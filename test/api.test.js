const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const createApp = require('../src/app');

// PNG válido de 1x1 pixel para o teste de upload
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

let server, base, tmpDir;

function api(pathname, init) {
  return fetch(base + pathname, init);
}

function postJson(pathname, body) {
  return api(pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wedding-test-'));
  const app = createApp({
    dataDir: path.join(tmpDir, 'data'),
    uploadsDir: path.join(tmpDir, 'uploads'),
  });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
});

after(() => {
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------- configuração do site ----------
test('GET /api/site devolve a configuração padrão', async () => {
  const resp = await api('/api/site');
  assert.equal(resp.status, 200);
  const cfg = await resp.json();
  assert.equal(cfg.couple.name1, 'Ana');
  assert.ok(Array.isArray(cfg.sectionOrder));
  assert.ok(cfg.sections.presentes.items.length > 0);
});

test('PUT /api/site persiste alterações', async () => {
  const cfg = await (await api('/api/site')).json();
  cfg.couple.name1 = 'Maria';
  cfg.sections.recados.visible = false;

  const put = await api('/api/site', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });
  assert.equal(put.status, 200);

  const again = await (await api('/api/site')).json();
  assert.equal(again.couple.name1, 'Maria');
  assert.equal(again.sections.recados.visible, false);
});

test('GET /api/site/defaults devolve a configuração de fábrica', async () => {
  const resp = await api('/api/site/defaults');
  assert.equal(resp.status, 200);
  const defaults = await resp.json();
  assert.equal(defaults.couple.name1, 'Ana');
  assert.ok(defaults.theme.accent);
  // não é afetado por alterações salvas no site
  const current = await (await api('/api/site')).json();
  assert.notEqual(current.couple.name1, defaults.couple.name1);
});

test('PUT /api/site rejeita corpo que não é objeto', async () => {
  const resp = await api('/api/site', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([1, 2, 3]),
  });
  assert.equal(resp.status, 400);
});

// ---------- RSVP ----------
test('POST /api/rsvp exige nome', async () => {
  const resp = await postJson('/api/rsvp', { phone: '11 99999-0000' });
  assert.equal(resp.status, 400);
});

test('fluxo RSVP: cria, lista e exclui', async () => {
  const create = await postJson('/api/rsvp', {
    name: '  Convidado Teste  ',
    attending: 'sim',
    guests: 2,
    message: 'Sem lactose',
  });
  assert.equal(create.status, 200);

  const list = await (await api('/api/rsvp')).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'Convidado Teste'); // trim aplicado
  assert.equal(list[0].guests, 2);
  assert.equal(list[0].attending, true);

  const del = await api('/api/rsvp/' + list[0].id, { method: 'DELETE' });
  assert.equal(del.status, 200);
  assert.equal((await (await api('/api/rsvp')).json()).length, 0);
});

test('POST /api/rsvp limita acompanhantes a 20', async () => {
  await postJson('/api/rsvp', { name: 'Exagerado', guests: 999 });
  const list = await (await api('/api/rsvp')).json();
  const item = list.find((r) => r.name === 'Exagerado');
  assert.equal(item.guests, 20);
  await api('/api/rsvp/' + item.id, { method: 'DELETE' });
});

// ---------- recados ----------
test('fluxo recados: valida, cria, lista e exclui', async () => {
  assert.equal((await postJson('/api/messages', { name: 'Sem texto' })).status, 400);

  const create = await postJson('/api/messages', { name: 'Tia Célia', text: 'Felicidades!' });
  assert.equal(create.status, 200);

  const list = await (await api('/api/messages')).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].text, 'Felicidades!');

  await api('/api/messages/' + list[0].id, { method: 'DELETE' });
  assert.equal((await (await api('/api/messages')).json()).length, 0);
});

// ---------- upload ----------
test('POST /api/upload aceita imagem e devolve URL', async () => {
  const fd = new FormData();
  fd.append('file', new Blob([TINY_PNG], { type: 'image/png' }), 'foto.png');
  const resp = await api('/api/upload', { method: 'POST', body: fd });
  assert.equal(resp.status, 200);
  const { url } = await resp.json();
  assert.match(url, /^\/uploads\/[0-9a-f]{16}\.png$/);
  assert.ok(fs.existsSync(path.join(tmpDir, 'uploads', path.basename(url))));
});

test('POST /api/upload rejeita arquivo que não é imagem', async () => {
  const fd = new FormData();
  fd.append('file', new Blob(['não sou imagem'], { type: 'text/plain' }), 'nota.txt');
  const resp = await api('/api/upload', { method: 'POST', body: fd });
  assert.equal(resp.status, 400);
});

// ---------- link-preview (validação e anti-SSRF) ----------
test('GET /api/link-preview exige URL http(s)', async () => {
  assert.equal((await api('/api/link-preview')).status, 400);
  assert.equal((await api('/api/link-preview?url=ftp://x.com')).status, 400);
});

test('GET /api/link-preview bloqueia endereços privados (SSRF)', async () => {
  for (const target of ['http://127.0.0.1/admin', 'http://192.168.0.1/', 'http://localhost:3001/']) {
    const resp = await api('/api/link-preview?url=' + encodeURIComponent(target));
    assert.equal(resp.status, 400, target + ' deveria ser bloqueado');
    const { error } = await resp.json();
    assert.match(error, /não é permitido/i);
  }
});

// ---------- reserva de presentes ----------
test('fluxo de reserva: reserva, bloqueia duplicada e libera', async () => {
  // reserva com nome visível
  const ok = await postJson('/api/gifts/g1/reserve', { name: 'Tio Roberto' });
  assert.equal(ok.status, 200);

  let cfg = await (await api('/api/site')).json();
  let gift = cfg.sections.presentes.items.find((g) => g.id === 'g1');
  assert.equal(gift.reserved.name, 'Tio Roberto');

  // segunda tentativa no mesmo presente → conflito
  const dup = await postJson('/api/gifts/g1/reserve', { name: 'Outra Pessoa' });
  assert.equal(dup.status, 409);

  // liberar (admin) e voltar a ficar disponível
  const free = await api('/api/gifts/g1/reserve', { method: 'DELETE' });
  assert.equal(free.status, 200);
  cfg = await (await api('/api/site')).json();
  gift = cfg.sections.presentes.items.find((g) => g.id === 'g1');
  assert.equal(gift.reserved, undefined);
});

test('reserva anônima: público não vê o nome, admin (?full=1) vê', async () => {
  const ok = await postJson('/api/gifts/g2/reserve', { name: 'Prima Discreta', anonymous: true });
  assert.equal(ok.status, 200);

  const publicCfg = await (await api('/api/site')).json();
  const publicGift = publicCfg.sections.presentes.items.find((g) => g.id === 'g2');
  assert.equal(publicGift.reserved.name, '');
  assert.equal(publicGift.reserved.anonymous, true);

  const fullCfg = await (await api('/api/site?full=1')).json();
  const fullGift = fullCfg.sections.presentes.items.find((g) => g.id === 'g2');
  assert.equal(fullGift.reserved.name, 'Prima Discreta');

  await api('/api/gifts/g2/reserve', { method: 'DELETE' });
});

test('reserva valida nome e presente existente', async () => {
  assert.equal((await postJson('/api/gifts/g3/reserve', { name: '   ' })).status, 400);
  assert.equal((await postJson('/api/gifts/nao-existe/reserve', { name: 'Alguém' })).status, 404);
});

// ---------- autenticação opcional ----------
test('com ADMIN_PASSWORD, escrita exige autenticação e leitura pública continua livre', async () => {
  const authTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wedding-auth-'));
  const app = createApp({
    dataDir: path.join(authTmp, 'data'),
    uploadsDir: path.join(authTmp, 'uploads'),
    adminPassword: 'segredo123',
  });
  const srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  const authBase = 'http://127.0.0.1:' + srv.address().port;

  try {
    // leitura pública segue aberta
    assert.equal((await fetch(authBase + '/api/site')).status, 200);

    const cfg = await (await fetch(authBase + '/api/site')).json();
    const putNoAuth = await fetch(authBase + '/api/site', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    assert.equal(putNoAuth.status, 401);

    const putAuth = await fetch(authBase + '/api/site', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from('admin:segredo123').toString('base64'),
      },
      body: JSON.stringify(cfg),
    });
    assert.equal(putAuth.status, 200);

    assert.equal((await fetch(authBase + '/admin')).status, 401);
  } finally {
    srv.close();
    fs.rmSync(authTmp, { recursive: true, force: true });
  }
});

// ---------- rate limit ----------
test('formulários públicos têm rate limit por IP', async () => {
  let limited = false;
  for (let i = 0; i < 15; i++) {
    const resp = await postJson('/api/messages', { name: 'Spam ' + i, text: 'oi' });
    if (resp.status === 429) { limited = true; break; }
  }
  assert.ok(limited, 'esperava receber 429 após muitas tentativas');
});

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  decodeEntities,
  metaContent,
  parsePrice,
  findJsonLdProduct,
  extractProductData,
} = require('../src/scraper');
const { isPrivateIp } = require('../src/net-guard');

// ---------- parsePrice ----------
test('parsePrice: formato brasileiro', () => {
  assert.equal(parsePrice('R$ 1.234,56'), 1234.56);
  assert.equal(parsePrice('349,90'), 349.9);
  assert.equal(parsePrice('R$ 12,00'), 12);
});

test('parsePrice: formato internacional', () => {
  assert.equal(parsePrice('1234.56'), 1234.56);
  assert.equal(parsePrice('1,234.56'), 1234.56);
  assert.equal(parsePrice(499.9), 499.9);
});

test('parsePrice: entradas inválidas retornam null', () => {
  assert.equal(parsePrice(null), null);
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice('grátis'), null);
  assert.equal(parsePrice('0'), null);
  assert.equal(parsePrice('-10'), 10); // sinais são descartados, valor absoluto
});

// ---------- decodeEntities ----------
test('decodeEntities: entidades comuns', () => {
  assert.equal(decodeEntities('Fog&atilde;o &amp; Forno'.replace('&atilde;', '&#227;')), 'Fogão & Forno');
  assert.equal(decodeEntities('&quot;Panela&quot; &#39;Wok&#39;'), '"Panela" \'Wok\'');
});

// ---------- metaContent ----------
test('metaContent: property antes ou depois do content', () => {
  const a = `<meta property="og:title" content="Batedeira Turbo">`;
  const b = `<meta content="Batedeira Turbo" property="og:title">`;
  assert.equal(metaContent(a, ['og:title']), 'Batedeira Turbo');
  assert.equal(metaContent(b, ['og:title']), 'Batedeira Turbo');
});

test('metaContent: respeita a ordem de prioridade e retorna null sem match', () => {
  const html = `<meta name="twitter:title" content="Do Twitter">`;
  assert.equal(metaContent(html, ['og:title', 'twitter:title']), 'Do Twitter');
  assert.equal(metaContent(html, ['og:image']), null);
});

// ---------- findJsonLdProduct ----------
test('findJsonLdProduct: produto com offers', () => {
  const html = `<script type="application/ld+json">
    {"@type":"Product","name":"Adega 12 Garrafas","image":["https://x.com/a.jpg"],
     "offers":{"@type":"Offer","price":"899.90"}}
  </script>`;
  const p = findJsonLdProduct(html);
  assert.equal(p.name, 'Adega 12 Garrafas');
  assert.equal(p.image, 'https://x.com/a.jpg');
  assert.equal(p.price, 899.9);
});

test('findJsonLdProduct: ignora JSON-LD malformado e não-produtos', () => {
  const html = `
    <script type="application/ld+json">{isso não é json}</script>
    <script type="application/ld+json">{"@type":"BreadcrumbList"}</script>`;
  assert.equal(findJsonLdProduct(html), null);
});

// ---------- extractProductData ----------
test('extractProductData: combina og tags e fallback de preço em R$', () => {
  const html = `
    <title>Loja X</title>
    <meta property="og:title" content="Jogo de Panelas 5 pe&#231;as">
    <meta property="og:image" content="https://cdn.loja.com/p.jpg">
    <div class="preco">R$ 289,90</div>`;
  const d = extractProductData(html);
  assert.equal(d.title, 'Jogo de Panelas 5 peças');
  assert.equal(d.image, 'https://cdn.loja.com/p.jpg');
  assert.equal(d.price, 289.9);
});

test('extractProductData: página sem dados retorna nulls', () => {
  const d = extractProductData('<html><body>nada aqui</body></html>');
  assert.equal(d.title, null);
  assert.equal(d.image, null);
  assert.equal(d.price, null);
});

// ---------- isPrivateIp (anti-SSRF) ----------
test('isPrivateIp: bloqueia faixas privadas IPv4', () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '172.31.255.255', '169.254.1.1', '0.0.0.0', '100.64.0.1']) {
    assert.equal(isPrivateIp(ip), true, ip + ' deveria ser privado');
  }
});

test('isPrivateIp: libera IPs públicos', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '200.147.35.149']) {
    assert.equal(isPrivateIp(ip), false, ip + ' deveria ser público');
  }
});

test('isPrivateIp: IPv6 loopback, link-local e mapeado', () => {
  assert.equal(isPrivateIp('::1'), true);
  assert.equal(isPrivateIp('fe80::1'), true);
  assert.equal(isPrivateIp('fc00::1'), true);
  assert.equal(isPrivateIp('::ffff:192.168.0.1'), true);
  assert.equal(isPrivateIp('2606:4700::1111'), false);
});

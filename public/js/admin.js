/* Painel de administração do site */
(async function () {
  let cfg = await fetch('/api/site?full=1').then((r) => r.json());
  let dirty = false;
  let currentTab = 'geral';

  const content = document.getElementById('content');
  const savebar = document.getElementById('savebar');
  const saveBtn = document.getElementById('saveBtn');
  const sidebar = document.getElementById('sidebar');

  const SECTION_META = {
    home: { label: 'Boas-vindas (Home)', desc: 'Texto de introdução do site' },
    casal: { label: 'O Casal', desc: 'Fotos e história de vocês' },
    padrinhos: { label: 'Padrinhos', desc: 'Fotos, nomes e papéis' },
    cerimonia: { label: 'Cerimônia e Recepção', desc: 'Horários, locais e endereços' },
    presentes: { label: 'Lista de Presentes', desc: 'Editada na aba Presentes' },
    rsvp: { label: 'Confirmação de Presença', desc: 'Formulário para convidados' },
    recados: { label: 'Recados', desc: 'Mural de mensagens dos convidados' },
  };

  const FONTS_DISPLAY = ['Cinzel', 'Playfair Display', 'Cormorant Garamond', 'Great Vibes', 'Montserrat'];
  const FONTS_BODY = ['Quicksand', 'Lato', 'Montserrat', 'Nunito'];

  // ---------- helpers ----------
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const brl = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function toast(msg, isError) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.className = 'toast'), 3500);
  }

  /* substitui o confirm() nativo por um modal no estilo do painel;
     retorna Promise<boolean> — use com await */
  function confirmModal({ title, message, okLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false }) {
    return new Promise((resolve) => {
      const back = document.createElement('div');
      back.className = 'modal-back';
      back.innerHTML = `
        <div class="modal confirm-modal" role="alertdialog" aria-modal="true" aria-label="${esc(title)}">
          <h3>${esc(title)}</h3>
          <p class="confirm-msg">${esc(message).replace(/\n/g, '<br>')}</p>
          <div class="modal-actions">
            <button type="button" class="btn" data-a="cancel">${esc(cancelLabel)}</button>
            <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-a="ok">${esc(okLabel)}</button>
          </div>
        </div>`;
      document.body.appendChild(back);

      const done = (answer) => {
        document.removeEventListener('keydown', onKey);
        back.remove();
        resolve(answer);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') done(false);
      };
      document.addEventListener('keydown', onKey);
      back.querySelector('[data-a=ok]').onclick = () => done(true);
      back.querySelector('[data-a=cancel]').onclick = () => done(false);
      back.addEventListener('click', (e) => { if (e.target === back) done(false); });
      back.querySelector('[data-a=cancel]').focus();
    });
  }

  function markDirty() {
    dirty = true;
    savebar.classList.add('show');
    document.getElementById('saveStatus').textContent = 'Alterações não salvas';
  }

  /* reservas acontecem no servidor a qualquer momento; antes de salvar a
     configuração inteira, adota as reservas mais recentes para não apagá-las */
  async function mergeServerReservations() {
    try {
      const server = await fetch('/api/site?full=1').then((r) => r.json());
      const byId = new Map(
        (server.sections?.presentes?.items || []).map((g) => [g.id, g.reserved])
      );
      for (const gift of cfg.sections?.presentes?.items || []) {
        const reserved = byId.get(gift.id);
        if (reserved) gift.reserved = reserved;
        else delete gift.reserved;
      }
    } catch {
      /* sem rede agora — salva como está */
    }
  }

  async function save() {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';
    try {
      await mergeServerReservations();
      const resp = await fetch('/api/site', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      if (!resp.ok) throw new Error();
      dirty = false;
      savebar.classList.remove('show');
      toast('✅ Alterações salvas! O site já está atualizado.');
    } catch {
      toast('Erro ao salvar. Tente novamente.', true);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Salvar alterações';
    }
  }
  saveBtn.addEventListener('click', save);
  window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  async function uploadImage(file) {
    const fd = new FormData();
    fd.append('file', file);
    const resp = await fetch('/api/upload', { method: 'POST', body: fd });
    let data = {};
    try { data = await resp.json(); } catch { /* resposta não-JSON */ }
    if (!resp.ok) throw new Error(data.error || 'Falha no upload');
    return data.url;
  }

  /* campo de imagem reutilizável: thumb + botões enviar/remover */
  function imgField(container, getUrl, setUrl, { round = false } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'img-field';
    const render = () => {
      const url = getUrl();
      wrap.innerHTML = `
        ${url
          ? `<img class="img-thumb" src="${esc(url)}" style="${round ? 'border-radius:50%' : ''}">`
          : `<div class="img-thumb empty" style="${round ? 'border-radius:50%' : ''}">🖼️</div>`}
        <button type="button" class="btn sm" data-act="up">📤 Enviar imagem</button>
        ${url ? `<button type="button" class="btn sm danger" data-act="rm">Remover</button>` : ''}
        <input type="file" accept="image/*" hidden>`;
      const fileInput = wrap.querySelector('input[type=file]');
      wrap.querySelector('[data-act=up]').onclick = () => fileInput.click();
      fileInput.onchange = async () => {
        if (!fileInput.files[0]) return;
        try {
          const url2 = await uploadImage(fileInput.files[0]);
          setUrl(url2);
          markDirty();
          render();
        } catch (e) { toast(e.message, true); }
      };
      const rm = wrap.querySelector('[data-act=rm]');
      if (rm) rm.onclick = () => { setUrl(''); markDirty(); render(); };
    };
    render();
    container.appendChild(wrap);
  }

  /* input de texto ligado ao cfg */
  function bind(el, get, set) {
    el.value = get() ?? '';
    el.addEventListener('input', () => { set(el.value); markDirty(); });
  }

  function toggleHtml(checked) {
    return `<label class="toggle"><input type="checkbox" ${checked ? 'checked' : ''}><span class="slider"></span></label>`;
  }

  // ---------- navegação ----------
  document.getElementById('sideNav').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    document.querySelectorAll('.side-nav button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.tab;
    sidebar.classList.remove('open');
    render();
  });
  document.getElementById('mobileMenuBtn').addEventListener('click', () => sidebar.classList.toggle('open'));

  function render() {
    content.innerHTML = '';
    ({ geral: renderGeral, secoes: renderSecoes, presentes: renderPresentes, confirmacoes: renderRsvps, recados: renderRecados })[currentTab]();
    window.scrollTo(0, 0);
  }

  // ============================================================
  // ABA: GERAL & TEMA
  // ============================================================
  function renderGeral() {
    content.innerHTML = `
      <div class="page-title">Geral &amp; Tema</div>
      <div class="page-sub">Nomes, data do casamento, cores e fontes do site.</div>

      <div class="card">
        <h3>💑 O casal</h3>
        <div class="grid2">
          <div class="field"><label>Nome 1</label><input type="text" id="fName1"></div>
          <div class="field"><label>Nome 2</label><input type="text" id="fName2"></div>
        </div>
      </div>

      <div class="card">
        <h3>📅 Data e hora do casamento</h3>
        <div class="field">
          <input type="datetime-local" id="fDate">
          <div class="hint">Usada na contagem regressiva e no "Save the date".</div>
        </div>
      </div>

      <div class="card">
        <h3>✨ Topo do site (hero) <span id="heroToggle"></span></h3>
        <div class="grid2">
          <div class="field"><label>Frase de destaque</label><input type="text" id="fTagline" placeholder="Save the date"></div>
          <div class="field">
            <label>Contagem regressiva</label>
            <span id="cdToggle"></span>
          </div>
        </div>
        <div class="field">
          <label>Foto do topo (opcional)</label>
          <div id="heroImgField"></div>
          <div class="hint">Aparece ao lado dos nomes, no topo do site. Sem foto, usamos a primeira foto da seção "O Casal".</div>
        </div>
      </div>

      <div class="card">
        <h3>🎨 Cores <button type="button" class="btn sm" id="resetColors">↩ Voltar às cores padrão</button></h3>
        <div class="grid3">
          <div class="field"><label>Cor de destaque</label>
            <div class="color-row"><input type="color" id="cAccent"><code id="cAccentV"></code></div>
          </div>
          <div class="field"><label>Destaque (escuro)</label>
            <div class="color-row"><input type="color" id="cAccentDark"><code id="cAccentDarkV"></code></div>
          </div>
          <div class="field"><label>Cor do texto</label>
            <div class="color-row"><input type="color" id="cInk"><code id="cInkV"></code></div>
          </div>
        </div>
        <div class="field"><label>Fundo suave (seções alternadas)</label>
          <div class="color-row"><input type="color" id="cSoft"><code id="cSoftV"></code></div>
        </div>
      </div>

      <div class="card">
        <h3>🔤 Fontes</h3>
        <div class="grid2">
          <div class="field"><label>Títulos</label><select id="fFontDisplay">${FONTS_DISPLAY.map((f) => `<option>${f}</option>`).join('')}</select></div>
          <div class="field"><label>Textos</label><select id="fFontBody">${FONTS_BODY.map((f) => `<option>${f}</option>`).join('')}</select></div>
        </div>
      </div>

      <div class="card">
        <h3>🦶 Rodapé</h3>
        <div class="field"><label>Texto do rodapé</label><input type="text" id="fFooter"></div>
      </div>

      <div class="card danger-zone">
        <h3>⚠️ Zona de risco</h3>
        <p class="hint" style="margin-bottom:1rem">Substitui <strong>todo o conteúdo do site</strong> (textos, fotos, presentes, reservas, cores e fontes) pelos valores de fábrica. Confirmações de presença e recados <strong>não</strong> são apagados. Não dá para desfazer.</p>
        <button type="button" class="btn danger" id="resetAll">🔄 Redefinir todo o site para o padrão</button>
      </div>`;

    bind(document.getElementById('fName1'), () => cfg.couple.name1, (v) => (cfg.couple.name1 = v));
    bind(document.getElementById('fName2'), () => cfg.couple.name2, (v) => (cfg.couple.name2 = v));
    bind(document.getElementById('fDate'), () => cfg.wedding.date, (v) => (cfg.wedding.date = v));
    bind(document.getElementById('fTagline'), () => cfg.hero.tagline, (v) => (cfg.hero.tagline = v));
    bind(document.getElementById('fFooter'), () => cfg.footer.text, (v) => (cfg.footer.text = v));
    bind(document.getElementById('fFontDisplay'), () => cfg.theme.fontDisplay, (v) => (cfg.theme.fontDisplay = v));
    bind(document.getElementById('fFontBody'), () => cfg.theme.fontBody, (v) => (cfg.theme.fontBody = v));

    // toggles do hero
    const heroToggle = document.getElementById('heroToggle');
    heroToggle.innerHTML = toggleHtml(cfg.hero.visible);
    heroToggle.querySelector('input').onchange = (e) => { cfg.hero.visible = e.target.checked; markDirty(); };
    const cdToggle = document.getElementById('cdToggle');
    cdToggle.innerHTML = toggleHtml(cfg.hero.showCountdown);
    cdToggle.querySelector('input').onchange = (e) => { cfg.hero.showCountdown = e.target.checked; markDirty(); };

    imgField(document.getElementById('heroImgField'),
      () => cfg.hero.backgroundImage,
      (v) => (cfg.hero.backgroundImage = v));

    // cores
    const colors = [
      ['cAccent', 'accent'], ['cAccentDark', 'accentDark'], ['cInk', 'ink'], ['cSoft', 'soft'],
    ];
    for (const [id, key] of colors) {
      const input = document.getElementById(id);
      const label = document.getElementById(id + 'V');
      input.value = cfg.theme[key] || '#000000';
      label.textContent = input.value.toUpperCase();
      input.addEventListener('input', () => {
        cfg.theme[key] = input.value;
        label.textContent = input.value.toUpperCase();
        markDirty();
      });
    }

    // ---- redefinir só as cores ----
    document.getElementById('resetColors').onclick = async () => {
      const ok = await confirmModal({
        title: '🎨 Redefinir as cores',
        message: 'Voltar às cores padrão do site? As fontes e o resto do conteúdo não mudam.',
        okLabel: 'Redefinir cores',
      });
      if (!ok) return;
      try {
        const defaults = await fetch('/api/site/defaults').then((r) => r.json());
        for (const key of ['accent', 'accentDark', 'ink', 'soft']) {
          cfg.theme[key] = defaults.theme[key];
        }
        markDirty();
        renderGeral();
        toast('Cores redefinidas! Lembre de salvar as alterações.');
      } catch {
        toast('Não foi possível carregar as cores padrão.', true);
      }
    };

    // ---- redefinir o site inteiro ----
    document.getElementById('resetAll').onclick = async () => {
      const first = await confirmModal({
        title: '⚠️ Redefinir todo o site',
        message:
          'Textos, fotos, presentes, reservas, cores e fontes voltam aos valores de fábrica. Confirmações de presença e recados são mantidos.\n\nEssa ação NÃO pode ser desfeita.',
        okLabel: 'Redefinir tudo',
        danger: true,
      });
      if (!first) return;
      const second = await confirmModal({
        title: 'Tem certeza mesmo?',
        message: 'Todo o conteúdo personalizado será perdido.',
        okLabel: 'Sim, redefinir',
        cancelLabel: 'Voltar',
        danger: true,
      });
      if (!second) return;
      try {
        const defaults = await fetch('/api/site/defaults').then((r) => r.json());
        const resp = await fetch('/api/site', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(defaults),
        });
        if (!resp.ok) throw new Error();
        cfg = defaults;
        dirty = false;
        savebar.classList.remove('show');
        renderGeral();
        toast('✅ Site redefinido para o padrão!');
      } catch {
        toast('Erro ao redefinir o site. Tente novamente.', true);
      }
    };
  }

  // ============================================================
  // ABA: SEÇÕES
  // ============================================================
  function renderSecoes() {
    content.innerHTML = `
      <div class="page-title">Seções do Site</div>
      <div class="page-sub">Ative, desative e reordene as seções. Clique em uma seção para editar o conteúdo.</div>
      <div id="orderList"></div>
      <div style="height:1.6rem"></div>
      <div class="page-title" style="font-size:1.15rem">Conteúdo das seções</div>
      <div class="page-sub">Edite os textos e fotos de cada parte do site.</div>
      <div id="editors"></div>`;

    renderOrderList();
    renderEditors();
  }

  function renderOrderList() {
    const list = document.getElementById('orderList');
    list.innerHTML = '';
    cfg.sectionOrder.forEach((id, i) => {
      const s = cfg.sections[id];
      const meta = SECTION_META[id] || { label: id, desc: '' };
      const row = document.createElement('div');
      row.className = 'section-row' + (s.visible ? '' : ' off');
      row.innerHTML = `
        <div class="arrows">
          <button ${i === 0 ? 'disabled' : ''} data-dir="-1" title="Mover para cima">↑</button>
          <button ${i === cfg.sectionOrder.length - 1 ? 'disabled' : ''} data-dir="1" title="Mover para baixo">↓</button>
        </div>
        <div class="s-name">${esc(meta.label)}<small>${esc(meta.desc)}</small></div>
        ${toggleHtml(s.visible)}`;
      row.querySelectorAll('[data-dir]').forEach((btn) => {
        btn.onclick = () => {
          const dir = Number(btn.dataset.dir);
          const arr = cfg.sectionOrder;
          [arr[i], arr[i + dir]] = [arr[i + dir], arr[i]];
          markDirty();
          renderOrderList();
        };
      });
      row.querySelector('.toggle input').onchange = (e) => {
        s.visible = e.target.checked;
        row.classList.toggle('off', !s.visible);
        markDirty();
      };
      list.appendChild(row);
    });
  }

  function editorShell(id, title, bodyBuilder) {
    const d = document.createElement('details');
    d.className = 'card';
    d.innerHTML = `<summary>${esc(title)} <span class="chev">▾</span></summary><div class="detail-body"></div>`;
    bodyBuilder(d.querySelector('.detail-body'));
    return d;
  }

  function fieldEl(parent, labelTxt, inputHtml) {
    const div = document.createElement('div');
    div.className = 'field';
    div.innerHTML = `<label>${labelTxt}</label>${inputHtml}`;
    parent.appendChild(div);
    return div.querySelector('input, textarea, select');
  }

  function renderEditors() {
    const wrap = document.getElementById('editors');
    wrap.innerHTML = '';

    // --- Home ---
    wrap.appendChild(editorShell('home', '🏠 Boas-vindas (Home)', (body) => {
      const s = cfg.sections.home;
      bind(fieldEl(body, 'Título', '<input type="text">'), () => s.title, (v) => (s.title = v));
      bind(fieldEl(body, 'Texto', '<textarea></textarea>'), () => s.text, (v) => (s.text = v));
    }));

    // --- Casal ---
    wrap.appendChild(editorShell('casal', '💑 O Casal', (body) => {
      const s = cfg.sections.casal;
      if (!Array.isArray(s.photos)) s.photos = [];
      bind(fieldEl(body, 'Título', '<input type="text">'), () => s.title, (v) => (s.title = v));
      const photosWrap = document.createElement('div');
      photosWrap.className = 'field';
      photosWrap.innerHTML = `<label>Fotos (até 4)</label>`;
      const rebuild = () => {
        photosWrap.querySelectorAll('.img-field, .add-photo').forEach((el) => el.remove());
        s.photos.forEach((p, i) => {
          imgField(photosWrap, () => s.photos[i], (v) => {
            if (v) s.photos[i] = v;
            else { s.photos.splice(i, 1); rebuild(); }
          });
        });
        if (s.photos.length < 4) {
          const add = document.createElement('button');
          add.type = 'button';
          add.className = 'btn sm add-photo';
          add.style.marginTop = '0.5rem';
          add.textContent = '➕ Adicionar foto';
          add.onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async () => {
              if (!input.files[0]) return;
              try {
                s.photos.push(await uploadImage(input.files[0]));
                markDirty();
                rebuild();
              } catch (e) { toast(e.message, true); }
            };
            input.click();
          };
          photosWrap.appendChild(add);
        }
      };
      rebuild();
      body.appendChild(photosWrap);
      bind(fieldEl(body, 'Nossa história', '<textarea style="min-height:160px"></textarea>'), () => s.story, (v) => (s.story = v));
    }));

    // --- Padrinhos ---
    wrap.appendChild(editorShell('padrinhos', '🤵👰 Padrinhos', (body) => {
      const s = cfg.sections.padrinhos;
      if (!Array.isArray(s.items)) s.items = [];
      bind(fieldEl(body, 'Título', '<input type="text">'), () => s.title, (v) => (s.title = v));
      const listEl = document.createElement('div');
      body.appendChild(listEl);
      const rebuild = () => {
        listEl.innerHTML = '';
        s.items.forEach((p, i) => {
          const row = document.createElement('div');
          row.className = 'person-row';
          row.innerHTML = `
            ${p.photo ? `<img src="${esc(p.photo)}">` : `<div class="no-img">👤</div>`}
            <input type="text" placeholder="Nome" value="${esc(p.name)}">
            <input type="text" placeholder="Papel (Madrinha, Padrinho...)" value="${esc(p.role || '')}">
            <div style="display:flex;gap:.4rem">
              <button type="button" class="btn sm" data-a="foto">📷</button>
              <button type="button" class="btn sm danger" data-a="del">✕</button>
            </div>`;
          const [nameIn, roleIn] = row.querySelectorAll('input[type=text]');
          nameIn.oninput = () => { p.name = nameIn.value; markDirty(); };
          roleIn.oninput = () => { p.role = roleIn.value; markDirty(); };
          row.querySelector('[data-a=foto]').onclick = () => {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = 'image/*';
            input.onchange = async () => {
              if (!input.files[0]) return;
              try { p.photo = await uploadImage(input.files[0]); markDirty(); rebuild(); }
              catch (e) { toast(e.message, true); }
            };
            input.click();
          };
          row.querySelector('[data-a=del]').onclick = () => { s.items.splice(i, 1); markDirty(); rebuild(); };
          listEl.appendChild(row);
        });
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'btn sm';
        add.style.marginTop = '0.8rem';
        add.textContent = '➕ Adicionar padrinho/madrinha';
        add.onclick = () => { s.items.push({ name: '', role: '', photo: '' }); markDirty(); rebuild(); };
        listEl.appendChild(add);
      };
      rebuild();
    }));

    // --- Cerimônia ---
    wrap.appendChild(editorShell('cerimonia', '💒 Cerimônia e Recepção', (body) => {
      const s = cfg.sections.cerimonia;
      if (!Array.isArray(s.events)) s.events = [];
      bind(fieldEl(body, 'Título', '<input type="text">'), () => s.title, (v) => (s.title = v));
      bind(fieldEl(body, 'Texto de apresentação', '<textarea></textarea>'), () => s.text, (v) => (s.text = v));
      const listEl = document.createElement('div');
      body.appendChild(listEl);
      const rebuild = () => {
        listEl.innerHTML = '';
        s.events.forEach((ev, i) => {
          const card = document.createElement('div');
          card.className = 'card';
          card.style.background = '#faf8f5';
          card.innerHTML = `<h3>Evento ${i + 1} <button type="button" class="btn sm danger">✕ Remover</button></h3>`;
          card.querySelector('button').onclick = () => { s.events.splice(i, 1); markDirty(); rebuild(); };
          const g = document.createElement('div');
          g.className = 'grid2';
          card.appendChild(g);
          bind(fieldEl(g, 'Nome (ex: Cerimônia)', '<input type="text">'), () => ev.name, (v) => (ev.name = v));
          bind(fieldEl(g, 'Horário (ex: 18h00)', '<input type="text">'), () => ev.time, (v) => (ev.time = v));
          bind(fieldEl(g, 'Local', '<input type="text">'), () => ev.venue, (v) => (ev.venue = v));
          bind(fieldEl(g, 'Endereço', '<input type="text">'), () => ev.address, (v) => (ev.address = v));
          const mapField = fieldEl(card, 'Link do Google Maps (opcional)', '<input type="url" placeholder="https://maps.app.goo.gl/...">');
          bind(mapField, () => ev.mapsUrl, (v) => (ev.mapsUrl = v));
          listEl.appendChild(card);
        });
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'btn sm';
        add.textContent = '➕ Adicionar evento';
        add.onclick = () => { s.events.push({ name: '', time: '', venue: '', address: '', mapsUrl: '' }); markDirty(); rebuild(); };
        listEl.appendChild(add);
      };
      rebuild();
      const imgWrap = document.createElement('div');
      imgWrap.className = 'field';
      imgWrap.style.marginTop = '1rem';
      imgWrap.innerHTML = '<label>Imagem da seção (opcional)</label>';
      body.appendChild(imgWrap);
      imgField(imgWrap, () => s.image, (v) => (s.image = v));
    }));

    // --- RSVP ---
    wrap.appendChild(editorShell('rsvp', '✅ Confirmação de Presença', (body) => {
      const s = cfg.sections.rsvp;
      bind(fieldEl(body, 'Título', '<input type="text">'), () => s.title, (v) => (s.title = v));
      bind(fieldEl(body, 'Texto', '<textarea></textarea>'), () => s.text, (v) => (s.text = v));
    }));

    // --- Recados ---
    wrap.appendChild(editorShell('recados', '💬 Recados', (body) => {
      const s = cfg.sections.recados;
      bind(fieldEl(body, 'Título', '<input type="text">'), () => s.title, (v) => (s.title = v));
      bind(fieldEl(body, 'Texto', '<textarea></textarea>'), () => s.text, (v) => (s.text = v));
    }));

    // --- Presentes (títulos) ---
    wrap.appendChild(editorShell('presentes', '🎁 Lista de Presentes (títulos)', (body) => {
      const s = cfg.sections.presentes;
      const note = document.createElement('p');
      note.className = 'hint';
      note.style.marginBottom = '1rem';
      note.textContent = 'Os presentes em si são gerenciados na aba "Presentes" do menu.';
      body.appendChild(note);
      bind(fieldEl(body, 'Título', '<input type="text">'), () => s.title, (v) => (s.title = v));
      bind(fieldEl(body, 'Subtítulo', '<textarea></textarea>'), () => s.subtitle, (v) => (s.subtitle = v));
    }));
  }

  // ============================================================
  // ABA: PRESENTES
  // ============================================================
  function renderPresentes() {
    const items = cfg.sections.presentes.items || (cfg.sections.presentes.items = []);
    content.innerHTML = `
      <div class="page-title">🎁 Presentes</div>
      <div class="page-sub">Adicione um presente colando o link da loja — nome, foto e preço são preenchidos automaticamente quando possível.</div>
      <div style="display:flex;justify-content:flex-end;margin-bottom:1.2rem">
        <button class="btn primary" id="addGift">➕ Adicionar presente</button>
      </div>
      <div id="giftList"></div>`;

    document.getElementById('addGift').onclick = () => openGiftModal(null);
    rebuildGiftList();
  }

  function rebuildGiftList() {
    const items = cfg.sections.presentes.items;
    const list = document.getElementById('giftList');
    if (!items.length) {
      list.innerHTML = '<div class="card" style="text-align:center;color:var(--muted)">Nenhum presente cadastrado ainda.</div>';
      return;
    }
    list.innerHTML = '';
    items.forEach((g, i) => {
      const row = document.createElement('div');
      row.className = 'gift-row' + (g.visible === false ? ' off' : '');
      const reservedInfo = g.reserved
        ? `<div class="g-reserved">💝 Presenteado por <strong>${esc(g.reserved.name || 'convidado')}</strong>${g.reserved.anonymous ? ' (anônimo no site)' : ''}${g.reserved.date ? ' em ' + new Date(g.reserved.date).toLocaleDateString('pt-BR') : ''}</div>`
        : '';
      row.innerHTML = `
        ${g.image ? `<img src="${esc(g.image)}">` : `<div class="no-img">🎁</div>`}
        <div class="g-info">
          <div class="g-name">${esc(g.name) || '<em>Sem nome</em>'}</div>
          <div class="g-price">${g.price ? brl(g.price) : 'Sem valor'}</div>
          ${g.url ? `<div class="g-url">🔗 ${esc(g.url)}</div>` : '<div class="g-url">Sem link</div>'}
          ${reservedInfo}
        </div>
        <div class="g-actions">
          ${toggleHtml(g.visible !== false)}
          <div style="display:flex;gap:.4rem">
            ${g.reserved ? '<button type="button" class="btn sm" data-a="free">↩ Liberar</button>' : ''}
            <button type="button" class="btn sm" data-a="edit">✏️ Editar</button>
            <button type="button" class="btn sm danger" data-a="del">✕</button>
          </div>
        </div>`;
      const freeBtn = row.querySelector('[data-a=free]');
      if (freeBtn) {
        freeBtn.onclick = async () => {
          const ok = await confirmModal({
            title: '↩ Liberar presente',
            message: `Liberar "${g.name}" para ser escolhido de novo?`,
            okLabel: 'Liberar',
          });
          if (!ok) return;
          const resp = await fetch(`/api/gifts/${encodeURIComponent(g.id)}/reserve`, { method: 'DELETE' });
          if (resp.ok) {
            delete g.reserved;
            rebuildGiftList();
            toast('Presente liberado e disponível de novo no site.');
          } else {
            toast('Erro ao liberar o presente.', true);
          }
        };
      }
      row.querySelector('.toggle input').onchange = (e) => {
        g.visible = e.target.checked;
        row.classList.toggle('off', !g.visible);
        markDirty();
      };
      row.querySelector('[data-a=edit]').onclick = () => openGiftModal(g);
      row.querySelector('[data-a=del]').onclick = async () => {
        const ok = await confirmModal({
          title: '🗑 Remover presente',
          message: `Remover o presente "${g.name}"?`,
          okLabel: 'Remover',
          danger: true,
        });
        if (!ok) return;
        items.splice(i, 1);
        markDirty();
        rebuildGiftList();
      };
      list.appendChild(row);
    });
  }

  function openGiftModal(gift) {
    const isNew = !gift;
    const draft = gift
      ? { ...gift }
      : { id: 'g' + Date.now().toString(36), name: '', url: '', image: '', price: null, visible: true };

    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `
      <div class="modal">
        <h3>${isNew ? '➕ Novo presente' : '✏️ Editar presente'}</h3>
        <div class="field">
          <label>Link do presente na loja</label>
          <div class="fetch-row">
            <input type="url" id="gUrl" placeholder="https://loja.com.br/produto...">
            <button type="button" class="btn" id="gFetch">🔍 Buscar dados</button>
          </div>
          <div class="fetch-status" id="gStatus"></div>
        </div>
        <div class="field"><label>Nome do presente *</label><input type="text" id="gName" maxlength="140"></div>
        <div class="field">
          <label>Valor (R$)</label>
          <input type="number" id="gPrice" min="0" step="0.01" placeholder="0,00">
          <div class="hint">Deixe vazio para não exibir valor.</div>
        </div>
        <div class="field">
          <label>Imagem</label>
          <div id="gImgField"></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn" id="gCancel">Cancelar</button>
          <button type="button" class="btn primary" id="gSave">Salvar presente</button>
        </div>
      </div>`;
    document.body.appendChild(back);

    const $ = (id) => back.querySelector('#' + id);
    $('gUrl').value = draft.url || '';
    $('gName').value = draft.name || '';
    $('gPrice').value = draft.price ?? '';

    const imgWrap = $('gImgField');
    const renderImg = () => {
      imgWrap.innerHTML = '';
      imgField(imgWrap, () => draft.image, (v) => (draft.image = v));
    };
    renderImg();

    $('gFetch').onclick = async () => {
      const url = $('gUrl').value.trim();
      const status = $('gStatus');
      if (!/^https?:\/\//i.test(url)) {
        status.className = 'fetch-status err';
        status.textContent = 'Cole um link válido começando com http:// ou https://';
        return;
      }
      $('gFetch').disabled = true;
      status.className = 'fetch-status';
      status.innerHTML = '<span class="spin">⏳</span> Lendo a página do presente...';
      try {
        const resp = await fetch('/api/link-preview?url=' + encodeURIComponent(url));
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Falha ao ler o link');
        const found = [];
        if (data.title) { $('gName').value = data.title; found.push('nome'); }
        if (data.price != null) { $('gPrice').value = data.price; found.push('valor'); }
        if (data.image) { draft.image = data.image; renderImg(); found.push('foto'); }
        if (found.length) {
          status.className = 'fetch-status ok';
          status.textContent = `✔ Encontrado: ${found.join(', ')}. Revise e ajuste se precisar.`;
        } else {
          status.className = 'fetch-status err';
          status.textContent = 'A página não forneceu dados. Preencha manualmente (a foto pode ser enviada abaixo).';
        }
      } catch (e) {
        status.className = 'fetch-status err';
        status.textContent = e.message;
      } finally {
        $('gFetch').disabled = false;
      }
    };

    const close = () => back.remove();
    $('gCancel').onclick = close;
    back.addEventListener('click', (e) => { if (e.target === back) close(); });

    $('gSave').onclick = () => {
      const name = $('gName').value.trim();
      if (!name) { toast('Dê um nome ao presente.', true); return; }
      draft.name = name;
      draft.url = $('gUrl').value.trim();
      const priceVal = parseFloat($('gPrice').value);
      draft.price = Number.isFinite(priceVal) && priceVal > 0 ? priceVal : null;
      const items = cfg.sections.presentes.items;
      if (isNew) items.push(draft);
      else Object.assign(gift, draft);
      markDirty();
      close();
      rebuildGiftList();
      toast(isNew ? 'Presente adicionado! Lembre de salvar as alterações.' : 'Presente atualizado! Lembre de salvar.');
    };
  }

  // ============================================================
  // ABA: CONFIRMAÇÕES (RSVP)
  // ============================================================
  async function renderRsvps() {
    content.innerHTML = `<div class="page-title">✅ Confirmações de Presença</div><div class="loading">Carregando...</div>`;
    const list = await fetch('/api/rsvp').then((r) => r.json());
    const yes = list.filter((r) => r.attending);
    const totalGuests = yes.reduce((acc, r) => acc + 1 + (r.guests || 0), 0);

    content.innerHTML = `
      <div class="page-title">✅ Confirmações de Presença</div>
      <div class="page-sub">Respostas enviadas pelo formulário do site.</div>
      <div class="stats-row">
        <div class="stat"><div class="n">${yes.length}</div><div class="l">Confirmaram</div></div>
        <div class="stat"><div class="n">${list.length - yes.length}</div><div class="l">Não vão</div></div>
        <div class="stat"><div class="n">${totalGuests}</div><div class="l">Total de pessoas</div></div>
      </div>
      <div class="card table-wrap">
        ${list.length ? `
        <table>
          <thead><tr><th>Nome</th><th>Telefone</th><th>Vai?</th><th>Acomp.</th><th>Observações</th><th>Data</th><th></th></tr></thead>
          <tbody>
            ${list.slice().reverse().map((r) => `
              <tr>
                <td><strong>${esc(r.name)}</strong></td>
                <td>${esc(r.phone) || '—'}</td>
                <td><span class="pill ${r.attending ? 'yes' : 'no'}">${r.attending ? 'Sim' : 'Não'}</span></td>
                <td>${r.guests || 0}</td>
                <td>${esc(r.message) || '—'}</td>
                <td>${new Date(r.date).toLocaleDateString('pt-BR')}</td>
                <td><button class="btn sm danger" data-id="${r.id}">✕</button></td>
              </tr>`).join('')}
          </tbody>
        </table>` : '<p style="color:var(--muted);text-align:center">Nenhuma confirmação ainda.</p>'}
      </div>`;

    content.querySelectorAll('button[data-id]').forEach((btn) => {
      btn.onclick = async () => {
        const ok = await confirmModal({
          title: 'Excluir confirmação',
          message: 'Excluir esta confirmação de presença?',
          okLabel: 'Excluir',
          danger: true,
        });
        if (!ok) return;
        await fetch('/api/rsvp/' + btn.dataset.id, { method: 'DELETE' });
        renderRsvps();
      };
    });
  }

  // ============================================================
  // ABA: RECADOS
  // ============================================================
  async function renderRecados() {
    content.innerHTML = `<div class="page-title">💬 Recados</div><div class="loading">Carregando...</div>`;
    const list = await fetch('/api/messages').then((r) => r.json());
    content.innerHTML = `
      <div class="page-title">💬 Recados</div>
      <div class="page-sub">Mensagens deixadas pelos convidados. Você pode excluir recados indesejados.</div>
      <div class="card table-wrap">
        ${list.length ? `
        <table>
          <thead><tr><th>Nome</th><th>Recado</th><th>Data</th><th></th></tr></thead>
          <tbody>
            ${list.slice().reverse().map((m) => `
              <tr>
                <td><strong>${esc(m.name)}</strong></td>
                <td>${esc(m.text)}</td>
                <td style="white-space:nowrap">${new Date(m.date).toLocaleDateString('pt-BR')}</td>
                <td><button class="btn sm danger" data-id="${m.id}">✕</button></td>
              </tr>`).join('')}
          </tbody>
        </table>` : '<p style="color:var(--muted);text-align:center">Nenhum recado ainda.</p>'}
      </div>`;

    content.querySelectorAll('button[data-id]').forEach((btn) => {
      btn.onclick = async () => {
        const ok = await confirmModal({
          title: 'Excluir recado',
          message: 'Excluir este recado?',
          okLabel: 'Excluir',
          danger: true,
        });
        if (!ok) return;
        await fetch('/api/messages/' + btn.dataset.id, { method: 'DELETE' });
        renderRecados();
      };
    });
  }

  render();
})();

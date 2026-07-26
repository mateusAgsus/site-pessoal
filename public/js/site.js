/* Site público — renderiza tudo a partir de /api/site */
(async function () {
  const cfg = await fetch('/api/site').then((r) => r.json());
  const app = document.getElementById('app');

  // ---------- helpers ----------
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const brl = (n) =>
    Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function toast(msg, isError) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.className = 'toast'), 3500);
  }

  /* lê a mensagem de erro da API sem quebrar se a resposta não for JSON */
  async function apiError(resp, fallback) {
    try {
      return (await resp.json()).error || fallback;
    } catch {
      return fallback;
    }
  }

  // ---------- tema ----------
  const t = cfg.theme || {};
  const rootStyle = document.documentElement.style;
  if (t.accent) rootStyle.setProperty('--accent', t.accent);
  if (t.accentDark) rootStyle.setProperty('--accent-dark', t.accentDark);
  if (t.ink) rootStyle.setProperty('--ink', t.ink);
  if (t.soft) rootStyle.setProperty('--soft', t.soft);
  if (t.fontDisplay) rootStyle.setProperty('--font-display', `'${t.fontDisplay}', serif`);
  if (t.fontBody) rootStyle.setProperty('--font-body', `'${t.fontBody}', sans-serif`);

  const n1 = esc(cfg.couple?.name1 || 'Noiva');
  const n2 = esc(cfg.couple?.name2 || 'Noivo');
  document.title = `${cfg.couple?.name1 || ''} & ${cfg.couple?.name2 || ''} — Chá de Panela`;

  const weddingDate = cfg.wedding?.date ? new Date(cfg.wedding.date) : null;
  const dateFmt = weddingDate
    ? weddingDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

  // ---------- navbar ----------
  document.getElementById('navLogo').innerHTML =
    `${n1[0] || ''}<span class="amp">&</span>${n2[0] || ''}`;

  const NAV_LABELS = {
    home: 'Home', casal: 'O casal', padrinhos: 'Padrinhos', cerimonia: 'Recepção',
    presentes: 'Lista de presentes', rsvp: 'Confirme sua presença', recados: 'Recados',
  };

  const order = (cfg.sectionOrder || []).filter((id) => cfg.sections?.[id]?.visible);
  const navLinks = document.getElementById('navLinks');
  navLinks.innerHTML = order
    .map((id) => `<li><a href="#${id}">${esc(NAV_LABELS[id] || id)}</a></li>`)
    .join('');

  const navbar = document.getElementById('navbar');
  const navToggle = document.getElementById('navToggle');
  navToggle.addEventListener('click', () => navbar.classList.toggle('menu-open'));
  navLinks.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') navbar.classList.remove('menu-open');
  });
  const toTop = document.getElementById('toTop');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 60);
    toTop.classList.toggle('show', window.scrollY > 500);
  });
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  // ---------- renderizadores de seção ----------
  const R = {};

  R.hero = () => {
    const h = cfg.hero || {};
    if (!h.visible) {
      document.querySelector('main').style.paddingTop = '70px';
      return '';
    }
    const photo = h.backgroundImage || (cfg.sections.casal?.photos || [])[0] || '';
    return `
      <header id="hero" class="hero">
        <img class="hero-leaf leaf-tl" src="/img/elemento-grafico-terracota-textura.png" alt="" aria-hidden="true">
        <img class="hero-leaf leaf-br" src="/img/elemento-grafico-terracota.png" alt="" aria-hidden="true">
        <div class="hero-grid${photo ? '' : ' no-photo'}">
          ${photo ? `<div class="hero-photo"><img src="${esc(photo)}" alt="${n1} e ${n2}"></div>` : ''}
          <div class="hero-text">
            <span class="hero-line"></span>
            ${h.tagline ? `<div class="hero-tagline">${esc(h.tagline)}</div>` : ''}
            <h1 class="hero-names">${n1}<span class="hero-e">e</span>${n2}</h1>
            ${dateFmt ? `<div class="hero-date">${dateFmt}</div>` : ''}
            ${h.showCountdown && weddingDate ? `
              <div class="countdown" id="countdown">
                ${['Dias', 'Horas', 'Min', 'Seg'].map((l) => `
                  <div class="unit"><div class="num">--</div><div class="label">${l}</div></div>`).join('')}
              </div>` : ''}
            <span class="hero-line"></span>
          </div>
        </div>
      </header>`;
  };

  const sectionShell = (id, title, inner) => `
    <section class="section" id="${id}">
      <div class="section-inner reveal">
        <h2 class="section-title">${esc(title)}</h2>
        <div class="section-divider"></div>
        ${inner}
      </div>
    </section>`;

  R.home = (s) => sectionShell('home', s.title, `<p class="section-text">${esc(s.text)}</p>`);

  R.casal = (s) => {
    const photos = (s.photos || []).filter(Boolean);
    const cls = photos.length === 1 ? 'couple-photos single' : 'couple-photos';
    return sectionShell('casal', s.title, `
      ${photos.length ? `<div class="${cls}">${photos.map((p) => `<img src="${esc(p)}" alt="Foto do casal" loading="lazy">`).join('')}</div>` : ''}
      <p class="section-text">${esc(s.story)}</p>`);
  };

  R.padrinhos = (s) => {
    const items = (s.items || []).filter((p) => p.name);
    if (!items.length) return '';
    return sectionShell('padrinhos', s.title, `
      <div class="padrinhos-grid">
        ${items.map((p) => `
          <div class="padrinho">
            ${p.photo ? `<img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy">` : ''}
            <div class="p-name">${esc(p.name)}</div>
            ${p.role ? `<div class="p-role">${esc(p.role)}</div>` : ''}
          </div>`).join('')}
      </div>`);
  };

  R.cerimonia = (s) => {
    const icons = { cerimônia: '💍', cerimonia: '💍', recepção: '🥂', recepcao: '🥂' };
    const events = (s.events || []).filter((e) => e.name);
    return sectionShell('cerimonia', s.title, `
      ${s.text ? `<p class="section-text">${esc(s.text)}</p>` : ''}
      ${events.length ? `<div class="ceremony-wrap">
        ${events.map((e) => `
          <div class="event-card">
            <div class="e-icon">${icons[(e.name || '').toLowerCase()] || '📍'}</div>
            <h3>${esc(e.name)}</h3>
            ${e.time ? `<div class="e-time">${esc(e.time)}</div>` : ''}
            ${e.venue ? `<div class="e-venue">${esc(e.venue)}</div>` : ''}
            ${e.address ? `<div class="e-address">${esc(e.address)}</div>` : ''}
            ${e.mapsUrl ? `<a class="btn outline" href="${esc(e.mapsUrl)}" target="_blank" rel="noopener">Ver no mapa</a>` : ''}
          </div>`).join('')}
      </div>` : ''}
      ${s.image ? `<img class="ceremony-img" src="${esc(s.image)}" alt="" loading="lazy">` : ''}`);
  };

  function giftCardHtml(g) {
    const reserved = g.reserved;
    const buyer = reserved
      ? (reserved.anonymous || !reserved.name ? 'um convidado' : reserved.name)
      : '';
    return `
      <div class="gift-card${reserved ? ' reserved' : ''}" data-gift-id="${esc(g.id)}">
        ${g.image
          ? `<img class="g-img" src="${esc(g.image)}" alt="${esc(g.name)}" loading="lazy">`
          : `<div class="g-img placeholder">🎁</div>`}
        ${reserved ? `<div class="g-ribbon">Presenteado ❤</div>` : ''}
        <div class="g-body">
          <div class="g-name">${esc(g.name)}</div>
          ${g.price ? `<div class="g-price">${brl(g.price)}</div>` : ''}
          ${reserved
            ? `<div class="g-buyer">com carinho, <strong>${esc(buyer)}</strong></div>`
            : `<button class="btn" type="button" data-gift-open="${esc(g.id)}">Presentear</button>`}
        </div>
      </div>`;
  }

  R.presentes = (s) => {
    const items = (s.items || []).filter((g) => g.visible !== false && g.name);
    if (!items.length) return '';
    return sectionShell('presentes', s.title, `
      ${s.subtitle ? `<p class="section-text">${esc(s.subtitle)}</p>` : ''}
      <div class="gifts-grid">${items.map(giftCardHtml).join('')}</div>`);
  };

  R.rsvp = (s) => sectionShell('rsvp', s.title, `
    ${s.text ? `<p class="section-text">${esc(s.text)}</p>` : ''}
    <div class="form-card">
      <form id="rsvpForm">
        <div class="field">
          <label for="rsvpName">Seu nome completo *</label>
          <input id="rsvpName" name="name" required maxlength="120" placeholder="Nome e sobrenome">
        </div>
        <div class="field">
          <label for="rsvpPhone">Telefone / WhatsApp</label>
          <input id="rsvpPhone" name="phone" maxlength="40" placeholder="(00) 00000-0000">
        </div>
        <div class="field">
          <label>Você vai?</label>
          <div class="radio-row">
            <label><input type="radio" name="attending" value="sim" checked> Sim, estarei lá! 🎉</label>
            <label><input type="radio" name="attending" value="nao"> Infelizmente não poderei</label>
          </div>
        </div>
        <div class="field">
          <label for="rsvpGuests">Acompanhantes (além de você)</label>
          <input id="rsvpGuests" name="guests" type="number" min="0" max="20" value="0">
        </div>
        <div class="field">
          <label for="rsvpMsg">Observações</label>
          <textarea id="rsvpMsg" name="message" maxlength="500" placeholder="Restrições alimentares, nomes dos acompanhantes..."></textarea>
        </div>
        <button class="btn" type="submit" style="width:100%">Confirmar presença</button>
      </form>
    </div>`);

  R.recados = (s) => sectionShell('recados', s.title, `
    ${s.text ? `<p class="section-text">${esc(s.text)}</p>` : ''}
    <div class="form-card">
      <form id="msgForm">
        <div class="field">
          <label for="msgName">Seu nome *</label>
          <input id="msgName" name="name" required maxlength="120">
        </div>
        <div class="field">
          <label for="msgText">Recado *</label>
          <textarea id="msgText" name="text" required maxlength="1000" placeholder="Deixe seu carinho aqui..."></textarea>
        </div>
        <button class="btn" type="submit" style="width:100%">Enviar recado</button>
      </form>
    </div>
    <div class="messages-list" id="messagesList"></div>`);

  // ---------- montagem ----------
  let html = R.hero();
  for (const id of order) {
    const s = cfg.sections[id];
    if (R[id]) html += R[id](s) || '';
  }
  app.innerHTML = html;

  // rodapé — créditos do desenvolvedor são fixos, não passam pela configuração
  const CREDITS = {
    name: 'Mateus Almeida Dias',
    linkedin: 'https://www.linkedin.com/in/mateusalmeidadias/',
    portfolio: 'https://portifoliodemateusdealmeida.netlify.app',
  };
  const LINKEDIN_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z"/></svg>`;
  const GLOBE_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20z"/></svg>`;
  document.getElementById('footer').innerHTML = `
    <div class="f-names">${n1} <span class="amp">&</span> ${n2}</div>
    ${dateFmt ? `<div class="f-text">${dateFmt}</div>` : ''}
    <div class="f-text">${esc(cfg.footer?.text || '')} <span class="f-heart">♥</span></div>
    <div class="f-credits">
      <span>Site feito por <strong>${esc(CREDITS.name)}</strong></span>
      <span class="f-social-row">
        <a class="f-social" href="${CREDITS.linkedin}" target="_blank" rel="noopener" title="LinkedIn">${LINKEDIN_ICON} LinkedIn</a>
        <a class="f-social" href="${CREDITS.portfolio}" target="_blank" rel="noopener" title="Portfólio">${GLOBE_ICON} Portfólio</a>
      </span>
    </div>`;

  // ---------- contagem regressiva ----------
  const cd = document.getElementById('countdown');
  if (cd && weddingDate) {
    const units = cd.querySelectorAll('.num');
    const tick = () => {
      let diff = Math.max(0, weddingDate - Date.now()) / 1000;
      const d = Math.floor(diff / 86400); diff %= 86400;
      const h = Math.floor(diff / 3600); diff %= 3600;
      const m = Math.floor(diff / 60);
      const s = Math.floor(diff % 60);
      [d, h, m, s].forEach((v, i) => (units[i].textContent = String(v).padStart(2, '0')));
    };
    tick();
    setInterval(tick, 1000);
  }

  // ---------- animação ao rolar ----------
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('in')),
    { threshold: 0.12 }
  );
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  // ---------- RSVP ----------
  const rsvpForm = document.getElementById('rsvpForm');
  if (rsvpForm) {
    rsvpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(rsvpForm);
      const body = Object.fromEntries(fd.entries());
      const resp = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (resp.ok) {
        rsvpForm.closest('.form-card').innerHTML = `
          <div class="form-success">
            <div class="big">💌</div>
            <h3 style="font-family:var(--font-display);margin-bottom:.4rem">Presença registrada!</h3>
            <p>Obrigado, ${esc(body.name)}. Mal podemos esperar para te ver!</p>
          </div>`;
      } else {
        toast(await apiError(resp, 'Erro ao enviar. Tente novamente.'), true);
      }
    });
  }

  // ---------- recados ----------
  async function loadMessages() {
    const list = document.getElementById('messagesList');
    if (!list) return;
    const msgs = await fetch('/api/messages').then((r) => r.json());
    if (!msgs.length) {
      list.innerHTML = `<p class="messages-empty">Seja o primeiro a deixar um recado! 💕</p>`;
      return;
    }
    list.innerHTML = msgs
      .slice()
      .reverse()
      .map((m) => `
        <div class="message-card">
          <div class="m-head">
            <span class="m-name">${esc(m.name)}</span>
            <span class="m-date">${new Date(m.date).toLocaleDateString('pt-BR')}</span>
          </div>
          <div class="m-text">${esc(m.text)}</div>
        </div>`).join('');
  }
  loadMessages();

  // ---------- reserva de presentes ----------
  function refreshGiftCard(gift) {
    const card = document.querySelector(`[data-gift-id="${CSS.escape(gift.id)}"]`);
    if (card) card.outerHTML = giftCardHtml(gift);
  }

  function openGiftReserveModal(gift) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `
      <div class="modal">
        <button class="modal-close" type="button" aria-label="Fechar">✕</button>
        <h3 class="modal-title">${esc(gift.name)}</h3>
        ${gift.price ? `<div class="modal-price">${brl(gift.price)}</div>` : ''}
        ${gift.url
          ? `<a class="btn outline modal-store" href="${esc(gift.url)}" target="_blank" rel="noopener">Ver na loja ↗</a>`
          : ''}
        <div class="modal-divider"></div>
        <p class="modal-hint">Vai dar este presente? Reserve aqui para que ninguém escolha o mesmo:</p>
        <div class="field">
          <label for="reserveName">Seu nome *</label>
          <input id="reserveName" maxlength="120" placeholder="Nome e sobrenome">
        </div>
        <label class="check-row">
          <input type="checkbox" id="reserveAnon"> Prefiro não mostrar meu nome no site
        </label>
        <button class="btn modal-confirm" type="button">Confirmar presente 🎁</button>
      </div>`;
    document.body.appendChild(back);

    const close = () => back.remove();
    back.querySelector('.modal-close').onclick = close;
    back.addEventListener('click', (e) => { if (e.target === back) close(); });

    back.querySelector('.modal-confirm').onclick = async () => {
      const name = back.querySelector('#reserveName').value.trim();
      if (!name) { toast('Informe seu nome para reservar.', true); return; }
      const anonymous = back.querySelector('#reserveAnon').checked;
      const resp = await fetch(`/api/gifts/${encodeURIComponent(gift.id)}/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, anonymous }),
      });
      if (resp.ok) {
        gift.reserved = { name: anonymous ? '' : name, anonymous };
        refreshGiftCard(gift);
        close();
        toast('Presente reservado! Os noivos agradecem de coração 💕');
      } else if (resp.status === 409) {
        gift.reserved = { name: '', anonymous: true };
        refreshGiftCard(gift);
        close();
        toast('Poxa, alguém acabou de escolher este presente. Que tal outro?', true);
      } else {
        toast(await apiError(resp, 'Erro ao reservar. Recarregue a página (Ctrl+F5) e tente novamente.'), true);
      }
    };
  }

  app.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-gift-open]');
    if (!btn) return;
    const gift = (cfg.sections.presentes?.items || []).find((g) => g.id === btn.dataset.giftOpen);
    if (gift) openGiftReserveModal(gift);
  });

  const msgForm = document.getElementById('msgForm');
  if (msgForm) {
    msgForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(msgForm).entries());
      const resp = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (resp.ok) {
        msgForm.reset();
        toast('Recado enviado! 💕');
        loadMessages();
      } else {
        toast(await apiError(resp, 'Erro ao enviar recado.'), true);
      }
    });
  }
})();

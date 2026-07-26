const { Router } = require('express');

function isPlainObject(v) {
  return Object.prototype.toString.call(v) === '[object Object]';
}

/** Oculta o nome de quem reservou presente pedindo anonimato. */
function maskAnonymousReservations(cfg) {
  const items = cfg.sections && cfg.sections.presentes && cfg.sections.presentes.items;
  if (Array.isArray(items)) {
    for (const gift of items) {
      if (gift.reserved && gift.reserved.anonymous) {
        gift.reserved = { ...gift.reserved, name: '' };
      }
    }
  }
  return cfg;
}

module.exports = function siteRoutes({ store, guard, readDefaults }) {
  const router = Router();

  // configuração padrão de fábrica — usada pelos botões de redefinir do painel
  router.get('/defaults', guard, (req, res) => res.json(readDefaults()));

  router.get('/', (req, res, next) => {
    // ?full=1 (painel) entrega os nomes reais — protegido quando há senha
    if (req.query.full === '1') {
      return guard(req, res, () => res.json(store.read()));
    }
    res.json(maskAnonymousReservations(store.read()));
  });

  router.put('/', guard, (req, res) => {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Dados inválidos.' });
    }
    store.write(req.body);
    res.json({ ok: true });
  });

  return router;
};

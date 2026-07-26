const { Router } = require('express');
const crypto = require('crypto');
const { wrap } = require('../middleware');

module.exports = function messagesRoutes({ store, guard, limiter }) {
  const router = Router();

  router.post(
    '/',
    limiter,
    wrap(async (req, res) => {
      const { name, text } = req.body || {};
      if (!name || !String(name).trim() || !text || !String(text).trim()) {
        return res.status(400).json({ error: 'Preencha nome e recado.' });
      }
      await store.add({
        id: crypto.randomBytes(6).toString('hex'),
        name: String(name).trim().slice(0, 120),
        text: String(text).trim().slice(0, 1000),
        date: new Date().toISOString(),
      });
      res.json({ ok: true });
    })
  );

  router.get('/', wrap(async (req, res) => res.json(await store.all())));

  router.delete(
    '/:id',
    guard,
    wrap(async (req, res) => {
      await store.remove(req.params.id);
      res.json({ ok: true });
    })
  );

  // admin apaga todos os recados (opção do reset completo do painel)
  router.delete(
    '/',
    guard,
    wrap(async (req, res) => {
      await store.clear();
      res.json({ ok: true });
    })
  );

  return router;
};

const { Router } = require('express');
const crypto = require('crypto');
const { wrap } = require('../middleware');

module.exports = function rsvpRoutes({ store, guard, limiter }) {
  const router = Router();

  router.post(
    '/',
    limiter,
    wrap(async (req, res) => {
      const { name, phone, attending, guests, message } = req.body || {};
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'Informe seu nome.' });
      }
      await store.add({
        id: crypto.randomBytes(6).toString('hex'),
        name: String(name).trim().slice(0, 120),
        phone: String(phone || '').trim().slice(0, 40),
        attending: attending !== false && attending !== 'nao',
        guests: Math.max(0, Math.min(20, parseInt(guests, 10) || 0)),
        message: String(message || '').trim().slice(0, 500),
        date: new Date().toISOString(),
      });
      res.json({ ok: true });
    })
  );

  router.get('/', guard, wrap(async (req, res) => res.json(await store.all())));

  router.delete(
    '/:id',
    guard,
    wrap(async (req, res) => {
      await store.remove(req.params.id);
      res.json({ ok: true });
    })
  );

  // admin apaga todas as confirmações (opção do reset completo do painel)
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

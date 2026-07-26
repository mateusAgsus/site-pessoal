const { Router } = require('express');
const crypto = require('crypto');

module.exports = function rsvpRoutes({ store, guard, limiter }) {
  const router = Router();

  router.post('/', limiter, (req, res) => {
    const { name, phone, attending, guests, message } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Informe seu nome.' });
    }
    const list = store.read();
    list.push({
      id: crypto.randomBytes(6).toString('hex'),
      name: String(name).trim().slice(0, 120),
      phone: String(phone || '').trim().slice(0, 40),
      attending: attending !== false && attending !== 'nao',
      guests: Math.max(0, Math.min(20, parseInt(guests, 10) || 0)),
      message: String(message || '').trim().slice(0, 500),
      date: new Date().toISOString(),
    });
    store.write(list);
    res.json({ ok: true });
  });

  router.get('/', guard, (req, res) => res.json(store.read()));

  router.delete('/:id', guard, (req, res) => {
    store.write(store.read().filter((r) => r.id !== req.params.id));
    res.json({ ok: true });
  });

  return router;
};

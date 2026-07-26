const { Router } = require('express');
const crypto = require('crypto');

module.exports = function messagesRoutes({ store, guard, limiter }) {
  const router = Router();

  router.post('/', limiter, (req, res) => {
    const { name, text } = req.body || {};
    if (!name || !String(name).trim() || !text || !String(text).trim()) {
      return res.status(400).json({ error: 'Preencha nome e recado.' });
    }
    const list = store.read();
    list.push({
      id: crypto.randomBytes(6).toString('hex'),
      name: String(name).trim().slice(0, 120),
      text: String(text).trim().slice(0, 1000),
      date: new Date().toISOString(),
    });
    store.write(list);
    res.json({ ok: true });
  });

  router.get('/', (req, res) => res.json(store.read()));

  router.delete('/:id', guard, (req, res) => {
    store.write(store.read().filter((m) => m.id !== req.params.id));
    res.json({ ok: true });
  });

  return router;
};

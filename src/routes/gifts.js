const { Router } = require('express');
const { wrap } = require('../middleware');

function findGift(cfg, id) {
  const items = (cfg.sections && cfg.sections.presentes && cfg.sections.presentes.items) || [];
  return items.find((g) => g.id === id);
}

module.exports = function giftRoutes({ store, guard, limiter }) {
  const router = Router();

  // convidado marca o presente como escolhido
  router.post(
    '/:id/reserve',
    limiter,
    wrap(async (req, res) => {
      const { name, anonymous } = req.body || {};
      const clean = String(name || '').trim().slice(0, 120);
      if (!clean) return res.status(400).json({ error: 'Informe seu nome.' });

      const cfg = await store.read();
      const gift = findGift(cfg, req.params.id);
      if (!gift) return res.status(404).json({ error: 'Presente não encontrado.' });
      if (gift.reserved) {
        return res.status(409).json({ error: 'Ops! Alguém acabou de escolher este presente.' });
      }

      gift.reserved = {
        name: clean,
        anonymous: Boolean(anonymous),
        date: new Date().toISOString(),
      };
      await store.write(cfg);
      res.json({ ok: true });
    })
  );

  // admin devolve o presente para a lista
  router.delete(
    '/:id/reserve',
    guard,
    wrap(async (req, res) => {
      const cfg = await store.read();
      const gift = findGift(cfg, req.params.id);
      if (!gift) return res.status(404).json({ error: 'Presente não encontrado.' });
      delete gift.reserved;
      await store.write(cfg);
      res.json({ ok: true });
    })
  );

  return router;
};

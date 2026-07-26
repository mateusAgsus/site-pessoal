const { Router } = require('express');
const { fetchLinkPreview } = require('../scraper');
const { BlockedUrlError } = require('../net-guard');

module.exports = function previewRoutes({ uploads, guard }) {
  const router = Router();

  router.get('/', guard, async (req, res) => {
    const url = req.query.url;
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'Informe uma URL válida (começando com http/https).' });
    }
    try {
      res.json(await fetchLinkPreview(url, uploads));
    } catch (err) {
      if (err instanceof BlockedUrlError) {
        return res.status(400).json({ error: err.message });
      }
      const msg =
        err.name === 'TimeoutError'
          ? 'A página demorou demais para responder.'
          : `Não foi possível ler a página (${err.message}). Alguns sites bloqueiam leitura automática — preencha os campos manualmente.`;
      res.status(502).json({ error: msg });
    }
  });

  return router;
};

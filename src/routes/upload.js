const { Router } = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { wrap } = require('../middleware');

const ALLOWED = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const MAX_SIZE = 10 * 1024 * 1024;

module.exports = function uploadRoutes({ uploads, guard }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_SIZE },
    fileFilter(req, file, cb) {
      cb(null, Boolean(ALLOWED[file.mimetype]));
    },
  });

  const router = Router();

  router.post(
    '/',
    guard,
    upload.single('file'),
    wrap(async (req, res) => {
      if (!req.file) {
        return res.status(400).json({ error: 'Envie uma imagem JPG, PNG, WebP ou GIF (até 10 MB).' });
      }
      // nome aleatório + extensão derivada do mimetype: nada do nome
      // original do arquivo é usado
      const name = crypto.randomBytes(8).toString('hex') + ALLOWED[req.file.mimetype];
      const url = await uploads.save(name, req.file.buffer, req.file.mimetype);
      res.json({ url });
    })
  );

  return router;
};

const { Router } = require('express');
const multer = require('multer');
const crypto = require('crypto');

const ALLOWED = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const MAX_SIZE = 10 * 1024 * 1024;

module.exports = function uploadRoutes({ uploadsDir, guard }) {
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadsDir,
      // nome aleatório + extensão derivada do mimetype: nada do nome
      // original do arquivo chega ao disco
      filename(req, file, cb) {
        cb(null, crypto.randomBytes(8).toString('hex') + ALLOWED[file.mimetype]);
      },
    }),
    limits: { fileSize: MAX_SIZE },
    fileFilter(req, file, cb) {
      cb(null, Boolean(ALLOWED[file.mimetype]));
    },
  });

  const router = Router();

  router.post('/', guard, upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Envie uma imagem JPG, PNG, WebP ou GIF (até 10 MB).' });
    }
    res.json({ url: '/uploads/' + req.file.filename });
  });

  return router;
};

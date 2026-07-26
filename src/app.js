const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const { createStore } = require('./storage');
const { basicAuth, rateLimit } = require('./middleware');
const siteRoutes = require('./routes/site');
const giftRoutes = require('./routes/gifts');
const uploadRoutes = require('./routes/upload');
const previewRoutes = require('./routes/preview');
const rsvpRoutes = require('./routes/rsvp');
const messagesRoutes = require('./routes/messages');

const ONE_DAY_S = 86400;

/**
 * Monta o app Express. `options` permite injetar diretórios e senha
 * nos testes; em produção tudo vem dos padrões/variáveis de ambiente.
 */
function createApp(options = {}) {
  const rootDir = options.rootDir || path.join(__dirname, '..');
  const publicDir = path.join(rootDir, 'public');
  const dataDir = options.dataDir || path.join(rootDir, 'data');
  const uploadsDir = options.uploadsDir || path.join(publicDir, 'uploads');
  const defaultsFile = options.defaultsFile || path.join(rootDir, 'data-defaults.json');
  const adminPassword = options.adminPassword ?? process.env.ADMIN_PASSWORD ?? '';

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

  const readDefaults = () =>
    JSON.parse(fs.readFileSync(defaultsFile, 'utf8').replace(/^﻿/, ''));

  const stores = {
    site: createStore(path.join(dataDir, 'site.json'), readDefaults),
    rsvps: createStore(path.join(dataDir, 'rsvps.json'), () => []),
    messages: createStore(path.join(dataDir, 'messages.json'), () => []),
  };

  const guard = basicAuth(adminPassword);
  const publicFormLimiter = rateLimit({ windowMs: 60_000, max: 10 });

  const app = express();
  app.disable('x-powered-by');
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));

  // painel protegido antes do static, para o guard valer também com senha
  app.get(['/admin', '/admin.html'], guard, (req, res) =>
    res.sendFile(path.join(publicDir, 'admin.html'))
  );

  app.use(
    express.static(publicDir, {
      setHeaders(res, filePath) {
        const dir = path.dirname(filePath);
        if (dir.endsWith(`${path.sep}uploads`) || dir.endsWith(`${path.sep}img`)) {
          res.setHeader('Cache-Control', `public, max-age=${ONE_DAY_S}`);
        }
      },
    })
  );

  app.use('/api/site', siteRoutes({ store: stores.site, guard, readDefaults }));
  app.use('/api/gifts', giftRoutes({ store: stores.site, guard, limiter: publicFormLimiter }));
  app.use('/api/upload', uploadRoutes({ uploadsDir, guard }));
  app.use('/api/link-preview', previewRoutes({ uploadsDir, guard }));
  app.use('/api/rsvp', rsvpRoutes({ store: stores.rsvps, guard, limiter: publicFormLimiter }));
  app.use('/api/messages', messagesRoutes({ store: stores.messages, guard, limiter: publicFormLimiter }));

  // JSON malformado no body → resposta amigável em vez de stack trace
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
      return res.status(400).json({ error: 'Dados inválidos.' });
    }
    next(err);
  });

  return app;
}

module.exports = createApp;

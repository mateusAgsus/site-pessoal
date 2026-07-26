const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const { createStore, createListStore } = require('./storage');
const supabase = require('./supabase');
const { createLocalUploads, createSupabaseUploads } = require('./uploads');
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
 *
 * Persistência: com SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY definidos,
 * dados e imagens vão para o Supabase (necessário em hospedagem
 * serverless, onde o disco é efêmero). Sem eles, tudo fica em arquivos
 * locais como antes. Diretórios injetados via options forçam o modo
 * arquivo, para os testes nunca tocarem um banco real.
 */
function createApp(options = {}) {
  const rootDir = options.rootDir || path.join(__dirname, '..');
  const publicDir = path.join(rootDir, 'public');
  const viewsDir = path.join(rootDir, 'views');
  const dataDir = options.dataDir || path.join(rootDir, 'data');
  const uploadsDir = options.uploadsDir || path.join(publicDir, 'uploads');
  const defaultsFile = options.defaultsFile || path.join(rootDir, 'data-defaults.json');
  const adminPassword = options.adminPassword ?? process.env.ADMIN_PASSWORD ?? '';

  const readDefaults = () =>
    JSON.parse(fs.readFileSync(defaultsFile, 'utf8').replace(/^﻿/, ''));

  const useSupabase =
    !options.dataDir && !options.uploadsDir && supabase.isConfigured();

  let stores, uploads;
  if (useSupabase) {
    const client = supabase.createSupabaseClient();
    stores = {
      site: supabase.createDocStore(client, 'site', readDefaults),
      rsvps: supabase.createListStore(client, 'rsvps'),
      messages: supabase.createListStore(client, 'messages'),
    };
    uploads = createSupabaseUploads(client, process.env.SUPABASE_BUCKET || 'uploads');
  } else {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(uploadsDir, { recursive: true });
    stores = {
      site: createStore(path.join(dataDir, 'site.json'), readDefaults),
      rsvps: createListStore(path.join(dataDir, 'rsvps.json')),
      messages: createListStore(path.join(dataDir, 'messages.json')),
    };
    uploads = createLocalUploads(uploadsDir);
  }

  const guard = basicAuth(adminPassword);
  const publicFormLimiter = rateLimit({ windowMs: 60_000, max: 10 });

  const app = express();
  app.disable('x-powered-by');
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));

  // admin.html fica fora de public/ para nunca ser servido sem passar
  // pelo guard (hospedagens estáticas entregam public/ direto)
  app.get(['/admin', '/admin.html'], guard, (req, res) =>
    res.sendFile(path.join(viewsDir, 'admin.html'))
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
  app.use('/api/upload', uploadRoutes({ uploads, guard }));
  app.use('/api/link-preview', previewRoutes({ uploads, guard }));
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

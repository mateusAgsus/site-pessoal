const crypto = require('crypto');

function timingSafeEquals(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufB, bufB); // custo constante mesmo em tamanhos diferentes
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * HTTP Basic Auth opcional: sem senha configurada, libera tudo
 * (uso local). Com senha (ADMIN_PASSWORD), protege painel e APIs
 * de escrita/administração.
 */
function basicAuth(password) {
  return (req, res, next) => {
    if (!password) return next();
    const header = req.headers.authorization || '';
    const [scheme, value] = header.split(' ');
    if (scheme === 'Basic' && value) {
      const decoded = Buffer.from(value, 'base64').toString('utf8');
      const pass = decoded.slice(decoded.indexOf(':') + 1);
      if (timingSafeEquals(pass, password)) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Painel do Site"');
    res.status(401).json({ error: 'Autenticação necessária.' });
  };
}

/**
 * Rate limit simples em memória por IP — suficiente para conter spam
 * nos formulários públicos sem dependências externas.
 */
function rateLimit({ windowMs = 60_000, max = 10 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const recent = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde um instante e tente de novo.' });
    }
    recent.push(now);
    hits.set(req.ip, recent);
    if (hits.size > 10_000) hits.clear(); // válvula de escape de memória
    next();
  };
}

/**
 * Encaminha rejeições de handlers async para o error handler do
 * Express 4, que não faz isso sozinho.
 */
function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { basicAuth, rateLimit, wrap };

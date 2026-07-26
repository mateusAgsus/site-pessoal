const dns = require('dns/promises');
const net = require('net');

/** Erro de URL bloqueada — mapeado para HTTP 400 nas rotas. */
class BlockedUrlError extends Error {}

function isPrivateV4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) ||           // link-local
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return isPrivateV4(ip);
  const low = ip.toLowerCase();
  if (low === '::' || low === '::1') return true;
  const mapped = low.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]);
  if (/^f[cd]/.test(low)) return true;   // fc00::/7 (unique local)
  if (/^fe[89ab]/.test(low)) return true; // fe80::/10 (link-local)
  return false;
}

/**
 * Garante que a URL é http(s) público — protege contra SSRF
 * (ex.: alguém pedir preview de http://192.168.0.1/admin).
 */
async function assertPublicUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new BlockedUrlError('URL inválida.');
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new BlockedUrlError('Apenas endereços http/https são aceitos.');
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new BlockedUrlError('Endereço local não é permitido.');
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new BlockedUrlError('Endereço de rede privada não é permitido.');
    return;
  }
  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new BlockedUrlError('Não foi possível resolver o endereço.');
  }
  if (addrs.some((a) => isPrivateIp(a.address))) {
    throw new BlockedUrlError('Endereço de rede privada não é permitido.');
  }
}

/**
 * fetch com redirecionamentos manuais: cada salto passa pela mesma
 * validação anti-SSRF antes de ser seguido.
 */
async function safeFetch(url, init = {}, maxRedirects = 5) {
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicUrl(current);
    const resp = await fetch(current, { ...init, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(resp.status)) return resp;
    const location = resp.headers.get('location');
    if (!location) return resp;
    current = new URL(location, current).href;
  }
  throw new BlockedUrlError('Redirecionamentos demais.');
}

module.exports = { BlockedUrlError, isPrivateIp, assertPublicUrl, safeFetch };

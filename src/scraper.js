const crypto = require('crypto');
const { safeFetch } = require('./net-guard');

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  Accept: 'text/html,application/xhtml+xml',
};

const FETCH_TIMEOUT_MS = 15000;
const MAX_HTML_BYTES = 2_000_000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

// ---------- funções puras de parsing (testáveis isoladamente) ----------

function decodeEntities(str) {
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .trim();
}

/** Lê o content da primeira meta tag que casar com um dos nomes dados. */
function metaContent(html, names) {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name|itemprop)=["']${name}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${name}["']`,
      'i'
    );
    const m = html.match(re);
    if (m) return decodeEntities(m[1] || m[2]);
  }
  return null;
}

/** Converte "R$ 1.234,56", "1234.56" etc. em número, ou null. */
function parsePrice(raw) {
  if (raw == null) return null;
  let s = String(raw).replace(/[^\d.,]/g, '');
  if (!s) return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // formato BR
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Procura um Product em blocos JSON-LD e extrai nome/imagem/preço. */
function findJsonLdProduct(html) {
  const blocks = html.match(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  if (!blocks) return null;
  for (const block of blocks) {
    const body = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      continue; // JSON-LD malformado
    }
    const items = Array.isArray(parsed) ? parsed : [parsed, ...(parsed['@graph'] || [])];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      if (!/product/i.test(String(item['@type'] || ''))) continue;
      const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
      return {
        name: item.name || null,
        image: (Array.isArray(item.image) ? item.image[0] : item.image) || null,
        price: parsePrice(offers && (offers.price || offers.lowPrice)),
      };
    }
  }
  return null;
}

/** Extrai {title, image, price} do HTML de uma página de produto. */
function extractProductData(html) {
  const ld = findJsonLdProduct(html) || {};

  let title =
    ld.name ||
    metaContent(html, ['og:title', 'twitter:title']) ||
    (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] ||
    null;
  if (title) title = decodeEntities(title).slice(0, 140);

  const image =
    ld.image || metaContent(html, ['og:image:secure_url', 'og:image', 'twitter:image']);

  let price =
    ld.price ||
    parsePrice(
      metaContent(html, [
        'product:price:amount',
        'og:price:amount',
        'product:sale_price:amount',
        'twitter:data1',
        'price',
      ])
    );
  if (price == null) {
    const m = html.match(/R\$\s*&?n?b?s?p?;?\s*([\d.]{1,10},\d{2})/);
    if (m) price = parsePrice(m[1]);
  }

  return { title, image: image || null, price };
}

// ---------- operações com rede ----------

const IMAGE_EXT = {
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
};

async function downloadImage(imageUrl, referer, uploads) {
  const resp = await safeFetch(imageUrl, {
    headers: { ...FETCH_HEADERS, Accept: 'image/*', Referer: referer },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const type = (resp.headers.get('content-type') || '').split(';')[0].trim();
  const ext = IMAGE_EXT[type];
  if (!ext) throw new Error('Não é uma imagem suportada');
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('Imagem grande demais');
  const name = crypto.randomBytes(8).toString('hex') + ext;
  return uploads.save(name, buf, type);
}

/**
 * Busca a página do presente e retorna {title, image, price}.
 * A imagem é copiada para o armazenamento de uploads quando possível;
 * senão mantém a URL remota como fallback.
 */
async function fetchLinkPreview(url, uploads) {
  const resp = await safeFetch(url, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error('A página respondeu com status ' + resp.status);
  const html = (await resp.text()).slice(0, MAX_HTML_BYTES);

  const data = extractProductData(html);

  if (data.image) {
    try {
      const absolute = new URL(data.image, resp.url || url).href;
      data.image = await downloadImage(absolute, url, uploads);
    } catch {
      /* mantém a URL remota */
    }
  }
  return data;
}

module.exports = {
  decodeEntities,
  metaContent,
  parsePrice,
  findJsonLdProduct,
  extractProductData,
  fetchLinkPreview,
};

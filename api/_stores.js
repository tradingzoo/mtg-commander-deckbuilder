// Store lookups for the card finder. Each store reads its own public search page, the same one a
// shopper sees, and turns it into { name, set, finish, price, qty, inStock, url } listings.
// Parsers are pure functions so tests can feed them saved page shapes.
import { USER_AGENT } from './_lib.js';

const TIMEOUT_MS = 8000;

// Lowercase, no accents, straight apostrophes, single spaces. "Dáin" -> "dain".
export function norm(s) {
  return decodeEntities(String(s || ''))
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ]/g, "'")
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

export function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

// Does a store's product title name this card? "Gimli of the Glittering Caves (Extended Art) [LTC]" yes,
// "Gimli's Axe" no. Front face only for double-faced cards.
export function titleMatches(title, cardName) {
  const want = norm(String(cardName).split(' // ')[0]);
  const t = norm(title);
  if (!t.startsWith(want)) return false;
  const rest = t.slice(want.length);
  return rest === '' || /^\s*[\[(\-–—/|,:]/.test(rest);
}

const between = (s, open, close) => {
  const i = s.indexOf(open); if (i < 0) return '';
  const j = s.indexOf(close, i + open.length); return j < 0 ? '' : s.slice(i + open.length, j);
};
const stripTags = (s) => decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
const money = (s) => { const n = Number(String(s).replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };

async function get(url, accept) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT, Accept: accept } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return accept.includes('json') ? await r.json() : await r.text();
  } finally { clearTimeout(t); }
}

// ---------- 1st Pick (Shopify) ----------
// search/suggest.json gives matching products; each product's .js gives every condition and whether it's in stock.
export function parseShopifySuggest(json, cardName) {
  const products = json?.resources?.results?.products || [];
  return products.filter(p => titleMatches(p.title, cardName)).map(p => ({
    handle: p.handle, title: decodeEntities(p.title), url: String(p.url || `/products/${p.handle}`).split('?')[0], available: !!p.available,
  }));
}

// Shopify prices in product .js are in satang (1/100 baht).
export function parseShopifyProduct(prod, base, title) {
  const name = decodeEntities(title || prod.title || '');
  const set = (name.match(/\[([^\]]+)\]\s*$/) || [])[1] || '';
  const label = name.replace(/\s*\[[^\]]+\]\s*$/, '');
  const rows = (prod.variants || []).map(v => ({
    name: label, set, finish: v.title || v.public_title || '', price: typeof v.price === 'number' ? v.price / 100 : money(v.price),
    qty: null, inStock: !!v.available, url: base + (prod.url || `/products/${prod.handle}`),
  }));
  // Each printing lists every condition; keep the ones you can buy, or one sold-out row so it still shows.
  const buyable = rows.filter(r => r.inStock);
  return buyable.length ? buyable : rows.slice(0, 1);
}

// 1st Pick, Power9 and Big Bear all run Shopify with the same card catalogue app, so one reader covers both.
const shopify = (base) => async (cardName) => {
  const q = encodeURIComponent(cardName);
  const json = await get(`${base}/search/suggest.json?q=${q}&resources%5Btype%5D=product&resources%5Blimit%5D=10`, 'application/json');
  const hits = parseShopifySuggest(json, cardName).slice(0, 6);
  const listings = [];
  for (const h of hits) {
    try { listings.push(...parseShopifyProduct(await get(`${base}/products/${h.handle}.js`, 'application/json'), base, h.title)); }
    catch { listings.push({ name: h.title, set: '', finish: '', price: null, qty: null, inStock: h.available, url: base + h.url }); }
  }
  return { listings, searchUrl: `${base}/search?q=${q}` };
};

// ---------- Yannick The Gathering (server-rendered search page) ----------
// Only in-stock products get a card; out-of-stock matches are summarised as "We know N matching products...".
export function parseYannick(html, cardName, base = 'https://yannickthegathering.com') {
  const listings = [];
  for (const chunk of html.split('<article class="row-product').slice(1)) {
    const art = chunk.split('</article>')[0];
    const nameP = between(art, '<p class="row-name">', '</p>');
    if (!nameP) continue;
    const title = stripTags(nameP);
    if (!titleMatches(title, cardName)) continue;
    const href = (nameP.match(/href="([^"]+)"/) || [])[1] || '';
    const amount = (art.match(/product-card-price-amount"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || '';
    const price = money(stripTags(amount).replace('฿', ''));
    const options = [...art.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map(m => decodeEntities(m[1]).trim()).filter(Boolean);
    const qtyText = (art.match(/title="[^"]*Total qty:\s*([0-9+]+)/) || [])[1] || null;
    // Labels seen: --in "In stock", --low "Only 2 left". Anything saying sold out / out of stock counts as gone.
    const label = (art.match(/product-stock-label[^"]*"[^>]*>([^<]*)</) || [])[1] || '';
    const inStock = !/product-stock-label--(out|sold|none)/.test(art) && !/sold out|out of stock|หมด/i.test(label);
    const set = (title.match(/\(([A-Z0-9]{3,5})\)(?:\s+\w+)?\s*$/) || [])[1] || '';
    listings.push({
      name: title.replace(/\s*\([A-Z0-9]{3,5}\)(\s+\w+)?\s*$/, '').replace(/\s*\(\d+\)\s*$/, '') + (/\bJapanese\s*$/.test(title) ? ' (Japanese)' : ''),
      set, finish: options[0] || stripTags(between(art, 'product-variant-current">', '</p>')), price, qty: qtyText, inStock,
      url: href ? new URL(href, base).href.split('?')[0] : '',
    });
  }
  const oos = html.match(/We know\s*(?:<!-- -->)?\s*(\d+)\s*(?:<!-- -->)?\s*matching product/);
  return { listings, outOfStockCount: oos ? Number(oos[1]) : 0 };
}

async function yannick(cardName) {
  const base = 'https://yannickthegathering.com';
  const searchUrl = `${base}/search?q=${encodeURIComponent(cardName)}`;
  const { listings, outOfStockCount } = parseYannick(await get(searchUrl, 'text/html'), cardName, base);
  return { listings, outOfStockCount, searchUrl };
}

// ---------- Sabai Cards (Laravel + Inertia: the page JSON sits in a data-page attribute) ----------
export function parseSabai(html, cardName, base = 'https://sabaicards.com') {
  const raw = (html.match(/data-page="([^"]*)"/) || [])[1];
  if (!raw) throw new Error('no page data');
  const page = JSON.parse(decodeEntities(raw));
  const rows = page?.props?.datas?.data || [];
  return rows.filter(r => titleMatches(r.original_name || r.name, cardName)).map(r => {
    const qty = Number(r.quantity) || 0;
    const extra = String(r.name || '').slice(String(r.original_name || '').length).trim();
    return {
      name: decodeEntities(r.original_name || r.name) + (extra ? ` ${extra}` : ''),
      set: r.expansion || '', finish: r.variation === 'foil' ? 'Foil' : 'Non-foil',
      price: money(r.price), qty: qty || null, inStock: qty > 0 && Number(r.status ?? 1) === 1,
      url: `${base}/products/view/${r.id}`,
    };
  });
}

async function sabai(cardName) {
  const base = 'https://sabaicards.com';
  const searchUrl = `${base}/products/singles?search=${encodeURIComponent(cardName)}`;
  return { listings: parseSabai(await get(searchUrl, 'text/html'), cardName, base), searchUrl };
}

// ---------- LeveLmax TCG (tomorrowlion.com, Next.js server-rendered search) ----------
// Each result: <a href="/card/{id}"><h3>Name</h3></a> then <span class="truncate">NM · SET</span><span class="tnum">฿ 252</span>.
// A "Foil" badge sits on the image link just before. The page lists only cards they have.
export function parseLevelmax(html, cardName, base = 'https://www.tomorrowlion.com') {
  const h = html.replace(/<!-- -->/g, '');
  const re = /<a[^>]*href="\/card\/([0-9a-f-]+)[^"]*"[^>]*>\s*<h3[^>]*>([^<]*)<\/h3>/g;
  const listings = [];
  let m;
  while ((m = re.exec(h))) {
    const title = decodeEntities(m[2]).trim();
    if (!titleMatches(title, cardName)) continue;
    const after = h.slice(m.index, m.index + 2500);
    const sp = after.match(/<span class="truncate[^"]*"[^>]*>([^<]*)<\/span>\s*<span class="tnum[^"]*"[^>]*>([^<]*)</);
    const before = h.slice(Math.max(0, h.indexOf(`href="/card/${m[1]}`)), m.index);
    const [cond = '', set = ''] = sp ? decodeEntities(sp[1]).split('·').map(x => x.trim()) : [];
    listings.push({
      name: title, set, finish: [cond, />\s*Foil\s*</.test(before) ? 'Foil' : ''].filter(Boolean).join(' · '),
      price: sp ? money(sp[2].replace('฿', '')) : null, qty: null, inStock: true, url: `${base}/card/${m[1]}`,
    });
  }
  return { listings };
}

async function levelmax(cardName) {
  const base = 'https://www.tomorrowlion.com';
  const searchUrl = `${base}/cards?q=${encodeURIComponent(cardName)}`;
  return { ...parseLevelmax(await get(searchUrl, 'text/html'), cardName, base), searchUrl };
}

// ---------- Nox TCG (Chiang Mai, ships across Thailand) ----------
// JSON API behind their card search. Singles and foils are separate "variants"; in_stock=true keeps only cards they hold.
// Each result has stock: [{ condition, quantity, price_thb }].
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function parseNox(json, cardName, foil, base = 'https://noxtcg.com') {
  const out = [];
  for (const r of json?.results || []) {
    const name = String(r.name || '').replace(/\s*\(\d+\)\s*$/, '');
    if (!titleMatches(name, cardName)) continue;
    for (const st of r.stock || []) {
      const qty = Number(st.quantity) || 0;
      out.push({
        name: r.name, set: r.set?.name || r.set?.abbreviation || '',
        finish: [st.condition, foil || r.is_foil ? 'Foil' : ''].filter(Boolean).join(' · '),
        price: money(st.price_thb), qty: qty || null, inStock: qty > 0,
        url: `${base}/cards/mtg/${r.id}-${slug(r.clean_name || r.name)}`,
      });
    }
  }
  return out;
}

async function nox(cardName) {
  const base = 'https://noxtcg.com';
  const q = encodeURIComponent(cardName);
  const listings = [];
  for (const variant of ['singles', 'foils']) {
    const json = await get(`${base}/api/games/mtg/cards?variant=${variant}&q=${q}&in_stock=true&page=1&page_size=60`, 'application/json');
    listings.push(...parseNox(json, cardName, variant === 'foils', base));
  }
  return { listings, searchUrl: `${base}/cards/mtg?q=${q}` };
}

export const STORES = [
  { id: 'firstpick', name: '1st Pick', site: '1stpickhs-onlineshop.com', run: shopify('https://1stpickhs-onlineshop.com'),
    search: (n) => `https://1stpickhs-onlineshop.com/search?q=${encodeURIComponent(n)}` },
  { id: 'power9', name: 'Power9', site: 'power9cardstore.com', run: shopify('https://power9cardstore.com'),
    search: (n) => `https://power9cardstore.com/search?q=${encodeURIComponent(n)}` },
  { id: 'bigbear', name: 'Big Bear Cards', site: 'bigbearcards.com', run: shopify('https://bigbearcards.com'),
    search: (n) => `https://bigbearcards.com/search?q=${encodeURIComponent(n)}` },
  { id: 'levelmax', name: 'LeveLmax TCG', site: 'tomorrowlion.com', run: levelmax,
    search: (n) => `https://www.tomorrowlion.com/cards?q=${encodeURIComponent(n)}` },
  { id: 'nox', name: 'Nox TCG', site: 'noxtcg.com', area: 'Chiang Mai · ships to Bangkok', run: nox,
    search: (n) => `https://noxtcg.com/cards/mtg?q=${encodeURIComponent(n)}` },
  { id: 'yannick', name: 'Yannick The Gathering', site: 'yannickthegathering.com', run: yannick,
    search: (n) => `https://yannickthegathering.com/search?q=${encodeURIComponent(n)}` },
  { id: 'sabai', name: 'Sabai Cards', site: 'sabaicards.com', run: sabai,
    search: (n) => `https://sabaicards.com/products/singles?search=${encodeURIComponent(n)}` },
];

// In stock first, then cheapest.
export function sortListings(list) {
  return [...list].sort((a, b) => (b.inStock - a.inStock) || ((a.price ?? 1e9) - (b.price ?? 1e9)));
}

export async function checkStore(store, cardName) {
  try {
    const r = await store.run(cardName);
    const listings = sortListings(r.listings);
    const inStock = listings.filter(l => l.inStock);
    return {
      id: store.id, name: store.name, site: store.site, area: store.area || 'Bangkok', ok: true, searchUrl: r.searchUrl,
      inStock: inStock.length > 0, cheapest: inStock[0]?.price ?? null,
      outOfStockCount: (r.outOfStockCount || 0) + listings.filter(l => !l.inStock).length,
      listings: listings.slice(0, 12),
    };
  } catch (e) {
    return { id: store.id, name: store.name, site: store.site, area: store.area || 'Bangkok', ok: false, searchUrl: store.search(cardName),
      error: e.name === 'AbortError' ? 'Timed out' : 'Could not read the store page', listings: [] };
  }
}

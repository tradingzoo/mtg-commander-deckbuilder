// Sealed product finder: reads each Thai store's sealed listings, works out what each product is
// ("Final Fantasy Collector Booster Box" -> set Final Fantasy, kind collector-box), then finds the same
// product on TCGplayer (prices via tcgcsv.com, a free daily mirror) for a reference price in US dollars.
// Parsers and matchers are pure functions so tests can feed them saved page shapes.
import { USER_AGENT } from './_lib.js';
import { norm, decodeEntities } from './_stores.js';
import { MSRP } from './_msrp.js';

const TIMEOUT_MS = 9000;
const NOT_MTG = /riftbound|pok[eé]mon|one piece|lorcana|digimon|gundam|flesh and blood|yu-?gi-?oh|altered|shadowverse|union arena|weiss|vanguard|star wars unlimited|sorcery/i;

async function get(url, accept = 'application/json') {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT, Accept: accept } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return accept.includes('json') ? await r.json() : await r.text();
  } finally { clearTimeout(t); }
}

// Runs fn over items, `limit` at a time.
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

const money = (s) => { const n = Number(String(s ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
const stripTags = (s) => decodeEntities(String(s).replace(/<!-- -->/g, '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
// Words only, for comparing names: "Tarkir: Dragonstorm" and "Tarkir Dragonstorm" both -> "tarkir dragonstorm".
export const words = (s) => norm(s).replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// ---------- What is this product? ----------
// Same rules run on store titles and TCGplayer names, so both sides land on the same labels.
const KINDS = [
  [/secret lair/, 'secret-lair'],
  [/sample pack/, 'sample-pack'],
  [/omega pack/, 'omega-pack'],
  [/commander kit/, 'commander-kit'],
  [/collector booster (display|box)/, 'collector-box'],
  [/collector booster/, 'collector-pack'],
  [/play booster (display|box)/, 'play-box'],
  [/play booster/, 'play-pack'],
  [/set booster (display|box)/, 'set-box'],
  [/set booster/, 'set-pack'],
  [/jumpstart.*booster (display|box)/, 'jumpstart-box'],
  [/jumpstart.*(booster|pack)/, 'jumpstart-pack'],
  [/draft booster (display|box)/, 'draft-box'],
  [/draft booster/, 'draft-pack'],
  [/draft night/, 'draft-night'],
  [/gift bundle|bundle gift edition/, 'gift-bundle'],
  [/\b(bundle|fat pack)\b/, 'bundle'],
  [/prerelease (pack|kit)/, 'prerelease'],
  [/starter kit/, 'starter-kit'],
  [/beginner box/, 'beginner-box'],
  [/scene box/, 'scene-box'],
  [/commander (deck|precon)|precon/, 'commander-deck'],
  [/theme deck/, 'theme-deck'],
  [/theme booster (display|box)/, 'theme-booster-box'],
  [/theme booster/, 'theme-booster-pack'],
  [/\bbooster (display|box)\b/, 'booster-box'],
  [/\bbooster( pack)?\b/, 'booster-pack'],
];
// Kinds that are one named deck out of several, so the deck's name has to match too.
const NAMED = new Set(['commander-deck', 'commander-kit', 'theme-deck']);

export function sealedKind(title) {
  const t = norm(title).replace(/[–—]/g, '-').replace(/\s*-\s*$/, '');
  const hit = KINDS.find(([re]) => re.test(t));
  const kind = hit ? hit[1] : null;
  const setOf = Number((t.match(/set of (\d)/) || [])[1]) || 0;
  const info = {
    kind: setOf ? 'deck-set' : kind,
    setOf,
    isCase: /\bcase\b/.test(t),
    isDisplay: !!kind && NAMED.has(kind) && /\bdisplay\b/.test(t),
    collectors: /collector'?s edition/.test(t),
    lang: /japanese|\bjp\b|\bjpn\b|\(jp\)/.test(t) ? 'ja' : /\b(chinese|korean|french|german|italian|spanish|portuguese|russian|thai)\b/.test(t) ? 'other' : 'en',
    deck: '',
  };
  if (kind && NAMED.has(kind) && !setOf) {
    const m = t.match(hit[0]);
    const after = t.slice(m.index + m[0].length);
    info.deck = words(after.replace(/\(collector'?s edition\)/, '').replace(/^\s*(deck|precon)?\s*/, '').replace(/^[\s:\-–|]+/, ''));
  }
  return info;
}

// ---------- Which set is it from? ----------
// tcgcsv groups are TCGplayer's sets. Commander products sit in "Commander: X", so both map to "x".
const SKIP_GROUP = /^(art series|promo pack|game day|prerelease cards|the list|world championship)|promos?$|tokens$|source material|eternal-legal|oversize|substitute|stellar sights|special guests/i;

export function setIndex(groups) {
  const byKey = new Map();
  for (const g of groups || []) {
    if (SKIP_GROUP.test(g.name)) continue;
    const key = words(String(g.name).replace(/^commander:\s*/i, '').replace(/^universes beyond:\s*/i, ''));
    if (key.length < 4) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(g);
  }
  // Longest names first, so "lorwyn eclipsed" wins over "lorwyn".
  return [...byKey.entries()].sort((a, b) => b[0].length - a[0].length).map(([key, gs]) => ({ key, groups: gs }));
}

export function findSet(title, index) {
  const t = ` ${words(title)} `;
  return index.find(s => t.includes(` ${s.key} `)) || null;
}

// ---------- Pick the TCGplayer product that is the same thing ----------
// candidates: [{ productId, name, url, market }] from the set's groups.
const QUALIFIERS = [/special edition/, /premium/, /compleat/, /anniversary/, /\bfoil\b/, /\bretail\b/, /\bhobby\b/, /mini/];
const FALLBACK = { 'booster-box': ['booster-box', 'play-box', 'draft-box'], 'booster-pack': ['booster-pack', 'play-pack', 'draft-pack'] };

export function matchProduct(title, candidates) {
  const want = sealedKind(title);
  if (!want.kind || want.kind === 'secret-lair' || want.lang === 'other') return null;
  const tw = norm(title);
  const parsed = (candidates || []).map(c => ({ c, k: sealedKind(c.name) }))
    .filter(({ c, k }) => k.isCase === want.isCase && k.lang === want.lang && k.isDisplay === want.isDisplay
      // A special version ("Special Edition Collector Booster Display") only matches a title that says so, and the other way round.
      && QUALIFIERS.every(q => q.test(norm(c.name)) === q.test(tw)));
  for (const kind of FALLBACK[want.kind] || [want.kind]) {
    let hits = parsed.filter(({ k }) => k.kind === kind);
    if (NAMED.has(kind)) {
      if (!want.deck || want.deck.length < 3) return null;
      hits = hits.filter(({ c, k }) => k.collectors === want.collectors && ` ${words(c.name)}`.includes(` ${want.deck}`));
    }
    if (kind === 'deck-set') hits = hits.filter(({ k }) => k.setOf === want.setOf);
    if (hits.length) return hits.sort((a, b) => a.c.name.length - b.c.name.length)[0].c;
  }
  return null;
}

// ---------- tcgcsv (TCGplayer prices, refreshed daily) ----------
const TCG = 'https://tcgcsv.com/tcgplayer/1';
const memo = new Map(); // survives between requests on a warm server
const MEMO_MS = 6 * 3600 * 1000;
async function cached(key, fn) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.value;
  const value = await fn();
  memo.set(key, { at: Date.now(), value });
  return value;
}
export const clearMemo = () => memo.clear();

// Sealed items have a UPC and no collector number.
export function sealedFromGroup(products, prices) {
  const price = new Map();
  for (const p of prices?.results || []) {
    if (p.marketPrice == null) continue;
    const prev = price.get(p.productId);
    if (prev == null || p.subTypeName === 'Normal') price.set(p.productId, p.marketPrice);
  }
  return (products?.results || [])
    .filter(p => !(p.extendedData || []).some(e => e.name === 'Number' || e.name === 'Rarity'))
    .map(p => ({ productId: p.productId, groupId: p.groupId, name: decodeEntities(p.name), url: p.url, market: price.get(p.productId) ?? null }));
}

const groupsList = () => cached('groups', async () => (await get(`${TCG}/groups`)).results || []);
const groupSealed = (id) => cached(`g${id}`, async () => {
  const [products, prices] = await Promise.all([get(`${TCG}/${id}/products`), get(`${TCG}/${id}/prices`)]);
  return sealedFromGroup(products, prices);
});

// MSRP first (when we know it), then TCGplayer market. Returns { usd, source, name, url } or null.
export function referenceFor(product) {
  if (!product) return null;
  const msrp = MSRP[product.productId];
  if (msrp) return { usd: msrp, source: 'msrp', name: product.name, url: product.url, market: product.market };
  if (product.market) return { usd: product.market, source: 'market', name: product.name, url: product.url, market: product.market };
  return null;
}

// ---------- Store readers: each returns [{ title, price, qty, url }] for sealed MTG they have in stock ----------

// Shopify: /collections/{handle}/products.json lists a collection, 250 at a time, prices in baht.
export function parseShopifyCollection(json, base) {
  const out = [];
  for (const p of json?.products || []) {
    const type = p.product_type || '';
    if (/single/i.test(type) || (type && !/mtg|magic|sealed/i.test(type)) || NOT_MTG.test(`${type} ${p.title}`)) continue;
    const v = (p.variants || []).filter(x => x.available).sort((a, b) => money(a.price) - money(b.price))[0];
    if (!v) continue;
    const extra = v.title && !/default title/i.test(v.title) ? ` (${v.title})` : '';
    out.push({ title: decodeEntities(p.title).replace(/\s*-\s*$/, '') + extra, price: money(v.price), qty: null, url: `${base}/products/${p.handle}`, key: p.handle });
  }
  return out;
}

const shopify = (base, handles) => async () => {
  const seen = new Map();
  await pool(handles, 3, async (h) => {
    for (let page = 1; page <= 4; page++) {
      const json = await get(`${base}/collections/${h}/products.json?limit=250&page=${page}`);
      for (const o of parseShopifyCollection(json, base)) seen.set(o.key, o);
      if ((json?.products || []).length < 250) break;
    }
  });
  return [...seen.values()];
};

// Nox TCG: a JSON product API. sell_price in baht, stock_qty on hand.
export function parseNoxProducts(json, base = 'https://noxtcg.com') {
  return (json?.results || []).filter(p => Number(p.stock_qty) > 0 && !NOT_MTG.test(p.name))
    .map(p => ({ title: decodeEntities(p.name), price: money(p.sell_price), qty: Number(p.stock_qty), url: `${base}/products/${p.id}` }));
}

async function nox() {
  const base = 'https://noxtcg.com';
  const out = [];
  let url = `${base}/api/products?category=sealed-product&page_size=100&page=1`;
  for (let i = 0; url && i < 5; i++) {
    const json = await get(url);
    out.push(...parseNoxProducts(json, base));
    url = json?.next ? String(json.next).replace(/^http:/, 'https:') : null;
  }
  return out;
}

// LeveLmax (tomorrowlion.com/sealed): server-rendered tiles: image alt = name, "Set · Kind", "฿ 5,690", "เหลือ 1 ชิ้น" (1 left).
export function parseLevelmaxSealed(html, base = 'https://www.tomorrowlion.com') {
  const h = String(html).replace(/<!-- -->/g, '');
  const out = [];
  for (const chunk of h.split('<img ').slice(1)) {
    const alt = (chunk.match(/^[^>]*alt="([^"]*)"/) || [])[1];
    const price = (chunk.match(/฿\s*([\d,]+(?:\.\d+)?)/) || [])[1];
    if (!alt || !price) continue;
    const qty = Number((chunk.match(/เหลือ\s*(\d+)\s*ชิ้น/) || [])[1]) || null;
    if (/สินค้าหมด|หมดแล้ว|sold out/i.test(chunk.split('<button')[0]) && !qty) continue;
    const title = decodeEntities(alt).trim();
    if (NOT_MTG.test(title)) continue;
    out.push({ title, price: money(price), qty, url: `${base}/sealed` });
  }
  return out;
}

const levelmax = async () => parseLevelmaxSealed(await get('https://www.tomorrowlion.com/sealed', 'text/html'));

// Yannick: same product tiles as their search page, 24 per page.
export function parseYannickTiles(html, base = 'https://yannickthegathering.com') {
  const out = [];
  for (const chunk of String(html).split('<article class="row-product').slice(1)) {
    const art = chunk.split('</article>')[0];
    const nameP = (art.match(/<p class="row-name">([\s\S]*?)<\/p>/) || [])[1];
    if (!nameP) continue;
    const label = (art.match(/product-stock-label[^"]*"[^>]*>([^<]*)</) || [])[1] || '';
    if (/product-stock-label--(out|sold|none)/.test(art) || /sold out|out of stock|หมด/i.test(label)) continue;
    const href = (nameP.match(/href="([^"]+)"/) || [])[1] || '';
    const amount = (art.match(/product-card-price-amount"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || '';
    const qty = Number((art.match(/Total qty:\s*(\d+)/) || [])[1]) || null;
    const title = stripTags(nameP);
    if (NOT_MTG.test(title)) continue;
    out.push({ title, price: money(stripTags(amount).replace('฿', '')), qty, url: href ? new URL(href, base).href.split('?')[0] : `${base}/collections/s/mtg-sealed` });
  }
  return out;
}

async function yannick() {
  const base = 'https://yannickthegathering.com';
  const first = await get(`${base}/collections/s/mtg-sealed`, 'text/html');
  const total = Number((first.match(/(\d+)\s*(?:<!-- -->)?\s*products/) || [])[1]) || 24;
  const pages = Math.min(Math.ceil(total / 24), 30);
  const rest = await pool(Array.from({ length: pages - 1 }, (_, i) => i + 2), 4, (p) =>
    get(`${base}/collections/s/mtg-sealed?page=${p}`, 'text/html').then(h => parseYannickTiles(h, base)).catch(() => []));
  return [parseYannickTiles(first, base), ...rest].flat();
}

// Sabai: Laravel + Inertia, the page data sits in a data-page attribute.
export function parseSabaiSealed(html, base = 'https://sabaicards.com') {
  const raw = (String(html).match(/data-page="([^"]*)"/) || [])[1];
  if (!raw) throw new Error('no page data');
  const d = JSON.parse(decodeEntities(raw))?.props?.datas || {};
  const rows = (d.data || []).filter(r => Number(r.quantity) > 0 && Number(r.status ?? 1) === 1 && !NOT_MTG.test(r.name || ''))
    // `name` is what the product page shows. Sabai reuses listings, so original_name can be an old product's name.
    .map(r => ({ title: decodeEntities(r.name || r.original_name), price: money(r.price), qty: Number(r.quantity), url: `${base}/products/view/${r.id}` }));
  return { rows, lastPage: Number(d.last_page) || 1 };
}

async function sabai() {
  const base = 'https://sabaicards.com';
  const { rows, lastPage } = parseSabaiSealed(await get(`${base}/products/sealed`, 'text/html'), base);
  for (let p = 2; p <= Math.min(lastPage, 5); p++) rows.push(...parseSabaiSealed(await get(`${base}/products/sealed?page=${p}`, 'text/html'), base).rows);
  return rows;
}

export const SEALED_STORES = [
  { id: 'firstpick', name: '1st Pick', site: '1stpickhs-onlineshop.com', page: 'https://1stpickhs-onlineshop.com/collections/mtg-sealed-product',
    run: shopify('https://1stpickhs-onlineshop.com', ['mtg-sealed-product', 'mtg-commander-deck', 'mtg-bundle', 'mtg-draft-booster', 'mtg-collector-booster', 'mtg-set-booster']) },
  { id: 'power9', name: 'Power9', site: 'power9cardstore.com', page: 'https://power9cardstore.com/collections/mtg-sealed',
    run: shopify('https://power9cardstore.com', ['mtg-sealed']) },
  { id: 'bigbear', name: 'Big Bear Cards', site: 'bigbearcards.com', page: 'https://bigbearcards.com/collections/mtg-sealed',
    run: shopify('https://bigbearcards.com', ['mtg-sealed']) },
  { id: 'levelmax', name: 'LeveLmax TCG', site: 'tomorrowlion.com', page: 'https://www.tomorrowlion.com/sealed', run: levelmax },
  { id: 'nox', name: 'Nox TCG', site: 'noxtcg.com', area: 'Chiang Mai · ships to Bangkok', page: 'https://noxtcg.com/products?category=sealed-product', run: nox },
  { id: 'yannick', name: 'Yannick The Gathering', site: 'yannickthegathering.com', page: 'https://yannickthegathering.com/collections/s/mtg-sealed', run: yannick },
  { id: 'sabai', name: 'Sabai Cards', site: 'sabaicards.com', page: 'https://sabaicards.com/products/sealed', run: sabai },
];

// Store kind label for people: "collector-box" -> "Collector booster box".
export const KIND_LABEL = {
  'collector-box': 'Collector booster box', 'collector-pack': 'Collector booster', 'play-box': 'Play booster box', 'play-pack': 'Play booster',
  'set-box': 'Set booster box', 'set-pack': 'Set booster', 'draft-box': 'Draft booster box', 'draft-pack': 'Draft booster',
  'booster-box': 'Booster box', 'booster-pack': 'Booster pack', 'jumpstart-box': 'Jumpstart box', 'jumpstart-pack': 'Jumpstart pack',
  bundle: 'Bundle', 'gift-bundle': 'Gift bundle', prerelease: 'Prerelease pack', 'starter-kit': 'Starter kit', 'beginner-box': 'Beginner box',
  'scene-box': 'Scene box', 'draft-night': 'Draft night', 'commander-deck': 'Commander deck', 'commander-kit': 'Commander kit',
  'theme-deck': 'Theme deck', 'theme-booster-box': 'Theme booster box', 'theme-booster-pack': 'Theme booster', 'deck-set': 'Deck set', 'secret-lair': 'Secret Lair', 'sample-pack': 'Sample pack', 'omega-pack': 'Omega pack',
};

// The whole catalogue: every store's in-stock sealed MTG with a reference price where we can find one.
export async function sealedCatalog({ usdToThb }) {
  const storeResults = await Promise.all(SEALED_STORES.map(async (s) => {
    try { return { s, ok: true, items: await s.run() }; }
    catch (e) { return { s, ok: false, items: [], error: e.name === 'AbortError' ? 'Timed out' : 'Could not read the store page' }; }
  }));

  let index = [];
  try { index = setIndex(await groupsList()); } catch { index = []; }

  const all = storeResults.flatMap(({ s, items }) => items.filter(i => i.price).map(i => ({ ...i, store: s })));
  const sets = new Map();
  for (const o of all) { o.set = findSet(o.title, index); if (o.set) sets.set(o.set.key, o.set); }

  // Each set's sealed products from TCGplayer, recent sets first if we have to stop early.
  const setProducts = new Map();
  await pool([...sets.values()], 6, async (set) => {
    const lists = await Promise.all(set.groups.map(g => groupSealed(g.groupId).catch(() => [])));
    setProducts.set(set.key, lists.flat());
  });

  const offers = all.map(o => {
    const k = sealedKind(o.title);
    const match = o.set ? matchProduct(o.title, setProducts.get(o.set.key)) : null;
    const ref = referenceFor(match);
    const refThb = ref && usdToThb ? Math.round(ref.usd * usdToThb) : null;
    return {
      title: o.title, kind: k.kind, kindLabel: KIND_LABEL[k.kind] || 'Other sealed', set: o.set ? o.set.groups[0].name.replace(/^Commander:\s*/i, '') : null,
      store: o.store.name, storeId: o.store.id, area: o.store.area || 'Bangkok', price: o.price, qty: o.qty, url: o.url,
      ref: ref ? { usd: ref.usd, thb: refThb, source: ref.source, name: ref.name, url: ref.url } : null,
      discountPct: refThb ? Math.round(((refThb - o.price) / refThb) * 1000) / 10 : null,
    };
  });

  return {
    offers,
    stores: storeResults.map(({ s, ok, items, error }) => ({ id: s.id, name: s.name, site: s.site, area: s.area || 'Bangkok', page: s.page, ok, count: items.length, error })),
  };
}

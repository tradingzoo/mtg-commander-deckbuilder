import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { installMockFetch, mockStores } from './mock-fetch.js';
import find, { onlinePrices } from '../api/find.js';
import { titleMatches, norm, parseShopifySuggest, parseShopifyProduct, parseYannick, parseSabai, sortListings } from '../api/_stores.js';
import { FIRSTPICK_SUGGEST, FIRSTPICK_PRODUCT, YANNICK_HTML, YANNICK_SOLD_OUT_HTML, SABAI_HTML, GIMLI_PRINTS } from './store-fixtures.js';

before(installMockFetch);
beforeEach(() => { mockStores.sabaiDown = false; mockStores.yannickSoldOut = false; });

function call(url) {
  const req = Readable.from([]);
  Object.assign(req, { url, method: 'GET', headers: {} });
  return new Promise((resolve) => {
    const headers = {};
    const res = { statusCode: 200, setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
      end: (s) => resolve({ status: res.statusCode, headers, body: JSON.parse(s) }) };
    find(req, res);
  });
}

const CARD = 'Gimli of the Glittering Caves';

test('titleMatches: the card and its printings, not cards that only share a word', () => {
  assert.ok(titleMatches('Gimli of the Glittering Caves [LotR Commander]', CARD));
  assert.ok(titleMatches('Gimli of the Glittering Caves (Extended Art)', CARD));
  assert.ok(titleMatches('GIMLI OF THE GLITTERING CAVES', CARD));
  assert.ok(!titleMatches("Gimli's Axe [LTR]", 'Gimli'));
  assert.ok(!titleMatches('Gimli, Mournful Avenger', CARD));
  assert.ok(!titleMatches('Sol Ring Sleeves', 'Sol Ring'), 'a longer name is a different product');
  assert.ok(titleMatches('Dain of the Ancient Halls [Tales]', 'Dáin of the Ancient Halls'), 'accents ignored');
  assert.ok(titleMatches('Gimli&#x27;s Axe (130) (LTR)', 'Gimli’s Axe'), 'entities and curly apostrophes');
  assert.ok(titleMatches('Fable of the Mirror-Breaker [NEO]', 'Fable of the Mirror-Breaker // Reflection of Kiki-Jiki'), 'front face');
  assert.equal(norm('  Dáin   of ’Halls '), "dain of 'halls");
});

test('1st Pick: suggest keeps only this card, product lists buyable conditions in baht', () => {
  const hits = parseShopifySuggest(FIRSTPICK_SUGGEST, CARD);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].url, '/products/gimli-of-the-glittering-caves-the-lord-of-the-rings-tales-of-middle-earth-commander');
  const rows = parseShopifyProduct(FIRSTPICK_PRODUCT, 'https://1stpickhs-onlineshop.com', hits[0].title);
  assert.deepEqual(rows.map(r => [r.finish, r.price, r.inStock]), [['Near Mint', 45, true], ['Lightly Played', 40, true]]);
  assert.equal(rows[0].set, 'The Lord of the Rings: Tales of Middle-Earth Commander');
  assert.equal(rows[0].name, CARD);
  const soldOut = parseShopifyProduct({ ...FIRSTPICK_PRODUCT, variants: FIRSTPICK_PRODUCT.variants.map(v => ({ ...v, available: false })) }, '', '');
  assert.equal(soldOut.length, 1, 'a sold-out printing still shows once');
  assert.equal(soldOut[0].inStock, false);
});

test('Yannick: reads name, set, price with commas, quantity and condition', () => {
  const { listings, outOfStockCount } = parseYannick(YANNICK_HTML, CARD);
  assert.equal(outOfStockCount, 0);
  assert.equal(listings.length, 2, "Gimli's Fury is left out");
  assert.deepEqual(listings[0], { name: CARD, set: 'LTC', finish: 'Non-Foil - NM', price: 1250, qty: '2', inStock: true,
    url: 'https://yannickthegathering.com/products/gimli-of-the-glittering-caves-115-ltc' });
  assert.equal(listings[1].name, `${CARD} (Japanese)`);
  assert.equal(listings[1].price, 30);
});

test('Yannick: sold-out search reports how many copies they list', () => {
  const r = parseYannick(YANNICK_SOLD_OUT_HTML, CARD);
  assert.deepEqual(r, { listings: [], outOfStockCount: 3 });
});

test('Sabai: reads the Inertia page data, quantity 0 is sold out', () => {
  const rows = parseSabai(SABAI_HTML, CARD);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { name: `${CARD} (Extended Art)`, set: 'The Lord of the Rings: Tales of Middle-earth Commander Decks Variants',
    finish: 'Non-foil', price: 720, qty: 1, inStock: true, url: 'https://sabaicards.com/products/view/179789' });
  assert.equal(rows[1].inStock, false);
  assert.throws(() => parseSabai('<html>blocked</html>', CARD));
});

test('sortListings: in stock first, then cheapest', () => {
  const s = sortListings([{ price: 10, inStock: false }, { price: 50, inStock: true }, { price: 20, inStock: true }, { price: null, inStock: true }]);
  assert.deepEqual(s.map(x => x.price), [20, 50, null, 10]);
});

test('onlinePrices: cheapest printing with a price', () => {
  const o = onlinePrices(GIMLI_PRINTS);
  assert.equal(o.usd.price, 1.1);
  assert.equal(o.eur.price, 0.95);
  assert.equal(o.printings, 3);
  assert.deepEqual(onlinePrices([]), { usd: null, eur: null, cardhoarder: null, printings: 0 });
});

test('/api/find: all three stores, cheapest in-stock store first, cached', async () => {
  const r = await call('/api/find?name=gimli glittering');
  assert.equal(r.status, 200);
  assert.equal(r.body.card.name, CARD);
  assert.deepEqual(r.body.stores.map(s => [s.id, s.inStock, s.cheapest]),
    [['yannick', true, 30], ['firstpick', true, 40], ['sabai', true, 720], ['power9', false, null]]);
  const p9 = r.body.stores.find(s => s.id === 'power9');
  assert.deepEqual(p9.listings.map(l => [l.name, l.finish, l.price, l.inStock]), [['Gimli of the Glittering Caves', 'Near Mint', 74, false]],
    'sold-out printing shows once, the Aglarond land is left out');
  assert.equal(p9.searchUrl, 'https://power9cardstore.com/search?q=Gimli%20of%20the%20Glittering%20Caves');
  assert.equal(r.body.online.usdToThb, 32.5);
  assert.ok(Math.abs(r.body.online.eurToUsd - 1 / 0.86) < 1e-9);
  assert.match(r.body.links.hareruya, /hareruyamtg\.com.*Gimli%20of%20the%20Glittering%20Caves/);
  assert.match(r.headers['cache-control'], /s-maxage=1800/);
});

test('/api/find: a blocked store says so and still gives its search link', async () => {
  mockStores.sabaiDown = true;
  mockStores.yannickSoldOut = true;
  const r = await call(`/api/find?name=${encodeURIComponent(CARD)}`);
  assert.equal(r.status, 200);
  const sabai = r.body.stores.find(s => s.id === 'sabai');
  assert.equal(sabai.ok, false);
  assert.match(sabai.searchUrl, /^https:\/\/sabaicards\.com\/products\/singles\?search=Gimli/);
  const yan = r.body.stores.find(s => s.id === 'yannick');
  assert.equal(yan.inStock, false);
  assert.equal(yan.outOfStockCount, 3);
  assert.equal(r.body.stores[0].id, 'firstpick', 'the store with stock comes first');
});

test('/api/find: bad input', async () => {
  assert.equal((await call('/api/find?name=x')).status, 400);
  const r = await call('/api/find?name=zzzzqqq');
  assert.equal(r.status, 404);
  assert.match(r.body.error, /No card called/);
});

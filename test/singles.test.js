import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { installMockFetch, mockStores } from './mock-fetch.js';
import singles from '../api/singles.js';
import { copyInfo, printsForSet, matchPrint, clearSinglesMemo, BATCH } from '../api/_singles.js';
import { GIMLI_PRINTS } from './store-fixtures.js';

before(installMockFetch);
beforeEach(() => { mockStores.sabaiDown = false; mockStores.yannickSoldOut = false; clearSinglesMemo(); });

function call(url) {
  const req = Readable.from([]);
  Object.assign(req, { url, method: 'GET', headers: {} });
  return new Promise((resolve) => {
    const headers = {};
    const res = { statusCode: 200, setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
      end: (s) => resolve({ status: res.statusCode, headers, body: JSON.parse(s) }) };
    singles(req, res);
  });
}

const L = (o) => ({ name: 'Gimli of the Glittering Caves', set: '', finish: '', price: 30, qty: 1, inStock: true, url: '', ...o });

test('copyInfo: finish, condition, language and treatment from each store\'s wording', () => {
  assert.equal(copyInfo(L({ finish: 'Non-Foil - NM' })).foil, 'nonfoil');
  assert.equal(copyInfo(L({ finish: 'Foil - NM' })).foil, 'foil');
  assert.equal(copyInfo(L({ finish: 'Near Mint Foil' })).foil, 'foil');
  assert.equal(copyInfo(L({ finish: 'NM · Foil' })).foil, 'foil');
  assert.equal(copyInfo(L({ name: 'Sol Ring (Foil Etched)' })).foil, 'etched');
  assert.equal(copyInfo(L({ finish: 'Near Mint' })).played, false);
  assert.equal(copyInfo(L({ finish: 'Lightly Played' })).played, true);
  assert.equal(copyInfo(L({ finish: 'EX' })).played, true);
  assert.equal(copyInfo(L({ finish: 'LP · Foil' })).played, true);
  assert.equal(copyInfo(L({ name: 'Gimli of the Glittering Caves (Japanese)' })).otherLang, true);
  assert.equal(copyInfo(L({ name: 'Gimli of the Glittering Caves (Extended Art)' })).treat.extendedart, true);
  assert.deepEqual(copyInfo(L({ url: 'https://yannickthegathering.com/products/gimli-of-the-glittering-caves-115-ltc' })).fromUrl, ['115', 'ltc']);
});

test('printsForSet: set code, set name, or the longest set name inside the store\'s text', () => {
  assert.equal(printsForSet('LTC', GIMLI_PRINTS).length, 2);
  assert.equal(printsForSet('Tales of Middle-earth Commander', GIMLI_PRINTS).length, 2);
  assert.equal(printsForSet('The Lord of the Rings: Tales of Middle-Earth Commander', GIMLI_PRINTS).length, 2);
  assert.equal(printsForSet('The Lord of the Rings: Tales of Middle-earth Commander Decks Variants', GIMLI_PRINTS).length, 2);
  assert.deepEqual(printsForSet('Commander Masters', GIMLI_PRINTS), []);
  assert.deepEqual(printsForSet('', GIMLI_PRINTS), []);
});

test('matchPrint: the exact printing and finish, or nothing when unsure', () => {
  const m = (o) => matchPrint(L(o), GIMLI_PRINTS);
  assert.deepEqual([m({ set: 'LTC', finish: 'NM' }).print.collector_number, m({ set: 'LTC', finish: 'NM' }).usd], ['115', 1.1], 'no treatment named = the plain card');
  assert.equal(m({ set: 'LTC', finish: 'NM · Foil' }).usd, 2, 'foil price for a foil');
  assert.equal(m({ name: 'Gimli of the Glittering Caves (Extended Art)', set: 'Tales of Middle-earth Commander' }).usd, 2.4);
  assert.equal(m({ url: 'https://yannickthegathering.com/products/gimli-of-the-glittering-caves-400-ltc', set: 'LTC' }).print.collector_number, '400', 'Yannick link names the number');
  assert.equal(m({ set: 'LTC', finish: 'Lightly Played' }), null, 'played copies are left out');
  assert.equal(m({ name: 'Gimli of the Glittering Caves (Japanese)', set: 'LTC' }), null);
  assert.equal(m({ set: 'Commander Masters' }), null, 'unknown set');
  assert.equal(m({ name: 'Gimli of the Glittering Caves (Borderless)', set: 'LTC' }), null, 'no borderless printing');
  assert.equal(m({ name: 'Sol Ring (Foil Etched)', set: 'LTC' }), null, 'no etched finish');
  // Two printings at very different prices and nothing to tell them apart: skip.
  const twins = [GIMLI_PRINTS[0], { ...GIMLI_PRINTS[0], collector_number: '999', prices: { usd: '9.00' } }];
  assert.equal(matchPrint(L({ set: 'LTC' }), twins), null);
  // ...but about the same price is fine, and uses the cheaper one.
  const close = [GIMLI_PRINTS[0], { ...GIMLI_PRINTS[0], collector_number: '999', prices: { usd: '1.15' } }];
  assert.equal(matchPrint(L({ set: 'LTC' }), close).usd, 1.1);
});

test('GET /api/singles: a batch of top cards, each store copy against its own printing', async () => {
  const r = await call('/api/singles?batch=0');
  assert.equal(r.status, 200);
  assert.match(r.headers['cache-control'], /s-maxage=21600/);
  assert.equal(r.body.total, 6);
  assert.equal(r.body.batches, Math.ceil(6 / BATCH));
  assert.equal(r.body.cards[0], 'Gimli of the Glittering Caves');
  const g = r.body.offers.filter(o => o.title === 'Gimli of the Glittering Caves');
  const by = (id) => g.filter(o => o.storeId === id);
  const fp = by('firstpick').find(o => o.price === 45);
  assert.equal(fp.ref.usd, 1.1);
  assert.equal(fp.ref.thb, 36); // 1.10 * 32.5
  assert.equal(fp.discountPct, -25);
  assert.equal(by('firstpick').find(o => o.price === 40).ref, null, 'Lightly Played: no comparison');
  assert.equal(by('levelmax').find(o => o.price === 1180).ref.usd, 2, 'foil');
  assert.equal(by('sabai').find(o => o.price === 720).ref.usd, 2.4, 'extended art');
  assert.equal(by('yannick').find(o => o.price === 1250).ref.name, 'Tales of Middle-earth Commander #115');
  assert.equal(by('yannick').find(o => o.price === 30).ref, null, 'Japanese');
  assert.equal(by('nox').find(o => o.price === 380).ref, null, 'EX condition');
  assert.equal(by('nox').find(o => o.price === 420).ref.usd, 1.1);
});

test('GET /api/singles: past the last batch is a 404', async () => {
  const r = await call('/api/singles?batch=99');
  assert.equal(r.status, 404);
});

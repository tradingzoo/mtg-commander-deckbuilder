import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { installMockFetch, mockStores } from './mock-fetch.js';
import sealed from '../api/sealed.js';
import { sealedKind, setIndex, findSet, matchProduct, sealedFromGroup, referenceFor, clearMemo,
  parseShopifyCollection, parseNoxProducts, parseLevelmaxSealed, parseYannickTiles, parseSabaiSealed } from '../api/_sealed.js';
import { TCG_GROUPS, TCG, POWER9_SEALED, BIGBEAR_SEALED, NOX_SEALED, LEVELMAX_SEALED, YANNICK_SEALED, SABAI_SEALED } from './sealed-fixtures.js';

before(installMockFetch);
beforeEach(() => { mockStores.sabaiDown = false; mockStores.tcgDown = false; clearMemo(); });

function call(url = '/api/sealed') {
  const req = Readable.from([]);
  Object.assign(req, { url, method: 'GET', headers: {} });
  return new Promise((resolve) => {
    const headers = {};
    const res = { statusCode: 200, setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
      end: (s) => resolve({ status: res.statusCode, headers, body: JSON.parse(s) }) };
    sealed(req, res);
  });
}

test('sealedKind: store and TCGplayer wordings land on the same labels', () => {
  const k = (t) => sealedKind(t).kind;
  assert.equal(k('Final Fantasy Collector Booster Box'), 'collector-box');
  assert.equal(k('FINAL FANTASY - Collector Booster Display'), 'collector-box');
  assert.equal(k('FINAL FANTASY - Collector Booster Pack'), 'collector-pack');
  assert.equal(k('FINAL FANTASY - Collector Booster Sample Pack'), 'sample-pack');
  assert.equal(k('Teenage Mutant Ninja Turtles - Play Booster Display'), 'play-box');
  assert.equal(k('Marvel Super Heroes Play Booster Box'), 'play-box');
  assert.equal(k('The Hobbit - Play Booster Pack -'), 'play-pack');
  assert.equal(k('Teenage Mutant Ninja Turtles - Pizza Bundle'), 'bundle');
  assert.equal(k('The Hobbit - Gift Bundle -'), 'gift-bundle');
  assert.equal(k('Lorwyn Fat Pack'), 'bundle');
  assert.equal(k('Lorwyn Eclipsed - Prerelease Kit'), 'prerelease');
  assert.equal(k('BOOSTER BOX BATTLE FOR ZENDIKAR'), 'booster-box');
  assert.equal(k('Reality Fracture - Secret Lair Bundle -'), 'secret-lair');
  assert.equal(k('Commander 2019 - Set of 4'), 'deck-set');
  assert.equal(k('Bloomburrow - Tin (Skunk)'), null);
  assert.ok(sealedKind('FINAL FANTASY - Play Booster Display Case').isCase);
  assert.equal(sealedKind('FINAL FANTASY - Collector Booster Display (Japanese)').lang, 'ja');
});

test('sealedKind: commander and theme decks keep the deck name and edition', () => {
  assert.deepEqual(
    [sealedKind('Lorwyn Eclipsed Commander Deck - Blight Curse')].map(x => [x.kind, x.deck, x.collectors])[0], ['commander-deck', 'blight curse', false]);
  const ce = sealedKind("Marvel Super Heroes Commander Deck - Doom Prevails (Collector's Edition) -");
  assert.deepEqual([ce.kind, ce.deck, ce.collectors], ['commander-deck', 'doom prevails', true]);
  assert.equal(sealedKind('Lorwyn Eclipsed - Theme Deck Pirates').deck, 'pirates');
  assert.ok(sealedKind('Lorwyn Eclipsed Commander Deck Display').isDisplay);
});

test('findSet: longest set name wins, Commander groups join their set, art series skipped', () => {
  const idx = setIndex(TCG_GROUPS.results);
  assert.equal(findSet('Lorwyn Eclipsed - Play Booster Display', idx).key, 'lorwyn eclipsed');
  assert.deepEqual(findSet('Lorwyn Eclipsed - Play Booster Display', idx).groups.map(g => g.groupId), [24463, 24464]);
  assert.equal(findSet('Lorwyn Fat Pack', idx).key, 'lorwyn');
  assert.equal(findSet('Final Fantasy Collector Booster Box', idx).key, 'final fantasy');
  assert.equal(findSet('Dragon Shield Matte Sleeves', idx), null);
});

const products = (...ids) => ids.flatMap(id => sealedFromGroup(TCG[id].products, TCG[id].prices));

test('sealedFromGroup: sealed items only, with market price', () => {
  const fin = products(24219);
  assert.ok(!fin.some(p => p.name === 'Cloud, Midgar Mercenary'), 'singles left out');
  assert.equal(fin.find(p => p.productId === 618890).market, 253.39);
});

test('matchProduct: same kind, same deck, same edition, never a case or another language', () => {
  const fin = products(24219, 24220);
  assert.equal(matchProduct('Final Fantasy Collector Booster Box', fin).productId, 618893);
  assert.equal(matchProduct('Final Fantasy Play Booster Box', fin).productId, 618890);
  assert.equal(matchProduct('Final Fantasy - Bundle', fin).productId, 618894);
  assert.equal(matchProduct('Final Fantasy - Gift Bundle', fin).productId, 618895);
  assert.equal(matchProduct('Final Fantasy Collector Booster Box (Japanese)', fin).productId, 618896);
  assert.equal(matchProduct('Final Fantasy Commander Deck - Revival Trance', fin).productId, 618901);
  assert.equal(matchProduct('Final Fantasy Commander Deck - Limit Break', fin).productId, 618902, 'not the collector edition');
  assert.equal(matchProduct("Final Fantasy Commander Deck - Limit Break (Collector's Edition)", fin).productId, 618903);
  assert.equal(matchProduct('Final Fantasy Commander Deck', fin), null, 'no deck name, no guess');
  const ecl = products(24463, 24464);
  assert.equal(matchProduct('Lorwyn Eclipsed - Theme Deck Angel', ecl).productId, 656321);
  assert.equal(matchProduct('Lorwyn Eclipsed Commander Deck - Blight Curse', ecl).productId, 656341);
  assert.equal(matchProduct('Lorwyn Eclipsed - Prerelease Kit', ecl), null, 'nothing like it listed');
  assert.equal(matchProduct('Lorwyn - Booster Box', products(67)).productId, 1000);
  assert.equal(matchProduct('Marvel Super Heroes Play Booster Box', products(24553)).productId, 700001);
});

test('referenceFor: market price when no MSRP is listed', () => {
  const p = products(24219).find(x => x.productId === 618890);
  assert.deepEqual(referenceFor(p), { usd: 253.39, source: 'market', name: p.name, url: p.url, market: 253.39 });
  assert.equal(referenceFor({ ...p, market: null }), null);
  assert.equal(referenceFor(null), null);
});

test('store readers: in-stock sealed Magic only, prices in baht', () => {
  const p9 = parseShopifyCollection(POWER9_SEALED, 'https://power9cardstore.com');
  assert.deepEqual(p9.map(o => [o.title, o.price]), [['BOOSTER BOX BATTLE FOR ZENDIKAR', 5000], ['Final Fantasy Play Booster Box', 7900]]);
  assert.equal(p9[0].url, 'https://power9cardstore.com/products/booster-box-battle-for-zendikar');
  const bb = parseShopifyCollection(BIGBEAR_SEALED, 'https://bigbearcards.com');
  assert.ok(!bb.some(o => /riftbound/i.test(o.title)), 'other games left out');
  assert.ok(!parseShopifyCollection({ products: [{ title: 'Dragon Shield Matte Sleeves', handle: 'x', product_type: 'Accessories', variants: [{ price: '450.00', available: true }] }] }, '').length, 'accessories left out');
  assert.equal(bb[1].title, 'The Hobbit - Play Booster Display', 'trailing dash trimmed');
  assert.deepEqual(parseNoxProducts(NOX_SEALED).map(o => [o.title, o.price, o.qty, o.url]),
    [["Battle for Baldur's Gate Commander Deck - Party Time", 5500, 1, 'https://noxtcg.com/products/38'], ['Final Fantasy - Bundle', 3500, 2, 'https://noxtcg.com/products/74']]);
  assert.deepEqual(parseLevelmaxSealed(LEVELMAX_SEALED).map(o => [o.title, o.price, o.qty]),
    [['Marvel Super Heroes Play Booster Box', 5690, 1], ['warhammer Pack 4', 39000, 2]]);
  const y = parseYannickTiles(YANNICK_SEALED);
  assert.deepEqual(y.map(o => [o.title, o.price]), [['Commander 2019 - Set of 4', 5950], ['Lorwyn Eclipsed - Bundle', 1600]], 'sold out left out');
  assert.equal(y[0].url, 'https://yannickthegathering.com/products/commander-2019-set-of-4');
  const s = parseSabaiSealed(SABAI_SEALED);
  assert.deepEqual(s.rows.map(o => [o.title, o.price, o.qty]), [['The Hobbit Collector Booster Box', 27000, 6], ['Final Fantasy Collector Booster Box (Japanese)', 26000, 1]]);
});

test('GET /api/sealed: every store, baht reference, discount, cached', async () => {
  const { status, headers, body } = await call();
  assert.equal(status, 200);
  assert.match(headers['cache-control'], /s-maxage=10800/);
  assert.equal(body.fx.usdToThb, 32.5);
  assert.equal(body.stores.length, 7);
  assert.ok(body.stores.every(s => s.ok), JSON.stringify(body.stores));
  const o = (title, store) => body.offers.find(x => x.title === title && (!store || x.storeId === store));
  const lc = o('Lorwyn Eclipsed Commander Deck - Blight Curse');
  assert.equal(lc.ref.usd, 52);
  assert.equal(lc.ref.thb, 1690); // 52 * 32.5
  assert.equal(lc.discountPct, -3.6); // 1750 vs 1690: 3.6% over
  const ff = o('Final Fantasy Play Booster Box');
  assert.equal(ff.ref.thb, Math.round(253.39 * 32.5)); // 8235
  assert.equal(ff.discountPct, 4.1); // 7900 vs 8235
  assert.equal(ff.store, 'Power9');
  assert.equal(ff.kindLabel, 'Play booster box');
  assert.equal(o('Final Fantasy - Bundle').ref.thb, Math.round(120.7 * 32.5));
  assert.equal(o('Commander 2019 - Set of 4').ref, null, 'no TCGplayer data for that set here');
  assert.equal(o("Marvel Super Heroes Commander Deck - Doom Prevails (Collector's Edition)").ref.usd, 260);
  assert.equal(body.offers.filter(x => x.title === 'Lorwyn Eclipsed Commander Deck - Blight Curse').length, 1, '1st Pick listed once across collections');
});

test('GET /api/sealed: a store or TCGplayer being down still returns the rest', async () => {
  mockStores.sabaiDown = true; mockStores.tcgDown = true;
  const { status, body } = await call();
  assert.equal(status, 200);
  const sabai = body.stores.find(s => s.id === 'sabai');
  assert.equal(sabai.ok, false);
  assert.ok(body.offers.length > 5);
  assert.ok(body.offers.every(o => o.ref === null && o.discountPct === null));
});

test('Sealed/Deals pages: type groups, search and the deals cut-off', async () => {
  const { pick, kindGroup } = await import('../public/js/find-sealed.js');
  assert.equal(kindGroup('collector-box'), 'box');
  assert.equal(kindGroup('play-pack'), 'pack');
  assert.equal(kindGroup('commander-deck'), 'commander');
  assert.equal(kindGroup('gift-bundle'), 'bundle');
  assert.equal(kindGroup(null), 'other');
  const offers = [
    { title: 'A Bundle', store: 'Power9', kind: 'bundle', kindLabel: 'Bundle', price: 1000, discountPct: 12 },
    { title: 'B Commander Deck - X', store: 'Nox TCG', kind: 'commander-deck', kindLabel: 'Commander deck', price: 1500, discountPct: -4 },
    { title: 'C Play Booster Display', store: '1st Pick', kind: 'play-box', kindLabel: 'Play booster box', price: 5000, discountPct: 0 },
    { title: 'D Mystery', store: 'Power9', kind: null, kindLabel: 'Other sealed', price: 50, discountPct: null },
  ];
  assert.deepEqual(pick(offers, {}).map(o => o.title[0]), ['D', 'A', 'B', 'C'], 'cheapest first');
  assert.deepEqual(pick(offers, { mode: 'deals' }).map(o => o.title[0]), ['A', 'C'], 'at or below only');
  assert.deepEqual(pick(offers, { mode: 'deals', within: 10 }).map(o => o.title[0]), ['A', 'C', 'B']);
  assert.deepEqual(pick(offers, { q: 'power9' }).map(o => o.title[0]), ['D', 'A']);
  assert.deepEqual(pick(offers, { q: 'commander nox' }).map(o => o.title[0]), ['B']);
  assert.deepEqual(pick(offers, { kind: 'box' }).map(o => o.title[0]), ['C']);
});

test('finder pages stay separate: no links into the deckbuilder', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const f of ['find.html', 'find-sealed.html', 'find-deals.html']) {
    const html = await readFile(new URL(`../public/${f}`, import.meta.url), 'utf8');
    const links = [...html.matchAll(/href="(\/[^"]*)"/g)].map(m => m[1]).filter(h => !/^\/(find[\w-]*\.(html|webmanifest)|style\.css|icons\/)/.test(h));
    assert.deepEqual(links, [], `${f} links to ${links.join(', ')}`);
    assert.match(html, /href="\/find-deals\.html"/);
  }
});

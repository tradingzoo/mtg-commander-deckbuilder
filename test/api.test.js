import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { installMockFetch, calls } from './mock-fetch.js';
import edhrec, { deckLines } from '../api/edhrec.js';
import cards from '../api/cards.js';
import autocomplete from '../api/autocomplete.js';

before(installMockFetch);

function call(handler, { url, method = 'GET', body, vercelBody } = {}) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  Object.assign(req, { url, method, headers: {} });
  if (vercelBody !== undefined) req.body = vercelBody;
  return new Promise((resolve) => {
    const headers = {};
    const res = { statusCode: 200, setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, headersSent: false,
      end: (s) => resolve({ status: res.statusCode, headers, body: JSON.parse(s) }) };
    handler(req, res);
  });
}

test('edhrec: average deck + stats', async () => {
  const r = await call(edhrec, { url: '/api/edhrec?slug=krenko-mob-boss' });
  assert.equal(r.status, 200);
  assert.equal(r.body.commander.name, 'Krenko, Mob Boss');
  assert.equal(r.body.commander.num_decks, 23456);
  assert.equal(r.body.deck.length, 13);
  assert.equal(r.body.edhrec_stats.land, 38);
  assert.match(r.headers['cache-control'], /s-maxage/);
  assert.ok(calls.some(c => c.headers['User-Agent']), 'sends a User-Agent');
});

test('edhrec: reads the newer grouped deck format', async () => {
  const r = await call(edhrec, { url: '/api/edhrec?slug=dain-of-the-ancient-halls&bracket=upgraded' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.deck, [
    '1 Dáin of the Ancient Halls', '1 Sol Ring', '1 The Arkenstone // Seek the Heart',
    '1 Command Tower', '8 Mountain', '9 Plains', '1 Bruenor Battlehammer',
  ]);
  assert.equal(r.body.edhrec_stats.basic, 17);
});

test('edhrec: deckLines handles both formats and junk', () => {
  assert.deepEqual(deckLines(['1 Sol Ring', 5, null]), ['1 Sol Ring']);
  assert.deepEqual(deckLines({ commander: ['A'], cards: { Land: [['Plains', 0], ['Mountain', 3], 'bad'] } }), ['1 A', '1 Plains', '3 Mountain']);
  assert.deepEqual(deckLines(null), []);
  assert.deepEqual(deckLines('nope'), []);
});

test('edhrec: bracket filter path', async () => {
  const r = await call(edhrec, { url: '/api/edhrec?slug=krenko-mob-boss&bracket=core' });
  assert.equal(r.status, 200);
  assert.equal(r.body.commander.num_decks, 1200);
  assert.equal(r.body.edhrec_url, 'https://edhrec.com/average-decks/krenko-mob-boss/core');
});

test('edhrec: follows redirects', async () => {
  const r = await call(edhrec, { url: '/api/edhrec?slug=krenko' });
  assert.equal(r.status, 200);
  assert.equal(r.body.deck.length, 13);
});

test('edhrec: unknown commander is a friendly 404', async () => {
  const r = await call(edhrec, { url: '/api/edhrec?slug=not-a-commander' });
  assert.equal(r.status, 404);
  assert.match(r.body.error, /no average deck/i);
  assert.equal(r.headers['cache-control'], 'no-store');
});

test('edhrec: rejects bad input', async () => {
  assert.equal((await call(edhrec, { url: '/api/edhrec?slug=../../etc' })).status, 400);
  assert.equal((await call(edhrec, { url: '/api/edhrec?slug=krenko-mob-boss&bracket=hacked' })).status, 400);
  assert.equal((await call(edhrec, { url: '/api/edhrec' })).status, 400);
});

test('cards: lookup, chunking over 75, fuzzy fallback, not found', async () => {
  const names = ['Sol Ring', 'Fable of the Mirror-Breaker // Reflection of Kiki-Jiki', 'Lightning Blot', 'Totally Fake'];
  for (let i = 0; i < 80; i++) names.push(`Filler ${i}`);
  const r = await call(cards, { url: '/api/cards', method: 'POST', body: { names } });
  assert.equal(r.status, 200);
  const byName = Object.fromEntries(r.body.cards.map(c => [c.name, c]));
  assert.equal(byName['Sol Ring'].primary_type, 'Artifact');
  assert.equal(byName['Fable of the Mirror-Breaker // Reflection of Kiki-Jiki'].primary_type, 'Enchantment');
  assert.match(byName['Fable of the Mirror-Breaker // Reflection of Kiki-Jiki'].oracle_text, /draw that many/);
  assert.equal(byName['Lightning Bolt'].requested, 'Lightning Blot');
  assert.ok(r.body.not_found.includes('Totally Fake'));
  const coll = calls.filter(c => c.url.endsWith('/cards/collection'));
  assert.ok(coll.length >= 2, 'split into chunks of 75');
});

test('cards: works with a Vercel-parsed body too', async () => {
  const r = await call(cards, { url: '/api/cards', method: 'POST', vercelBody: { names: ['Sol Ring'] } });
  assert.equal(r.status, 200);
  assert.equal(r.body.cards[0].name, 'Sol Ring');
});

test('cards: rejects GET and empty lists', async () => {
  assert.equal((await call(cards, { url: '/api/cards' })).status, 405);
  assert.equal((await call(cards, { url: '/api/cards', method: 'POST', body: { names: [] } })).status, 400);
});

test('autocomplete', async () => {
  const r = await call(autocomplete, { url: '/api/autocomplete?q=kren' });
  assert.deepEqual(r.body.names, ['Krenko, Mob Boss']);
  const short = await call(autocomplete, { url: '/api/autocomplete?q=k' });
  assert.deepEqual(short.body.names, []);
});

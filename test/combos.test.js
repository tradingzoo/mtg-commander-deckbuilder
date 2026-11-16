import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { installMockFetch, calls } from './mock-fetch.js';
import combos from '../api/combos.js';
import { cardKey, splitSections, slimCombo, rankAlmost, bracketWarning, tagLabel } from '../public/js/combos.js';
import { parseDecklist } from '../public/js/classify.js';
import { COMBOS } from './fixtures.js';

before(installMockFetch);

function call(handler, { method = 'POST', body } = {}) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  Object.assign(req, { url: '/api/combos', method, headers: {} });
  return new Promise((resolve) => {
    const headers = {};
    const res = { statusCode: 200, setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
      end: (s) => resolve({ status: res.statusCode, headers, body: JSON.parse(s) }) };
    handler(req, res);
  });
}

test('cardKey: accents, case and back faces', () => {
  assert.equal(cardKey('Dáin, Lord of the Iron Hills'), 'dain, lord of the iron hills');
  assert.equal(cardKey('Bofur, Reliable Guardian // Concerted Care'), 'bofur, reliable guardian');
  assert.equal(cardKey('  MJÖLNIR, Hammer of Thor '), 'mjolnir, hammer of thor');
});

test('splitSections: Moxfield-style export with commander and sideboard', () => {
  const text = 'Commander\n1 Dáin of the Ancient Halls\n\nDeck\n1 Sol Ring\n1x Magda, Brazen Outlaw (OTJ) 140\n\nSIDEBOARD:\n1 The One Ring\nMaybeboard (2)\n1 Xorn';
  const s = splitSections(text, parseDecklist);
  assert.deepEqual(s.commanders, ['Dáin of the Ancient Halls']);
  assert.deepEqual(s.main, ['Sol Ring', 'Magda, Brazen Outlaw']);
  assert.deepEqual(s.side, ['The One Ring', 'Xorn']);
});

test('splitSections: plain list is all main deck', () => {
  assert.deepEqual(splitSections('1 Sol Ring\n2 Mountain', parseDecklist), { commanders: [], main: ['Sol Ring', 'Mountain'], side: [] });
});

test('slimCombo: missing cards, headline results, link', () => {
  const have = new Set(['the reaver cleaver']);
  const c = slimCombo(COMBOS[0], have);
  assert.deepEqual(c.missing, ['Aggravated Assault']);
  assert.deepEqual(c.results, ['Infinite colored mana', 'Infinite combat phases', 'Infinite artifact tokens']);
  assert.equal(c.two_card, true);
  assert.equal(c.url, 'https://commanderspellbook.com/combo/3750-5039/');
  assert.match(c.prerequisites, /power five or greater/);
});

test('rankAlmost: sideboard hits first, then popularity', () => {
  const list = [{ id: 'a', in_sideboard: [], popularity: 900 }, { id: 'b', in_sideboard: ['X'], popularity: 5 }, { id: 'c', in_sideboard: [], popularity: 1000 }];
  assert.deepEqual(rankAlmost(list).map(x => x.id), ['b', 'c', 'a']);
});

test('bracketWarning: two-card combos by bracket', () => {
  assert.match(bracketWarning({ two_card: true }, 2), /not allowed/);
  assert.match(bracketWarning({ two_card: true }, 3), /late in the game/);
  assert.equal(bracketWarning({ two_card: false }, 3), '');
  assert.equal(tagLabel('S'), 'Spicy');
  assert.equal(tagLabel(undefined), 'Not rated');
});

test('api/combos: has, one card away, sideboard flag, deck tag', async () => {
  const r = await call(combos, { body: {
    commanders: ['Dáin of the Ancient Halls'],
    main: ['Magda, Brazen Outlaw', 'Aggravated Assault', 'Gleaming Splendor', 'Smothering Tithe', 'The Reaver Cleaver'],
    side: ['Anointed Procession'],
  } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.included.map(c => c.id), ['3750-5039', '1486-3750']);
  assert.equal(r.body.almost[0].id, '7474-1');
  assert.deepEqual(r.body.almost[0].missing, ['Anointed Procession']);
  assert.deepEqual(r.body.almost[0].in_sideboard, ['Anointed Procession']);
  assert.equal(r.body.deck_tag, 'S');
  assert.equal(r.body.identity, 'RW');
  const sent = calls.filter(c => c.url.includes('commanderspellbook'));
  assert.ok(sent.length >= 2 && sent.every(c => c.headers['User-Agent']), 'sends a User-Agent');
});

test('api/combos: sideboard cards do not count as in the deck', async () => {
  const r = await call(combos, { body: { main: ['The Reaver Cleaver'], side: ['Aggravated Assault'] } });
  assert.equal(r.status, 200);
  assert.equal(r.body.included.length, 0);
  assert.deepEqual(r.body.almost.map(c => c.id), ['3750-5039']);
  assert.deepEqual(r.body.almost[0].in_sideboard, ['Aggravated Assault']);
});

test('api/combos: bad input and Spellbook errors', async () => {
  assert.equal((await call(combos, { method: 'GET' })).status, 405);
  assert.equal((await call(combos, { body: { main: [] } })).status, 400);
  const down = await call(combos, { body: { main: ['Spellbook Down'] } });
  assert.equal(down.status, 502);
  assert.match(down.body.error, /Spellbook/);
});

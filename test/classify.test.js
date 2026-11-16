import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, KRENKO_DECK } from './fixtures.js';
import { rolesOf, primaryType, slugify, slugFromInput, filtersFromInput, parseDecklist, summarize, frontFace } from '../public/js/classify.js';
import { slim } from '../api/cards.js';

const asSlim = (c) => { const { expect, ...card } = c; return slim(card.card_faces ? (({ oracle_text, ...r }) => r)(card) : card); };

for (const c of CARDS) {
  test(`roles: ${c.name}`, () => {
    assert.deepEqual([...rolesOf(asSlim(c))].sort(), [...c.expect].sort());
  });
}

test('primary types', () => {
  assert.equal(primaryType('Artifact Creature — Golem'), 'Creature');
  assert.equal(primaryType('Artifact Land'), 'Land');
  assert.equal(primaryType('Legendary Planeswalker — Chandra'), 'Planeswalker');
  assert.equal(primaryType('Kindred Instant — Goblin'), 'Instant');
  assert.equal(primaryType('Sorcery // Land'), 'Sorcery');
  assert.equal(primaryType('Battle — Siege'), 'Battle');
  assert.equal(primaryType('Enchantment — Aura'), 'Enchantment');
  assert.equal(primaryType(''), 'Other');
});

test('slugs', () => {
  assert.equal(slugify("Atraxa, Praetors' Voice"), 'atraxa-praetors-voice');
  assert.equal(slugify('Krenko, Mob Boss'), 'krenko-mob-boss');
  assert.equal(slugify('Lim-Dûl the Necromancer'), 'lim-dul-the-necromancer');
  assert.equal(slugify('Esika, God of the Tree // The Prismatic Bridge'), 'esika-god-of-the-tree');
  assert.equal(slugify('  Edgar Markov  '), 'edgar-markov');
  assert.equal(slugFromInput('https://edhrec.com/commanders/krenko-mob-boss'), 'krenko-mob-boss');
  assert.equal(slugFromInput('https://edhrec.com/average-decks/krenko-mob-boss/core/budget'), 'krenko-mob-boss');
  assert.equal(slugFromInput('edhrec.com/commanders/tymna-the-weaver-kraum-ludevics-opus'), 'tymna-the-weaver-kraum-ludevics-opus');
});

test('EDHREC links: slug, bracket and budget', () => {
  const dain = 'https://edhrec.com/commanders/dain-of-the-ancient-halls/upgraded/decks';
  assert.equal(slugFromInput(dain), 'dain-of-the-ancient-halls');
  assert.deepEqual(filtersFromInput(dain), { bracket: 'upgraded', budget: '' });
  assert.equal(slugify('Dáin of the Ancient Halls'), 'dain-of-the-ancient-halls');
  assert.deepEqual(filtersFromInput('https://edhrec.com/average-decks/krenko-mob-boss/core/budget'), { bracket: 'core', budget: 'budget' });
  assert.deepEqual(filtersFromInput('edhrec.com/commanders/krenko-mob-boss/expensive'), { bracket: '', budget: 'expensive' });
  assert.deepEqual(filtersFromInput('Krenko, Mob Boss'), { bracket: '', budget: '' });
});

test('decklist parsing', () => {
  const list = parseDecklist(`Commander
1 Krenko, Mob Boss (FDN) 204 *F*

Deck
1x Sol Ring [CMM]
Arcane Signet
// Lands
30 Mountain
2 Mountain
1 Lightning Bolt #Removal
SIDEBOARD:
1 Fable of the Mirror-Breaker // Reflection of Kiki-Jiki (NEO) 141`);
  assert.deepEqual(list, [
    { qty: 1, name: 'Krenko, Mob Boss' }, { qty: 1, name: 'Sol Ring' }, { qty: 1, name: 'Arcane Signet' },
    { qty: 32, name: 'Mountain' }, { qty: 1, name: 'Lightning Bolt' },
    { qty: 1, name: 'Fable of the Mirror-Breaker // Reflection of Kiki-Jiki' },
  ]);
});

test('summary of the mock Krenko average deck', () => {
  const map = new Map();
  for (const c of CARDS) { const s = asSlim(c); map.set(s.name.toLowerCase(), s); map.set(frontFace(s.name).toLowerCase(), s); }
  const s = summarize(parseDecklist(KRENKO_DECK.join('\n')), map, 'Krenko, Mob Boss');
  assert.equal(s.total, 41);                 // commander excluded
  assert.equal(s.types.Land, 31);
  assert.equal(s.basics, 30);
  assert.equal(s.spells, 10);                // 41 cards - 31 lands
  assert.equal(s.nonbasics, 1);
  assert.equal(s.types.Creature, 2);          // Dockside, Chieftain
  assert.equal(s.types.Instant, 2);
  assert.equal(s.types.Sorcery, 2);
  assert.equal(s.types.Artifact, 3);
  assert.equal(s.types.Enchantment, 1);
  assert.equal(s.roles.Ramp, 5);              // Sol Ring, Signet, Dockside, Jeska's Will, Fable
  assert.equal(s.roles.Removal, 2);           // Bolt, Chaos Warp
  assert.equal(s.roles['Board wipes'], 1);
  assert.equal(s.roles['Card draw'], 3);      // Skullclamp, Jeska's Will, Fable
  assert.deepEqual(s.unknown, []);
  assert.equal(s.curve.reduce((a, b) => a + b, 0), 10);
  assert.equal(s.curve[7], 1);                // Blasphemous Act
});

test('unknown cards are counted as Other, not dropped', () => {
  const s = summarize([{ qty: 1, name: 'Made Up Card' }], new Map(), '');
  assert.equal(s.total, 1);
  assert.equal(s.types.Other, 1);
  assert.deepEqual(s.unknown, ['Made Up Card']);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BRACKETS, GAME_CHANGERS, bracketById, bracketByNumber, isGameChanger, bracketFlags, bracketFloor, bracketSignals,
} from '../public/js/brackets.js';
import { BRACKETS as BRACKET_IDS, lookup } from '../public/js/classify.js';
import { slim } from '../api/cards.js';

// Real oracle text (Scryfall) and the bracket signals we expect.
const SIGNAL_CARDS = [
  { name: 'Armageddon', type_line: 'Sorcery', oracle_text: 'Destroy all lands.', mld: true },
  { name: 'Ravages of War', type_line: 'Sorcery', oracle_text: 'Destroy all lands.', mld: true },
  { name: 'Ruination', type_line: 'Sorcery', oracle_text: 'Destroy all nonbasic lands.', mld: true },
  { name: 'Jokulhaups', type_line: 'Sorcery', oracle_text: "Destroy all artifacts, creatures, and lands. They can't be regenerated.", mld: true },
  { name: 'Devastation', type_line: 'Sorcery', oracle_text: 'Destroy all creatures and lands.', mld: true },
  { name: 'Sunder', type_line: 'Instant', oracle_text: "Return all lands to their owners' hands.", mld: true },
  { name: 'Upheaval', type_line: 'Sorcery', oracle_text: "Return all permanents to their owners' hands.", mld: true },
  { name: 'Wildfire', type_line: 'Sorcery', oracle_text: 'Each player sacrifices four lands. Wildfire deals 4 damage to each creature.', mld: true },
  { name: 'Global Ruin', type_line: 'Sorcery', oracle_text: 'Each player chooses from the lands they control a land of each basic land type, then sacrifices the rest.', mld: true },
  { name: 'Winter Orb', type_line: 'Artifact', oracle_text: "As long as Winter Orb is untapped, players can't untap more than one land during their untap steps.", mld: true },
  { name: 'Static Orb', type_line: 'Artifact', oracle_text: "As long as Static Orb is untapped, players can't untap more than two permanents during their untap steps.", mld: true },
  { name: 'Back to Basics', type_line: 'Enchantment', oracle_text: "Nonbasic lands don't untap during their controllers' untap steps.", mld: true },
  { name: 'Rising Waters', type_line: 'Enchantment', oracle_text: "Lands don't untap during their controllers' untap steps.\nAt the beginning of each player's upkeep, that player untaps a land they control.", mld: true },
  { name: 'Blood Moon', type_line: 'Enchantment', oracle_text: 'Nonbasic lands are Mountains.', mld: true },
  { name: 'Harbinger of the Seas', type_line: 'Creature — Merfolk Wizard', oracle_text: 'Nonbasic lands are Islands.', mld: true },

  { name: 'Strip Mine', type_line: 'Land', oracle_text: '{T}: Add {C}.\n{T}, Sacrifice Strip Mine: Destroy target land.' },
  { name: 'Planar Cleansing', type_line: 'Sorcery', oracle_text: 'Destroy all nonland permanents.' },
  { name: 'Evacuation', type_line: 'Instant', oracle_text: "Return all creatures to their owners' hands." },
  { name: 'Wrath of God', type_line: 'Sorcery', oracle_text: "Destroy all creatures. They can't be regenerated." },
  { name: 'Mana Vault', type_line: 'Artifact', oracle_text: "Mana Vault doesn't untap during your untap step.\nAt the beginning of your upkeep, you may pay {4}. If you do, untap Mana Vault.\nAt the beginning of your draw step, if Mana Vault is tapped, it deals 1 damage to you.\n{T}: Add {C}{C}{C}.", gc: true },
  { name: 'Harrow', type_line: 'Instant', oracle_text: 'As an additional cost to cast this spell, sacrifice a land.\nSearch your library for up to two basic land cards, put them onto the battlefield, then shuffle.' },

  { name: 'Time Warp', type_line: 'Sorcery', oracle_text: 'Target player takes an extra turn after this one.', turns: true },
  { name: 'Time Stretch', type_line: 'Sorcery', oracle_text: 'Target player takes two extra turns after this one.', turns: true },
  { name: 'Nexus of Fate', type_line: 'Instant', oracle_text: "Take an extra turn after this one.\nIf Nexus of Fate would be put into a graveyard from anywhere, reveal Nexus of Fate and shuffle it into its owner's library instead.", turns: true },
  { name: 'Stranglehold', type_line: 'Enchantment', oracle_text: "Your opponents can't search libraries.\nIf an opponent would begin an extra turn, that player skips that turn instead." },

  { name: 'Rhystic Study', type_line: 'Enchantment', oracle_text: 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.', gc: true },
  { name: 'Tergrid, God of Fright', type_line: 'Legendary Creature — God', oracle_text: 'Menace\nWhenever an opponent sacrifices a nontoken permanent or discards a permanent card, you may put that card onto the battlefield under your control from their graveyard.', gc: true },
  { name: 'Food Chain', type_line: 'Enchantment', oracle_text: 'Exile a creature you control: Add X mana of any one color, where X is 1 plus the exiled creature\'s mana value. Spend this mana only to cast creature spells.' },
];

for (const c of SIGNAL_CARDS) {
  test(`bracket signals: ${c.name}`, () => {
    const f = bracketFlags(slim(c));
    assert.deepEqual(f, { gameChanger: !!c.gc, extraTurns: !!c.turns, massLandDenial: !!c.mld });
  });
}

test('bracket definitions line up with the EDHREC bracket ids', () => {
  assert.deepEqual(BRACKETS.map(b => b.id), BRACKET_IDS.filter(Boolean));
  assert.deepEqual(BRACKETS.map(b => b.number), [1, 2, 3, 4, 5]);
  assert.deepEqual(BRACKETS.map(b => b.minTurns), [9, 8, 6, 4, 0]);
  assert.deepEqual(BRACKETS.map(b => b.limits.gameChangers), [0, 0, 3, Infinity, Infinity]);
  assert.deepEqual(BRACKETS.map(b => b.limits.extraTurns), ['none', 'few', 'few', 'any', 'any']);
  assert.deepEqual(BRACKETS.map(b => b.limits.massLandDenial), ['none', 'none', 'none', 'any', 'any']);
  assert.deepEqual(BRACKETS.map(b => b.limits.twoCardCombos), ['none', 'none', 'late', 'any', 'any']);
  assert.equal(bracketById('upgraded').number, 3);
  assert.equal(bracketByNumber(5).id, 'cedh');
  assert.equal(bracketById('nope'), null);
});

test('Game Changers list: 53 unique cards, current as of Feb 2026', () => {
  assert.equal(GAME_CHANGERS.length, 53);
  assert.equal(new Set(GAME_CHANGERS).size, 53);
  for (const n of ['Farewell', 'Biorhythm', 'The One Ring', "Thassa's Oracle"]) assert.ok(isGameChanger(n), n);
  // removed in the Oct 2025 update
  for (const n of ['Food Chain', 'Kinnan, Bonder Prodigy', 'Urza, Lord High Artificer', 'Deflecting Swat', 'Expropriate']) {
    assert.equal(isGameChanger(n), false, n);
  }
  assert.ok(isGameChanger('Gaea’s Cradle'), 'curly apostrophe');
  assert.ok(isGameChanger('demonic tutor'), 'case');
});

test("Scryfall's game_changer flag wins over the built-in list", () => {
  assert.equal(isGameChanger({ name: 'Rhystic Study', game_changer: false }), false);
  assert.equal(isGameChanger({ name: 'Some New Card', game_changer: true }), true);
  assert.equal(isGameChanger({ name: 'Rhystic Study' }), true);
  assert.deepEqual(slim({ name: 'X', type_line: 'Artifact', game_changer: true }).game_changer, true);
  assert.equal('game_changer' in slim({ name: 'X', type_line: 'Artifact' }), false);
});

test('bracket floor from card limits', () => {
  assert.deepEqual(bracketFloor({}), { bracket: 1, reasons: [] });
  assert.equal(bracketFloor({ extraTurns: 1 }).bracket, 2);
  assert.equal(bracketFloor({ gameChangers: 1 }).bracket, 3);
  assert.equal(bracketFloor({ gameChangers: 3, extraTurns: 2 }).bracket, 3);
  assert.equal(bracketFloor({ gameChangers: 4 }).bracket, 4);
  assert.equal(bracketFloor({ massLandDenial: 1 }).bracket, 4);
  assert.equal(bracketFloor({ extraTurns: 4 }).bracket, 4);
  const r = bracketFloor({ gameChangers: 5, massLandDenial: 1 });
  assert.equal(r.bracket, 4);
  assert.equal(r.reasons.length, 2);
  assert.match(r.reasons[0].why, /5 Game Changers/);
});

test('bracket signals for a whole deck (commander counts, duplicates once)', () => {
  const map = new Map(SIGNAL_CARDS.map(c => [c.name.toLowerCase(), slim(c)]));
  const entries = [
    { qty: 1, name: 'Tergrid, God of Fright' }, { qty: 1, name: 'Rhystic Study' }, { qty: 1, name: 'Time Warp' },
    { qty: 1, name: 'Armageddon' }, { qty: 1, name: 'Wrath of God' }, { qty: 1, name: 'Unknown Card' },
    { qty: 1, name: 'rhystic study' },
  ];
  const s = bracketSignals(entries, map, lookup);
  assert.deepEqual(s.counts, { gameChangers: 2, extraTurns: 1, massLandDenial: 1 });
  assert.deepEqual(s.lists['Game Changers'].map(x => x.name), ['Tergrid, God of Fright', 'Rhystic Study']);
  assert.equal(s.floor.bracket, 4);
});

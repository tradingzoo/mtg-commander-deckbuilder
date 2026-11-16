// Hand-written test data shaped like real Scryfall / EDHREC responses.
// expect = the roles the classifier should find.

export const CARDS = [
  { name: 'Krenko, Mob Boss', type_line: 'Legendary Creature — Goblin Warrior', cmc: 4, color_identity: ['R'], oracle_text: '{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.', expect: [] },
  { name: 'Sol Ring', type_line: 'Artifact', cmc: 1, oracle_text: '{T}: Add {C}{C}.', expect: ['Ramp'] },
  { name: 'Arcane Signet', type_line: 'Artifact', cmc: 2, oracle_text: "{T}: Add one mana of any color in your commander's color identity.", expect: ['Ramp'] },
  { name: 'Cultivate', type_line: 'Sorcery', cmc: 3, oracle_text: 'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.', expect: ['Ramp'] },
  { name: 'Llanowar Elves', type_line: 'Creature — Elf Druid', cmc: 1, oracle_text: '{T}: Add {G}.', expect: ['Ramp'] },
  { name: 'Dockside Extortionist', type_line: 'Creature — Goblin Pirate', cmc: 2, oracle_text: 'When Dockside Extortionist enters, create X Treasure tokens, where X is the number of artifacts and enchantments your opponents control.', expect: ['Ramp'] },
  { name: 'Swords to Plowshares', type_line: 'Instant', cmc: 1, oracle_text: 'Exile target creature. Its controller gains life equal to its power.', expect: ['Removal'] },
  { name: 'Path to Exile', type_line: 'Instant', cmc: 1, oracle_text: 'Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.', expect: ['Removal'] },
  { name: 'Lightning Bolt', type_line: 'Instant', cmc: 1, oracle_text: 'Lightning Bolt deals 3 damage to any target.', expect: ['Removal'] },
  { name: 'Beast Within', type_line: 'Instant', cmc: 3, oracle_text: 'Destroy target permanent. Its controller creates a 3/3 green Beast creature token.', expect: ['Removal'] },
  { name: 'Chaos Warp', type_line: 'Instant', cmc: 3, oracle_text: 'The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it’s a permanent card, they put it onto the battlefield.', expect: ['Removal'] },
  { name: 'Cyclonic Rift', type_line: 'Instant', cmc: 2, oracle_text: "Return target nonland permanent you don't control to its owner's hand.\nOverload {6}{U} (You may cast this spell for its overload cost. If you do, change its text by replacing all instances of \"target\" with \"each.\")", expect: ['Removal'] },
  { name: 'Infernal Grasp', type_line: 'Instant', cmc: 2, oracle_text: 'Destroy target creature. You lose 2 life.', expect: ['Removal'] },
  { name: 'Wrath of God', type_line: 'Sorcery', cmc: 4, oracle_text: "Destroy all creatures. They can't be regenerated.", expect: ['Board wipes'] },
  { name: 'Blasphemous Act', type_line: 'Sorcery', cmc: 9, oracle_text: 'This spell costs {1} less to cast for each creature on the battlefield.\nBlasphemous Act deals 13 damage to each creature.', expect: ['Board wipes'] },
  { name: 'Toxic Deluge', type_line: 'Sorcery', cmc: 3, oracle_text: 'As an additional cost to cast this spell, pay X life.\nAll creatures get -X/-X until end of turn.', expect: ['Board wipes'] },
  { name: 'Counterspell', type_line: 'Instant', cmc: 2, oracle_text: 'Counter target spell.', expect: ['Counterspells'] },
  { name: 'Demonic Tutor', type_line: 'Sorcery', cmc: 2, oracle_text: 'Search your library for a card, put that card into your hand, then shuffle.', expect: ['Tutors'] },
  { name: 'Rhystic Study', type_line: 'Enchantment', cmc: 3, oracle_text: 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.', expect: ['Card draw'] },
  { name: 'Harmonize', type_line: 'Sorcery', cmc: 4, oracle_text: 'Draw three cards.', expect: ['Card draw'] },
  { name: 'Skullclamp', type_line: 'Artifact — Equipment', cmc: 1, oracle_text: 'Equipped creature gets +1/-1.\nWhenever equipped creature dies, draw two cards.\nEquip {1}', expect: ['Card draw'] },
  { name: "Jeska's Will", type_line: 'Sorcery', cmc: 3, oracle_text: "Choose one. If you control a commander as you cast this spell, you may choose both instead.\n• Add {R} for each card in target opponent's hand.\n• Exile the top three cards of your library. You may play them this turn.", expect: ['Ramp', 'Card draw'] },
  { name: 'Goblin Chieftain', type_line: 'Creature — Goblin', cmc: 3, oracle_text: 'Haste\nOther Goblin creatures you control get +1/+1 and have haste.', expect: [] },
  { name: 'Reanimate', type_line: 'Sorcery', cmc: 1, oracle_text: 'Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to its mana value.', expect: [] },
  { name: 'Command Tower', type_line: 'Land', cmc: 0, oracle_text: "{T}: Add one mana of any color in your commander's color identity.", expect: [] },
  { name: 'Bojuka Bog', type_line: 'Land', cmc: 0, oracle_text: "Bojuka Bog enters tapped.\nWhen Bojuka Bog enters, exile target player's graveyard.\n{T}: Add {B}.", expect: [] },
  { name: 'Mountain', type_line: 'Basic Land — Mountain', cmc: 0, oracle_text: '({T}: Add {R}.)', expect: [] },
  { name: 'Fable of the Mirror-Breaker // Reflection of Kiki-Jiki', type_line: 'Enchantment — Saga // Enchantment Creature — Goblin Shaman', cmc: 3, card_faces: [
    { type_line: 'Enchantment — Saga', oracle_text: '(As this Saga enters and after your draw step, add a lore counter.)\nI — Create a 2/2 red Goblin Shaman creature token with "Whenever this creature attacks, create a Treasure token."\nII — You may discard up to two cards. If you do, draw that many cards.\nIII — Exile this Saga, then return it to the battlefield transformed under your control.' },
    { type_line: 'Enchantment Creature — Goblin Shaman', oracle_text: '{1}, {T}: Create a token that\'s a copy of another target nonlegendary creature you control, except it has haste. Sacrifice it at the beginning of the next end step.' },
  ], expect: ['Ramp', 'Card draw'] },
];

// Average deck for the mock commander (commander line included, like EDHREC).
export const KRENKO_DECK = [
  '1 Krenko, Mob Boss', '1 Sol Ring', '1 Arcane Signet', '1 Dockside Extortionist', "1 Jeska's Will",
  '1 Lightning Bolt', '1 Chaos Warp', '1 Blasphemous Act', '1 Skullclamp', '1 Goblin Chieftain',
  '1 Fable of the Mirror-Breaker // Reflection of Kiki-Jiki', '1 Command Tower', '30 Mountain',
];

export const EDHREC = {
  'average-decks/krenko-mob-boss': {
    header: 'Average Deck for Krenko, Mob Boss', deck: KRENKO_DECK,
    container: { json_dict: { card: { name: 'Krenko, Mob Boss', sanitized: 'krenko-mob-boss', color_identity: ['R'], num_decks: 23456 } } },
  },
  'average-decks/krenko-mob-boss/core': {
    header: 'Average Deck for Krenko, Mob Boss - Core', deck: KRENKO_DECK.slice(0, 8).concat(['34 Mountain']),
    container: { json_dict: { card: { name: 'Krenko, Mob Boss', color_identity: ['R'], num_decks: 1200 } } },
  },
  'commanders/krenko-mob-boss': {
    creature: 31, instant: 9, sorcery: 8, artifact: 10, enchantment: 3, battle: 0, planeswalker: 0, land: 38, basic: 26, nonbasic: 12,
    container: { json_dict: { card: { name: 'Krenko, Mob Boss', sanitized: 'krenko-mob-boss', color_identity: ['R'], num_decks: 23456 } } },
  },
  'commanders/krenko-mob-boss/core': { land: 38, creature: 30, container: { json_dict: { card: { name: 'Krenko, Mob Boss', color_identity: ['R'], num_decks: 1200 } } } },
  // EDHREC's current shape (seen Nov 2026): deck grouped by card type as [name, qty] pairs.
  'average-decks/dain-of-the-ancient-halls/upgraded': {
    header: 'Average Deck for Dáin of the Ancient Halls - Upgraded',
    deck: {
      commander: ['Dáin of the Ancient Halls'],
      commander_v2: [['Dáin of the Ancient Halls', 1]],
      cards: {
        Artifact: [['Sol Ring', 1], ['The Arkenstone // Seek the Heart', 1]],
        Land: [['Command Tower', 1], ['Mountain', 8], ['Plains', 9]],
        Creature: [['Bruenor Battlehammer', 1]],
        Junk: 'not a list',
      },
    },
    container: { json_dict: { card: { name: 'Dáin of the Ancient Halls', sanitized: 'dain-of-the-ancient-halls', color_identity: ['R', 'W'], num_decks: 192 } } },
  },
  'commanders/dain-of-the-ancient-halls/upgraded': {
    creature: 29, land: 35, basic: 17, nonbasic: 18,
    container: { json_dict: { card: { name: 'Dáin of the Ancient Halls', sanitized: 'dain-of-the-ancient-halls', color_identity: ['R', 'W'], num_decks: 192 } } },
  },
  'commanders/krenko': { redirect: '/commanders/krenko-mob-boss' },
  'average-decks/krenko': { redirect: '/average-decks/krenko-mob-boss' },
};

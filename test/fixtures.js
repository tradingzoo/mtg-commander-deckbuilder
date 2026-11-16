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
  // Protection: gives something else hexproof/indestructible/shroud/protection, phases out, or redirects.
  { name: 'Lightning Greaves', type_line: 'Artifact — Equipment', cmc: 2, oracle_text: "Equipped creature has haste and shroud. (It can't be the target of spells or abilities.)\nEquip {0}", expect: ['Protection'] },
  { name: 'Swiftfoot Boots', type_line: 'Artifact — Equipment', cmc: 2, oracle_text: "Equipped creature has hexproof and haste. (It can't be the target of spells or abilities your opponents control. It can attack and {T} no matter when it came under your control.)\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)", expect: ['Protection'] },
  { name: 'Darksteel Plate', type_line: 'Artifact — Equipment', cmc: 3, oracle_text: 'Indestructible\nEquipped creature has indestructible.\nEquip {2}', expect: ['Protection'] },
  { name: 'Heroic Intervention', type_line: 'Instant', cmc: 2, oracle_text: 'Permanents you control gain hexproof and indestructible until end of turn.', expect: ['Protection'] },
  { name: "Teferi's Protection", type_line: 'Instant', cmc: 3, oracle_text: "Until your next turn, your life total can't change and you gain protection from everything. All permanents you control phase out. (While they're phased out, they're treated as though they don't exist. They phase in before you untap during your untap step.)\nExile Teferi's Protection.", expect: ['Protection'] },
  { name: 'Boros Charm', type_line: 'Instant', cmc: 2, oracle_text: 'Choose one —\n• Boros Charm deals 4 damage to target player or planeswalker.\n• Permanents you control gain indestructible until end of turn.\n• Target creature gains double strike until end of turn.', expect: ['Removal', 'Protection'] },
  { name: 'Mother of Runes', type_line: 'Creature — Human Cleric', cmc: 1, oracle_text: '{T}: Target creature you control gains protection from the color of your choice until end of turn.', expect: ['Protection'] },
  { name: 'Bastion Protector', type_line: 'Creature — Human Soldier', cmc: 3, oracle_text: 'Commander creatures you control get +2/+2 and have indestructible.', expect: ['Protection'] },
  { name: "Akroma's Will", type_line: 'Instant', cmc: 4, oracle_text: 'Choose one. If you control a commander as you cast this spell, you may choose both instead.\n• Creatures you control gain flying, vigilance, and double strike until end of turn.\n• Creatures you control gain lifelink, indestructible, and protection from each color until end of turn.', expect: ['Protection'] },
  { name: 'Deflecting Swat', type_line: 'Instant', cmc: 3, oracle_text: 'If you control a commander, you may cast this spell without paying its mana cost.\nYou may choose new targets for target spell or ability.', expect: ['Protection'] },
  // Its discard ability is a Pyroclasm ("2 damage to each creature"), so it is a small board wipe as well as removal.
  { name: 'Mjölnir, Hammer of Thor', type_line: 'Legendary Artifact — Equipment', cmc: 4, oracle_text: "When Mjölnir enters, it deals 4 damage to up to one target creature.\nDouble all damage equipped creature would deal.\nEquip worthy {1} (A creature is worthy if it's a legendary non-Villain that's red and/or white.)\n{2}{R}, Discard this card: It deals 2 damage to each creature.", expect: ['Removal', 'Board wipes'] },
  // Only protects itself: not counted.
  { name: 'Carnage Tyrant', type_line: 'Creature — Dinosaur', cmc: 6, oracle_text: "This spell can't be countered.\nTrample, hexproof", expect: [] },
  { name: 'Sigarda, Host of Herons', type_line: 'Legendary Creature — Angel', cmc: 5, oracle_text: "Flying, hexproof\nSpells and abilities your opponents control can't cause you to sacrifice permanents.", expect: [] },
  { name: 'Ulamog, the Defiler', type_line: 'Legendary Creature — Eldrazi', cmc: 10, oracle_text: 'When you cast this spell, target opponent exiles the top half of their library, rounded up.\nWard—Sacrifice two permanents.\nUlamog enters with a number of +1/+1 counters on it equal to the greatest mana value among cards in exile.\nUlamog has annihilator X, where X is the number of +1/+1 counters on it.', expect: [] },
  { name: 'Yahenni, Undying Partisan', type_line: 'Legendary Creature — Aetherborn Vampire', cmc: 3, oracle_text: 'Haste\nWhenever a creature an opponent controls dies, put a +1/+1 counter on Yahenni.\nSacrifice another creature: Yahenni gains indestructible until end of turn.', expect: [] },
];

// Average deck for the mock commander (commander line included, like EDHREC).
export const KRENKO_DECK = [
  '1 Krenko, Mob Boss', '1 Sol Ring', '1 Arcane Signet', '1 Dockside Extortionist', "1 Jeska's Will",
  '1 Lightning Bolt', '1 Chaos Warp', '1 Blasphemous Act', '1 Skullclamp', '1 Goblin Chieftain',
  '1 Fable of the Mirror-Breaker // Reflection of Kiki-Jiki', '1 Command Tower', '30 Mountain',
];

const KRENKO_TAGS = [
  { count: 380, slug: 'goblins', value: 'Goblins' }, { count: 410, slug: 'tokens', value: 'Tokens' },
  { count: 7, slug: 'go-wide', value: 'Go Wide' }, { count: 2, slug: 'combo', value: 'Combo' },
  { count: 60, slug: 'treasure', value: 'Treasure' }, { count: 0, slug: 'empty', value: 'Empty' }, { slug: '../bad', value: 'Bad', count: 9 },
];

export const EDHREC = {
  'average-decks/krenko-mob-boss': {
    header: 'Average Deck for Krenko, Mob Boss', deck: KRENKO_DECK,
    container: { json_dict: { card: { name: 'Krenko, Mob Boss', sanitized: 'krenko-mob-boss', color_identity: ['R'], num_decks: 23456 } } },
  },
  'average-decks/krenko-mob-boss/core': {
    header: 'Average Deck for Krenko, Mob Boss - Core', deck: KRENKO_DECK.slice(0, 8).concat(['34 Mountain']),
    tag_counts: KRENKO_TAGS,
    container: { json_dict: { card: { name: 'Krenko, Mob Boss', color_identity: ['R'], num_decks: 1200 } } },
  },
  // Themes ("Popular tags"). Treasure has no average deck on purpose, to show the error path.
  'average-decks/krenko-mob-boss/core/tokens': {
    header: 'Average Deck for Krenko, Mob Boss - Core Tokens', deck: KRENKO_DECK.slice(0, 9).concat(['1 Heroic Intervention', '1 Swiftfoot Boots', '1 Command Tower', '31 Mountain']),
    tag_counts: KRENKO_TAGS,
    container: { json_dict: { card: { name: 'Krenko, Mob Boss', color_identity: ['R'], num_decks: 410 } } },
  },
  'average-decks/krenko-mob-boss/core/goblins': {
    deck: KRENKO_DECK.filter(l => !l.includes('Chaos Warp')).concat(['1 Rhystic Study']),
    container: { json_dict: { card: { name: 'Krenko, Mob Boss', color_identity: ['R'], num_decks: 380 } } },
  },
  'average-decks/krenko-mob-boss/core/go-wide': {
    deck: KRENKO_DECK.filter(l => !l.includes('Blasphemous')).concat(['1 Lightning Greaves']),
    container: { json_dict: { card: { name: 'Krenko, Mob Boss', color_identity: ['R'], num_decks: 7 } } },
  },
  'commanders/krenko-mob-boss': {
    creature: 31, instant: 9, sorcery: 8, artifact: 10, enchantment: 3, battle: 0, planeswalker: 0, land: 38, basic: 26, nonbasic: 12,
    container: { json_dict: { card: { name: 'Krenko, Mob Boss', sanitized: 'krenko-mob-boss', color_identity: ['R'], num_decks: 23456 } } },
  },
  'commanders/krenko-mob-boss/core': { land: 38, creature: 30, container: { json_dict: { card: { name: 'Krenko, Mob Boss', color_identity: ['R'], num_decks: 1200 } } } },
  // More brackets, so `npm run mock` can show the cross-bracket table. Exhibition is left out on purpose.
  'average-decks/krenko-mob-boss/upgraded': {
    deck: KRENKO_DECK.filter(l => !l.includes('Mountain')).concat(['29 Mountain']),
    container: { json_dict: { card: { name: 'Krenko, Mob Boss', color_identity: ['R'], num_decks: 2100 } } },
  },
  // The newer EDHREC shape: commander_v2 plus cards grouped by type as [name, qty] pairs.
  'average-decks/krenko-mob-boss/optimized': {
    deck: {
      commander: ['Krenko, Mob Boss'],
      commander_v2: [['Krenko, Mob Boss', 1]],
      cards: {
        Artifact: [['Sol Ring', 1], ['Arcane Signet', 1], ['Skullclamp', 1]],
        Creature: [['Dockside Extortionist', 1], ['Goblin Chieftain', 1]],
        Instant: [['Lightning Bolt', 2], ['Chaos Warp', 1]],
        Sorcery: [["Jeska's Will", 1], ['Blasphemous Act', 1]],
        Enchantment: [['Fable of the Mirror-Breaker // Reflection of Kiki-Jiki', 1]],
        Land: [['Command Tower', 1], ['Mountain', 26]],
      },
    },
    container: { json_dict: { card: { name: 'Krenko, Mob Boss', color_identity: ['R'], num_decks: 640 } } },
  },
  'average-decks/krenko-mob-boss/cedh': {
    deck: KRENKO_DECK.filter(l => !l.includes('Mountain') && !l.includes('Chieftain')).concat(['24 Mountain']),
    container: { json_dict: { card: { name: 'Krenko, Mob Boss', color_identity: ['R'], num_decks: 85 } } },
  },
  'commanders/krenko': { redirect: '/commanders/krenko-mob-boss' },
  'average-decks/krenko': { redirect: '/average-decks/krenko-mob-boss' },
};

// Commander Brackets: the official WotC power-level system for Commander, as data.
// Runs in the browser and in Node tests (no dependencies).
//
// Sources (re-check these when Wizards posts a bracket update):
//   https://magic.wizards.com/en/news/announcements/introducing-commander-brackets-beta          (Feb 11 2025: the card limits below)
//   https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-october-21-2025 (turn expectations, tutor limits removed, 10 Game Changers removed)
//   https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-february-9-2026 (Farewell and Biorhythm added)
// Checked 2026-11-16: no Commander bracket or Game Changers changes since Feb 9 2026
// (the Mar, May and Oct 2026 announcements left Commander alone).

import { frontFace } from './classify.js';

export const RULES_CHECKED = '2026-11-16';
export const RULES_VERSION = 'Commander Brackets beta, Game Changers as of Feb 9 2026';

// limits.gameChangers: how many Game Changers a deck may run (Infinity = any number).
// limits.extraTurns:   'none' | 'few' (low numbers, never chained or looped) | 'any'
// limits.massLandDenial / limits.twoCardCombos: 'none' | 'late' (no intentional early-game ones) | 'any'
export const BRACKETS = [
  {
    id: 'exhibition', number: 1, name: 'Exhibition', minTurns: 9,
    summary: 'Theme or idea over power. Win conditions are highly thematic or substandard. Card legality can flex if the pod agrees.',
    limits: { gameChangers: 0, massLandDenial: 'none', extraTurns: 'none', twoCardCombos: 'none' },
  },
  {
    id: 'core', number: 2, name: 'Core', minTurns: 8,
    summary: 'Unoptimized and straightforward. Wins are incremental, telegraphed on the board, and can be disrupted. Low pressure.',
    limits: { gameChangers: 0, massLandDenial: 'none', extraTurns: 'few', twoCardCombos: 'none' },
  },
  {
    id: 'upgraded', number: 3, name: 'Upgraded', minTurns: 6,
    summary: 'Strong synergy and high card quality, with real disruption. Can win in one big turn from hand after building up resources.',
    limits: { gameChangers: 3, massLandDenial: 'none', extraTurns: 'few', twoCardCombos: 'late' },
  },
  {
    id: 'optimized', number: 4, name: 'Optimized', minTurns: 4,
    summary: 'Lethal, consistent and fast, but not built for the cEDH metagame. Fast mana, tutors, free disruption and efficient wins.',
    limits: { gameChangers: Infinity, massLandDenial: 'any', extraTurns: 'any', twoCardCombos: 'any' },
  },
  {
    id: 'cedh', number: 5, name: 'cEDH', minTurns: 0,
    summary: 'Built to battle in the competitive (cEDH) metagame. Victory over everything else. Games can end on any turn.',
    limits: { gameChangers: Infinity, massLandDenial: 'any', extraTurns: 'any', twoCardCombos: 'any' },
  },
];

export const bracketById = (id) => BRACKETS.find(b => b.id === id) || null;
export const bracketByNumber = (n) => BRACKETS.find(b => b.number === n) || null;

// The official Game Changers list (53 cards). Scryfall also marks these with `game_changer: true`;
// when Scryfall gives that flag we trust it, so the app stays right if the list changes before this file does.
export const GAME_CHANGERS = [
  'Ad Nauseam', 'Ancient Tomb', 'Aura Shards', 'Biorhythm', "Bolas's Citadel", 'Braids, Cabal Minion',
  'Chrome Mox', 'Coalition Victory', 'Consecrated Sphinx', 'Crop Rotation', 'Cyclonic Rift', 'Demonic Tutor',
  'Drannith Magistrate', 'Enlightened Tutor', 'Farewell', 'Field of the Dead', 'Fierce Guardianship',
  'Force of Will', "Gaea's Cradle", 'Gamble', 'Gifts Ungiven', 'Glacial Chasm', 'Grand Arbiter Augustin IV',
  'Grim Monolith', 'Humility', 'Imperial Seal', 'Intuition', "Jeska's Will", "Lion's Eye Diamond",
  'Mana Vault', "Mishra's Workshop", 'Mox Diamond', 'Mystical Tutor', 'Narset, Parter of Veils',
  'Natural Order', 'Necropotence', 'Notion Thief', 'Opposition Agent', 'Orcish Bowmasters', 'Panoptic Mirror',
  'Rhystic Study', 'Seedborn Muse', "Serra's Sanctum", 'Smothering Tithe', 'Survival of the Fittest',
  "Teferi's Protection", 'Tergrid, God of Fright', "Thassa's Oracle", 'The One Ring',
  'The Tabernacle at Pendrell Vale', 'Underworld Breach', 'Vampiric Tutor', 'Worldly Tutor',
];

const norm = (name) => frontFace(name).toLowerCase().replace(/[‘’]/g, "'");
const GC_SET = new Set(GAME_CHANGERS.map(norm));

// card: a card from /api/cards, or just a name string.
export function isGameChanger(card) {
  if (!card) return false;
  if (typeof card === 'string') return GC_SET.has(norm(card));
  if (typeof card.game_changer === 'boolean') return card.game_changer;
  return GC_SET.has(norm(card.name));
}

// ---------- bracket signals from rules text ----------

function text(card) {
  let t = String(card?.oracle_text || '').toLowerCase().replace(/[‘’]/g, "'");
  t = t.replace(/\([^)]*\)/g, ' ');   // drop reminder text
  return t;
}

const EXTRA_TURN = /\btakes? (?:an|one|two|x|that many) extra turns?\b/;

// Mass land denial, as WotC describes it: cards that destroy, exile or bounce lands en masse,
// keep them tapped, or change what mana they make, without replacing them.
const MLD = [
  /\b(?:destroy|exile) all (?:[a-z]+, )*(?:[a-z]+,? and )?(?:nonbasic )?lands\b/,  // Armageddon, Ruination, Jokulhaups
  /\breturn all (?:lands|permanents) to their owners' hands\b/,                   // Sunder, Upheaval
  /\beach player sacrifices (?:all|x|two|three|four|five|six|seven|half|\d+)[^.]*\blands?\b/, // Wildfire, Tectonic Break
  /\bchooses from the lands they control[^.]*then sacrifices the rest\b/,          // Global Ruin, Cataclysm-style
  /\b(?:nonbasic )?lands don't untap during their controllers' untap steps\b/,     // Back to Basics, Rising Waters
  /\bcan't untap more than (?:one|two) (?:lands?|permanents?)\b/,                  // Winter Orb, Static Orb
  /\bnonbasic lands are (?:plains|islands|swamps|mountains|forests)\b/,            // Blood Moon, Harbinger of the Seas
];

export function bracketFlags(card) {
  const t = text(card);
  return {
    gameChanger: isGameChanger(card),
    extraTurns: EXTRA_TURN.test(t),
    massLandDenial: MLD.some(rx => rx.test(t)),
  };
}

// "Low numbers" of extra turns isn't defined by WotC. At this many we call it more than a few.
export const MANY_EXTRA_TURNS = 4;

// entries: [{qty, name}], cards: Map(lowercase name -> card), lookup: (cards, name) -> card
// The commander counts here (unlike in the 99), because a Game Changer commander still counts.
export function bracketSignals(entries, cards, lookup) {
  const lists = { 'Game Changers': [], 'Extra turns': [], 'Mass land denial': [] };
  const seen = new Set();
  for (const { qty, name } of entries) {
    const card = lookup(cards, name) || { name };
    const key = norm(card.name || name);
    if (seen.has(key)) continue;
    seen.add(key);
    const f = bracketFlags(card);
    const item = { qty, name: card.name || name };
    if (f.gameChanger) lists['Game Changers'].push(item);
    if (f.extraTurns) lists['Extra turns'].push(item);
    if (f.massLandDenial) lists['Mass land denial'].push(item);
  }
  const count = (k) => lists[k].reduce((s, x) => s + x.qty, 0);
  const counts = {
    gameChangers: count('Game Changers'),
    extraTurns: count('Extra turns'),
    massLandDenial: count('Mass land denial'),
  };
  return { lists, counts, floor: bracketFloor(counts) };
}

// The lowest bracket the card limits allow. This is a floor, not a placement: it can't see
// two-card combos, intent, or how fast the deck really is, so a deck can belong higher.
// Never returns 5, since cEDH is about the metagame a deck is built for, not its cards.
export function bracketFloor({ gameChangers = 0, extraTurns = 0, massLandDenial = 0 } = {}) {
  let floor = 1;
  const reasons = [];
  const raise = (n, why) => { if (n > floor) floor = n; reasons.push({ bracket: n, why }); };
  if (gameChangers > 3) raise(4, `${gameChangers} Game Changers (Bracket 3 allows up to 3)`);
  else if (gameChangers > 0) raise(3, `${gameChangers} Game Changer${gameChangers > 1 ? 's' : ''} (Brackets 1 and 2 allow none)`);
  if (massLandDenial > 0) raise(4, `mass land denial (not allowed in Brackets 1 to 3)`);
  if (extraTurns >= MANY_EXTRA_TURNS) raise(4, `${extraTurns} extra-turn cards (Brackets 2 and 3 expect only a few)`);
  else if (extraTurns > 0) raise(2, `extra-turn cards (Bracket 1 allows none)`);
  return { bracket: floor, reasons };
}

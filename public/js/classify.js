// Shared deck logic. Runs in the browser and in Node tests (no dependencies).

export const TYPE_ORDER = [
  'Land', 'Creature', 'Instant', 'Sorcery', 'Artifact',
  'Enchantment', 'Planeswalker', 'Battle', 'Other',
];

export const ROLE_ORDER = ['Ramp', 'Card draw', 'Removal', 'Board wipes', 'Counterspells', 'Protection', 'Tutors'];

export const BRACKETS = ['', 'exhibition', 'core', 'upgraded', 'optimized', 'cedh'];
export const BUDGETS = ['', 'budget', 'expensive'];
// Path words on EDHREC links that are pages, not themes.
const NOT_TAGS = ['decks', 'cards', 'combos', 'similar', 'average-decks', 'commanders'];

// ---------- names, slugs, decklists ----------

export function frontFace(name) {
  return String(name || '').split(' // ')[0].trim();
}

// Same rule EDHREC uses for URLs: "Atraxa, Praetors' Voice" -> "atraxa-praetors-voice"
export function slugify(name) {
  return frontFace(name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

// Accepts a commander name, or an EDHREC link such as
// https://edhrec.com/commanders/krenko-mob-boss  or  .../average-decks/krenko-mob-boss/core
export function slugFromInput(input) {
  const text = String(input || '').trim();
  const m = text.match(/edhrec\.com\/(?:commanders|average-decks|decks)\/([a-z0-9-]+)/i);
  if (m) return m[1].toLowerCase();
  return slugify(text);
}

// The bracket and budget in an EDHREC link, e.g. .../commanders/dain-of-the-ancient-halls/upgraded/decks
export function filtersFromInput(input) {
  const m = String(input || '').match(/edhrec\.com\/(?:commanders|average-decks|decks)\/[a-z0-9-]+((?:\/[a-z0-9-]+)*)/i);
  const parts = m ? m[1].toLowerCase().split('/').filter(Boolean) : [];
  return {
    bracket: parts.find(p => BRACKETS.includes(p) && p) || '',
    budget: parts.find(p => BUDGETS.includes(p) && p) || '',
    // A theme link such as .../dain-of-the-ancient-halls/upgraded/equipment names the theme too.
    tag: parts.find(p => !BRACKETS.includes(p) && !BUDGETS.includes(p) && !NOT_TAGS.includes(p)) || '',
  };
}

const SECTION_HEADERS = /^(commander|commanders|deck|decklist|main|mainboard|sideboard|maybeboard|companion|tokens?|lands?|creatures?|instants?|sorcer(y|ies)|artifacts?|enchantments?|planeswalkers?|battles?|other)\s*:?\s*(\(\d+\))?$/i;

// "1 Sol Ring", "1x Sol Ring", "Sol Ring", "1 Sol Ring (CMM) 410 *F*", "1 Sol Ring [CMM]"
export function parseDecklist(text) {
  const out = [];
  for (let raw of String(text || '').split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;
    if (SECTION_HEADERS.test(line)) continue;
    let qty = 1;
    const q = line.match(/^(\d+)\s*x?\s+(.*)$/i);
    if (q) { qty = parseInt(q[1], 10); line = q[2]; }
    line = line
      .replace(/\s+\*[A-Z]+\*\s*$/i, '')          // *F* foil marks
      .replace(/\s+\[[^\]]*\]\s*$/, '')           // [SET] or [tags]
      .replace(/\s+\([A-Z0-9]{2,6}\)(\s+[\w-]+)?\s*$/i, '') // (SET) 123
      .replace(/\s+#\S.*$/, '')                   // Archidekt #tags
      .trim();
    if (!line || qty <= 0) continue;
    const found = out.find(e => e.name.toLowerCase() === line.toLowerCase());
    if (found) found.qty += qty; else out.push({ qty, name: line });
  }
  return out;
}

// ---------- types ----------

export function primaryType(typeLine) {
  const front = String(typeLine || '').split(' // ')[0];
  const main = front.split(/\s+[—-]\s+/)[0];
  // Order matters: an "Artifact Creature" is a creature, an "Artifact Land" is a land.
  for (const t of ['Land', 'Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment']) {
    if (new RegExp(`\\b${t}\\b`).test(main)) return t;
  }
  return 'Other';
}

// ---------- roles (best-effort, from rules text) ----------

const NUM = '(?:a|an|one|two|three|four|five|six|seven|x|that many|\\d+)';

function clean(card) {
  let t = String(card.oracle_text || '').toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\u2212/g, '-');
  t = t.replace(/\([^)]*\)/g, ' ');            // drop reminder text
  // Legends call themselves by their short name: "Yahenni gains indestructible".
  const front = frontFace(card.name || '');
  for (const n of [card.name, front, front.split(', ')[1] && front.split(', ')[0].length >= 4 ? front.split(', ')[0] : '']) {
    if (n) t = t.split(n.toLowerCase()).join('this');
  }
  return t;
}

// Split into sentences so "exile target card from a graveyard" can be ruled out.
function clauses(text) {
  return text.split(/[.\n•]/).map(s => s.trim()).filter(Boolean);
}

const RX = {
  manaAbility: /\badd (?:\{[wubrgcsx0-9]\}|one mana|two mana|three mana|x mana|mana of|an amount of|that much mana|\w+ mana)/,
  landToBattlefield: /search your library for [^.]*\blands?\b[^.]*onto the battlefield|put (?:a|up to \w+) lands? cards? from your hand onto the battlefield|search your library for [^.]*\blands? cards?\b[^.]*put (?:it|them|those cards|one of them|that card) onto the battlefield/,
  extraLand: /play (?:an|two) additional lands?/,
  treasure: /create [^.]*\btreasure tokens?\b|create (?:a|an|one|two|three|x) treasures?/,

  draw: new RegExp(`\\bdraw ${NUM} (?:additional )?cards?\\b|\\bdraw cards\\b|\\bdraws? cards equal\\b|\\bdraw (?:a|an) card for each\\b`),
  impulse: /exile the top (?:\w+ )?cards? of your library[^.]*\.[^.]*\byou may (?:play|cast)\b|exile the top (?:\w+ )?cards? of your library\. (?:until|during)[^.]*you may (?:play|cast)/,

  targetedKill: /\b(?:destroy|exile) (?:up to (?:one|two|three|x) )?(?:other )?target\b/,
  damage: /damage to (?:any target|any other target|(?:up to \w+ )?(?:other )?target (?:[\w\s,-]{0,30})?(?:creature|planeswalker|permanent|battle)s?)/,
  bounce: /return (?:up to \w+ )?(?:other )?target (?:[\w\s,-]{0,30})?(?:creature|permanent|artifact|enchantment|planeswalker)s? [^.]*to (?:its|their) (?:owner's|owners'|owner) hands?/,
  shrink: /target (?:[\w\s]{0,30})?creature[^.]{0,40} gets -(?:\d+|x)\/-(?:\d+|x)/,
  fight: /\bfights? (?:up to one )?(?:another )?target\b|\bfight each other\b/,
  edict: /\b(?:target player|target opponent|each opponent) sacrifices (?:a|an|one|two|x|that many)\b/,
  tuck: /put target [^.]*(?:on the bottom|on top|into its owner's library|second from the top)|owner of target [^.]*shuffles it into|shuffles? target [^.]*into (?:its|their) owner's library/,

  wipe: /\b(?:destroy|exile) (?:all|each)\b|\ball (?:other )?(?:non\w+ )?creatures get -|\beach (?:other )?creature (?:you don't control )?gets -|damage to each (?:other )?(?:non\w+ )?creature|\breturn all (?:other )?(?:nonland )?(?:creatures|permanents)|\beach player sacrifices (?:a|all|x|that many|\w+)\b|\beach opponent sacrifices all\b/,

  counter: /\bcounter (?:target|up to one target|that spell|that ability|it unless|all)\b|\bcounter target\b/,
  // Gives something else hexproof/indestructible/shroud/protection/ward, phases your stuff out, or redirects a spell.
  // A card that only protects itself ("this gains indestructible", "Trample, hexproof") is not protection.
  protect: /\b(?:gains?|has|have)\b[^.]*\b(?:hexproof|indestructible|shroud|protection from|ward)\b/,
  protectSelf: /\bthis (?:\w+ )?(?:gains?|has)\b/,
  protectOther: /\b(?:permanents|creatures) you control phase out\b|\byou gain protection from\b|\bchoose (?:a )?new targets? for target\b|\bchange the targets? of target\b/,
  tutorSearch: /search your library for ([^.]*?)\bcards?\b/g,
};

export function rolesOf(card) {
  const roles = new Set();
  if (!card || !card.oracle_text) return roles;
  const type = card.primary_type || primaryType(card.type_line);
  const text = clean(card);
  const parts = clauses(text);
  const any = (rx) => parts.some(p => rx.test(p) && !/graveyard/.test(p));

  // Ramp (lands are your mana base, not ramp)
  if (type !== 'Land' && (RX.manaAbility.test(text) || RX.landToBattlefield.test(text) || RX.extraLand.test(text) || RX.treasure.test(text))) {
    roles.add('Ramp');
  }

  if (RX.draw.test(text) || RX.impulse.test(text)) roles.add('Card draw');

  if (any(RX.targetedKill) || any(RX.damage) || any(RX.bounce) || any(RX.shrink) || any(RX.fight) || any(RX.edict) || any(RX.tuck)) {
    roles.add('Removal');
  }

  if (any(RX.wipe)) roles.add('Board wipes');

  if (RX.counter.test(text)) roles.add('Counterspells');

  if (parts.some(p => RX.protect.test(p) && !RX.protectSelf.test(p)) || RX.protectOther.test(text)) roles.add('Protection');

  for (const m of text.matchAll(RX.tutorSearch)) {
    if (!/\bland\b|\blands\b|\bforest|\bisland|\bswamp|\bmountain|\bplains/.test(m[1])) { roles.add('Tutors'); break; }
  }

  return roles;
}

// ---------- deck summary ----------

// entries: [{qty, name}], cards: Map(lowercase name -> card info from /api/cards)
export function lookup(cards, name) {
  return cards.get(name.toLowerCase()) || cards.get(frontFace(name).toLowerCase()) || null;
}

export function summarize(entries, cards, commanderName = '') {
  const cmdr = frontFace(commanderName).toLowerCase();
  const types = Object.fromEntries(TYPE_ORDER.map(t => [t, 0]));
  const roles = Object.fromEntries(ROLE_ORDER.map(r => [r, 0]));
  const lists = {};               // category -> [{qty, name}]
  const add = (cat, qty, name) => { (lists[cat] ||= []).push({ qty, name }); };
  const curve = [0, 0, 0, 0, 0, 0, 0, 0]; // 0..6, 7+
  let total = 0, basics = 0, cmcSum = 0, cmcCount = 0;
  const unknown = [];
  let commanderSeen = false;

  for (const { qty, name } of entries) {
    const card = lookup(cards, name);
    if (cmdr && frontFace(name).toLowerCase() === cmdr && !commanderSeen) {
      commanderSeen = true;
      if (qty <= 1) continue;        // the commander itself isn't part of the 99
    }
    total += qty;
    if (!card) { unknown.push(name); types.Other += qty; add('Other', qty, name); continue; }
    const type = card.primary_type || primaryType(card.type_line);
    types[type] += qty; add(type, qty, card.name);
    if (type === 'Land') {
      if (/\bBasic\b/.test(card.type_line)) basics += qty;
    } else {
      const cmc = Math.round(Number(card.cmc) || 0);
      curve[Math.min(cmc, 7)] += qty;
      cmcSum += cmc * qty; cmcCount += qty;
    }
    for (const r of rolesOf(card)) { roles[r] += qty; add(r, qty, card.name); }
  }

  return {
    total, types, roles, lists, curve, unknown,
    basics, nonbasics: types.Land - basics,
    spells: total - types.Land,       // every non-land card, unknown ones included
    avgCmc: cmcCount ? cmcSum / cmcCount : 0,
  };
}

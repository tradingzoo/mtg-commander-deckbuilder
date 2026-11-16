// Combo finder helpers, shared by api/combos.js and the page.
// Combos come from Commander Spellbook (backend.commanderspellbook.com/find-my-combos).
import { frontFace } from './classify.js';

// Lowercase, no accents, front face only: "Dáin, Lord of the Iron Hills" -> "dain, lord of the iron hills".
export function cardKey(name) {
  return frontFace(String(name || '')).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const SIDE = /^(sideboard|maybeboard|maybe|considering)\s*:?\s*(\(\d+\))?$/i;
const CMDR = /^(commanders?)\s*:?\s*(\(\d+\))?$/i;
const OTHER_HEADER = /^(deck|decklist|main|mainboard|companion|tokens?)\s*:?\s*(\(\d+\))?$/i;

// Splits a pasted list into commander / main / sideboard names, using section headers
// ("Commander", "Sideboard", "Maybeboard") the way Moxfield and Archidekt export them.
// Lines are parsed by the caller's parseDecklist, so this only sorts them into sections.
export function splitSections(text, parseDecklist) {
  const out = { commanders: [], main: [], side: [] };
  let section = 'main';
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    for (const e of parseDecklist(buf.join('\n'))) out[section].push(e.name);
    buf = [];
  };
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (SIDE.test(line)) { flush(); section = 'side'; continue; }
    if (CMDR.test(line)) { flush(); section = 'commanders'; continue; }
    if (OTHER_HEADER.test(line)) { flush(); section = 'main'; continue; }
    buf.push(raw);
  }
  flush();
  return out;
}

// Commander Spellbook's bracket tags. Exhibition and Core line up with Brackets 1 and 2;
// the rest are Spellbook's own names, shown as they are.
export const TAGS = {
  E: { label: 'Exhibition', tone: 'good' },
  C: { label: 'Core', tone: 'good' },
  O: { label: 'Oddball', tone: 'mid' },
  P: { label: 'Powerful', tone: 'mid' },
  S: { label: 'Spicy', tone: 'bad' },
  R: { label: 'Ruthless', tone: 'bad' },
  B: { label: 'Has a banned card', tone: 'bad' },
};
export const tagLabel = (t) => TAGS[t]?.label || 'Not rated';

// Spellbook lists every effect; "S" (standalone) ones are the headline, then "C" (contextual).
function results(produces) {
  const list = Array.isArray(produces) ? produces : [];
  const pick = (st) => list.filter(p => p?.feature?.status === st).map(p => p.feature.name);
  const main = [...pick('S'), ...pick('C')];
  return (main.length ? main : list.map(p => p?.feature?.name).filter(Boolean)).slice(0, 3);
}

// Trims one Spellbook variant to what the page shows.
// Card picture: Spellbook's own Scryfall image, or Scryfall's image redirect by exact name.
export function cardImage(card) {
  const src = card?.imageUriFrontNormal || card?.imageUriFrontLarge || card?.imageUriFrontSmall;
  if (typeof src === 'string' && /^https:\/\/cards\.scryfall\.io\//.test(src)) return src;
  const name = frontFace(String(card?.name || ''));
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`;
}

export function slimCombo(v, have, side = new Set()) {
  const uses = (v?.uses || []).filter(u => u?.card?.name);
  const cards = uses.map(u => u.card.name);
  const missing = cards.filter(c => !have.has(cardKey(c)));
  return {
    id: String(v?.id || ''),
    cards,
    images: uses.map(u => cardImage(u.card)),
    missing,
    in_sideboard: missing.filter(c => side.has(cardKey(c))),
    results: results(v?.produces),
    prerequisites: String(v?.notablePrerequisites || '').trim(),
    tag: v?.bracketTag || null,
    popularity: Number(v?.popularity) || 0,
    two_card: cards.length === 2,
    url: v?.id ? `https://commanderspellbook.com/combo/${encodeURIComponent(v.id)}/` : null,
  };
}

// Sorts "one card away" so the sideboard hits come first, then the most played.
export function rankAlmost(list) {
  return [...list].sort((a, b) => (b.in_sideboard.length - a.in_sideboard.length) || (b.popularity - a.popularity));
}

// Bracket 3 allows two-card infinite combos only late in the game; 1 and 2 allow none.
export function bracketWarning(combo, bracketNumber) {
  if (!combo.two_card) return '';
  if (bracketNumber && bracketNumber <= 2) return 'Two-card combo: not allowed in Brackets 1 and 2.';
  if (bracketNumber === 3) return 'Two-card combo: Bracket 3 allows it only late in the game.';
  return 'Two-card combo: none in Brackets 1–2, late game only in 3.';
}

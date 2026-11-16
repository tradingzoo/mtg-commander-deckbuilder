// GET /api/edhrec?slug=krenko-mob-boss&bracket=core&budget=budget
// Returns the commander's EDHREC average deck plus EDHREC's own type averages.
import { send, query, getJson } from './_lib.js';

const BRACKETS = new Set(['exhibition', 'core', 'upgraded', 'optimized', 'cedh']);
const BUDGETS = new Set(['budget', 'expensive']);
const STAT_KEYS = ['creature', 'instant', 'sorcery', 'artifact', 'enchantment', 'battle', 'planeswalker', 'land', 'basic', 'nonbasic'];

async function edhrec(path) {
  let res = await getJson(`https://json.edhrec.com/pages/${path}.json`);
  // EDHREC sometimes answers with {"redirect": "/commanders/other-name"}
  const redirect = res.body && typeof res.body.redirect === 'string' ? res.body.redirect : null;
  if (redirect && /^\/[a-z0-9\-/]+$/.test(redirect)) {
    res = await getJson(`https://json.edhrec.com/pages${redirect}.json`);
  }
  return res;
}

function commanderInfo(body) {
  const card = body?.container?.json_dict?.card || {};
  const img = Array.isArray(card.image_uris) ? card.image_uris[0] : card.image_uris;
  return {
    name: card.name || body?.header || '',
    sanitized: card.sanitized || '',
    color_identity: Array.isArray(card.color_identity) ? card.color_identity : [],
    num_decks: card.num_decks || body?.num_decks_avg || null,
    image: (img && (img.normal || img.art_crop)) || null,
    url: card.url || null,
  };
}

function stats(body) {
  if (!body) return null;
  const s = {};
  let found = false;
  for (const k of STAT_KEYS) {
    if (typeof body[k] === 'number') { s[k] = body[k]; found = true; }
  }
  return found ? s : null;
}

// EDHREC used to send deck as ["1 Sol Ring", ...]. Since late 2026 it sends
// { commander: [...], cards: { Artifact: [["Sol Ring", 1], ...], Land: [...] } }.
// Both become "1 Card Name" lines; the commander line comes first.
export function deckLines(deck) {
  if (Array.isArray(deck)) return deck.filter(l => typeof l === 'string');
  if (!deck || typeof deck !== 'object') return [];
  const lines = [];
  const pair = (p) => Array.isArray(p) && typeof p[0] === 'string' ? `${Number(p[1]) > 0 ? Number(p[1]) : 1} ${p[0]}` : null;
  const cmdrs = Array.isArray(deck.commander_v2) ? deck.commander_v2.map(pair)
    : Array.isArray(deck.commander) ? deck.commander.filter(n => typeof n === 'string').map(n => `1 ${n}`) : [];
  lines.push(...cmdrs.filter(Boolean));
  const groups = deck.cards && typeof deck.cards === 'object' ? Object.values(deck.cards) : [];
  for (const g of groups) if (Array.isArray(g)) lines.push(...g.map(pair).filter(Boolean));
  return lines;
}

export default async function handler(req, res) {
  const q = query(req);
  const slug = (q.get('slug') || '').toLowerCase();
  const bracket = (q.get('bracket') || '').toLowerCase();
  const budget = (q.get('budget') || '').toLowerCase();

  if (!/^[a-z0-9-]{2,120}$/.test(slug)) return send(res, 400, { error: 'Enter a commander name.' });
  if (bracket && !BRACKETS.has(bracket)) return send(res, 400, { error: 'Unknown bracket.' });
  if (budget && !BUDGETS.has(budget)) return send(res, 400, { error: 'Unknown budget.' });

  const suffix = [slug, bracket, budget].filter(Boolean).join('/');

  try {
    const [avg, cmd] = await Promise.all([
      edhrec(`average-decks/${suffix}`),
      edhrec(`commanders/${suffix}`),
    ]);

    const deck = deckLines(avg.body?.deck);
    if (!deck.length) {
      const status = avg.status === 404 || avg.status === 403 || cmd.status === 404 ? 404 : 502;
      return send(res, status, {
        error: status === 404
          ? `EDHREC has no average deck for "${slug}"${bracket || budget ? ' with those filters' : ''}. Check the spelling, or paste the commander's EDHREC link.`
          : 'EDHREC did not respond properly. Try again in a minute.',
      });
    }

    const info = commanderInfo(cmd.body?.container ? cmd.body : avg.body);
    send(res, 200, {
      slug, bracket, budget,
      commander: info,
      deck,
      edhrec_stats: stats(cmd.body) || stats(avg.body),
      edhrec_url: `https://edhrec.com/average-decks/${suffix}`,
      fetched_at: new Date().toISOString(),
    }, 60 * 60 * 12);
  } catch (e) {
    send(res, 502, { error: 'Could not reach EDHREC. Try again in a minute.' });
  }
}

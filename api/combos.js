// POST /api/combos  { "main": [...names], "commanders": [...names], "side": [...names] }
// Asks Commander Spellbook which combos the deck already has and which are one card away.
// Sideboard names are not counted as "in the deck"; they only mark missing cards you already own.
import { send, readJson, getJson } from './_lib.js';
import { cardKey, slimCombo, rankAlmost } from '../public/js/combos.js';

const SPELLBOOK = 'https://backend.commanderspellbook.com';
const MAX_CARDS = 250;
const MAX_ALMOST = 60;

const names = (list) => [...new Map((Array.isArray(list) ? list : [])
  .filter(n => typeof n === 'string' && n.trim())
  .map(n => [cardKey(n), n.trim().slice(0, 200)])).values()];

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
  let body;
  try { body = await readJson(req); } catch { return send(res, 400, { error: 'Bad JSON.' }); }

  const commanders = names(body?.commanders).slice(0, 2);
  const main = names(body?.main).slice(0, MAX_CARDS);
  const side = names(body?.side).slice(0, MAX_CARDS);
  if (!main.length && !commanders.length) return send(res, 400, { error: 'No card names given.' });

  const deck = JSON.stringify({ commanders: commanders.map(card => ({ card })), main: main.map(card => ({ card })) });
  const post = (path) => getJson(`${SPELLBOOK}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: deck,
  });

  let found, estimate;
  try {
    [found, estimate] = await Promise.all([post('/find-my-combos'), post('/estimate-bracket').catch(() => null)]);
  } catch {
    return send(res, 502, { error: 'Could not reach Commander Spellbook. Try again in a minute.' });
  }
  const r = found?.body?.results;
  if (!found?.ok || !r) return send(res, 502, { error: 'Commander Spellbook did not respond properly. Try again in a minute.' });

  const have = new Set([...main, ...commanders].map(cardKey));
  const sideSet = new Set(side.map(cardKey));
  const slim = (v) => slimCombo(v, have, sideSet);
  const included = (r.included || []).map(slim).sort((a, b) => b.popularity - a.popularity);
  const almostAll = rankAlmost((r.almostIncluded || []).map(slim));

  send(res, 200, {
    identity: r.identity || '',
    deck_tag: estimate?.ok ? estimate.body?.bracketTag || null : null,
    included,
    almost: almostAll.slice(0, MAX_ALMOST),
    almost_total: almostAll.length,
    source: 'https://commanderspellbook.com',
  });
}

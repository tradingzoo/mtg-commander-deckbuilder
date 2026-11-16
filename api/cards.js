// POST /api/cards  { "names": ["Sol Ring", "Swords to Plowshares", ...] }
// Looks the cards up on Scryfall and returns the fields the app needs.
import { send, readJson, getJson, sleep } from './_lib.js';
import { primaryType, frontFace } from '../public/js/classify.js';

const MAX_NAMES = 250;

export function slim(c) {
  const faces = Array.isArray(c.card_faces) ? c.card_faces : [];
  const type_line = c.type_line || faces.map(f => f.type_line).filter(Boolean).join(' // ');
  const oracle_text = c.oracle_text ?? faces.map(f => f.oracle_text || '').join('\n');
  return {
    name: c.name,
    type_line,
    primary_type: primaryType(type_line),
    oracle_text,
    cmc: typeof c.cmc === 'number' ? c.cmc : (faces[0]?.cmc ?? 0),
    mana_cost: c.mana_cost ?? faces[0]?.mana_cost ?? '',
    color_identity: c.color_identity || [],
    scryfall_uri: c.scryfall_uri || null,
    // Scryfall's own Game Changers flag; missing on old cached data, so brackets.js falls back to its list.
    ...(typeof c.game_changer === 'boolean' ? { game_changer: c.game_changer } : {}),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
  let body;
  try { body = await readJson(req); } catch { return send(res, 400, { error: 'Bad JSON.' }); }

  const names = [...new Set((Array.isArray(body?.names) ? body.names : [])
    .filter(n => typeof n === 'string' && n.trim())
    .map(n => frontFace(n)))].slice(0, MAX_NAMES);
  if (!names.length) return send(res, 400, { error: 'No card names given.' });

  const cards = [];
  let notFound = [];
  try {
    for (let i = 0; i < names.length; i += 75) {
      if (i) await sleep(110); // Scryfall asks for ~10 requests per second at most
      const chunk = names.slice(i, i + 75);
      const r = await getJson('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: chunk.map(name => ({ name })) }),
      });
      if (!r.ok || !r.body) return send(res, 502, { error: 'Scryfall did not respond properly. Try again in a minute.' });
      for (const c of r.body.data || []) cards.push(slim(c));
      for (const nf of r.body.not_found || []) if (nf?.name) notFound.push(nf.name);
    }

    // Second chance for misspellings / odd names: fuzzy lookup (max 15).
    const stillMissing = [];
    for (const name of notFound.slice(0, 15)) {
      await sleep(110);
      const r = await getJson(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`);
      if (r.ok && r.body?.object === 'card') cards.push({ ...slim(r.body), requested: name });
      else stillMissing.push(name);
    }
    notFound = [...stillMissing, ...notFound.slice(15)];
  } catch {
    return send(res, 502, { error: 'Could not reach Scryfall. Try again in a minute.' });
  }

  send(res, 200, { cards, not_found: notFound });
}

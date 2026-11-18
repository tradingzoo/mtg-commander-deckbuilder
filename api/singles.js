// GET /api/singles?batch=0  (or ?name=Any Card, see oneCard below)
// Singles deals, a few cards at a time so each request stays short: the page asks for batch 0, 1, 2 ...
// until `batches`. Each batch is cached for 6 hours, so after the first visit the page fills in fast.
import { send, query, getJson } from './_lib.js';
import { topCards, singlesBatch, BATCH } from './_singles.js';
import { fxRates } from './find.js';

const CACHE_SECONDS = 60 * 60 * 6;

// GET /api/singles?name=Rhystic Study: any one card, every in-stock copy, above or below the US price.
async function oneCard(res, raw) {
  let card;
  try {
    const r = await getJson(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(raw)}`);
    if (r.status === 404) return send(res, 404, { error: `No card called "${raw}". Check the spelling.` });
    if (!r.ok || r.body?.object !== 'card') return send(res, 502, { error: 'Scryfall did not respond properly. Try again in a minute.' });
    card = r.body;
  } catch {
    return send(res, 502, { error: 'Could not reach Scryfall. Try again in a minute.' });
  }
  const fx = await fxRates();
  const [result] = await singlesBatch([card.name], fx);
  send(res, 200, {
    card: card.name, offers: result.offers, failed: result.failed,
    fx: { usdToThb: fx.usdToThb, source: 'open.er-api.com (ExchangeRate-API, daily)' },
    checked: new Date().toISOString(),
  }, 60 * 30);
}

export default async function handler(req, res) {
  const name = (query(req).get('name') || '').trim().slice(0, 120);
  if (name) return name.length < 2 ? send(res, 400, { error: 'Type a card name.' }) : oneCard(res, name);
  const batch = Math.max(0, Math.floor(Number(query(req).get('batch')) || 0));
  let cards;
  try { cards = await topCards(); } catch { return send(res, 502, { error: 'Could not load the card list from EDHREC.' }); }
  const batches = Math.ceil(cards.length / BATCH);
  if (batch >= batches) return send(res, 404, { error: 'No such batch.' });
  const names = cards.slice(batch * BATCH, (batch + 1) * BATCH);
  const fx = await fxRates();
  const results = await singlesBatch(names, fx);
  send(res, 200, {
    batch, batches, total: cards.length, cards: names,
    offers: results.flatMap(r => r.offers),
    failed: results.filter(r => r.failed.length).map(r => ({ name: r.name, stores: r.failed })),
    fx: { usdToThb: fx.usdToThb, source: 'open.er-api.com (ExchangeRate-API, daily)' },
    reference: 'TCGplayer market price of the same printing and finish, from Scryfall (daily)',
    checked: new Date().toISOString(),
  }, CACHE_SECONDS);
}

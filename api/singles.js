// GET /api/singles?batch=0
// Singles deals, a few cards at a time so each request stays short: the page asks for batch 0, 1, 2 ...
// until `batches`. Each batch is cached for 6 hours, so after the first visit the page fills in fast.
import { send, query } from './_lib.js';
import { topCards, singlesBatch, BATCH } from './_singles.js';
import { fxRates } from './find.js';

const CACHE_SECONDS = 60 * 60 * 6;

export default async function handler(req, res) {
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

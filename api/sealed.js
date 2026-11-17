// GET /api/sealed
// Every Thai store's in-stock sealed Magic (boxes, packs, bundles, precons), in baht, each with a
// reference price: US MSRP where we have it, otherwise TCGplayer market, converted to baht.
// The finder's Sealed and Deals pages both read this and filter in the browser.
import { send } from './_lib.js';
import { sealedCatalog } from './_sealed.js';
import { fxRates } from './find.js';

const CACHE_SECONDS = 60 * 60 * 3; // a full crawl is ~40 store pages, so three hours between refreshes

export default async function handler(req, res) {
  const fx = await fxRates();
  const { offers, stores } = await sealedCatalog(fx);
  send(res, 200, {
    offers: offers.sort((a, b) => a.title.localeCompare(b.title) || a.price - b.price),
    stores,
    fx: { usdToThb: fx.usdToThb, source: 'open.er-api.com (ExchangeRate-API, daily)' },
    reference: 'US MSRP where listed, otherwise TCGplayer market price (via tcgcsv.com, daily)',
    checked: new Date().toISOString(),
  }, CACHE_SECONDS);
}

// GET /api/find?name=Gimli of the Glittering Caves
// Where to buy one card: Bangkok stores first (baht, stock), then online reference prices from Scryfall.
import { send, query, getJson } from './_lib.js';
import { STORES, checkStore } from './_stores.js';
import { matchPrint } from './_singles.js';

const CACHE_SECONDS = 60 * 30; // store stock moves; half an hour keeps us polite without going stale

export function onlinePrices(prints) {
  const usable = (prints || []).filter(c => c.prices && (c.prices.usd || c.prices.usd_foil || c.prices.eur));
  const num = (v) => (v == null ? null : Number(v));
  const cheapUsd = usable.map(c => ({ c, p: num(c.prices.usd) ?? num(c.prices.usd_foil) })).filter(x => x.p != null).sort((a, b) => a.p - b.p)[0];
  const cheapEur = usable.map(c => ({ c, p: num(c.prices.eur) ?? num(c.prices.eur_foil) })).filter(x => x.p != null).sort((a, b) => a.p - b.p)[0];
  const pick = cheapUsd?.c || cheapEur?.c || (prints || [])[0];
  return {
    usd: cheapUsd ? { price: cheapUsd.p, set: cheapUsd.c.set_name, url: cheapUsd.c.purchase_uris?.tcgplayer || null } : null,
    eur: cheapEur ? { price: cheapEur.p, set: cheapEur.c.set_name, url: cheapEur.c.purchase_uris?.cardmarket || null } : null,
    cardhoarder: pick?.purchase_uris?.cardhoarder || null,
    printings: (prints || []).length,
  };
}

// Free, keyless daily rates. Returns { usdToThb, eurToUsd } or nulls when the service is down.
export async function fxRates() {
  try {
    const r = await getJson('https://open.er-api.com/v6/latest/USD');
    const thb = Number(r.body?.rates?.THB), eur = Number(r.body?.rates?.EUR);
    return { usdToThb: thb > 10 && thb < 100 ? thb : null, eurToUsd: eur > 0.3 && eur < 3 ? 1 / eur : null };
  } catch { return { usdToThb: null, eurToUsd: null }; }
}

export default async function handler(req, res) {
  const raw = (query(req).get('name') || '').trim().slice(0, 120);
  if (raw.length < 2) return send(res, 400, { error: 'Type a card name.' });

  // 1. Pin down the real card name, so store searches and matching use the exact spelling.
  let card;
  try {
    const r = await getJson(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(raw)}`);
    if (r.status === 404) return send(res, 404, { error: `No card called "${raw}". Check the spelling.` });
    if (!r.ok || r.body?.object !== 'card') return send(res, 502, { error: 'Scryfall did not respond properly. Try again in a minute.' });
    card = r.body;
  } catch {
    return send(res, 502, { error: 'Could not reach Scryfall. Try again in a minute.' });
  }
  const name = card.name;
  const front = name.split(' // ')[0];

  // 2. Every store at once, plus all printings (for the cheapest online price) and the baht rate.
  const printsP = getJson(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${name}"`)}&unique=prints&order=usd&dir=asc`)
    .then(r => (r.ok ? r.body?.data || [] : [card])).catch(() => [card]);
  const [stores, prints, fx] = await Promise.all([
    Promise.all(STORES.map(s => checkStore(s, front))),
    printsP,
    fxRates(),
  ]);

  // Each copy against the US price of its own printing and finish, when we can tell which printing it is.
  for (const s of stores) {
    for (const l of s.listings) {
      const m = matchPrint(l, prints);
      if (!m) continue;
      const thb = fx.usdToThb ? Math.round(m.usd * fx.usdToThb) : null;
      l.ref = { usd: m.usd, thb, name: `${m.print.set_name} #${m.print.collector_number}${m.foil !== 'nonfoil' ? ` (${m.foil})` : ''}`,
        url: m.print.purchase_uris?.tcgplayer || m.print.scryfall_uri };
      l.vsUsPct = thb && l.price ? Math.round(((thb - l.price) / thb) * 1000) / 10 : null;
    }
  }

  const img = card.image_uris || card.card_faces?.[0]?.image_uris || {};
  send(res, 200, {
    card: { name, type_line: card.type_line || card.card_faces?.[0]?.type_line || '', image: img.normal || img.small || null, scryfall_uri: card.scryfall_uri },
    stores: stores.sort((a, b) => (!!b.inStock - !!a.inStock) || ((a.cheapest ?? 1e9) - (b.cheapest ?? 1e9))),
    online: { ...onlinePrices(prints), ...fx },
    links: {
      hareruya: `https://www.hareruyamtg.com/en/products/search?product=${encodeURIComponent(front)}`,
      cardkingdom: `https://www.cardkingdom.com/catalog/search?search=header&filter%5Bname%5D=${encodeURIComponent(front)}`,
    },
    checked: new Date().toISOString(),
  }, CACHE_SECONDS);
}

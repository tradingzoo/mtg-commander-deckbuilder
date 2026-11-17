// Replaces global fetch with canned EDHREC/Scryfall answers (for tests and `npm run mock`).
import { CARDS, EDHREC, COMBOS } from './fixtures.js';
import { cardKey } from '../public/js/combos.js';
import { TCG_GROUPS, TCG, POWER9_SEALED, FIRSTPICK_SEALED, FIRSTPICK_DECKS, BIGBEAR_SEALED, NOX_SEALED, LEVELMAX_SEALED, YANNICK_SEALED, SABAI_SEALED } from './sealed-fixtures.js';
import { GIMLI, GIMLI_PRINTS, FIRSTPICK_SUGGEST, FIRSTPICK_PRODUCT, YANNICK_HTML, YANNICK_SOLD_OUT_HTML, SABAI_HTML, FX, POWER9_SUGGEST, POWER9_PRODUCT, LEVELMAX_HTML, NOX_SINGLES, NOX_FOILS } from './store-fixtures.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function scryfallCard(c) {
  const { expect, ...card } = c;
  if (card.card_faces) { const { oracle_text, ...rest } = card; return { object: 'card', ...rest }; }
  return { object: 'card', ...card };
}

function findCard(name) {
  const n = name.toLowerCase();
  return CARDS.find(c => c.name.toLowerCase() === n || c.name.split(' // ')[0].toLowerCase() === n);
}

export const calls = [];
// Flip these in tests to see how the card finder copes with a store that is down or sold out.
export const mockStores = { sabaiDown: false, yannickSoldOut: false, tcgDown: false };
const html = (body) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } });

export function installMockFetch() {
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ url: u.href, method: init.method || 'GET', headers: init.headers || {} });

    if (u.hostname === 'json.edhrec.com') {
      const key = u.pathname.replace(/^\/pages\//, '').replace(/\.json$/, '');
      if (key === 'top/year') {
        return json(200, { container: { json_dict: { cardlists: [{ header: 'Past 2 Years',
          cardviews: ['Gimli of the Glittering Caves', 'Sol Ring', 'Command Tower', 'Arcane Signet', 'Swords to Plowshares', 'Counterspell'].map(name => ({ name })) }] } } });
      }
      return EDHREC[key] ? json(200, EDHREC[key]) : json(404, { error: 'Not found' });
    }
    // Sealed product lists (card finder's Sealed and Deals pages).
    if (u.hostname === 'tcgcsv.com') {
      if (mockStores.tcgDown) return new Response('down', { status: 503 });
      if (u.pathname === '/tcgplayer/1/groups') return json(200, TCG_GROUPS);
      const g = u.pathname.match(/^\/tcgplayer\/1\/(\d+)\/(products|prices)$/);
      if (g && TCG[g[1]]) return json(200, TCG[g[1]][g[2]]);
      return json(404, {});
    }
    const coll = u.pathname.match(/^\/collections\/([a-z0-9-]+)\/products\.json$/);
    if (coll) {
      const page = Number(u.searchParams.get('page') || 1);
      const empty = { products: [] };
      if (page > 1) return json(200, empty);
      if (u.hostname === 'power9cardstore.com' && coll[1] === 'mtg-sealed') return json(200, POWER9_SEALED);
      if (u.hostname === 'bigbearcards.com' && coll[1] === 'mtg-sealed') return json(200, BIGBEAR_SEALED);
      if (u.hostname === '1stpickhs-onlineshop.com' && coll[1] === 'mtg-sealed-product') return json(200, FIRSTPICK_SEALED);
      if (u.hostname === '1stpickhs-onlineshop.com' && coll[1] === 'mtg-commander-deck') return json(200, FIRSTPICK_DECKS);
      return json(200, empty);
    }
    if (u.hostname === 'noxtcg.com' && u.pathname === '/api/products') return json(200, NOX_SEALED);
    if (u.hostname === 'www.tomorrowlion.com' && u.pathname === '/sealed') return html(LEVELMAX_SEALED);
    if (u.hostname === 'yannickthegathering.com' && u.pathname === '/collections/s/mtg-sealed') return html(YANNICK_SEALED);
    if (u.hostname === 'sabaicards.com' && u.pathname === '/products/sealed') {
      return mockStores.sabaiDown ? new Response('Forbidden', { status: 403 }) : html(SABAI_SEALED);
    }
    if (u.hostname === '1stpickhs-onlineshop.com') {
      if (u.pathname === '/search/suggest.json') return json(200, FIRSTPICK_SUGGEST);
      if (u.pathname === `/products/${FIRSTPICK_PRODUCT.handle}.js`) return json(200, FIRSTPICK_PRODUCT);
      return json(404, {});
    }
    if (u.hostname === 'power9cardstore.com') {
      if (u.pathname === '/search/suggest.json') return json(200, POWER9_SUGGEST);
      if (u.pathname === `/products/${POWER9_PRODUCT.handle}.js`) return json(200, POWER9_PRODUCT);
      return json(404, {});
    }
    if (u.hostname === 'bigbearcards.com' && u.pathname === '/search/suggest.json') return json(200, { resources: { results: { products: [] } } });
    if (u.hostname === 'www.tomorrowlion.com' && u.pathname === '/cards') return html(LEVELMAX_HTML);
    if (u.hostname === 'noxtcg.com' && u.pathname === '/api/games/mtg/cards') {
      return json(200, u.searchParams.get('variant') === 'foils' ? NOX_FOILS : NOX_SINGLES);
    }
    if (u.hostname === 'yannickthegathering.com' && u.pathname === '/search') {
      return html(mockStores.yannickSoldOut ? YANNICK_SOLD_OUT_HTML : YANNICK_HTML);
    }
    if (u.hostname === 'sabaicards.com' && u.pathname === '/products/singles') {
      return mockStores.sabaiDown ? new Response('Forbidden', { status: 403 }) : html(SABAI_HTML);
    }
    if (u.hostname === 'open.er-api.com') return json(200, FX);
    if (u.hostname === 'api.scryfall.com') {
      if (u.pathname === '/cards/search' && /gimli of the glittering caves/i.test(u.searchParams.get('q') || '')) {
        return json(200, { object: 'list', data: GIMLI_PRINTS });
      }
      if (u.pathname === '/cards/named' && /^gimli/i.test(u.searchParams.get('fuzzy') || '')) return json(200, GIMLI);
      if (u.pathname === '/cards/collection') {
        const { identifiers } = JSON.parse(init.body);
        if (identifiers.length > 75) return json(422, { object: 'error' });
        const data = [], not_found = [];
        for (const id of identifiers) {
          const c = findCard(id.name);
          c ? data.push(scryfallCard(c)) : not_found.push(id);
        }
        return json(200, { object: 'list', data, not_found });
      }
      if (u.pathname === '/cards/named') {
        const q = (u.searchParams.get('fuzzy') || '').toLowerCase().replace(/[^a-z]/g, '');
        const c = q.length >= 6 && CARDS.find(x => x.name.toLowerCase().replace(/[^a-z]/g, '').startsWith(q.slice(0, 9)));
        return c ? json(200, scryfallCard(c)) : json(404, { object: 'error' });
      }
      if (u.pathname === '/cards/autocomplete') {
        const q = (u.searchParams.get('q') || '').toLowerCase();
        return json(200, { object: 'catalog', data: CARDS.map(c => c.name).filter(n => n.toLowerCase().includes(q)) });
      }
    }
    if (u.hostname === 'backend.commanderspellbook.com') {
      const { commanders = [], main = [] } = JSON.parse(init.body || '{}');
      const deck = new Set([...commanders, ...main].map(x => cardKey(x.card)));
      if (deck.has(cardKey('Spellbook Down'))) return json(500, { detail: 'boom' });
      const miss = (v) => v.uses.filter(x => !deck.has(cardKey(x.card.name))).length;
      if (u.pathname === '/find-my-combos') {
        return json(200, { count: 0, next: null, results: { identity: 'RW',
          included: COMBOS.filter(v => miss(v) === 0), almostIncluded: COMBOS.filter(v => miss(v) === 1) } });
      }
      if (u.pathname === '/estimate-bracket') {
        return json(200, { bracketTag: COMBOS.some(v => miss(v) === 0 && v.bracketTag === 'S') ? 'S' : 'P', combos: [] });
      }
    }
    return json(404, { error: 'mock: unknown url ' + u.href });
  };
}

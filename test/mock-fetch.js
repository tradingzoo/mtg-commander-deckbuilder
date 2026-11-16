// Replaces global fetch with canned EDHREC/Scryfall answers (for tests and `npm run mock`).
import { CARDS, EDHREC } from './fixtures.js';
import { GIMLI, GIMLI_PRINTS, FIRSTPICK_SUGGEST, FIRSTPICK_PRODUCT, YANNICK_HTML, YANNICK_SOLD_OUT_HTML, SABAI_HTML, FX, POWER9_SUGGEST, POWER9_PRODUCT, LEVELMAX_HTML } from './store-fixtures.js';

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
export const mockStores = { sabaiDown: false, yannickSoldOut: false };
const html = (body) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } });

export function installMockFetch() {
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ url: u.href, method: init.method || 'GET', headers: init.headers || {} });

    if (u.hostname === 'json.edhrec.com') {
      const key = u.pathname.replace(/^\/pages\//, '').replace(/\.json$/, '');
      return EDHREC[key] ? json(200, EDHREC[key]) : json(404, { error: 'Not found' });
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
    return json(404, { error: 'mock: unknown url ' + u.href });
  };
}

// Replaces global fetch with canned EDHREC/Scryfall answers (for tests and `npm run mock`).
import { CARDS, EDHREC, COMBOS } from './fixtures.js';
import { cardKey } from '../public/js/combos.js';

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

export function installMockFetch() {
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ url: u.href, method: init.method || 'GET', headers: init.headers || {} });

    if (u.hostname === 'json.edhrec.com') {
      const key = u.pathname.replace(/^\/pages\//, '').replace(/\.json$/, '');
      return EDHREC[key] ? json(200, EDHREC[key]) : json(404, { error: 'Not found' });
    }
    if (u.hostname === 'api.scryfall.com') {
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

// GET /api/autocomplete?q=atra  -> { names: [...] }  (legendary-ish suggestions from Scryfall)
import { send, query, getJson } from './_lib.js';

export default async function handler(req, res) {
  const q = (query(req).get('q') || '').trim().slice(0, 80);
  if (q.length < 2) return send(res, 200, { names: [] });
  try {
    const r = await getJson(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`);
    const names = Array.isArray(r.body?.data) ? r.body.data.slice(0, 20) : [];
    send(res, 200, { names }, 60 * 60 * 24);
  } catch {
    send(res, 200, { names: [] });
  }
}

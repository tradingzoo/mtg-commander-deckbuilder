// Helpers shared by the API routes. Files starting with "_" are not routes on Vercel.

export const USER_AGENT = 'MTGCommanderDeckbuilder/0.1 (personal project)';

export function send(res, status, body, cacheSeconds = 0) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (cacheSeconds > 0 && status === 200) {
    res.setHeader('Cache-Control', `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}`);
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
  res.end(JSON.stringify(body));
}

export function query(req) {
  return new URL(req.url, 'http://localhost').searchParams;
}

// Vercel pre-parses JSON bodies into req.body; the local dev server doesn't.
export async function readJson(req) {
  if (req.body !== undefined && req.body !== null && req.body !== '') {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function getJson(url, init = {}) {
  const r = await fetch(url, {
    ...init,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...(init.headers || {}) },
  });
  let body = null;
  try { body = await r.json(); } catch { body = null; }
  return { status: r.status, ok: r.ok, body };
}

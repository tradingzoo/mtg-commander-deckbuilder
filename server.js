// Local dev server: `npm run dev` then open http://localhost:3000
// Serves /public and runs the /api routes the same way Vercel does. No dependencies.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const pub = join(root, 'public');
const PORT = Number(process.env.PORT) || 3000;

if (process.env.MOCK === '1' || process.argv.includes('--mock')) {
  const { installMockFetch } = await import('./test/mock-fetch.js');
  installMockFetch();
  console.log('Mock mode: EDHREC/Scryfall replaced with test data');
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  try {
    const api = path.match(/^\/api\/([a-z-]+)$/);
    if (api) {
      const mod = await import(`./api/${api[1]}.js`).catch(() => null);
      if (!mod) { res.statusCode = 404; return res.end('{"error":"no such route"}'); }
      return await mod.default(req, res);
    }
    let file = normalize(join(pub, path === '/' ? 'index.html' : path));
    if (!file.startsWith(pub)) { res.statusCode = 403; return res.end(); }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const data = await readFile(file);
    res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch (e) {
    if (!res.headersSent) res.statusCode = e.code === 'ENOENT' ? 404 : 500;
    res.end(e.code === 'ENOENT' ? 'Not found' : 'Server error');
    if (e.code !== 'ENOENT') console.error(e);
  }
}).listen(PORT, () => console.log(`Deckbuilder running at http://localhost:${PORT}`));

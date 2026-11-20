// Offline shell: the app screens load without signal; deckbuilder data still needs a connection.
const CACHE = 'deckbuilder-v7';
const SHELL = ['/', '/index.html', '/style.css', '/js/app.js', '/js/classify.js', '/js/brackets.js', '/js/combos.js', '/find.html', '/js/find.js', '/find-sealed.html', '/find-deals.html', '/js/find-sealed.js', '/find.webmanifest', '/manifest.webmanifest', '/icons/icon-192.png',
  '/tracker.html', '/tracker.css', '/js/tracker.js', '/js/tracker-core.js', '/tracker.webmanifest', '/icons/tracker-192.png', '/icons/tracker-180.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // The game tracker is used at the table, often with weak signal: answer from the cache straight away
  // and refresh the cache in the background, so the next launch gets any update.
  if (/^\/(tracker|js\/tracker|icons\/tracker)/.test(url.pathname)) {
    const fresh = fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    });
    e.respondWith(caches.match(e.request, { ignoreSearch: true })
      .then(r => r || fresh.catch(() => caches.match('/tracker.html'))));
    e.waitUntil(fresh.then(() => {}, () => {}));
    return;
  }
  // Network first so updates show up straight away; cache as fallback offline.
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      if (r.ok) caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match(url.pathname.startsWith('/tracker') ? '/tracker.html' : '/index.html')))
  );
});

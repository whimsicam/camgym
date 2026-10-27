/* CAM Gym — service worker.
   File statici: risposta dalla cache e aggiornamento in background.
   programma.json: sempre dalla rete, la cache solo se offline. */

const CACHE = 'camgym-v2';
const STATICI = [
  './', 'index.html', 'app.js', 'style.css', 'manifest.webmanifest',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(CACHE).then(c => c.addAll(STATICI)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function conTimeout(p, ms) {
  return Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
}

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin && url.pathname.endsWith('/programma.json')) {
    const chiave = new URL('programma.json', self.registration.scope).href;
    ev.respondWith(
      conTimeout(fetch(req, { cache: 'no-store' }), 6000)
        .then(r => {
          if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(chiave, copia)); }
          return r;
        })
        .catch(() => caches.match(chiave))
    );
    return;
  }

  if (url.origin === location.origin) {
    ev.respondWith(
      caches.open(CACHE).then(async c => {
        const inCache = await c.match(req, { ignoreSearch: true });
        const rete = fetch(req)
          .then(r => { if (r.ok) c.put(req, r.clone()); return r; })
          .catch(() => inCache);
        return inCache || rete;
      })
    );
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    ev.respondWith(
      caches.open(CACHE).then(async c => {
        const inCache = await c.match(req);
        if (inCache) return inCache;
        const r = await fetch(req);
        if (r.ok || r.type === 'opaque') c.put(req, r.clone());
        return r;
      })
    );
  }
  // tutto il resto (API GitHub) passa direttamente in rete
});

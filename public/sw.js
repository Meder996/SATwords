// SAT VocaMaster service worker: offline app shell + icon/vendor precache.
// Everything the app is served from this origin; cross-origin requests (Firebase,
// Puter, fonts) are never intercepted.
const CACHE = 'vocamaster-v2';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/browserconfig.xml',
  '/icon.svg',
  '/icon-maskable.svg',
  '/favicon.ico',
  '/favicon-16.png',
  '/favicon-32.png',
  '/favicon-48.png',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/vendor/puter.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      // Individual failures must not abort the whole install.
      Promise.all(SHELL.map(url => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Hashed build assets, images and the vendored SDK never change under the same URL: cache first.
  const immutable = url.pathname.startsWith('/assets/') || url.pathname.startsWith('/vendor/')
    || url.pathname.startsWith('/icons/') || /\.(?:png|svg|ico|webmanifest|webp|woff2?)$/.test(url.pathname);
  if (immutable) {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(response => {
        if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(req, copy)); }
        return response;
      }).catch(() => cached || Response.error()))
    );
    return;
  }

  // Documents and code: network first so deploys land immediately, cache as the offline fallback.
  event.respondWith(
    fetch(req).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(req, copy)); }
      return response;
    }).catch(() => caches.match(req).then(cached => cached || (req.mode === 'navigate' ? caches.match('/') : Response.error())))
  );
});

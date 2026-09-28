const CACHE = 'vocamaster-v1';
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/', '/icon.svg', '/manifest.webmanifest']))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))); self.clients.claim(); });
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin) || new URL(req.url).pathname.startsWith('/api/')) return;
  event.respondWith(fetch(req).then(response => { if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(req, copy)); } return response; }).catch(() => caches.match(req).then(cached => cached || (req.mode === 'navigate' ? caches.match('/') : Response.error()))));
});

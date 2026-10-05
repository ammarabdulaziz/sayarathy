// Installable, network-only PWA. No CacheStorage, precaching, offline fallback,
// background sync, or interception of Google authorization / Drive requests.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.method === 'GET' && new URL(event.request.url).origin === self.location.origin) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
  }
});

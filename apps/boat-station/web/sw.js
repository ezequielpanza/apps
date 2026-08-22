// Legacy root service worker retirement.
// Boat Station now runs from /clean/ and must not serve the old cached UI.
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      try { client.navigate('/clean/?v=20260822-1516'); } catch (_) {}
    }
  })());
});

self.addEventListener('fetch', event => {
  // Do not intercept anything while this legacy worker is being retired.
});

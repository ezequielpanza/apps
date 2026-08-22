// Boat Station service worker retirement.
// The shared Web/Core PWA now runs directly from the web root.
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
      try { client.navigate('/'); } catch (_) {}
    }
  })());
});

self.addEventListener('fetch', event => {
  // Do not intercept anything while this retiring worker unregisters itself.
});

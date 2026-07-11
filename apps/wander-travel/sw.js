const CACHE_NAME = 'wander-travel-v0.87.2';
const APP_SHELL = [
  './index.html',
  './wander-ui.css',
  './wander-simulator-interactions.css',
  './wander-context-rail.css',
  './wander-icons.svg',
  './wander-app-icon.svg',
  './manifest.webmanifest',
  './version.json',
  './reset.html',
  './runtime-context-store.js',
  './runtime-context-location.js',
  './runtime-context-init.js',
  './runtime-version.js',
  './app.js',
  './runtime-source-policy.js',
  './runtime-poi-normalized.js',
  './runtime-poi-consolidated.js',
  './runtime-poi-store.js',
  './runtime-poi-engine.js',
  './runtime-external-source-tripadvisor.js',
  './runtime-external-source-google-maps.js',
  './runtime-poi-connector-wikidata.js',
  './runtime-poi-connector-openstreetmap.js',
  './runtime-map-core.js',
  './runtime-map-position.js',
  './runtime-map-controls.js',
  './runtime-map.js',
  './runtime-provider-location.js',
  './runtime-provider-place.js',
  './runtime-provider-nearby.js',
  './runtime-provider-simulator.js',
  './runtime-engine-state.js',
  './runtime-engine-inference.js',
  './runtime-engine-transition.js',
  './runtime-engine-journey.js',
  './runtime-engine-memory.js',
  './runtime-engine-place.js',
  './runtime-engine-relevance.js',
  './runtime-engine-decision.js',
  './runtime-engine.js',
  './runtime-ui.js',
  './runtime-field-guide.js',
  './runtime-engine-presenter.js',
  './runtime-field-test.js',
  './runtime-panel.js',
  './runtime-context-rail.js',
  './runtime-context-panel.js',
  './runtime-topbar.js',
  './runtime-tracks.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('wander-travel') && key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirst(request, fallback = null) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || (fallback ? await caches.match(fallback) : Response.error());
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/reset.html') || url.pathname.endsWith('/version.json') || url.pathname.endsWith('/sw.js')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, './index.html'));
    return;
  }

  const runtimeAsset = url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.webmanifest');
  if (runtimeAsset) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

const CACHE_NAME = 'wander-travel-v0.82.1';
const APP_SHELL = [
  './index.html',
  './wander-ui.css',
  './wander-simulator-interactions.css',
  './wander-icons.svg',
  './wander-app-icon.svg',
  './manifest.webmanifest',
  './runtime-context-store.js',
  './runtime-context-location.js',
  './runtime-context-init.js',
  './runtime-version.js',
  './app.js',
  './runtime-source-policy.js',
  './runtime-poi-candidate.js',
  './runtime-poi-evidence.js',
  './runtime-poi-store.js',
  './runtime-poi-connectors.js',
  './runtime-external-source-tripadvisor.js',
  './runtime-external-source-google-maps.js',
  './runtime-poi-connector-wikidata.js',
  './runtime-map-core.js',
  './runtime-map-position.js',
  './runtime-map-controls.js',
  './runtime-map.js',
  './runtime-provider-location.js',
  './runtime-provider-place.js',
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
  './runtime-panel.js',
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
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
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

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, './index.html'));
    return;
  }

  const pathname = requestUrl.pathname;
  const runtimeAsset =
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.webmanifest');

  if (runtimeAsset) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});

const CACHE_NAME = 'wander-travel-v0.90.8';
const APP_SHELL = [
  './index.html',
  './wander-ui.css',
  './wander-simulator-interactions.css',
  './wander-context-dashboard.css',
  './wander-dashboard-order.css',
  './wander-rule-checker.css',
  './wander-message-top.css',
  './wander-record-button.css',
  './wander-simulator-dashboard-offset.css',
  './wander-message-actions.css',
  './wander-personal-poi-sheet.css',
  './wander-track-delete.css',
  './wander-dashboard-visibility.css',
  './wander-message-timeout-settings.css',
  './wander-map-selected-point.css',
  './wander-icons.svg',
  './wander-app-icon.svg',
  './manifest.webmanifest',
  './runtime-context-store.js',
  './runtime-context-location.js',
  './runtime-context-init.js',
  './runtime-version.js',
  './app.js',
  './runtime-dashboard-viewport.js',
  './runtime-dashboard-order.js',
  './runtime-dashboard-visibility-guard.js',
  './runtime-situation-engine.js',
  './runtime-movement-method-refinement.js',
  './runtime-movement-method-loader.js',
  './runtime-personal-map-tools.js',
  './runtime-personal-poi-tap-fix.js',
  './runtime-personal-poi-sheet.js',
  './runtime-map-selected-point.js',
  './runtime-message-timeout-settings.js',
  './runtime-simulator-dashboard-offset.js',
  './runtime-rule-checker.js',
  './runtime-current-poi-motion-guard.js',
  './runtime-coordinate-format-ui.js',
  './runtime-debug-overture.js',
  './runtime-source-policy.js',
  './runtime-source-policy-google-places.js',
  './runtime-poi-normalized.js',
  './runtime-poi-consolidated.js',
  './runtime-poi-store.js',
  './runtime-poi-engine.js',
  './runtime-external-source-tripadvisor.js',
  './runtime-external-source-google-maps.js',
  './runtime-poi-connector-wikidata.js',
  './runtime-poi-connector-openstreetmap.js',
  './runtime-poi-connector-google-places.js',
  './runtime-map-core.js',
  './runtime-map-position.js',
  './runtime-map-controls.js',
  './runtime-map.js',
  './runtime-provider-location.js',
  './runtime-provider-place.js',
  './runtime-provider-nearby.js',
  './runtime-provider-container.js',
  './runtime-provider-container-google.js',
  './runtime-provider-current-poi.js',
  './runtime-provider-current-container-bridge.js',
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
  './runtime-context-dashboard.js',
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

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('./index.html')));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
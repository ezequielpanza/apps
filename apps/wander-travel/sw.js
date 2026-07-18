importScripts('./runtime-version.js');

const SHELL_REVISION = '20260718-10';
const CACHE_NAME = 'wander-travel-' + self.WanderVersion + '-' + SHELL_REVISION;
const APP_SHELL = [
  './index.html',
  './manifest.webmanifest',
  './wander-app-icon.svg',
  './wander-icons.svg',
  './wander-ui.css',
  './wander-simulator-interactions.css',
  './wander-context-dashboard.css',
  './wander-dashboard-order.css',
  './wander-rule-checker.css',
  './wander-message-top.css',
  './wander-personal-poi-sheet.css',
  './wander-personal-poi-marker.css',
  './wander-track-delete.css',
  './wander-message-timeout-settings.css',
  './wander-map-selected-point.css',
  './wander-points-screen.css',
  './wander-sessions.css',
  './wander-interaction.css',
  './runtime-context-store.js',
  './runtime-context-location.js',
  './runtime-context-init.js',
  './runtime-memory-repository.js',
  './runtime-version.js',
  './runtime-platform.js',
  './runtime-native-app-version.js',
  './runtime-map-core.js',
  './runtime-map-position.js',
  './runtime-map-controls.js',
  './runtime-map.js',
  './runtime-source-policy.js',
  './runtime-source-policy-google-places.js',
  './runtime-poi-normalized.js',
  './runtime-poi-consolidated.js',
  './runtime-poi-store.js',
  './runtime-poi-engine.js',
  './runtime-poi-connector-wikidata.js',
  './runtime-poi-connector-openstreetmap.js',
  './runtime-poi-connector-google-places.js',
  './runtime-native-location-source.js',
  './runtime-native-motion.js',
  './runtime-location-source.js',
  './runtime-provider-location.js',
  './runtime-provider-place.js',
  './runtime-provider-nearby.js',
  './runtime-provider-container.js',
  './runtime-provider-container-google.js',
  './runtime-provider-current-poi.js',
  './runtime-provider-current-container-bridge.js',
  './runtime-engine-state.js',
  './runtime-engine-inference.js',
  './runtime-engine-transition.js',
  './runtime-engine-journey.js',
  './runtime-engine-memory.js',
  './runtime-engine-place.js',
  './runtime-engine-discovery.js',
  './runtime-engine-relevance.js',
  './runtime-engine-decision.js',
  './runtime-companion-policy.js',
  './runtime-engine.js',
  './runtime-pedestrian-motion.js',
  './runtime-sensor-motion-bridge.js',
  './runtime-session-engine.js',
  './runtime-situation-engine.js',
  './runtime-rule-checker.js',
  './runtime-ui.js',
  './runtime-interaction-core.js',
  './runtime-context-dashboard.js',
  './runtime-place-hierarchy-dashboard.js',
  './runtime-dashboard-order.js',
  './runtime-panel.js',
  './runtime-context-panel.js',
  './runtime-place-hierarchy-panel.js',
  './runtime-tracks.js',
  './runtime-provider-simulator.js',
  './runtime-current-poi-motion-guard.js',
  './runtime-coordinate-format-ui.js',
  './runtime-personal-poi-core.js',
  './runtime-place-hierarchy.js',
  './runtime-personal-poi-situation.js',
  './runtime-personal-map-tools.js',
  './runtime-personal-poi-sheet.js',
  './runtime-map-selected-point.js',
  './runtime-points-screen.js',
  './runtime-message-timeout-settings.js',
  './runtime-companion.js',
  './runtime-proactive-companion.js',
  './runtime-interaction-panel.js',
  './runtime-navigation.js',
  './app.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const preferNetwork = event.request.mode === 'navigate' || /\.(?:js|css)$/.test(url.pathname);
  if (preferNetwork) {
    event.respondWith(
      fetch(new Request(event.request, { cache: 'no-store' }))
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => cached || fetch(event.request))
  );
});

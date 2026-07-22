importScripts('./runtime-version.js');

const SHELL_REVISION = '20260722-02';
const CACHE_NAME = 'wander-travel-' + self.WanderVersion + '-' + SHELL_REVISION;
const TILE_CACHE_NAME = 'wander-map-tiles-v1';
const TILE_META_DB = 'wander-map-cache-meta-v1';
const TILE_META_STORE = 'tiles';
const TILE_CONFIG_STORE = 'config';
const DEFAULT_TILE_RETENTION_DAYS = 30;
const MAX_TILE_ENTRIES = 2500;
const TOUCH_INTERVAL_MS = 6 * 60 * 60 * 1000;
let tileWritesSinceCleanup = 0;

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
  './wander-travel-log.css',
  './wander-direction-indicator.css',
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
  './runtime-room-companion.js',
  './runtime-interaction-panel.js',
  './runtime-notification-router.js',
  './runtime-navigation.js',
  './runtime-travel-log.js',
  './runtime-travel-log-screen.js',
  './runtime-morning-briefing.js',
  './runtime-direction-indicator.js',
  './runtime-direction-indicator-settings.js',
  './runtime-map-cache-settings.js',
  './app.js',
];

function openTileDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(TILE_META_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TILE_META_STORE)) db.createObjectStore(TILE_META_STORE, { keyPath: 'url' });
      if (!db.objectStoreNames.contains(TILE_CONFIG_STORE)) db.createObjectStore(TILE_CONFIG_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open map cache metadata'));
  });
}

async function tileDbRequest(storeName, mode, operation) {
  const db = await openTileDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let request;
      try { request = operation(store); }
      catch (error) { reject(error); return; }
      if (request) {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Map cache metadata request failed'));
      } else {
        transaction.oncomplete = () => resolve(null);
      }
      transaction.onerror = () => reject(transaction.error || new Error('Map cache metadata transaction failed'));
    });
  } finally {
    db.close();
  }
}

function normalizeRetentionDays(value) {
  const days = Number(value);
  return [0, 7, 30, 90, 180, 365].includes(days) ? days : DEFAULT_TILE_RETENTION_DAYS;
}

async function getTileRetentionDays() {
  try {
    const record = await tileDbRequest(TILE_CONFIG_STORE, 'readonly', (store) => store.get('retentionDays'));
    return normalizeRetentionDays(record?.value);
  } catch {
    return DEFAULT_TILE_RETENTION_DAYS;
  }
}

async function setTileRetentionDays(value) {
  const retentionDays = normalizeRetentionDays(value);
  await tileDbRequest(TILE_CONFIG_STORE, 'readwrite', (store) => store.put({ key: 'retentionDays', value: retentionDays }));
  if (retentionDays === 0) await clearMapTileCache();
  else await cleanupMapTileCache(retentionDays, true);
  return retentionDays;
}

async function getTileMeta(url) {
  try { return await tileDbRequest(TILE_META_STORE, 'readonly', (store) => store.get(url)); }
  catch { return null; }
}

async function putTileMeta(record) {
  try { await tileDbRequest(TILE_META_STORE, 'readwrite', (store) => store.put(record)); }
  catch {}
}

async function deleteTileMeta(url) {
  try { await tileDbRequest(TILE_META_STORE, 'readwrite', (store) => store.delete(url)); }
  catch {}
}

async function listTileMeta() {
  try { return await tileDbRequest(TILE_META_STORE, 'readonly', (store) => store.getAll()) || []; }
  catch { return []; }
}

async function clearTileMeta() {
  try { await tileDbRequest(TILE_META_STORE, 'readwrite', (store) => store.clear()); }
  catch {}
}

function isMapTileRequest(url) {
  if (url.hostname === 'tile.openstreetmap.org') return /^\/\d+\/\d+\/\d+\.png$/.test(url.pathname);
  if (url.hostname === 'server.arcgisonline.com') {
    return /^\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile\/\d+\/\d+\/\d+$/.test(url.pathname);
  }
  return false;
}

async function mapCacheStatus() {
  const cache = await caches.open(TILE_CACHE_NAME);
  const keys = await cache.keys();
  return {
    ok: true,
    retentionDays: await getTileRetentionDays(),
    count: keys.length,
    maxEntries: MAX_TILE_ENTRIES,
  };
}

async function clearMapTileCache() {
  await caches.delete(TILE_CACHE_NAME);
  await clearTileMeta();
  tileWritesSinceCleanup = 0;
  return mapCacheStatus();
}

async function cleanupMapTileCache(retentionDays = null, force = false) {
  const days = retentionDays === null ? await getTileRetentionDays() : normalizeRetentionDays(retentionDays);
  if (days === 0) return clearMapTileCache();
  if (!force && tileWritesSinceCleanup < 25) return mapCacheStatus();
  tileWritesSinceCleanup = 0;

  const cache = await caches.open(TILE_CACHE_NAME);
  const records = await listTileMeta();
  const now = Date.now();
  const ttlMs = days * 24 * 60 * 60 * 1000;
  const expired = records.filter((record) => now - Number(record.cachedAt || 0) > ttlMs);
  for (const record of expired) {
    await cache.delete(record.url);
    await deleteTileMeta(record.url);
  }

  const remaining = records
    .filter((record) => !expired.some((expiredRecord) => expiredRecord.url === record.url))
    .sort((a, b) => Number(a.lastAccessAt || a.cachedAt || 0) - Number(b.lastAccessAt || b.cachedAt || 0));
  const excess = Math.max(0, remaining.length - MAX_TILE_ENTRIES);
  for (const record of remaining.slice(0, excess)) {
    await cache.delete(record.url);
    await deleteTileMeta(record.url);
  }
  return mapCacheStatus();
}

async function cacheMapTile(request, response) {
  if (!(response?.ok || response?.type === 'opaque')) return response;
  const cache = await caches.open(TILE_CACHE_NAME);
  await cache.put(request, response.clone());
  const now = Date.now();
  await putTileMeta({ url: request.url, cachedAt: now, lastAccessAt: now });
  tileWritesSinceCleanup += 1;
  cleanupMapTileCache().catch(() => {});
  return response;
}

async function handleMapTileRequest(request) {
  const retentionDays = await getTileRetentionDays();
  if (retentionDays === 0) return fetch(request);

  const cache = await caches.open(TILE_CACHE_NAME);
  const cached = await cache.match(request);
  const meta = cached ? await getTileMeta(request.url) : null;
  const now = Date.now();
  const ttlMs = retentionDays * 24 * 60 * 60 * 1000;
  const fresh = cached && meta && now - Number(meta.cachedAt || 0) <= ttlMs;

  if (fresh) {
    if (now - Number(meta.lastAccessAt || 0) >= TOUCH_INTERVAL_MS) {
      putTileMeta({ ...meta, lastAccessAt: now }).catch(() => {});
    }
    return cached;
  }

  try {
    const response = await fetch(request);
    return cacheMapTile(request, response);
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}

function respondToMessage(event, payload) {
  const port = event.ports?.[0];
  if (port) port.postMessage(payload);
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME && key !== TILE_CACHE_NAME).map((key) => caches.delete(key))
    )),
    cleanupMapTileCache(null, true).catch(() => null),
  ]));
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  const type = event.data?.type;
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (type === 'WANDER_MAP_CACHE_STATUS') {
    event.waitUntil(mapCacheStatus().then((status) => respondToMessage(event, status)).catch((error) => respondToMessage(event, { ok: false, error: error.message })));
    return;
  }
  if (type === 'WANDER_MAP_CACHE_CONFIG') {
    event.waitUntil(setTileRetentionDays(event.data?.retentionDays)
      .then(() => mapCacheStatus())
      .then((status) => respondToMessage(event, status))
      .catch((error) => respondToMessage(event, { ok: false, error: error.message })));
    return;
  }
  if (type === 'WANDER_MAP_CACHE_CLEAR') {
    event.waitUntil(clearMapTileCache().then((status) => respondToMessage(event, status)).catch((error) => respondToMessage(event, { ok: false, error: error.message })));
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (isMapTileRequest(url)) {
    event.respondWith(handleMapTileRequest(event.request));
    return;
  }

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

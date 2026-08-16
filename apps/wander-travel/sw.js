importScripts('./runtime-version.js');

const SHELL_REVISION = '20260816-01';
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
  './wander-context-hud.css',
  './wander-dashboard-order.css',
  './wander-rule-checker.css',
  './wander-message-top.css',
  './wander-personal-poi-sheet.css',
  './wander-personal-poi-marker.css',
  './wander-track-delete.css',
  './wander-message-timeout-settings.css',
  './wander-map-selected-point.css',
  './wander-map-crosshair.css',
  './wander-points-screen.css',
  './wander-sessions.css',
  './wander-interaction.css',
  './wander-travel-log.css',
  './wander-travel-timeline.css',
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
  './runtime-map-zoom-buttons.js',
  './runtime-resilience-fixes.js',
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
  './runtime-context-hud.js',
  './runtime-place-hierarchy-dashboard.js',
  './runtime-dashboard-order.js',
  './runtime-panel.js',
  './runtime-context-panel.js',
  './runtime-place-hierarchy-panel.js',
  './runtime-tracks.js',
  './runtime-raw-location-recorder.js',
  './runtime-track-intelligence.js',
  './runtime-track-intelligence-poller.js',
  './runtime-track-review-ui.js',
  './runtime-track-tree-ui.js',
  './runtime-bitacora-tree-mode.js',
  './runtime-unified-travel-log.js',
  './runtime-active-track-log-bridge.js',
  './runtime-provider-simulator.js',
  './runtime-current-poi-motion-guard.js',
  './runtime-coordinate-format-ui.js',
  './runtime-personal-poi-core.js',
  './runtime-place-hierarchy.js',
  './runtime-personal-poi-situation.js',
  './runtime-personal-map-tools.js',
  './runtime-personal-poi-sheet.js',
  './runtime-map-selected-point.js',
  './runtime-map-crosshair.js',
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
  try { return await tileDbRequest(TILE_META_STORE, 'readonly', (store) => store.getAll()) || [];
  } catch { return []; }
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
  const requests = await cache.keys();
  const metadata = await listTileMeta();
  const retentionDays = await getTileRetentionDays();
  const totals = { osm: 0, esri: 0 };
  const bytes = { osm: 0, esri: 0 };
  metadata.forEach((item) => {
    if (item.source === 'osm' || item.source === 'esri') {
      totals[item.source] += 1;
      bytes[item.source] += Number(item.bytes) || 0;
    }
  });
  return {
    entries: requests.length,
    bySource: totals,
    bytesBySource: bytes,
    approximateBytes: Object.values(bytes).reduce((total, value) => total + value, 0),
    retentionDays,
    maximumEntries: MAX_TILE_ENTRIES,
  };
}

async function clearMapTileCache() {
  await caches.delete(TILE_CACHE_NAME);
  await clearTileMeta();
  return mapCacheStatus();
}

async function cleanupMapTileCache(retentionDays = DEFAULT_TILE_RETENTION_DAYS, force = false) {
  const days = normalizeRetentionDays(retentionDays);
  if (days === 0) return clearMapTileCache();
  if (!force && tileWritesSinceCleanup < 50) return null;
  tileWritesSinceCleanup = 0;
  const now = Date.now();
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  const cache = await caches.open(TILE_CACHE_NAME);
  const metadata = (await listTileMeta()).sort((left, right) => Number(left.lastAccessAt || 0) - Number(right.lastAccessAt || 0));
  const expired = metadata.filter((item) => Number(item.lastAccessAt || item.cachedAt || 0) < cutoff);
  for (const item of expired) {
    await cache.delete(item.url);
    await deleteTileMeta(item.url);
  }
  const remaining = (await listTileMeta()).sort((left, right) => Number(left.lastAccessAt || 0) - Number(right.lastAccessAt || 0));
  if (remaining.length > MAX_TILE_ENTRIES) {
    const overflow = remaining.slice(0, remaining.length - MAX_TILE_ENTRIES);
    for (const item of overflow) {
      await cache.delete(item.url);
      await deleteTileMeta(item.url);
    }
  }
  return mapCacheStatus();
}

async function cacheMapTile(request) {
  const cache = await caches.open(TILE_CACHE_NAME);
  try {
    const response = await fetch(request);
    if (!response.ok) throw new Error('Tile network response failed');
    const clone = response.clone();
    await cache.put(request, clone);
    const buffer = await response.clone().arrayBuffer().catch(() => null);
    const url = new URL(request.url);
    const source = url.hostname === 'tile.openstreetmap.org' ? 'osm' : 'esri';
    const now = Date.now();
    await putTileMeta({
      url: request.url,
      source,
      bytes: buffer?.byteLength || 0,
      cachedAt: now,
      lastAccessAt: now,
    });
    tileWritesSinceCleanup += 1;
    cleanupMapTileCache(undefined, false).catch(() => {});
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cachedMapTile(request) {
  const cache = await caches.open(TILE_CACHE_NAME);
  const cached = await cache.match(request);
  if (!cached) return null;
  const meta = await getTileMeta(request.url);
  const now = Date.now();
  if (!meta || now - Number(meta.lastAccessAt || 0) >= TOUCH_INTERVAL_MS) {
    await putTileMeta({
      ...(meta || { url: request.url, source: new URL(request.url).hostname === 'tile.openstreetmap.org' ? 'osm' : 'esri', bytes: 0, cachedAt: now }),
      lastAccessAt: now,
    });
  }
  return cached;
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('wander-travel-') && key !== CACHE_NAME).map((key) => caches.delete(key)))),
    cleanupMapTileCache(undefined, true),
  ]));
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  const type = event.data?.type;
  if (type === 'wander-map-cache-status') {
    event.waitUntil(mapCacheStatus().then((status) => event.source?.postMessage?.({ type: 'wander-map-cache-status', status })));
  }
  if (type === 'wander-map-cache-clear') {
    event.waitUntil(clearMapTileCache().then((status) => event.source?.postMessage?.({ type: 'wander-map-cache-cleared', status })));
  }
  if (type === 'wander-map-cache-retention') {
    event.waitUntil(setTileRetentionDays(event.data?.retentionDays).then((retentionDays) => event.source?.postMessage?.({ type: 'wander-map-cache-retention', retentionDays })));
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (isMapTileRequest(url)) {
    event.respondWith((async () => {
      const cached = await cachedMapTile(request);
      if (cached) {
        event.waitUntil(cacheMapTile(request).catch(() => {}));
        return cached;
      }
      return cacheMapTile(request);
    })());
    return;
  }

  if (url.origin === location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    );
  }
});

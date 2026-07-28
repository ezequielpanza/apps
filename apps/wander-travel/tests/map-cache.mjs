import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

const serviceWorker = read('sw.js');
const settings = read('runtime-map-cache-settings.js');
const mapCore = read('runtime-map-core.js');
const app = read('app.js');
const capacitorConfig = JSON.parse(read('capacitor.config.json'));
const mobileBuild = read('mobile/build-web.mjs');
const plugin = read('android/app/src/main/java/app/wandertravel/mobile/WanderOfflineTilePlugin.java');
const mainActivity = read('android/app/src/main/java/app/wandertravel/mobile/MainActivity.java');
const manifest = read('android/app/src/main/AndroidManifest.xml');

assert.equal(capacitorConfig.server, undefined);
assert.equal(capacitorConfig.webDir, 'mobile-dist');
assert.match(mobileBuild, /vendor', 'leaflet/);
assert.match(mobileBuild, /rewriteMobileIndex/);
assert.match(mobileBuild, /vendor\/leaflet\/leaflet\.js/);
assert.match(mobileBuild, /vendor\/leaflet\/leaflet\.css/);

assert.match(mainActivity, /registerPlugin\(WanderOfflineTilePlugin\.class\)/);
assert.match(manifest, /ACCESS_NETWORK_STATE/);
assert.match(plugin, /CACHE_DIRECTORY = "osm-tile-cache-v1"/);
assert.match(plugin, /MAX_TILE_COUNT = 6000/);
assert.match(plugin, /DEFAULT_RETENTION_DAYS = 90/);
assert.match(plugin, /OSM_TILE_TEMPLATE/);
assert.match(plugin, /ESRI_TILE_TEMPLATE/);
assert.match(plugin, /boolean networkAvailable\(\)/);
assert.match(plugin, /if \(hasCached\)/);
assert.match(plugin, /tileResponse\(bytes, true, !fresh, source/);
assert.match(plugin, /No cached tile and no validated network/);
assert.match(plugin, /void getTile\(PluginCall call\)/);
assert.match(plugin, /void getStats\(PluginCall call\)/);
assert.match(plugin, /void configure\(PluginCall call\)/);
assert.match(plugin, /void clear\(PluginCall call\)/);
assert.match(plugin, /User-Agent/);

assert.match(mapCore, /https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
assert.doesNotMatch(mapCore, /\{s\}\.tile\.openstreetmap\.org/);
assert.match(mapCore, /NativeStoredTileLayer/);
assert.match(mapCore, /nativeLayer\('osm'/);
assert.match(mapCore, /nativeLayer\('esri'/);
assert.match(mapCore, /source: this\.wanderSource/);
assert.match(mapCore, /nativeTileSources/);
assert.match(mapCore, /BASE_LAYER_KEY/);
assert.match(mapCore, /storedBaseLayer/);
assert.match(mapCore, /wander-route-pane/);
assert.match(mapCore, /wander-current-track-pane/);
assert.match(mapCore, /errorTileUrl: TRANSPARENT_TILE/);

assert.match(serviceWorker, /const TILE_CACHE_NAME = 'wander-map-tiles-v1'/);
assert.match(serviceWorker, /DEFAULT_TILE_RETENTION_DAYS = 30/);
assert.match(serviceWorker, /MAX_TILE_ENTRIES = 2500/);
assert.match(serviceWorker, /tile\.openstreetmap\.org/);
assert.match(serviceWorker, /server\.arcgisonline\.com/);
assert.match(serviceWorker, /function isMapTileRequest\(/);
assert.match(serviceWorker, /WANDER_MAP_CACHE_CONFIG/);
assert.match(serviceWorker, /WANDER_MAP_CACHE_CLEAR/);
assert.match(serviceWorker, /if \(cached\) return cached/);
assert.match(serviceWorker, /retentionDays === 0/);
assert.match(serviceWorker, /key !== TILE_CACHE_NAME/);
assert.doesNotMatch(serviceWorker, /prefetch|preload.*tile|download.*area/i);

assert.match(settings, /sectores de calles y satélite/);
assert.match(settings, /El recorrido se registra y se dibuja incluso cuando no hay ningún tile disponible/);
assert.match(settings, /MIGRATION_KEY/);
assert.match(settings, /const raw = localStorage\.getItem\(STORAGE_KEY\)/);
assert.match(settings, /if \(raw === null\) return DEFAULT_DAYS/);
assert.match(settings, /value === 0 && !migrated/);
assert.doesNotMatch(settings, /Number\(localStorage\.getItem\(STORAGE_KEY\)\)/);
for (const days of ['0', '7', '30', '90', '180', '365']) {
  assert.match(settings, new RegExp(`<option value="${days}">`));
}
assert.match(settings, /Vaciar mapa local/);
assert.match(settings, /WANDER_MAP_CACHE_STATUS/);
assert.match(settings, /WanderOfflineTiles/);
assert.match(settings, /map\.track\.available/);
assert.match(app, /loadMapCacheSettings/);
assert.match(app, /runtime-map-cache-settings\.js/);

console.log('PASS Wander uses a real default retention, migrates the v0.109.1 zero-day bug, and restores cached street and satellite tiles offline');
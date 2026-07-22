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

assert.match(mapCore, /https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
assert.doesNotMatch(mapCore, /\{s\}\.tile\.openstreetmap\.org/);
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
assert.match(settings, /No descarga zonas por adelantado/);
for (const days of ['0', '7', '30', '90', '180', '365']) {
  assert.match(settings, new RegExp(`<option value="${days}">`));
}
assert.match(settings, /Vaciar mapas guardados/);
assert.match(settings, /WANDER_MAP_CACHE_STATUS/);
assert.match(app, /loadMapCacheSettings/);
assert.match(app, /runtime-map-cache-settings\.js/);

console.log('PASS viewed map tiles use a configurable, bounded offline cache');

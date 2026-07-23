import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY_ROOT = path.resolve(ROOT, '..', '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

const html = read('index.html');
const app = read('app.js');
const serviceWorker = read('sw.js');
const platform = read('runtime-platform.js');
const versionRuntime = read('runtime-version.js');
const manifest = JSON.parse(read('manifest.webmanifest'));
const packageManifest = JSON.parse(read('package.json'));
const androidVersion = JSON.parse(read('android-version.json'));
const capacitorConfig = JSON.parse(read('capacitor.config.json'));

function localReferences(source) {
  return [...source.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1].split(/[?#]/)[0].replace(/^\.\//, ''))
    .filter((reference) => reference && !/^https?:\/\//.test(reference));
}

function addDynamicReferences(target, source) {
  const patterns = [
    /(?:script\.src|link\.href)\s*=\s*["']\.\/([^"']+)["']/g,
    /loadScript\(\s*["']\.\/([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) target.add(match[1].split(/[?#]/)[0]);
  }
}

const loaded = new Set(localReferences(html));
addDynamicReferences(loaded, platform);
addDynamicReferences(loaded, app);
loaded.add('index.html');
const cached = new Set([...serviceWorker.matchAll(/["']\.\/([^"']+)["']/g)].map((match) => match[1]));

for (const reference of loaded) {
  assert.equal(fs.existsSync(path.join(ROOT, reference)), true, `Missing shell asset: ${reference}`);
  assert.equal(cached.has(reference), true, `Shell asset is not cached: ${reference}`);
}

for (const file of fs.readdirSync(ROOT)) {
  const absolute = path.join(ROOT, file);
  if (!fs.statSync(absolute).isFile()) continue;
  if (file.endsWith('.js') && file !== 'sw.js') assert.equal(loaded.has(file), true, `Unloaded JavaScript file: ${file}`);
  if (file.endsWith('.css')) assert.equal(loaded.has(file), true, `Unloaded stylesheet: ${file}`);
}

const versionMatch = versionRuntime.match(/const VERSION = '(v\d+\.\d+\.\d+)'/);
assert.ok(versionMatch, 'runtime-version.js must define a semantic web version');
assert.equal(versionMatch[1], 'v0.107.3');
assert.equal(manifest.start_url, './?app=v0.107.3');
assert.equal(packageManifest.version, '0.107.3');
assert.equal(androidVersion.versionName, '0.9.1');
assert.equal(androidVersion.versionCode, 14);
assert.equal(capacitorConfig.server.url, 'https://wander-travel.pages.dev');
assert.equal(capacitorConfig.server.errorPath, 'index.html');

const dashboard = read('runtime-context-dashboard.js');
const direction = read('runtime-direction-indicator.js');
const directionSettings = read('runtime-direction-indicator-settings.js');
const locationProvider = read('runtime-provider-location.js');
const tracks = read('runtime-tracks.js');
const sessionEngine = read('runtime-session-engine.js');
const notificationPlugin = read('android/app/src/main/java/app/wandertravel/mobile/WanderNotificationPlugin.java');
const mainActivity = read('android/app/src/main/java/app/wandertravel/mobile/MainActivity.java');
const notificationRouter = read('runtime-notification-router.js');
const interactionPanel = read('runtime-interaction-panel.js');
const roomCompanion = read('runtime-room-companion.js');
const mapCore = read('runtime-map-core.js');
const mapCacheSettings = read('runtime-map-cache-settings.js');
const travelLog = read('runtime-travel-log.js');
const travelLogScreen = read('runtime-travel-log-screen.js');

assert.match(direction, /thresholdKmh: 0/);
assert.match(direction, /magneticEnabled/);
assert.match(direction, /source: 'gps'/);
assert.match(direction, /source: 'compass'/);
assert.match(directionSettings, /Mostrar indicador/);
assert.match(directionSettings, /Brújula magnética \+ giróscopo/);
assert.match(directionSettings, /Umbral para usar brújula/);
assert.match(dashboard, /function directionValue\(/);
assert.match(dashboard, /context\.value\('direction\.heading'\)/);
assert.match(dashboard, /label: 'Dirección'/);
assert.match(dashboard, /cardinalDirection/);

assert.match(locationProvider, /function validateSample\(/);
assert.match(locationProvider, /reason: 'isolated-jump'/);
assert.match(locationProvider, /reason: 'confirmed-relocation'/);
assert.match(locationProvider, /location\.validation\.rejectedJumpCount/);
assert.match(locationProvider, /wander:location-sample-rejected/);

assert.match(sessionEngine, /type: 'movement'/);
assert.match(sessionEngine, /segments: \[\]/);
assert.match(tracks, /function sessionLatLngSegments\(/);
assert.match(tracks, /currentLine\.setLatLngs\(latLngs\)/);
assert.match(tracks, /line\.setLatLngs\(segments\)/);
assert.match(tracks, /const latLngs = segments\.flat\(\)/);

assert.match(notificationPlugin, /EXTRA_NOTIFICATION_ID/);
assert.match(notificationPlugin, /void consumePendingOpen\(PluginCall call\)/);
assert.match(notificationPlugin, /notifyListeners\("notificationOpened"/);
assert.match(mainActivity, /protected void onNewIntent\(Intent intent\)/);
assert.match(notificationRouter, /target === 'room-prompt'/);
assert.match(notificationRouter, /WanderInteractionPanel\?\.focus/);
assert.match(interactionPanel, /function focus\(id\)/);
assert.match(roomCompanion, /function openNotification\(id\)/);

assert.match(mapCore, /https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
assert.match(serviceWorker, /TILE_CACHE_NAME = 'wander-map-tiles-v1'/);
assert.match(serviceWorker, /MAX_TILE_ENTRIES = 2500/);
assert.match(serviceWorker, /WANDER_MAP_CACHE_CONFIG/);
assert.match(serviceWorker, /WANDER_MAP_CACHE_CLEAR/);
assert.match(mapCacheSettings, /No descarga zonas por adelantado/);
assert.match(mapCacheSettings, /Vaciar mapas guardados/);

assert.match(travelLog, /window\.WanderTravelLog/);
assert.match(travelLog, /contextChanges/);
assert.match(travelLog, /sessionId/);
assert.match(travelLogScreen, /Bitácora de viaje/);
assert.match(travelLogScreen, /Próximamente/);

assert.doesNotMatch(html, /v\d+\.\d+\.\d+/);
assert.doesNotMatch(serviceWorker, /wander-travel-v\d+/);
assert.match(serviceWorker, /if \(!response\.ok\) throw/);

for (const retiredPath of ['imports/wander', 'imports/wander-clean', 'imports/wander-v2', 'sync/wander', 'services/wander-web-acquisition']) {
  const absolute = path.join(REPOSITORY_ROOT, retiredPath);
  const hasFiles = fs.existsSync(absolute) && fs.readdirSync(absolute, { recursive: true, withFileTypes: true }).some((entry) => entry.isFile());
  assert.equal(hasFiles, false, `Retired Wander staging path is not empty: ${retiredPath}`);
}

console.log(`PASS Wander Web ${versionMatch[1]} / APK ${androidVersion.versionName} GPS-filtered direction shell is consistent`);

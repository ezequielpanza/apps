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
    /ensureStyles\(\s*["']\.\/([^"']+)["']/g,
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
const onlineEnhancements = new Set(['runtime-cloud-backup.js', 'wander-cloud-backup.css']);

for (const reference of loaded) {
  assert.equal(fs.existsSync(path.join(ROOT, reference)), true, `Missing shell asset: ${reference}`);
  if (!onlineEnhancements.has(reference)) {
    assert.equal(cached.has(reference), true, `Shell asset is not cached: ${reference}`);
  }
}

for (const file of fs.readdirSync(ROOT)) {
  const absolute = path.join(ROOT, file);
  if (!fs.statSync(absolute).isFile()) continue;
  if (file.endsWith('.js') && file !== 'sw.js') assert.equal(loaded.has(file), true, `Unloaded JavaScript file: ${file}`);
  if (file.endsWith('.css')) assert.equal(loaded.has(file), true, `Unloaded stylesheet: ${file}`);
}

const versionMatch = versionRuntime.match(/const VERSION = '(v\d+\.\d+\.\d+)'/);
assert.ok(versionMatch, 'runtime-version.js must define a semantic web version');
assert.equal(versionMatch[1], 'v0.109.5');
assert.equal(manifest.start_url, './?app=v0.109.5');
assert.equal(packageManifest.version, '0.109.5');
assert.equal(androidVersion.versionName, '0.11.6');
assert.equal(androidVersion.versionCode, 22);
assert.equal(capacitorConfig.webDir, 'mobile-dist');
assert.equal(capacitorConfig.server, undefined, 'Android must start from bundled assets instead of a remote URL');
assert.equal(capacitorConfig.plugins?.CapacitorHttp?.enabled, true);

const dashboard = read('runtime-context-dashboard.js');
const direction = read('runtime-direction-indicator.js');
const directionSettings = read('runtime-direction-indicator-settings.js');
const directionPlugin = read('android/app/src/main/java/app/wandertravel/mobile/WanderDirectionPlugin.java');
const locationService = read('android/app/src/main/java/app/wandertravel/mobile/WanderLocationService.java');
const androidManifest = read('android/app/src/main/AndroidManifest.xml');
const locationProvider = read('runtime-provider-location.js');
const tracks = read('runtime-tracks.js');
const sessionEngine = read('runtime-session-engine.js');
const sensorMotionBridge = read('runtime-sensor-motion-bridge.js');
const notificationPlugin = read('android/app/src/main/java/app/wandertravel/mobile/WanderNotificationPlugin.java');
const offlineTilePlugin = read('android/app/src/main/java/app/wandertravel/mobile/WanderOfflineTilePlugin.java');
const cloudIdentityPlugin = read('android/app/src/main/java/app/wandertravel/mobile/WanderCloudIdentityPlugin.java');
const mainActivity = read('android/app/src/main/java/app/wandertravel/mobile/MainActivity.java');
const notificationRouter = read('runtime-notification-router.js');
const interactionPanel = read('runtime-interaction-panel.js');
const roomCompanion = read('runtime-room-companion.js');
const mapCore = read('runtime-map-core.js');
const mapCrosshair = read('runtime-map-crosshair.js');
const mapCacheSettings = read('runtime-map-cache-settings.js');
const mobileBuild = read('mobile/build-web.mjs');
const travelLog = read('runtime-travel-log.js');
const travelLogScreen = read('runtime-travel-log-screen.js');
const cloudBackup = read('runtime-cloud-backup.js');
const cloudBackupApi = read('functions/api/cloud-backup.js');
const cloudProvisioner = read('scripts/ensure-cloudflare-backup-kv.mjs');

assert.match(app, /const cloudBootstrap = loadCloudBackup\(\)/);
assert.match(app, /Promise\.allSettled\(\[/);
assert.match(app, /loadDirectionIndicator\(\),\s*loadMapCrosshair\(\),\s*loadTravelMemory\(\)/s);
assert.match(app, /cloudBootstrap\.then\(\(cloudResult\)/);
assert.doesNotMatch(app, /await loadCloudBackup\(\)/);
assert.match(app, /initializeStableDirectionMarker/);
assert.match(app, /GPS_SWITCH_MS = 4000/);
assert.match(app, /COMPASS_SWITCH_MS = 2500/);
assert.match(app, /wander\.tracks\.recent\.window\.v1/);
assert.match(app, /Mostrar en el mapa/);
assert.match(app, /Últimas 24 horas/);
assert.match(app, /segment\?\.type !== 'movement' \|\| !segment\.endedAt/);

assert.match(direction, /thresholdKmh: 0/);
assert.match(direction, /magneticEnabled/);
assert.match(direction, /source: 'gps'/);
assert.match(direction, /source: 'compass'/);
assert.match(direction, /SENSOR_RETRY_MS/);
assert.match(direction, /HEALTHCHECK_INTERVAL_MS/);
assert.match(direction, /retryStaleSensor/);
assert.match(direction, /removeMarker\(\)/);
assert.doesNotMatch(direction, /document\.visibilityState !== 'hidden'/);
assert.match(direction, /syncNativeSensor\(\);\s*healthTimer/s);
assert.match(directionSettings, /Mostrar indicador/);
assert.match(directionSettings, /Brújula magnética \+ giróscopo/);
assert.match(directionSettings, /Umbral para usar brújula/);
assert.match(directionPlugin, /implements SensorEventListener/);
assert.match(directionPlugin, /TYPE_ROTATION_VECTOR/);
assert.match(directionPlugin, /TYPE_GEOMAGNETIC_ROTATION_VECTOR/);
assert.match(directionPlugin, /independentFromLocation/);
assert.match(directionPlugin, /handleOnResume/);
assert.doesNotMatch(directionPlugin, /WanderLocationService/);
assert.doesNotMatch(locationService, /ACTION_DIRECTION_SENSOR/);
assert.doesNotMatch(locationService, /TYPE_ROTATION_VECTOR/);
assert.match(dashboard, /function directionValue\(/);
assert.match(dashboard, /context\.value\('direction\.heading'\)/);
assert.match(dashboard, /label: 'Dirección'/);
assert.match(dashboard, /cardinalDirection/);

assert.match(sensorMotionBridge, /STARTUP_GUARD_MS = 20000/);
assert.match(sensorMotionBridge, /corroborationRequired: true/);
assert.match(sensorMotionBridge, /accelerometer_without_position_corroboration/);
assert.match(sensorMotionBridge, /stable_movement_confirmed/);
assert.match(sensorMotionBridge, /STOP_CONFIRM_MS = 10000/);

assert.match(mapCrosshair, /bearingTo\(/);
assert.match(mapCrosshair, /distanceLabel\(/);
assert.match(mapCrosshair, /position\.isFollowingPosition/);
assert.match(mapCrosshair, /map\.getCenter\(\)/);
assert.match(mapCrosshair, /map\.distance\(here, target\)/);
assert.match(mapCrosshair, /map-point-marker/);

assert.match(locationProvider, /function validateSample\(/);
assert.match(locationProvider, /reason: 'isolated-jump'/);
assert.match(locationProvider, /reason: 'confirmed-relocation'/);
assert.match(locationProvider, /location\.validation\.rejectedJumpCount/);
assert.match(locationProvider, /wander:location-sample-rejected/);

assert.match(sessionEngine, /type: 'movement'/);
assert.match(sessionEngine, /segments: \[\]/);
assert.match(sessionEngine, /if \(openMovement\(active\)\) closeMovement\(at\)/);
assert.match(sessionEngine, /const stay = reconcileStay\(position, at\)/);
assert.match(tracks, /function sessionLatLngSegments\(/);
assert.match(tracks, /currentLine\.setLatLngs\(latLngs\)/);

assert.match(notificationPlugin, /EXTRA_NOTIFICATION_ID/);
assert.match(notificationPlugin, /void consumePendingOpen\(PluginCall call\)/);
assert.match(notificationPlugin, /notifyListeners\("notificationOpened"/);
assert.match(mainActivity, /protected void onNewIntent\(Intent intent\)/);
assert.match(notificationRouter, /target === 'room-prompt'/);
assert.match(notificationRouter, /WanderInteractionPanel\?\.focus/);
assert.match(interactionPanel, /function focus\(id\)/);
assert.match(roomCompanion, /function openNotification\(id\)/);

assert.match(mainActivity, /registerPlugin\(WanderOfflineTilePlugin\.class\)/);
assert.match(androidManifest, /ACCESS_NETWORK_STATE/);
assert.match(offlineTilePlugin, /name = "WanderOfflineTiles"/);
assert.match(offlineTilePlugin, /MAX_FALLBACK_DEPTH = 4/);
assert.match(offlineTilePlugin, /findCachedAncestor/);
assert.match(offlineTilePlugin, /fallbackTileResponse/);
assert.match(offlineTilePlugin, /warmAncestorTiles/);
assert.match(offlineTilePlugin, /result\.put\("zoomFallback", true\)/);
assert.match(mapCore, /document\.createElement\('canvas'\)/);
assert.match(mapCore, /result\.fallback === true/);
assert.match(mapCore, /context\.drawImage\(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 256, 256\)/);
assert.match(mapCore, /tilefallback/);
assert.match(mapCore, /nativeLayer\('osm'/);
assert.match(mapCore, /nativeLayer\('esri'/);
assert.match(mapCacheSettings, /sectores de calles y satélite/);
assert.match(mapCacheSettings, /MIGRATION_KEY/);
assert.match(mapCacheSettings, /if \(raw === null\) return DEFAULT_DAYS/);
assert.match(platform, /const PRODUCTION_ORIGIN = 'https:\/\/wander-travel\.pages\.dev'/);
assert.match(platform, /const origin = isNative\(\) \? PRODUCTION_ORIGIN : window\.location\.origin/);
assert.match(mobileBuild, /vendor', 'leaflet/);
assert.match(mobileBuild, /leafletAssets/);
assert.match(mobileBuild, /Integrity mismatch/);
assert.match(mobileBuild, /entry\.name === 'sw\.js'/);
assert.match(mobileBuild, /__WANDER_DISABLE_SERVICE_WORKER__/);
assert.match(mobileBuild, /navigator\.serviceWorker\.getRegistrations\(\)/);
assert.match(mobileBuild, /registration\.unregister\(\)/);
assert.match(mobileBuild, /caches\.delete\(key\)/);
assert.match(mobileBuild, /window\.location\.reload\(\)/);
assert.match(mobileBuild, /Could not locate Wander service worker guard/);

assert.match(serviceWorker, /TILE_CACHE_NAME = 'wander-map-tiles-v1'/);
assert.match(serviceWorker, /wander-map-crosshair\.css/);
assert.match(serviceWorker, /runtime-map-crosshair\.js/);
assert.match(serviceWorker, /wander-travel-timeline\.css/);
assert.match(serviceWorker, /WANDER_MAP_CACHE_CONFIG/);
assert.match(serviceWorker, /WANDER_MAP_CACHE_CLEAR/);

assert.match(cloudIdentityPlugin, /name = "WanderCloudIdentity"/);
assert.match(cloudIdentityPlugin, /Settings\.Secure\.ANDROID_ID/);
assert.match(cloudIdentityPlugin, /MessageDigest\.getInstance\("SHA-256"\)/);
assert.match(mainActivity, /registerPlugin\(WanderCloudIdentityPlugin\.class\)/);
assert.match(cloudBackup, /wander\.personalPOIs\.v1/);
assert.match(cloudBackup, /wander\.sessions\.v1/);
assert.match(cloudBackup, /wander\.travelLog\.entries\.v1/);
assert.match(cloudBackup, /hasMeaningfulData/);
assert.match(cloudBackup, /LAST_SUCCESS_KEY/);
assert.match(cloudBackup, /LAST_ATTEMPT_KEY/);
assert.match(cloudBackup, /PENDING_KEY/);
assert.match(cloudBackup, /Último backup confirmado/);
assert.match(cloudBackup, /Crear backup ahora/);
assert.match(cloudBackup, /result\.contentHash && result\.contentHash !== backup\.contentHash/);
assert.match(cloudBackupApi, /WANDER_BACKUPS/);
assert.match(cloudBackupApi, /MAX_BODY_BYTES = 20 \* 1024 \* 1024/);
assert.match(cloudProvisioner, /wander-travel-backups/);
assert.match(cloudProvisioner, /kv_namespaces/);

assert.match(travelLog, /window\.WanderTravelLog/);
assert.match(travelLog, /contextChanges/);
assert.match(travelLogScreen, /ensureMenuButton/);
assert.match(travelLogScreen, /button\.dataset\.screenTarget = 'travel-log'/);
assert.match(travelLogScreen, /movementItemsForDay/);
assert.match(travelLogScreen, /Track entre detenciones/);
assert.match(travelLogScreen, /item\.from.*item\.to/s);
assert.match(travelLogScreen, /showMovement/);
assert.doesNotMatch(travelLogScreen, /open\?\.\('routes'\)/);

assert.doesNotMatch(html, /v\d+\.\d+\.\d+/);
assert.doesNotMatch(serviceWorker, /wander-travel-v\d+/);
assert.match(serviceWorker, /if \(!response\.ok\) throw/);

for (const retiredPath of ['imports/wander', 'imports/wander-clean', 'imports/wander-v2', 'sync/wander', 'services/wander-web-acquisition']) {
  const absolute = path.join(REPOSITORY_ROOT, retiredPath);
  const hasFiles = fs.existsSync(absolute) && fs.readdirSync(absolute, { recursive: true, withFileTypes: true }).some((entry) => entry.isFile());
  assert.equal(hasFiles, false, `Retired Wander staging path is not empty: ${retiredPath}`);
}

console.log(`PASS Wander Web ${versionMatch[1]} / APK ${androidVersion.versionName} starts local-first without native service-worker races, with persistent cloud backup status, integrated travel tracks, stable direction, crosshair metrics, and offline zoom fallback`);

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
const directionStyles = read('wander-direction-indicator.css');
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
  if (!onlineEnhancements.has(reference)) assert.equal(cached.has(reference), true, `Shell asset is not cached: ${reference}`);
}

for (const file of fs.readdirSync(ROOT)) {
  const absolute = path.join(ROOT, file);
  if (!fs.statSync(absolute).isFile()) continue;
  if (file.endsWith('.js') && file !== 'sw.js') assert.equal(loaded.has(file), true, `Unloaded JavaScript file: ${file}`);
  if (file.endsWith('.css')) assert.equal(loaded.has(file), true, `Unloaded stylesheet: ${file}`);
}

const versionMatch = versionRuntime.match(/const VERSION = '(v\d+\.\d+\.\d+)'/);
assert.ok(versionMatch, 'runtime-version.js must define a semantic web version');
assert.equal(versionMatch[1], 'v0.109.8');
assert.equal(manifest.start_url, './?app=v0.109.8');
assert.equal(packageManifest.version, '0.109.8');
assert.equal(androidVersion.versionName, '0.11.9');
assert.equal(androidVersion.versionCode, 25);
assert.equal(capacitorConfig.webDir, 'mobile-dist');
assert.equal(capacitorConfig.server, undefined, 'Android must start from bundled assets instead of a remote URL');
assert.equal(capacitorConfig.plugins?.CapacitorHttp?.enabled, true);

const sources = {
  dashboard: read('runtime-context-dashboard.js'),
  direction: read('runtime-direction-indicator.js'),
  directionSettings: read('runtime-direction-indicator-settings.js'),
  directionPlugin: read('android/app/src/main/java/app/wandertravel/mobile/WanderDirectionPlugin.java'),
  locationPlugin: read('android/app/src/main/java/app/wandertravel/mobile/WanderLocationPlugin.java'),
  locationService: read('android/app/src/main/java/app/wandertravel/mobile/WanderLocationService.java'),
  nativeLocationSource: read('runtime-native-location-source.js'),
  androidManifest: read('android/app/src/main/AndroidManifest.xml'),
  locationProvider: read('runtime-provider-location.js'),
  tracks: read('runtime-tracks.js'),
  sessionEngine: read('runtime-session-engine.js'),
  sensorMotionBridge: read('runtime-sensor-motion-bridge.js'),
  notificationPlugin: read('android/app/src/main/java/app/wandertravel/mobile/WanderNotificationPlugin.java'),
  offlineTilePlugin: read('android/app/src/main/java/app/wandertravel/mobile/WanderOfflineTilePlugin.java'),
  cloudIdentityPlugin: read('android/app/src/main/java/app/wandertravel/mobile/WanderCloudIdentityPlugin.java'),
  mainActivity: read('android/app/src/main/java/app/wandertravel/mobile/MainActivity.java'),
  notificationRouter: read('runtime-notification-router.js'),
  interactionPanel: read('runtime-interaction-panel.js'),
  roomCompanion: read('runtime-room-companion.js'),
  mapCore: read('runtime-map-core.js'),
  mapCrosshair: read('runtime-map-crosshair.js'),
  mapCacheSettings: read('runtime-map-cache-settings.js'),
  mobileBuild: read('mobile/build-web.mjs'),
  travelLog: read('runtime-travel-log.js'),
  travelLogScreen: read('runtime-travel-log-screen.js'),
  cloudBackup: read('runtime-cloud-backup.js'),
  cloudBackupApi: read('functions/api/cloud-backup.js'),
  cloudProvisioner: read('scripts/ensure-cloudflare-backup-kv.mjs'),
};

assert.match(versionRuntime, /LAST_24_HOURS_MS = 24 \* 60 \* 60 \* 1000/);
assert.match(versionRuntime, /localStorage\.getItem\(RECENT_TRACKS_KEY\) === null/);
assert.match(versionRuntime, /stored\.profileId === 'balanced'/);

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

assert.doesNotMatch(directionStyles, /transition:transform/);
assert.match(sources.direction, /thresholdKmh: 0/);
assert.match(sources.direction, /magneticEnabled/);
assert.match(sources.direction, /source: 'gps'/);
assert.match(sources.direction, /source: 'compass'/);
assert.match(sources.direction, /SENSOR_RETRY_MS/);
assert.match(sources.direction, /HEALTHCHECK_INTERVAL_MS/);
assert.match(sources.direction, /retryStaleSensor/);
assert.match(sources.direction, /removeMarker\(\)/);
assert.doesNotMatch(sources.direction, /document\.visibilityState !== 'hidden'/);
assert.match(sources.direction, /syncNativeSensor\(\);\s*healthTimer/s);
assert.match(sources.directionSettings, /Mostrar indicador/);
assert.match(sources.directionSettings, /Brújula magnética \+ giróscopo/);
assert.match(sources.directionSettings, /Umbral para usar brújula/);
assert.match(sources.directionPlugin, /implements SensorEventListener/);
assert.match(sources.directionPlugin, /TYPE_ROTATION_VECTOR/);
assert.match(sources.directionPlugin, /TYPE_GEOMAGNETIC_ROTATION_VECTOR/);
assert.match(sources.directionPlugin, /independentFromLocation/);
assert.match(sources.directionPlugin, /handleOnResume/);
assert.doesNotMatch(sources.directionPlugin, /WanderLocationService/);
assert.doesNotMatch(sources.locationService, /TYPE_ROTATION_VECTOR/);
assert.match(sources.dashboard, /function directionValue\(/);
assert.match(sources.dashboard, /context\.value\('direction\.heading'\)/);
assert.match(sources.dashboard, /label: 'Dirección'/);
assert.match(sources.dashboard, /cardinalDirection/);

assert.match(sources.sensorMotionBridge, /STARTUP_GUARD_MS = 20000/);
assert.match(sources.sensorMotionBridge, /corroborationRequired: true/);
assert.match(sources.sensorMotionBridge, /accelerometer_without_position_corroboration/);
assert.match(sources.sensorMotionBridge, /stable_movement_confirmed/);
assert.match(sources.sensorMotionBridge, /STOP_CONFIRM_MS = 20000/);
assert.match(sources.sensorMotionBridge, /STOP_MIN_RADIUS_M = 8/);
assert.match(sources.sensorMotionBridge, /STOP_MAX_RADIUS_M = 25/);
assert.match(sources.sensorMotionBridge, /STOP_MAX_ACCURACY_M = 40/);
assert.match(sources.sensorMotionBridge, /WALK_STOP_SPEED_KMH = 1\.5/);
assert.match(sources.sensorMotionBridge, /VEHICLE_STOP_SPEED_KMH = 3/);

assert.match(sources.mapCrosshair, /bearingTo\(/);
assert.match(sources.mapCrosshair, /distanceLabel\(/);
assert.match(sources.mapCrosshair, /position\.isFollowingPosition/);
assert.match(sources.mapCrosshair, /map\.getCenter\(\)/);
assert.match(sources.mapCrosshair, /map\.distance\(here, target\)/);
assert.match(sources.mapCrosshair, /map-point-marker/);

assert.match(sources.locationProvider, /function validateSample\(/);
assert.match(sources.locationProvider, /reason: 'isolated-jump'/);
assert.match(sources.locationProvider, /reason: 'confirmed-relocation'/);
assert.match(sources.locationProvider, /location\.validation\.rejectedJumpCount/);
assert.match(sources.locationProvider, /wander:location-sample-rejected/);
assert.match(sources.nativeLocationSource, /precise: Object\.freeze\(\{ intervalSec: 1, distanceM: 0 \}\)/);
assert.match(sources.nativeLocationSource, /minimumIntervalMs: clampInteger\(config\?\.intervalSec, 1, 60, 1\) \* 1000/);
assert.match(sources.locationPlugin, /Math\.max\(1000, call\.getInt\("minimumIntervalMs", 1000\)\)/);
assert.match(sources.locationService, /minimumIntervalMs = intent == null \? 1000/);
assert.match(sources.locationService, /minimumDistanceM = intent == null \? 0/);

assert.match(sources.sessionEngine, /type: 'movement'/);
assert.match(sources.sessionEngine, /segments: \[\]/);
assert.match(sources.sessionEngine, /minimumIntervalSec: 1/);
assert.match(sources.sessionEngine, /intervalSec: 1, distanceM: 0/);
assert.match(sources.sessionEngine, /raw: true/);
assert.match(sources.sessionEngine, /sessions\.map\(compactSession\)/);
assert.doesNotMatch(sources.sessionEngine, /elapsedMs < config\.intervalSec/);
assert.doesNotMatch(sources.sessionEngine, /distance < config\.distanceM/);
assert.match(sources.sessionEngine, /addMovementPoint\(movement, position, at, true\);\s*closeMovement\(at\)/s);
assert.match(sources.sessionEngine, /lat: finite\(closedStay\?\.center\?\.lat\) \?\? position\.lat/);
assert.match(sources.sessionEngine, /const stay = reconcileStay\(position, at\)/);
assert.match(sources.tracks, /function sessionLatLngSegments\(/);
assert.match(sources.tracks, /TRACK_SMOOTHING_KEY/);
assert.match(sources.tracks, /Suavizar recorrido/);
assert.match(sources.tracks, /visualOnly: true/);
assert.match(sources.tracks, /function displayLatLngs\(/);
assert.match(sources.tracks, /wander:track-smoothing-changed/);
assert.match(sources.tracks, /currentLine\.setLatLngs\(latLngs\)/);
assert.match(sources.tracks, /application\/gpx\+xml/);
assert.match(sources.tracks, /WanderLocation/);
assert.match(sources.tracks, /saveGpx/);
assert.match(sources.tracks, /function exportSegment\(/);
assert.match(sources.tracks, /data\.logMovementDownload/);
assert.match(sources.tracks, /Descargar track en formato GPX/);
assert.match(sources.tracks, /http:\/\/www\.topografix\.com\/GPX\/1\/1/);

assert.match(sources.notificationPlugin, /EXTRA_NOTIFICATION_ID/);
assert.match(sources.notificationPlugin, /void consumePendingOpen\(PluginCall call\)/);
assert.match(sources.notificationPlugin, /notifyListeners\("notificationOpened"/);
assert.match(sources.mainActivity, /protected void onNewIntent\(Intent intent\)/);
assert.match(sources.notificationRouter, /target === 'room-prompt'/);
assert.match(sources.notificationRouter, /WanderInteractionPanel\?\.focus/);
assert.match(sources.interactionPanel, /function focus\(id\)/);
assert.match(sources.roomCompanion, /function openNotification\(id\)/);

assert.match(sources.mainActivity, /registerPlugin\(WanderOfflineTilePlugin\.class\)/);
assert.match(sources.androidManifest, /ACCESS_NETWORK_STATE/);
assert.match(sources.offlineTilePlugin, /name = "WanderOfflineTiles"/);
assert.match(sources.offlineTilePlugin, /MAX_FALLBACK_DEPTH = 4/);
assert.match(sources.offlineTilePlugin, /findCachedAncestor/);
assert.match(sources.offlineTilePlugin, /fallbackTileResponse/);
assert.match(sources.offlineTilePlugin, /warmAncestorTiles/);
assert.match(sources.offlineTilePlugin, /result\.put\("zoomFallback", true\)/);
assert.match(sources.mapCore, /document\.createElement\('canvas'\)/);
assert.match(sources.mapCore, /result\.fallback === true/);
assert.match(sources.mapCore, /context\.drawImage\(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 256, 256\)/);
assert.match(sources.mapCore, /tilefallback/);
assert.match(sources.mapCore, /nativeLayer\('osm'/);
assert.match(sources.mapCore, /nativeLayer\('esri'/);
assert.match(sources.mapCacheSettings, /sectores de calles y satélite/);
assert.match(sources.mapCacheSettings, /MIGRATION_KEY/);
assert.match(sources.mapCacheSettings, /if \(raw === null\) return DEFAULT_DAYS/);
assert.match(platform, /const PRODUCTION_ORIGIN = 'https:\/\/wander-travel\.pages\.dev'/);
assert.match(platform, /const origin = isNative\(\) \? PRODUCTION_ORIGIN : window\.location\.origin/);
assert.match(sources.mobileBuild, /vendor', 'leaflet/);
assert.match(sources.mobileBuild, /leafletAssets/);
assert.match(sources.mobileBuild, /Integrity mismatch/);
assert.match(sources.mobileBuild, /entry\.name === 'sw\.js'/);
assert.match(sources.mobileBuild, /__WANDER_DISABLE_SERVICE_WORKER__/);
assert.match(sources.mobileBuild, /navigator\.serviceWorker\.getRegistrations\(\)/);
assert.match(sources.mobileBuild, /registration\.unregister\(\)/);
assert.match(sources.mobileBuild, /caches\.delete\(key\)/);
assert.match(sources.mobileBuild, /window\.location\.reload\(\)/);
assert.match(sources.mobileBuild, /Could not locate Wander service worker guard/);

assert.match(serviceWorker, /TILE_CACHE_NAME = 'wander-map-tiles-v1'/);
assert.match(serviceWorker, /wander-map-crosshair\.css/);
assert.match(serviceWorker, /runtime-map-crosshair\.js/);
assert.match(serviceWorker, /wander-travel-timeline\.css/);
assert.match(serviceWorker, /WANDER_MAP_CACHE_CONFIG/);
assert.match(serviceWorker, /WANDER_MAP_CACHE_CLEAR/);

assert.match(sources.cloudIdentityPlugin, /name = "WanderCloudIdentity"/);
assert.match(sources.cloudIdentityPlugin, /Settings\.Secure\.ANDROID_ID/);
assert.match(sources.cloudIdentityPlugin, /MessageDigest\.getInstance\("SHA-256"\)/);
assert.match(sources.mainActivity, /registerPlugin\(WanderCloudIdentityPlugin\.class\)/);
assert.match(sources.cloudBackup, /wander\.personalPOIs\.v1/);
assert.match(sources.cloudBackup, /wander\.sessions\.v1/);
assert.match(sources.cloudBackup, /wander\.travelLog\.entries\.v1/);
assert.match(sources.cloudBackup, /hasMeaningfulData/);
assert.match(sources.cloudBackup, /LAST_SUCCESS_KEY/);
assert.match(sources.cloudBackup, /LAST_ATTEMPT_KEY/);
assert.match(sources.cloudBackup, /PENDING_KEY/);
assert.match(sources.cloudBackup, /Último backup confirmado/);
assert.match(sources.cloudBackup, /Crear backup ahora/);
assert.match(sources.cloudBackup, /result\.contentHash && result\.contentHash !== backup\.contentHash/);
assert.match(sources.cloudBackupApi, /WANDER_BACKUPS/);
assert.match(sources.cloudBackupApi, /MAX_BODY_BYTES = 20 \* 1024 \* 1024/);
assert.match(sources.cloudProvisioner, /wander-travel-backups/);
assert.match(sources.cloudProvisioner, /kv_namespaces/);

assert.match(sources.travelLog, /window\.WanderTravelLog/);
assert.match(sources.travelLog, /contextChanges/);
assert.match(sources.travelLogScreen, /ensureMenuButton/);
assert.match(sources.travelLogScreen, /button\.dataset\.screenTarget = 'travel-log'/);
assert.match(sources.travelLogScreen, /movementItemsForDay/);
assert.match(sources.travelLogScreen, /Track entre detenciones/);
assert.match(sources.travelLogScreen, /item\.from.*item\.to/s);
assert.match(sources.travelLogScreen, /showMovement/);
assert.match(sources.travelLogScreen, /WanderTracks\?\.displayLatLngs/);
assert.doesNotMatch(sources.travelLogScreen, /open\?\.\('routes'\)/);

assert.doesNotMatch(html, /v\d+\.\d+\.\d+/);
assert.doesNotMatch(serviceWorker, /wander-travel-v\d+/);
assert.match(serviceWorker, /if \(!response\.ok\) throw/);

for (const retiredPath of ['imports/wander', 'imports/wander-clean', 'imports/wander-v2', 'sync/wander', 'services/wander-web-acquisition']) {
  const absolute = path.join(REPOSITORY_ROOT, retiredPath);
  const hasFiles = fs.existsSync(absolute) && fs.readdirSync(absolute, { recursive: true, withFileTypes: true }).some((entry) => entry.isFile());
  assert.equal(hasFiles, false, `Retired Wander staging path is not empty: ${retiredPath}`);
}

console.log(`PASS Wander Web ${versionMatch[1]} / APK ${androidVersion.versionName} records every second with continuous stops, 24-hour recent tracks, stable direction, cloud backup, GPX downloads, and offline zoom fallback`);

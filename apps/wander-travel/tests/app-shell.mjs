import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY_ROOT = path.resolve(ROOT, '..', '..');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const versionRuntime = fs.readFileSync(path.join(ROOT, 'runtime-version.js'), 'utf8');
const nativeVersionRuntime = fs.readFileSync(path.join(ROOT, 'runtime-native-app-version.js'), 'utf8');
const nativeLocationRuntime = fs.readFileSync(path.join(ROOT, 'runtime-native-location-source.js'), 'utf8');
const sessionEngineRuntime = fs.readFileSync(path.join(ROOT, 'runtime-session-engine.js'), 'utf8');
const dashboardRuntime = fs.readFileSync(path.join(ROOT, 'runtime-context-dashboard.js'), 'utf8');
const contextPanelRuntime = fs.readFileSync(path.join(ROOT, 'runtime-context-panel.js'), 'utf8');
const placeHierarchyRuntime = fs.readFileSync(path.join(ROOT, 'runtime-place-hierarchy.js'), 'utf8');
const placeHierarchyDashboardRuntime = fs.readFileSync(path.join(ROOT, 'runtime-place-hierarchy-dashboard.js'), 'utf8');
const placeHierarchyPanelRuntime = fs.readFileSync(path.join(ROOT, 'runtime-place-hierarchy-panel.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
const packageManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const androidVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'android-version.json'), 'utf8'));
const androidBuild = fs.readFileSync(path.join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');
const nativePlugin = fs.readFileSync(path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'app', 'wandertravel', 'mobile', 'WanderLocationPlugin.java'), 'utf8');
const mapCore = fs.readFileSync(path.join(ROOT, 'runtime-map-core.js'), 'utf8');
const mapRuntime = fs.readFileSync(path.join(ROOT, 'runtime-map.js'), 'utf8');
const mapControls = fs.readFileSync(path.join(ROOT, 'runtime-map-controls.js'), 'utf8');
const tracksRuntime = fs.readFileSync(path.join(ROOT, 'runtime-tracks.js'), 'utf8');
const pointsRuntime = fs.readFileSync(path.join(ROOT, 'runtime-points-screen.js'), 'utf8');
const sessionsCss = fs.readFileSync(path.join(ROOT, 'wander-sessions.css'), 'utf8');
const pointsCss = fs.readFileSync(path.join(ROOT, 'wander-points-screen.css'), 'utf8');
const dashboardCss = fs.readFileSync(path.join(ROOT, 'wander-context-dashboard.css'), 'utf8');
const messageCss = fs.readFileSync(path.join(ROOT, 'wander-message-top.css'), 'utf8');
const uiRuntime = fs.readFileSync(path.join(ROOT, 'runtime-ui.js'), 'utf8');
const capacitorConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8'));

function localReferences(source) {
  return [...source.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1].split(/[?#]/)[0].replace(/^\.\//, ''))
    .filter((reference) => reference && !/^https?:\/\//.test(reference));
}

const htmlReferences = new Set(localReferences(html));
htmlReferences.add('index.html');

for (const reference of htmlReferences) {
  assert.equal(fs.existsSync(path.join(ROOT, reference)), true, `Missing shell asset: ${reference}`);
}

const cached = new Set(
  [...serviceWorker.matchAll(/["']\.\/([^"']+)["']/g)].map((match) => match[1])
);

for (const reference of htmlReferences) {
  assert.equal(cached.has(reference), true, `Shell asset is not cached: ${reference}`);
}

for (const file of fs.readdirSync(ROOT)) {
  const absolute = path.join(ROOT, file);
  if (!fs.statSync(absolute).isFile()) continue;
  if (file.endsWith('.js') && file !== 'sw.js') {
    assert.equal(htmlReferences.has(file), true, `Unloaded JavaScript file: ${file}`);
  }
  if (file.endsWith('.css')) {
    assert.equal(htmlReferences.has(file), true, `Unloaded stylesheet: ${file}`);
  }
}

const versionMatch = versionRuntime.match(/const VERSION = '(v\d+\.\d+\.\d+)'/);
assert.ok(versionMatch, 'runtime-version.js must define the web app version');
assert.equal(manifest.start_url, `./?app=${versionMatch[1]}`, 'Manifest start URL must follow the web version');
assert.equal(packageManifest.version, versionMatch[1].slice(1), 'package.json must follow the web version');
assert.match(versionRuntime, /app\.webVersion/, 'The web version must have its own context key');
assert.equal(androidVersion.versionName, '0.4.0', 'The GPX-capable Android shell must be APK 0.4.0');
assert.equal(androidVersion.versionCode, 8, 'APK 0.4.0 must update over APK 0.3.0');
assert.match(androidBuild, /android-version\.json/, 'Gradle must read the separate Android version source');
assert.match(nativePlugin, /void getAppInfo\(PluginCall call\)/, 'The native bridge must expose APK metadata');
assert.match(nativePlugin, /PackageInfo packageInfo/, 'The APK version must come from the installed Android package');
assert.match(nativePlugin, /packageInfo\.getLongVersionCode\(\)/, 'The native version code must support current Android versions');
assert.match(nativeVersionRuntime, /MAX_ATTEMPTS/, 'APK version detection must retry while Capacitor initializes');
assert.match(nativeVersionRuntime, /visibilitychange/, 'APK version detection must refresh when the app returns');
assert.match(nativeVersionRuntime, /app\.apkVersionStatus/, 'APK version detection must publish a diagnostic status');
assert.match(dashboardRuntime, /label: 'Versión Web'/, 'The dashboard must expose the web version separately');
assert.match(dashboardRuntime, /label: 'Versión APK'/, 'The dashboard must expose the APK version separately');
assert.match(contextPanelRuntime, /'apkVersion'/, 'Contexto must allow selecting the APK version for the dashboard');
assert.match(placeHierarchyRuntime, /function personalCandidates\(/, 'Place hierarchy must evaluate personal POIs');
assert.match(placeHierarchyRuntime, /function specificCandidates\(/, 'Place hierarchy must evaluate specific POIs');
assert.match(placeHierarchyRuntime, /function containerCandidates\(/, 'Place hierarchy must evaluate containing places');
assert.match(placeHierarchyRuntime, /scoreBreakdown/, 'Place selection must expose an explainable score');
assert.match(placeHierarchyRuntime, /SWITCH_MARGIN/, 'Place selection must include a continuity margin');
assert.match(placeHierarchyRuntime, /placeHierarchy\.diagnostics/, 'Place diagnostics must enter WanderContext');
assert.match(placeHierarchyRuntime, /\[personal, specific, container, zone, city, country\]/, 'Place hierarchy must preserve every geographic level');
assert.match(placeHierarchyDashboardRuntime, /label: 'Lugar actual'/, 'Dashboard must expose the selected place');
assert.match(placeHierarchyDashboardRuntime, /label: 'POI específico'/, 'Dashboard must expose the specific POI');
assert.match(placeHierarchyDashboardRuntime, /label: 'Contenedor'/, 'Dashboard must expose the containing place');
assert.match(placeHierarchyDashboardRuntime, /label: 'Confianza del lugar'/, 'Dashboard must expose place confidence');
assert.match(placeHierarchyPanelRuntime, /Diagnóstico de lugar/, 'Contexto must display place decision diagnostics');
assert.match(placeHierarchyPanelRuntime, /Candidatos \(/, 'Contexto must list scored place candidates');
assert.doesNotMatch(html, /v\d+\.\d+\.\d+/, 'index.html must not duplicate the web version');
assert.doesNotMatch(serviceWorker, /wander-travel-v\d+/, 'sw.js must derive its cache name from runtime-version.js');
assert.match(mapCore, /const currentTrack = L\.polyline/, 'The map must provide a dedicated current-session route layer');
assert.match(mapCore, /currentTrack,/, 'The current-session layer must be exposed by WanderMapCore');
assert.match(mapRuntime, /currentTrack: core\.currentTrack/, 'WanderBase must expose the current-session layer');
assert.match(tracksRuntime, /CURRENT_TRACK_VISIBLE_KEY/, 'Current-route visibility must persist between app openings');
assert.match(tracksRuntime, /id="session-map-toggle"/, 'Recorridos must include a current-route visibility switch');
assert.match(tracksRuntime, /currentLine\.setLatLngs\(latLngs\)/, 'The current route must update live from session points');
assert.match(tracksRuntime, /currentTrackVisible \? currentLatLngs\(snapshot\?\.active\) : \[\]/, 'Hiding the current route must remove it from the map without deleting session data');
assert.match(tracksRuntime, /sessions\.currentTrackVisible/, 'The route visibility state must enter WanderContext');
assert.match(sessionEngineRuntime, /id: 'precise'.*intervalSec: 2, distanceM: 2/, 'A precise recording preset must exist');
assert.match(sessionEngineRuntime, /id: 'balanced'.*intervalSec: 5, distanceM: 5/, 'A balanced recording preset must exist');
assert.match(sessionEngineRuntime, /id: 'vehicle'.*intervalSec: 3, distanceM: 10/, 'A vehicle recording preset must exist');
assert.match(sessionEngineRuntime, /id: 'saver'.*intervalSec: 15, distanceM: 20/, 'A battery-saving recording preset must exist');
assert.match(sessionEngineRuntime, /id: 'manual'/, 'A manual recording profile must exist');
assert.match(sessionEngineRuntime, /elapsedMs < config\.intervalSec \* 1000/, 'Recorded points must honor the configured time threshold');
assert.match(sessionEngineRuntime, /distance < config\.distanceM/, 'Recorded points must honor the configured distance threshold');
assert.match(sessionEngineRuntime, /\(distance \/ 1000\) \/ \(elapsedMs \/ 3600000\)/, 'Plausibility filtering must calculate speed in km/h');
assert.match(sessionEngineRuntime, /sessions\.recordingIntervalSec/, 'Recording settings must enter WanderContext');
assert.match(nativeLocationRuntime, /RECORDING_KEY = 'wander\.recording\.profile\.v1'/, 'Android sampling must read the persisted recording profile');
assert.match(nativeLocationRuntime, /minimumIntervalMs:.*intervalSec.*\* 1000/s, 'Android GPS sampling must use the selected time threshold');
assert.match(nativeLocationRuntime, /minimumDistanceM:.*distanceM/s, 'Android GPS sampling must use the selected distance threshold');
assert.match(nativeLocationRuntime, /wander:recording-profile-changed/, 'Android GPS sampling must update immediately when the profile changes');
assert.match(tracksRuntime, /id="session-recording-profile"/, 'Recorridos must expose the recording profile selector');
assert.match(tracksRuntime, /id="session-recording-interval"/, 'Manual mode must expose the time field');
assert.match(tracksRuntime, /id="session-recording-distance"/, 'Manual mode must expose the distance field');
assert.match(sessionsCss, /\.session-recording-card/, 'Recording profile controls must be styled');
assert.match(pointsRuntime, /<wpt lat=/, 'Personal points must export as GPX waypoints');
assert.match(pointsRuntime, /wander:radiusM/, 'Wander-specific point attributes must be preserved in GPX extensions');
assert.match(pointsRuntime, /duplicateKey/, 'GPX import must detect duplicate names and coordinates');
assert.match(pointsRuntime, /id="points-export-gpx"/, 'Puntos must expose GPX export');
assert.match(pointsRuntime, /id="points-import-gpx"/, 'Puntos must expose GPX import');
assert.match(pointsCss, /\.points-transfer-toolbar/, 'GPX controls must be styled');
assert.match(nativePlugin, /void pickGpx\(PluginCall call\)/, 'Android must use the system file picker for GPX import');
assert.match(nativePlugin, /Intent\.ACTION_OPEN_DOCUMENT/, 'GPX import must not require broad storage access');
assert.match(nativePlugin, /void saveGpx\(PluginCall call\)/, 'Android must use the system document picker for GPX export');
assert.match(nativePlugin, /Intent\.ACTION_CREATE_DOCUMENT/, 'GPX export must allow Drive and user-selected destinations');
assert.match(mapControls, /installLockedPinchZoom/, 'Pinch zoom must use a locked anchor while following');
assert.match(mapControls, /centerForAnchor\(pinchAnchor, zoom\)/, 'Pinch zoom must calculate the center from the active user anchor');
assert.match(mapControls, /map\._move\(center, zoom, \{ pinch: true, round: false \}\)/, 'Pinch zoom must update around the fixed anchor during the gesture');
assert.match(mapControls, /residualTouchLock = Boolean\(event\.touches\?\.length\)/, 'Pinch completion must detect a finger that remains on screen');
assert.match(mapControls, /if \(residualTouchLock\) \{[\s\S]*?consumeTouch\(event\)/, 'Residual one-finger movement must be consumed after pinch completion');
assert.match(mapControls, /map\.dragging\.disable\(\)/, 'Map dragging must be cancelled when the second pinch finger arrives');
assert.match(mapControls, /map\.dragging\?\.enable\?\.\(\)/, 'Map dragging must resume only after every pinch finger is released');
assert.doesNotMatch(dashboardCss, /data-dashboard-field=["']appVersion["'][\s\S]{0,120}display:\s*none/, 'The web version field must remain visible on mobile dashboards');
assert.match(messageCss, /\.wander-card\s*\{[\s\S]*?top:\s*0;/, 'Wander messages must open from the top edge');
assert.match(messageCss, /z-index:\s*115;/, 'Wander messages must cover the map header');
assert.match(uiRuntime, /configureChoices\(options\.choices\)/, 'Wander messages must support explicit choices');
assert.equal(capacitorConfig.server.url, 'https://wander-travel.pages.dev', 'Android shell must load the deployed Wander web app');
assert.equal(capacitorConfig.server.errorPath, 'index.html', 'Android shell must retain its bundled offline recovery');
assert.match(serviceWorker, /if \(!response\.ok\) throw/, 'A broken network asset must fall back to the last complete cache');

for (const retiredPath of [
  'imports/wander',
  'imports/wander-clean',
  'imports/wander-v2',
  'sync/wander',
  'services/wander-web-acquisition',
]) {
  const absolute = path.join(REPOSITORY_ROOT, retiredPath);
  const hasFiles = fs.existsSync(absolute) && fs.readdirSync(absolute, { recursive: true, withFileTypes: true })
    .some((entry) => entry.isFile());
  assert.equal(hasFiles, false, `Retired Wander staging path is not empty: ${retiredPath}`);
}

console.log(`PASS Wander Web ${versionMatch[1]} / APK ${androidVersion.versionName} app shell is consistent`);

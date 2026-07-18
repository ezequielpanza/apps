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
const dashboardRuntime = fs.readFileSync(path.join(ROOT, 'runtime-context-dashboard.js'), 'utf8');
const contextPanelRuntime = fs.readFileSync(path.join(ROOT, 'runtime-context-panel.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
const androidVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'android-version.json'), 'utf8'));
const androidBuild = fs.readFileSync(path.join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');
const nativePlugin = fs.readFileSync(path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'app', 'wandertravel', 'mobile', 'WanderLocationPlugin.java'), 'utf8');
const mapControls = fs.readFileSync(path.join(ROOT, 'runtime-map-controls.js'), 'utf8');
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
assert.match(versionRuntime, /app\.webVersion/, 'The web version must have its own context key');
assert.equal(androidVersion.versionName, '0.3.0', 'The native APK line must start at 0.3.0');
assert.ok(Number.isInteger(androidVersion.versionCode) && androidVersion.versionCode > 6, 'Android versionCode must remain upgrade-compatible');
assert.match(androidBuild, /android-version\.json/, 'Gradle must read the separate Android version source');
assert.match(nativePlugin, /void getAppInfo\(PluginCall call\)/, 'The native bridge must expose APK metadata');
assert.match(nativePlugin, /BuildConfig\.VERSION_NAME/, 'The APK version must come from the installed native package');
assert.match(nativeVersionRuntime, /plugin\.getAppInfo\(\)/, 'The web runtime must query the installed APK version');
assert.match(nativeVersionRuntime, /app\.apkVersion/, 'The installed APK version must enter WanderContext');
assert.match(dashboardRuntime, /label: 'Versión Web'/, 'The dashboard must expose the web version separately');
assert.match(dashboardRuntime, /label: 'Versión APK'/, 'The dashboard must expose the APK version separately');
assert.match(contextPanelRuntime, /'apkVersion'/, 'Contexto must allow selecting the APK version for the dashboard');
assert.doesNotMatch(html, /v\d+\.\d+\.\d+/, 'index.html must not duplicate the web version');
assert.doesNotMatch(serviceWorker, /wander-travel-v\d+/, 'sw.js must derive its cache name from runtime-version.js');
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

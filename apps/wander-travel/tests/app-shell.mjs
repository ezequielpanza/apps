import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY_ROOT = path.resolve(ROOT, '..', '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

const html = read('index.html');
const serviceWorker = read('sw.js');
const versionRuntime = read('runtime-version.js');
const manifest = JSON.parse(read('manifest.webmanifest'));
const packageManifest = JSON.parse(read('package.json'));
const androidVersion = JSON.parse(read('android-version.json'));
const capacitorConfig = JSON.parse(read('capacitor.config.json'));
const memoryRepository = read('runtime-memory-repository.js');
const engineState = read('runtime-engine-state.js');
const interactionCore = read('runtime-interaction-core.js');
const interactionPanel = read('runtime-interaction-panel.js');
const companion = read('runtime-companion.js');
const companionPolicy = read('runtime-companion-policy.js');
const proactiveCompanion = read('runtime-proactive-companion.js');
const interactionCss = read('wander-interaction.css');
const mapControls = read('runtime-map-controls.js');
const pointsRuntime = read('runtime-points-screen.js');
const tracksRuntime = read('runtime-tracks.js');
const sessionEngine = read('runtime-session-engine.js');
const platformRuntime = read('runtime-platform.js');
const settingsRuntime = read('runtime-message-timeout-settings.js');
const notificationPlugin = read('android/app/src/main/java/app/wandertravel/mobile/WanderNotificationPlugin.java');
const mainActivity = read('android/app/src/main/java/app/wandertravel/mobile/MainActivity.java');

function localReferences(source) {
  return [...source.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1].split(/[?#]/)[0].replace(/^\.\//, ''))
    .filter((reference) => reference && !/^https?:\/\//.test(reference));
}

const htmlReferences = new Set(localReferences(html));
htmlReferences.add('index.html');
const cached = new Set([...serviceWorker.matchAll(/["']\.\/([^"']+)["']/g)].map((match) => match[1]));

for (const reference of htmlReferences) {
  assert.equal(fs.existsSync(path.join(ROOT, reference)), true, `Missing shell asset: ${reference}`);
  assert.equal(cached.has(reference), true, `Shell asset is not cached: ${reference}`);
}

for (const file of fs.readdirSync(ROOT)) {
  const absolute = path.join(ROOT, file);
  if (!fs.statSync(absolute).isFile()) continue;
  if (file.endsWith('.js') && file !== 'sw.js') assert.equal(htmlReferences.has(file), true, `Unloaded JavaScript file: ${file}`);
  if (file.endsWith('.css')) assert.equal(htmlReferences.has(file), true, `Unloaded stylesheet: ${file}`);
}

const versionMatch = versionRuntime.match(/const VERSION = '(v\d+\.\d+\.\d+)'/);
assert.ok(versionMatch, 'runtime-version.js must define the web version');
assert.equal(versionMatch[1], 'v0.104.2');
assert.equal(manifest.start_url, './?app=v0.104.2');
assert.equal(packageManifest.version, '0.104.2');
assert.equal(androidVersion.versionName, '0.6.0');
assert.equal(androidVersion.versionCode, 10);
assert.equal(capacitorConfig.server.url, 'https://wander-travel.pages.dev');
assert.equal(capacitorConfig.server.errorPath, 'index.html');

assert.match(notificationPlugin, /name = "WanderNotifications"/);
assert.match(notificationPlugin, /void checkPermission\(PluginCall call\)/);
assert.match(notificationPlugin, /void requestPermission\(PluginCall call\)/);
assert.match(notificationPlugin, /ACTION_APP_NOTIFICATION_SETTINGS/);
assert.match(notificationPlugin, /result\.put\("delivered", false\)/);
assert.match(notificationPlugin, /NotificationManagerCompat\.from\(getContext\(\)\)\.areNotificationsEnabled\(\)/);
assert.match(mainActivity, /registerPlugin\(WanderNotificationPlugin\.class\)/);
assert.match(platformRuntime, /refreshNotificationPermission/);
assert.match(platformRuntime, /requestNotificationPermission/);
assert.match(platformRuntime, /deliverNotification/);
assert.match(platformRuntime, /notificationState\.granted === true/);
assert.match(settingsRuntime, /Notificaciones de Wander/);
assert.match(settingsRuntime, /Activar notificaciones/);
assert.match(settingsRuntime, /Enviar prueba/);
assert.match(settingsRuntime, /Dejá que Wander te avise/);

assert.match(memoryRepository, /indexedDB\.open\(DB_NAME, DB_VERSION\)/);
assert.match(memoryRepository, /migratedFrom: LEGACY_STATE_KEY/);
assert.match(memoryRepository, /randomId\('user'\)/);
assert.match(memoryRepository, /randomId\('device'\)/);
assert.match(memoryRepository, /recordInteraction/);
assert.match(memoryRepository, /recordSignal/);
assert.match(engineState, /schemaVersion: 2/);
assert.match(engineState, /repository\?\.saveState/);
assert.match(engineState, /function learnPreference\(/);

assert.match(interactionCore, /\['observe', 'inform', 'suggest', 'ask', 'warn'\]/);
assert.match(interactionCore, /function recordDecision\(/);
assert.match(interactionCore, /function respond\(/);
assert.match(html, /data-screen-target="companion"/);
assert.match(html, /id="companion-history-list"/);
assert.match(interactionPanel, /Perfil local anónimo/);
assert.match(interactionPanel, /interaction_presented/);
assert.match(interactionCss, /\.wander-card-choices/);
assert.match(interactionCss, /\.companion-history-item/);

assert.match(companionPolicy, /interactionType: 'inform'/);
assert.match(companionPolicy, /interactionType: 'suggest'/);
assert.match(companion, /label: 'Llévame'/);
assert.match(companion, /label: 'Contame más'/);
assert.match(companion, /label: 'Otra opción'/);
assert.match(companion, /label: 'Ahora no'/);
assert.match(companion, /learnPreference/);
assert.match(proactiveCompanion, /learnedPreferenceScore/);
assert.match(proactiveCompanion, /function requestAlternative\(/);
assert.match(proactiveCompanion, /PLACE_STABILITY_MS = 12000/);
assert.match(proactiveCompanion, /SUGGESTION_COOLDOWN_MS = 10 \* 60 \* 1000/);

assert.match(mapControls, /installLockedPinchZoom/);
assert.match(pointsRuntime, /id="points-export-gpx"/);
assert.match(pointsRuntime, /id="points-import-gpx"/);
assert.match(tracksRuntime, /id="session-map-toggle"/);
assert.match(sessionEngine, /id: 'precise'.*intervalSec: 2, distanceM: 2/);
assert.match(sessionEngine, /id: 'manual'/);
assert.doesNotMatch(html, /v\d+\.\d+\.\d+/);
assert.doesNotMatch(serviceWorker, /wander-travel-v\d+/);
assert.match(serviceWorker, /if \(!response\.ok\) throw/);

for (const retiredPath of ['imports/wander', 'imports/wander-clean', 'imports/wander-v2', 'sync/wander', 'services/wander-web-acquisition']) {
  const absolute = path.join(REPOSITORY_ROOT, retiredPath);
  const hasFiles = fs.existsSync(absolute) && fs.readdirSync(absolute, { recursive: true, withFileTypes: true }).some((entry) => entry.isFile());
  assert.equal(hasFiles, false, `Retired Wander staging path is not empty: ${retiredPath}`);
}

console.log(`PASS Wander Web ${versionMatch[1]} / APK ${androidVersion.versionName} notification permission shell is consistent`);
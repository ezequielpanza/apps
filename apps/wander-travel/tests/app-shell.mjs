import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY_ROOT = path.resolve(ROOT, '..', '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

const html = read('index.html');
const app = read('app.js');
const contextInit = read('runtime-context-init.js');
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
    /(?:script\.src|link\.href)\s*=\s*["']\.\/?([^"']+)["']/g,
    /loadScript\(\s*["']\.\/?([^"']+)["']/g,
    /ensureStyles\(\s*["']\.\/?([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) target.add(match[1].split(/[?#]/)[0]);
  }
}

const loaded = new Set(localReferences(html));
addDynamicReferences(loaded, platform);
addDynamicReferences(loaded, app);
addDynamicReferences(loaded, contextInit);
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
const webVersion = versionMatch[1];
assert.equal(manifest.start_url, `./?app=${webVersion}`);
assert.equal(packageManifest.version, webVersion.slice(1));
assert.match(androidVersion.versionName, /^0\.11\.\d+$/);
assert.ok(Number.isInteger(androidVersion.versionCode) && androidVersion.versionCode > 0);
assert.equal(capacitorConfig.webDir, 'mobile-dist');
assert.equal(capacitorConfig.server, undefined, 'Android must start from bundled assets instead of a remote URL');
assert.equal(capacitorConfig.plugins?.CapacitorHttp?.enabled, true);

const simulator = read('runtime-provider-simulator.js');
const bitacoraMode = read('runtime-bitacora-tree-mode.js');
const unifiedLog = read('runtime-unified-travel-log.js');
const mapCacheSettings = read('runtime-map-cache-settings.js');
const directionSettings = read('runtime-direction-indicator-settings.js');
const ui = read('runtime-ui.js');
const mainActivity = read('android/app/src/main/java/app/wandertravel/mobile/MainActivity.java');
const ttsPlugin = read('android/app/src/main/java/app/wandertravel/mobile/WanderTTSPlugin.java');
const mobileBuild = read('mobile/build-web.mjs');

assert.match(contextInit, /wanderRecordingGateInstalled/);
assert.match(contextInit, /elapsedMs < 1000/);
assert.match(contextInit, /balanced: \{ intervalSec: 5, distanceM: 5 \}/);
assert.match(contextInit, /distanceReached/);
assert.match(versionRuntime, /recordingProfileDefault', 'balanced'/);
assert.match(versionRuntime, /recordingDefaultIntervalSec', 5/);
assert.match(versionRuntime, /recordingDefaultDistanceM', 5/);
assert.match(versionRuntime, /recordingMaximumFrequencyHz', 1/);

assert.match(simulator, /VISUAL_TICK_MS = 200/);
assert.doesNotMatch(simulator, /WanderTracks\?\.addPoint/);
assert.match(simulator, /session recording gate owns/);

assert.match(bitacoraMode, /WanderUnifiedTravelLog/);
assert.match(bitacoraMode, /content\.hidden = false/);
assert.doesNotMatch(bitacoraMode, /appendChild\(trackList\)/);
assert.match(unifiedLog, /utl-day/);
assert.match(unifiedLog, /utl-episode/);
assert.match(unifiedLog, /utl-activity/);
assert.match(unifiedLog, /sessionTracks\(\)/);
assert.match(mapCacheSettings, /Grabación y Bitácora/);
assert.match(mapCacheSettings, /wander-clean-bitacora-style/);
assert.match(mapCacheSettings, /máximo 1 punto\/s/);

assert.match(ui, /DEFAULT_MESSAGE_TIMEOUT_MS = 5000/);
assert.match(versionRuntime, /MESSAGE_TIMEOUT_MIGRATION_KEY/);
assert.match(versionRuntime, /localStorage\.setItem\(MESSAGE_TIMEOUT_KEY, '5000'\)/);

assert.match(directionSettings, /window\.WanderTTS/);
assert.match(directionSettings, /wander-tts-map-action/);
assert.match(directionSettings, /wrap\.prepend\(button\)/);
assert.match(directionSettings, /wander:interaction-change/);
assert.match(mainActivity, /registerPlugin\(WanderTTSPlugin\.class\)/);
assert.match(ttsPlugin, /@CapacitorPlugin\(name = "WanderTTS"\)/);
assert.match(ttsPlugin, /TextToSpeech/);
assert.match(ttsPlugin, /public void speak\(PluginCall call\)/);
assert.match(ttsPlugin, /public void stop\(PluginCall call\)/);

assert.match(mobileBuild, /entry\.isFile\(\)/);
assert.match(mobileBuild, /assetExtensions/);
assert.match(mobileBuild, /entry\.name === 'sw\.js'/);
assert.match(mobileBuild, /__WANDER_DISABLE_SERVICE_WORKER__/);

for (const retiredPath of ['imports/wander', 'imports/wander-clean', 'imports/wander-v2', 'sync/wander', 'services/wander-web-acquisition']) {
  const absolute = path.join(REPOSITORY_ROOT, retiredPath);
  const hasFiles = fs.existsSync(absolute) && fs.readdirSync(absolute, { recursive: true, withFileTypes: true }).some((entry) => entry.isFile());
  assert.equal(hasFiles, false, `Retired Wander staging path is not empty: ${retiredPath}`);
}

console.log(`PASS Wander Web ${webVersion} / APK ${androidVersion.versionName}: balanced recording gate, smooth simulator, unified Bitácora, 5-second messages and TTS map control`);

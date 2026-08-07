import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

function refs(source) {
  const found = new Set([...source.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((m) => m[1].split(/[?#]/)[0].replace(/^\.\//, ''))
    .filter((v) => v && !/^https?:\/\//.test(v)));
  for (const pattern of [
    /(?:script\.src|link\.href)\s*=\s*["']\.\/([^"']+)["']/g,
    /loadScript\(\s*["'](?:\.\/)?([^"']+)["']/g,
    /ensureStyles\(\s*["'](?:\.\/)?([^"']+)["']/g,
  ]) for (const m of source.matchAll(pattern)) found.add(m[1].split(/[?#]/)[0]);
  return found;
}

const loaded = new Set(['index.html']);
for (const source of [html, platform, app, contextInit]) for (const ref of refs(source)) loaded.add(ref);
const cached = new Set([...serviceWorker.matchAll(/["']\.\/([^"']+)["']/g)].map((m) => m[1]));
const onlineOnly = new Set(['runtime-cloud-backup.js', 'wander-cloud-backup.css']);
for (const ref of loaded) {
  assert.ok(fs.existsSync(path.join(ROOT, ref)), `Missing shell asset: ${ref}`);
  if (!onlineOnly.has(ref)) assert.ok(cached.has(ref), `Shell asset is not cached: ${ref}`);
}

const version = versionRuntime.match(/const VERSION = '(v\d+\.\d+\.\d+)'/)?.[1];
assert.ok(version);
assert.equal(manifest.start_url, `./?app=${version}`);
assert.equal(packageManifest.version, version.slice(1));
assert.match(androidVersion.versionName, /^\d+\.\d+\.\d+$/);
assert.ok(Number.isInteger(androidVersion.versionCode) && androidVersion.versionCode > 0);
assert.equal(capacitorConfig.webDir, 'mobile-dist');
assert.equal(capacitorConfig.server, undefined);

const direction = read('runtime-direction-indicator.js');
const simulator = read('runtime-provider-simulator.js');
const resilience = read('runtime-resilience-fixes.js');
const location = read('runtime-provider-location.js');
const rawRecorder = read('runtime-raw-location-recorder.js');
const tree = read('runtime-track-tree-ui.js');
const treeMode = read('runtime-bitacora-tree-mode.js');

assert.match(contextInit, /WanderStableDirectionMarker/);
assert.match(contextInit, /disabled: true/);
assert.match(direction, /thresholdKmh: 5/);
assert.match(direction, /className: 'wander-direction-marker'/);
assert.doesNotMatch(direction, /wander-stable-direction-marker/);

assert.match(simulator, /function publishMotion\(/);
assert.match(simulator, /context\.setMotion/);
assert.match(simulator, /source: 'simulator'/);
assert.match(simulator, /setInterval\(tick, 100\)/);
assert.match(resilience, /function enforceSimulatorAuthority\(/);
assert.match(resilience, /entry\?\.source !== 'simulator'/);
assert.match(rawRecorder, /context\.getEffectiveLocation/);

assert.match(location, /reason: 'raw-capture'/);
assert.match(location, /stabilizationRequired: false/);
assert.match(location, /accepted-suspicious/);
assert.doesNotMatch(location, /isolated-jump/);

assert.match(tree, /Días → Episodios → Actividades → Tracks/);
assert.match(treeMode, /travel-log-tree-host/);
assert.match(treeMode, /Lo que pasó hoy/);
assert.match(treeMode, /WanderTrackTreeUI\?\.render/);

for (const asset of [
  'runtime-map-zoom-buttons.js', 'runtime-resilience-fixes.js', 'runtime-raw-location-recorder.js',
  'runtime-track-intelligence.js', 'runtime-track-intelligence-poller.js', 'runtime-track-review-ui.js',
  'runtime-track-tree-ui.js', 'runtime-bitacora-tree-mode.js', 'runtime-unified-travel-log.js',
  'runtime-active-track-log-bridge.js',
]) assert.ok(cached.has(asset), `Offline shell must cache ${asset}`);

console.log(`PASS Wander Web ${version} / APK ${androidVersion.versionName}: single direction marker, authoritative simulator motion, tree Bitácora and complete offline tracking shell`);

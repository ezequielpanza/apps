import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY_ROOT = path.resolve(ROOT, '..', '..');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const versionRuntime = fs.readFileSync(path.join(ROOT, 'runtime-version.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
const mapControls = fs.readFileSync(path.join(ROOT, 'runtime-map-controls.js'), 'utf8');
const messageCss = fs.readFileSync(path.join(ROOT, 'wander-message-top.css'), 'utf8');
const uiRuntime = fs.readFileSync(path.join(ROOT, 'runtime-ui.js'), 'utf8');

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
assert.ok(versionMatch, 'runtime-version.js must define the app version');
assert.equal(manifest.start_url, `./?app=${versionMatch[1]}`, 'Manifest start URL must follow the app version');
assert.doesNotMatch(html, /v\d+\.\d+\.\d+/, 'index.html must not duplicate the app version');
assert.doesNotMatch(serviceWorker, /wander-travel-v\d+/, 'sw.js must derive its cache name from runtime-version.js');
assert.match(mapControls, /restoreFollowAfterPinch/, 'Pinch zoom must preserve active map following');
assert.match(mapControls, /position\.setFollowMode\(true, \{ centerNow: false \}\)/, 'Pinch zoom must restore the selected center anchor');
assert.match(messageCss, /\.wander-card\s*\{[\s\S]*?top:\s*0;/, 'Wander messages must open from the top edge');
assert.match(messageCss, /z-index:\s*115;/, 'Wander messages must cover the map header');
assert.match(uiRuntime, /configureChoices\(options\.choices\)/, 'Wander messages must support explicit choices');

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

console.log(`PASS Wander ${versionMatch[1]} app shell is consistent`);

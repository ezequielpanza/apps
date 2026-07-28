import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(mobileDirectory, '..');
const destination = path.join(root, 'mobile-dist');
const assetExtensions = new Set(['.html', '.css', '.js', '.svg', '.webmanifest', '.png']);
const leafletRoot = path.join(destination, 'vendor', 'leaflet');
const LEAFLET_VERSION = '1.9.4';
const LEAFLET_BASE = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist`;
const leafletAssets = [
  { path: 'leaflet.js', url: `${LEAFLET_BASE}/leaflet.js`, sha256: '20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=' },
  { path: 'leaflet.css', url: `${LEAFLET_BASE}/leaflet.css`, sha256: 'p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=' },
  { path: 'images/marker-icon.png', url: `${LEAFLET_BASE}/images/marker-icon.png` },
  { path: 'images/marker-icon-2x.png', url: `${LEAFLET_BASE}/images/marker-icon-2x.png` },
  { path: 'images/marker-shadow.png', url: `${LEAFLET_BASE}/images/marker-shadow.png` },
  { path: 'images/layers.png', url: `${LEAFLET_BASE}/images/layers.png` },
  { path: 'images/layers-2x.png', url: `${LEAFLET_BASE}/images/layers-2x.png` },
];

const nativeServiceWorkerReset = `<script>
(() => {
  window.__WANDER_DISABLE_SERVICE_WORKER__ = true;
  if (!("serviceWorker" in navigator)) return;

  const CACHE_RESET_KEY = "wander.native.service-worker-cache-reset.v1";
  const RELOAD_KEY = "wander.native.service-worker-reload.v1";
  const hadController = Boolean(navigator.serviceWorker.controller);
  let clearCaches = true;
  try { clearCaches = localStorage.getItem(CACHE_RESET_KEY) !== "done"; } catch {}

  const unregister = navigator.serviceWorker.getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())));
  const removeCaches = clearCaches && "caches" in window
    ? caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
    : Promise.resolve();

  Promise.all([unregister, removeCaches]).then(() => {
    try { localStorage.setItem(CACHE_RESET_KEY, "done"); } catch {}
    if (!hadController) return;
    try {
      if (sessionStorage.getItem(RELOAD_KEY) === "done") return;
      sessionStorage.setItem(RELOAD_KEY, "done");
    } catch {}
    window.location.reload();
  }).catch(() => {});
})();
</script>`;

function copyRootAssets() {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !assetExtensions.has(path.extname(entry.name))) continue;
    if (entry.name === 'sw.js') continue;
    fs.copyFileSync(path.join(root, entry.name), path.join(destination, entry.name));
  }
}

async function downloadAsset(asset) {
  const response = await fetch(asset.url, { headers: { 'user-agent': 'WanderTravelBuild/0.109.4' } });
  if (!response.ok) throw new Error(`Could not download ${asset.url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (asset.sha256) {
    const digest = crypto.createHash('sha256').update(bytes).digest('base64');
    if (digest !== asset.sha256) throw new Error(`Integrity mismatch for ${asset.path}`);
  }
  const target = path.join(leafletRoot, asset.path);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
}

function rewriteMobileIndex() {
  const indexPath = path.join(destination, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  html = html
    .replace('<head>', `<head>\n${nativeServiceWorkerReset}`)
    .replace('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'vendor/leaflet/leaflet.css')
    .replace('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'vendor/leaflet/leaflet.js');
  fs.writeFileSync(indexPath, html);
}

function disableMobileServiceWorkerRegistration() {
  const appPath = path.join(destination, 'app.js');
  let source = fs.readFileSync(appPath, 'utf8');
  const originalGuard = "if (!('serviceWorker' in navigator)) return;";
  if (!source.includes(originalGuard)) throw new Error('Could not locate Wander service worker guard');
  source = source.replace(
    originalGuard,
    "if (window.__WANDER_DISABLE_SERVICE_WORKER__ || !('serviceWorker' in navigator)) return;"
  );
  fs.writeFileSync(appPath, source);
}

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
copyRootAssets();
await Promise.all(leafletAssets.map(downloadAsset));
rewriteMobileIndex();
disableMobileServiceWorkerRegistration();

console.log(`Prepared ${fs.readdirSync(destination).length} Wander web assets with Leaflet ${LEAFLET_VERSION} bundled and native service workers disabled`);

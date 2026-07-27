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

function copyRootAssets() {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !assetExtensions.has(path.extname(entry.name))) continue;
    fs.copyFileSync(path.join(root, entry.name), path.join(destination, entry.name));
  }
}

async function downloadAsset(asset) {
  const response = await fetch(asset.url, { headers: { 'user-agent': 'WanderTravelBuild/0.108.0' } });
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
    .replace('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'vendor/leaflet/leaflet.css')
    .replace('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'vendor/leaflet/leaflet.js');
  fs.writeFileSync(indexPath, html);
}

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
copyRootAssets();
await Promise.all(leafletAssets.map(downloadAsset));
rewriteMobileIndex();

console.log(`Prepared ${fs.readdirSync(destination).length} Wander web assets with Leaflet ${LEAFLET_VERSION} bundled for Android`);

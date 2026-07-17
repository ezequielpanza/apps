import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(mobileDirectory, '..');
const destination = path.join(root, 'mobile-dist');
const assetExtensions = new Set(['.html', '.css', '.js', '.svg', '.webmanifest']);

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isFile() || !assetExtensions.has(path.extname(entry.name))) continue;
  fs.copyFileSync(path.join(root, entry.name), path.join(destination, entry.name));
}

console.log(`Prepared ${fs.readdirSync(destination).length} Wander web assets for Android`);

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("builds the Sailward game shell", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /<title>Sailward · Real-time sailing<\/title>/i);
  assert.match(html, /SAILWARD/);
  assert.match(html, /Preparando el mundo/);
  assert.match(html, /Mapa mundial interactivo de Sailward/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/i);
});

test("keeps product version and offline voyage contract aligned", async () => {
  const [page, packageJson, version, publicVersion] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../VERSION", import.meta.url), "utf8"),
    readFile(new URL("../public/version.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const APP_VERSION = "0\.1\.0"/);
  assert.match(page, /sailward\.voyage/);
  assert.match(page, /open-meteo\.com/);
  assert.match(page, /tiles\.openseamap\.org/);
  assert.match(page, /pitch: 56/);
  assert.match(page, /Vista isométrica/);
  assert.equal(JSON.parse(packageJson).version, version.trim());
  assert.equal(JSON.parse(publicVersion).version, version.trim());
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("https://sailward.test/", {
      headers: { accept: "text/html", host: "sailward.test" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Sailward game shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
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

  assert.match(page, /const APP_VERSION = "0\.2\.0"/);
  assert.match(page, /sailward\.voyage/);
  assert.match(page, /open-meteo\.com/);
  assert.match(page, /tiles\.openseamap\.org/);
  assert.match(page, /pitch: 56/);
  assert.match(page, /autopilot/);
  assert.match(page, /polarEfficiency/);
  assert.match(page, /isOnLand/);
  assert.match(page, /sailboat-hull\.png/);
  assert.match(page, /const updateVoyage = useCallback\([\s\S]*change\(current\)/);
  assert.match(page, /Vista isométrica/);
  assert.equal(JSON.parse(packageJson).version, version.trim());
  assert.equal(JSON.parse(publicVersion).version, version.trim());
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import { feature } from "topojson-client";
import landTopology from "world-atlas/land-110m.json" with { type: "json" };

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

  assert.match(page, /const APP_VERSION = "0\.4\.0"/);
  assert.match(page, /boat-bearing-ring/);
  assert.match(page, /ROSA DE GRADOS/);
  assert.match(page, /\}, 50\); return \(\) => window\.clearInterval\(interval\);/);
  assert.match(page, /map-layer-settings/);
  assert.match(page, /brand-follow-button/);
  assert.match(page, /inventory-dock-tab/);
  assert.match(page, /winchLinePercentage/);
  assert.match(page, /winch-line-percent/);
  assert.match(page, /inventory-folder-toggle/);
  assert.match(page, /Eliminar carpeta/);
  assert.match(page, /sailward\.voyage/);
  assert.match(page, /open-meteo\.com/);
  assert.match(page, /tiles\.openseamap\.org/);
  assert.match(page, /World_Imagery\/MapServer/);
  assert.match(page, /satelliteLayer/);
  assert.match(page, /pitch: 56/);
  assert.match(page, /autopilot/);
  assert.match(page, /polarEfficiency/);
  assert.match(page, /isOnLand/);
  assert.match(page, /sailboat-hull\.png/);
  assert.match(page, /BOAT_SPRITE_SIZE_PX = 72/);
  assert.match(page, /pitchAlignment: "viewport"/);
  assert.match(page, /rotationAlignment: "viewport"/);
  assert.match(page, /rotateX\(42deg\)/);
  assert.match(page, /GPS de arranque temporal/);
  assert.match(page, /developerLatitude/);
  assert.match(page, /CENTRAR/);
  assert.match(page, /rudder: 0/);
  assert.match(page, /mainSail: 0, genoaSail: 0, mainSheet: 0, genoaSheet: 0, motor: 0/);
  assert.match(page, /const updateVoyage = useCallback\([\s\S]*change\(current\)/);
  assert.match(page, /lastMapCenterRef\.current !== centerKey/);
  assert.match(page, /followRef\.current = followBoat/);
  assert.match(page, /map\.on\("dragstart"/);
  assert.match(page, /Desactivar seguimiento del barco/);
  assert.match(page, /aria-pressed=\{followBoat\}/);
  assert.match(page, /map-tool-icon--satellite/);
  assert.match(page, /map-tool-icon--nautical/);
  assert.match(page, /map-tool-icon--follow/);
  assert.match(page, /sailward\.panelPositions\.v1/);
  assert.match(page, /data-floating-panel="voyage"/);
  assert.match(page, /data-floating-panel="conditions"/);
  assert.match(page, /data-floating-panel="helm"/);
  assert.match(page, /data-floating-panel="autopilot"/);
  assert.match(page, /data-floating-panel="anchor"/);
  assert.match(page, /data-floating-panel="rigging"/);
  assert.match(page, /data-floating-panel="compass"/);
  assert.match(page, /data-floating-panel="gps"/);
  assert.match(page, /data-floating-panel="wind"/);
  assert.match(page, /gpsNavigation/);
  assert.match(page, /apparentWind/);
  assert.match(page, /RUMBO GPS · COG/);
  assert.match(page, /VELOCIDAD GPS · SOG/);
  assert.match(page, /VIENTO REAL/);
  assert.match(page, /VIENTO APARENTE/);
  assert.match(page, /HEADING/);
  assert.match(page, /minimized-summary/);
  assert.match(page, /COG \{Math\.round\(gps\.course\)/);
  assert.match(page, /R \{conditions\.windKn\.toFixed\(1\)\} kn\//);
  assert.match(page, /beginPanelDrag/);
  assert.match(page, /setPointerCapture/);
  assert.match(page, /Mover ventana del timón/);
  assert.match(page, /sailward\.minimizedPanels\.v1/);
  assert.match(page, /togglePanelMinimized/);
  assert.match(page, /window-minimize-button/);
  assert.match(page, /Minimizar ventana de travesía/);
  assert.match(page, /Minimizar ventana de meteorología/);
  assert.match(page, /Minimizar ventana de velas/);
  assert.match(page, /Minimizar ventana del timón/);
  assert.match(page, /Minimizar ventana del piloto automático/);
  assert.match(page, /Minimizar ventana de ancla/);
  assert.match(page, /Minimizar ventana de superficies y líneas/);
  assert.match(page, /Minimizar ventana del compás/);
  assert.match(page, /Minimizar ventana GPS/);
  assert.match(page, /Minimizar ventana de viento/);
  assert.match(page, /sailward\.keybindings\.v1/);
  assert.match(page, /DEFAULT_KEY_BINDINGS[\s\S]*KeyA[\s\S]*KeyD/);
  assert.match(page, /event\.code === keyBindings\.rudderLeft/);
  assert.match(page, /event\.code === keyBindings\.rudderRight/);
  assert.match(page, /Abrir ajustes de Sailward/);
  assert.match(page, /Cambiar tecla para/);
  assert.match(page, /RESTAURAR A \/ D/);
  assert.match(page, /helm-layout/);
  assert.match(page, /helm-step-column/);
  assert.match(page, /−FULL/);
  assert.match(page, /\+FULL/);
  assert.match(page, /FIJAR HEADING ACTUAL/);
  assert.match(page, /MAX_ANCHOR_RODE_M = 160/);
  assert.match(page, /anchor1RodeM/);
  assert.match(page, /anchor2RodeM/);
  assert.match(page, /anchorIsHolding/);
  assert.match(page, /beginAnchorWinch/);
  assert.match(page, /LIBERAR ANCLA/);
  assert.match(page, /SUPERFICIES Y LÍNEAS/);
  assert.match(page, /DRIZA MAYOR/);
  assert.match(page, /ENROLLADOR GENOA/);
  assert.match(page, /ESCOTA MAYOR/);
  assert.match(page, /ESCOTA GENOA BABOR/);
  assert.match(page, /ESCOTA GENOA ESTRIBOR/);
  assert.match(page, /METEOROLOGÍA/);
  assert.match(page, /Viento real/);
  assert.match(page, /Información local en vivo/);
  assert.match(page, /data-floating-panel="depth"/);
  assert.match(page, /DEPTH SOUNDER/);
  assert.match(page, /Minimizar ventana de sonda de profundidad/);
  assert.match(page, /sailward\.depthAlarm\.v1/);
  assert.match(page, /Profundidad de alarma/);
  assert.match(page, /BAJA PROFUNDIDAD/);
  assert.match(page, /data-floating-panel="resources"/);
  assert.match(page, /RECURSOS Y BODEGA/);
  assert.match(page, /Reservas y mercancía próximamente/);
  assert.match(page, /waterReserveL/);
  assert.match(page, /sailward\.panelSizes\.v1/);
  assert.match(page, /panelResizeRef/);
  assert.match(page, /onDoubleClick/);
  assert.match(page, /document\.addEventListener\("dblclick", onDoubleClick\)/);
  assert.match(page, /floating-window-bar/);
  assert.match(page, /settings-danger-zone/);
  assert.match(page, /FINALIZAR SIMULACIÓN/);
  assert.match(page, /data-floating-panel="engine"/);
  assert.match(page, /PRESIÓN DE ACEITE/);
  assert.match(page, /Acelerador del motor/);
  assert.match(page, /engineRunning/);
  assert.match(page, /rudderSensitivity/);
  assert.match(page, /Sensibilidad de timón/);
  assert.match(page, /\* voyage\.rudderSensitivity/);
  assert.match(page, /min="-100" max="100"/);
  assert.match(page, /REVERSA/);
  assert.match(page, /Math\.abs\(throughWater\)/);
  assert.match(page, /BOAT_PROFILE_STORAGE_KEY/);
  assert.match(page, /PERFIL DE BARCO/);
  assert.match(page, /Velocidad máxima del motor/);
  assert.match(page, /Ángulo máximo de timón/);
  assert.match(page, /Velocidad de giro/);
  assert.match(page, /boatProfile\.motorMaxKn/);
  assert.match(page, /boatProfile\.rudderMaxDeg/);
  assert.match(page, /const isometricView = true/);
  assert.match(page, /minPitch: 56, maxPitch: 56/);
  assert.match(page, /touchPitch: false/);
  assert.doesNotMatch(page, /north-indicator/);
  assert.doesNotMatch(page, /Indicador de norte/);
  assert.doesNotMatch(page, /setIsometricView/);
  assert.equal(JSON.parse(packageJson).version, version.trim());
  assert.equal(JSON.parse(publicVersion).version, version.trim());
});

test("uses each land polygon when evaluating navigation collisions", () => {
  const collection = feature(landTopology, landTopology.objects.land);
  assert.equal(collection.type, "FeatureCollection");
  assert.ok(collection.features.length > 0);
  assert.doesNotThrow(() => collection.features.some((land) => booleanPointInPolygon(point([-15.4145, 28.1278]), land)));
});

"use client";
/* eslint-disable jsx-a11y/role-supports-aria-props */

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Map as MapInstance, Marker as MarkerInstance } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { feature } from "topojson-client";
import landTopology from "world-atlas/land-110m.json";

const APP_VERSION = "0.2.0";
const STORAGE_KEY = "sailward.voyage";
const LEGACY_STORAGE_KEY = "sailward.voyage.0.1.0";
const KEY_BINDINGS_STORAGE_KEY = "sailward.keybindings.v1";
const PANEL_POSITIONS_STORAGE_KEY = "sailward.panelPositions.v1";
const BASE_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const BOAT_SPRITE_SIZE_PX = 72;

type Port = { id: string; name: string; country: string; lat: number; lon: number; heading: number };
type TrailPoint = { lat: number; lon: number };
type Voyage = {
  portId: string; lat: number; lon: number; heading: number; rudder: number;
  mainSail: number; genoaSail: number; mainSheet: number; genoaSheet: number;
  motor: number; autopilot: boolean; targetHeading: number | null;
  speedKn: number; sailSpeedKn: number; distanceNm: number; grounded: boolean;
  trail: TrailPoint[]; startedAt: number; updatedAt: number;
};
type Conditions = {
  windKn: number; windDirection: number; waveHeight: number; currentKn: number;
  currentDirection: number; depthM: number; source: "live" | "estimated"; updatedAt: number;
};
type KeyBindingName = "rudderLeft" | "rudderRight";
type KeyBindings = Record<KeyBindingName, string>;
type FloatingPanelName = "voyage" | "conditions" | "sails" | "helm";
type PanelPosition = { x: number; y: number };
type PanelPositions = Partial<Record<FloatingPanelName, PanelPosition>>;
type PanelDrag = { panel: FloatingPanelName; offsetX: number; offsetY: number; width: number; height: number };

const DEFAULT_KEY_BINDINGS: KeyBindings = { rudderLeft: "KeyA", rudderRight: "KeyD" };

const PORTS: Port[] = [
  // Just outside the marina entrance: enough clear water for the first manoeuvre.
  { id: "las-palmas", name: "Las Palmas", country: "Islas Canarias", lat: 28.1278, lon: -15.4145, heading: 55 },
  { id: "miami", name: "Miami", country: "Estados Unidos", lat: 25.769, lon: -80.15, heading: 105 },
  { id: "barcelona", name: "Barcelona", country: "España", lat: 41.341, lon: 2.183, heading: 135 },
  { id: "cape-town", name: "Ciudad del Cabo", country: "Sudáfrica", lat: -33.899, lon: 18.433, heading: 320 },
  { id: "sydney", name: "Sídney", country: "Australia", lat: -33.844, lon: 151.238, heading: 75 },
  { id: "papeete", name: "Papeete", country: "Polinesia Francesa", lat: -17.535, lon: -149.565, heading: 330 },
  { id: "ushuaia", name: "Ushuaia", country: "Argentina", lat: -54.816, lon: -68.292, heading: 95 },
  { id: "singapore", name: "Singapur", country: "Singapur", lat: 1.247, lon: 103.86, heading: 110 },
];
const DEFAULT_CONDITIONS: Conditions = { windKn: 13, windDirection: 65, waveHeight: 0.9, currentKn: 0.4, currentDirection: 110, depthM: 42, source: "estimated", updatedAt: Date.now() };
const landFeatures = (feature(landTopology as never, (landTopology as { objects: { land: never } }).objects.land) as FeatureCollection<Polygon | MultiPolygon>).features;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;
const normalizeHeading = (heading: number) => ((heading % 360) + 360) % 360;
const signedAngle = (from: number, to: number) => ((to - from + 540) % 360) - 180;
const angleDifference = (a: number, b: number) => Math.abs(signedAngle(a, b));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const numeric = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;

function destinationPoint(lat: number, lon: number, heading: number, distanceNm: number) {
  const angularDistance = distanceNm / 3440.065;
  const bearing = toRadians(heading); const lat1 = toRadians(lat); const lon1 = toRadians(lon);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing));
  const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1), Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: toDegrees(lat2), lon: ((toDegrees(lon2) + 540) % 360) - 180 };
}
function isOnLand(lat: number, lon: number) {
  const location = point([lon, lat]);
  return landFeatures.some((land) => booleanPointInPolygon(location, land));
}
function estimateDepthM(lat: number, lon: number) {
  for (let distance = 0.25; distance <= 12; distance += 0.25) for (let bearing = 0; bearing < 360; bearing += 30) {
    const sample = destinationPoint(lat, lon, bearing, distance);
    if (isOnLand(sample.lat, sample.lon)) return Math.round(clamp(3 + distance * 14, 3, 170));
  }
  return 220;
}
function polarEfficiency(windAngle: number) {
  const polar = [[0, 0], [35, 0], [42, 0.28], [55, 0.46], [80, 0.61], [105, 0.65], [135, 0.56], [160, 0.43], [180, 0.34]];
  for (let index = 1; index < polar.length; index += 1) {
    const [a0, e0] = polar[index - 1]; const [a1, e1] = polar[index];
    if (windAngle <= a1) return e0 + ((windAngle - a0) / (a1 - a0)) * (e1 - e0);
  }
  return 0.34;
}
function sailSpeed(voyage: Voyage, conditions: Conditions) {
  const angle = angleDifference(conditions.windDirection, voyage.heading);
  const canvas = (voyage.mainSail * 0.62 + voyage.genoaSail * 0.38) / 100;
  const trim = ((voyage.mainSheet * 0.56 + voyage.genoaSheet * 0.44) / 100);
  if (angle < 42 || canvas === 0) return 0;
  return Math.min(9.4, conditions.windKn * polarEfficiency(angle) * canvas * (0.58 + trim * 0.42));
}
function motion(voyage: Voyage, conditions: Conditions) {
  const underSail = sailSpeed(voyage, conditions);
  const motorSpeed = voyage.motor * 0.065;
  return { sailSpeedKn: underSail, speedKn: underSail + motorSpeed };
}
function headingAfter(voyage: Voyage, conditions: Conditions, seconds: number) {
  const drive = Math.max(1.2, voyage.speedKn);
  const rudderTurn = (voyage.rudder / 35) * drive * 10;
  const targetTurn = voyage.autopilot && voyage.targetHeading !== null ? clamp(signedAngle(voyage.heading, voyage.targetHeading) * 1.5, -28, 28) : 0;
  const windLeeway = Math.sin(toRadians(signedAngle(voyage.heading, conditions.windDirection))) * conditions.windKn * 0.7;
  const currentYaw = Math.sin(toRadians(signedAngle(voyage.heading, conditions.currentDirection))) * conditions.currentKn * 3;
  const sailBalance = ((voyage.genoaSail * voyage.genoaSheet) - (voyage.mainSail * voyage.mainSheet)) / 10000 * conditions.windKn * 3;
  return normalizeHeading(voyage.heading + (rudderTurn + targetTurn + windLeeway + currentYaw + sailBalance) * seconds / 60);
}
function appendTrail(trail: TrailPoint[], next: TrailPoint) {
  const previous = trail.at(-1);
  if (previous && angleDifference(0, 0) === 0) {
    const latDelta = Math.abs(previous.lat - next.lat); const lonDelta = Math.abs(previous.lon - next.lon);
    if (latDelta + lonDelta < 0.00008) return trail;
  }
  return [...trail, next].slice(-700);
}
function advanceVoyage(voyage: Voyage, conditions: Conditions, now: number) {
  let remaining = Math.min(Math.max(0, (now - voyage.updatedAt) / 1000), 3600);
  let next = { ...voyage, trail: [...voyage.trail] };
  while (remaining > 0.001) {
    const stepSeconds = Math.min(remaining, 4); const speed = motion(next, conditions);
    const heading = headingAfter({ ...next, ...speed }, conditions, stepSeconds);
    const throughWater = speed.speedKn * stepSeconds / 3600;
    const waterPoint = destinationPoint(next.lat, next.lon, heading, throughWater);
    const candidate = destinationPoint(waterPoint.lat, waterPoint.lon, conditions.currentDirection, conditions.currentKn * stepSeconds / 3600);
    if (throughWater > 0 && isOnLand(candidate.lat, candidate.lon)) return { ...next, heading, speedKn: 0, sailSpeedKn: speed.sailSpeedKn, grounded: true, updatedAt: now };
    next = { ...next, ...candidate, heading, speedKn: speed.speedKn, sailSpeedKn: speed.sailSpeedKn, grounded: false, distanceNm: next.distanceNm + throughWater, trail: appendTrail(next.trail, candidate) };
    remaining -= stepSeconds;
  }
  return { ...next, updatedAt: now };
}
function normalizeVoyage(saved: Partial<Voyage> & { sail?: number }): Voyage {
  const timestamp = numeric(saved.updatedAt, Date.now()); const main = numeric(saved.mainSail, numeric(saved.sail, 72));
  return { portId: typeof saved.portId === "string" ? saved.portId : PORTS[0].id, lat: numeric(saved.lat, PORTS[0].lat), lon: numeric(saved.lon, PORTS[0].lon), heading: normalizeHeading(numeric(saved.heading, PORTS[0].heading)), rudder: clamp(numeric(saved.rudder, 0), -35, 35), mainSail: clamp(main, 0, 100), genoaSail: clamp(numeric(saved.genoaSail, main), 0, 100), mainSheet: clamp(numeric(saved.mainSheet, 70), 0, 100), genoaSheet: clamp(numeric(saved.genoaSheet, 70), 0, 100), motor: clamp(numeric(saved.motor, 0), 0, 100), autopilot: Boolean(saved.autopilot), targetHeading: typeof saved.targetHeading === "number" ? normalizeHeading(saved.targetHeading) : null, speedKn: numeric(saved.speedKn, 0), sailSpeedKn: numeric(saved.sailSpeedKn, 0), distanceNm: numeric(saved.distanceNm, 0), grounded: Boolean(saved.grounded), trail: Array.isArray(saved.trail) ? saved.trail.filter((item): item is TrailPoint => Boolean(item) && typeof item.lat === "number" && typeof item.lon === "number").slice(-700) : [], startedAt: numeric(saved.startedAt, timestamp), updatedAt: timestamp };
}
function compassPoint(heading: number) { const points = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"]; return points[Math.round(normalizeHeading(heading) / 45) % 8]; }
function formatCoordinate(value: number, positive: string, negative: string) { return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`; }
function keyLabel(code: string) {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return ({ ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Space: "ESPACIO", Enter: "ENTER" } as Record<string, string>)[code] ?? code.replace(/Left$|Right$/, "").toUpperCase();
}
function parsePanelPositions(raw: string, viewportWidth: number, viewportHeight: number): PanelPositions {
  const saved = JSON.parse(raw) as PanelPositions; const next: PanelPositions = {};
  for (const panel of ["voyage", "conditions", "sails", "helm"] as const) { const position = saved[panel]; if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) next[panel] = { x: clamp(position.x, 8, Math.max(8, viewportWidth - 80)), y: clamp(position.y, 8, Math.max(8, viewportHeight - 50)) }; }
  return next;
}

export default function Home() {
  const mapContainerRef = useRef<HTMLDivElement>(null); const mapRef = useRef<MapInstance | null>(null); const boatMarkerRef = useRef<MarkerInstance | null>(null);
  const voyageRef = useRef<Voyage | null>(null); const conditionsRef = useRef(DEFAULT_CONDITIONS); const followRef = useRef(true); const lastMapCenterRef = useRef<string | null>(null);
  const panelPositionsRef = useRef<PanelPositions>({}); const panelDragRef = useRef<PanelDrag | null>(null);
  const [hydrated, setHydrated] = useState(false); const [selectedPortId, setSelectedPortId] = useState(PORTS[0].id); const [developerLatitude, setDeveloperLatitude] = useState(""); const [developerLongitude, setDeveloperLongitude] = useState(""); const [voyage, setVoyage] = useState<Voyage | null>(null);
  const [conditions, setConditions] = useState(DEFAULT_CONDITIONS); const [followBoat, setFollowBoat] = useState(true); const [satelliteLayer, setSatelliteLayer] = useState(true); const [nauticalLayer, setNauticalLayer] = useState(true); const isometricView = true;
  const [mapReady, setMapReady] = useState(false); const [mapError, setMapError] = useState(false); const [conditionsBusy, setConditionsBusy] = useState(false); const [now, setNow] = useState(0);
  const [panelPositions, setPanelPositions] = useState<PanelPositions>({}); const [activePanel, setActivePanel] = useState<FloatingPanelName>("helm");
  const [settingsOpen, setSettingsOpen] = useState(false); const [capturingKey, setCapturingKey] = useState<KeyBindingName | null>(null); const [keyBindings, setKeyBindings] = useState<KeyBindings>(DEFAULT_KEY_BINDINGS);
  const selectedPort = useMemo(() => PORTS.find((port) => port.id === selectedPortId) ?? PORTS[0], [selectedPortId]);
  const developerStart = useMemo(() => {
    if (!developerLatitude.trim() && !developerLongitude.trim()) return null;
    const lat = Number(developerLatitude); const lon = Number(developerLongitude);
    return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? { lat, lon } : undefined;
  }, [developerLatitude, developerLongitude]);
  useEffect(() => { followRef.current = followBoat; }, [followBoat]); useEffect(() => { voyageRef.current = voyage; }, [voyage]); useEffect(() => { conditionsRef.current = conditions; }, [conditions]);
  const refreshConditions = useCallback(async (lat: number, lon: number) => {
    setConditionsBusy(true); const depthM = estimateDepthM(lat, lon);
    try {
      const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast"); weatherUrl.searchParams.set("latitude", String(lat)); weatherUrl.searchParams.set("longitude", String(lon)); weatherUrl.searchParams.set("current", "wind_speed_10m,wind_direction_10m"); weatherUrl.searchParams.set("wind_speed_unit", "kn");
      const marineUrl = new URL("https://marine-api.open-meteo.com/v1/marine"); marineUrl.searchParams.set("latitude", String(lat)); marineUrl.searchParams.set("longitude", String(lon)); marineUrl.searchParams.set("current", "wave_height,ocean_current_velocity,ocean_current_direction"); marineUrl.searchParams.set("velocity_unit", "kn");
      const [weatherResponse, marineResponse] = await Promise.all([fetch(weatherUrl), fetch(marineUrl)]); if (!weatherResponse.ok || !marineResponse.ok) throw new Error("weather");
      const weather = await weatherResponse.json() as { current?: Record<string, unknown> }; const marine = await marineResponse.json() as { current?: Record<string, unknown> };
      setConditions({ windKn: numeric(weather.current?.wind_speed_10m, 13), windDirection: numeric(weather.current?.wind_direction_10m, 65), waveHeight: numeric(marine.current?.wave_height, 0.9), currentKn: numeric(marine.current?.ocean_current_velocity, 0.4), currentDirection: numeric(marine.current?.ocean_current_direction, 110), depthM, source: "live", updatedAt: Date.now() });
    } catch { setConditions((current) => ({ ...current, depthM, source: "estimated", updatedAt: Date.now() })); } finally { setConditionsBusy(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { const timestamp = Date.now(); setNow(timestamp); try { const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY); if (raw) { const restored = advanceVoyage(normalizeVoyage(JSON.parse(raw) as Partial<Voyage>), conditionsRef.current, timestamp); voyageRef.current = restored; setVoyage(restored); setSelectedPortId(restored.portId); } } catch { window.localStorage.removeItem(STORAGE_KEY); } try { const raw = window.localStorage.getItem(KEY_BINDINGS_STORAGE_KEY); if (raw) { const saved = JSON.parse(raw) as Partial<KeyBindings>; if (typeof saved.rudderLeft === "string" && typeof saved.rudderRight === "string") setKeyBindings({ rudderLeft: saved.rudderLeft, rudderRight: saved.rudderRight }); } } catch { window.localStorage.removeItem(KEY_BINDINGS_STORAGE_KEY); } try { const raw = window.localStorage.getItem(PANEL_POSITIONS_STORAGE_KEY); if (raw) { const saved = parsePanelPositions(raw, window.innerWidth, window.innerHeight); panelPositionsRef.current = saved; setPanelPositions(saved); } } catch { window.localStorage.removeItem(PANEL_POSITIONS_STORAGE_KEY); } setHydrated(true); }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => { const onResize = () => { const next: PanelPositions = {}; for (const panel of ["voyage", "conditions", "sails", "helm"] as const) { const position = panelPositionsRef.current[panel]; if (position) next[panel] = { x: clamp(position.x, 8, Math.max(8, window.innerWidth - 80)), y: clamp(position.y, 8, Math.max(8, window.innerHeight - 50)) }; } panelPositionsRef.current = next; setPanelPositions(next); }; window.addEventListener("resize", onResize); return () => window.removeEventListener("resize", onResize); }, []);
  useEffect(() => { if (!hydrated) return; const refresh = () => { const target = voyageRef.current ?? selectedPort; void refreshConditions(target.lat, target.lon); }; refresh(); const interval = window.setInterval(refresh, 15 * 60 * 1000); return () => window.clearInterval(interval); }, [hydrated, refreshConditions, selectedPort]);
  useEffect(() => { const interval = window.setInterval(() => { const timestamp = Date.now(); setNow(timestamp); setVoyage((current) => current ? advanceVoyage(current, conditionsRef.current, timestamp) : current); }, 1000); return () => window.clearInterval(interval); }, []);
  useEffect(() => { if (!hydrated) return; const save = () => { if (voyageRef.current) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(voyageRef.current)); }; const interval = window.setInterval(save, 5000); window.addEventListener("beforeunload", save); return () => { save(); window.clearInterval(interval); window.removeEventListener("beforeunload", save); }; }, [hydrated]);
  // Helm, sails and motor are commands. They must never run the geographic
  // simulation for every pixel crossed by a range input; the 1 Hz loop does that.
  const updateVoyage = useCallback((change: (current: Voyage) => Voyage) => setVoyage((current) => current ? change(current) : current), []);
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (settingsOpen) { if (event.code === "Escape" && !capturingKey) setSettingsOpen(false); return; } if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLButtonElement) return; if (event.code === keyBindings.rudderLeft) { event.preventDefault(); updateVoyage((current) => ({ ...current, rudder: clamp(current.rudder - 2, -35, 35) })); } else if (event.code === keyBindings.rudderRight) { event.preventDefault(); updateVoyage((current) => ({ ...current, rudder: clamp(current.rudder + 2, -35, 35) })); } }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [capturingKey, keyBindings, settingsOpen, updateVoyage]);
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return; let disposed = false;
    void import("maplibre-gl").then(({ default: maplibregl }) => { if (disposed || !mapContainerRef.current) return; const map = new maplibregl.Map({ container: mapContainerRef.current, style: BASE_STYLE, center: [selectedPort.lon, selectedPort.lat], zoom: 8.2, pitch: 56, minPitch: 56, maxPitch: 56, bearing: -34, touchPitch: false, attributionControl: false });
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right"); map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
      const markerRoot = document.createElement("div"); markerRoot.className = "boat-marker"; markerRoot.setAttribute("aria-label", "Posición de tu barco"); markerRoot.style.setProperty("--boat-sprite-size", `${BOAT_SPRITE_SIZE_PX}px`);
      const vessel = document.createElement("div"); vessel.className = "boat-marker__vessel"; vessel.innerHTML = '<img src="/sailboat-hull.png" alt="" /><span class="boat-sail boat-sail--main"></span><span class="boat-sail boat-sail--genoa"></span>'; markerRoot.appendChild(vessel);
      const marker = new maplibregl.Marker({ element: markerRoot, anchor: "center", pitchAlignment: "viewport", rotationAlignment: "viewport", scale: 1 }).setLngLat([selectedPort.lon, selectedPort.lat]).addTo(map);
      map.on("load", () => {
        try {
          map.addSource("esri-world-imagery", {
            type: "raster",
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
            tileSize: 256,
            attribution: "Tiles © Esri, Maxar, Earthstar Geographics, and the GIS User Community",
          });
          map.addLayer({ id: "satellite-imagery", type: "raster", source: "esri-world-imagery" });
          map.addSource("open-seamap", {
            type: "raster",
            tiles: ["https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenSeaMap contributors",
          });
          map.addLayer({ id: "open-seamap", type: "raster", source: "open-seamap", paint: { "raster-opacity": 0.88 } });
        } catch {
          // The base map remains playable if an optional imagery layer fails.
        }
        setMapReady(true);
      });
      map.on("dragstart", () => { if (!followRef.current) return; followRef.current = false; setFollowBoat(false); });
      map.on("error", () => setMapError(true)); mapRef.current = map; boatMarkerRef.current = marker;
    }); return () => { disposed = true; boatMarkerRef.current?.remove(); mapRef.current?.remove(); boatMarkerRef.current = null; mapRef.current = null; };
  }, [selectedPort.lat, selectedPort.lon]);
  useEffect(() => {
    const map = mapRef.current;
    const marker = boatMarkerRef.current;
    const position = voyage ?? selectedPort;
    if (!map || !marker) return;
    marker.setLngLat([position.lon, position.lat]);
    const vessel = marker.getElement().querySelector<HTMLElement>(".boat-marker__vessel");
    if (vessel) {
      const ahead = destinationPoint(position.lat, position.lon, voyage?.heading ?? position.heading, 0.06);
      const originPx = map.project([position.lon, position.lat]);
      const aheadPx = map.project([ahead.lon, ahead.lat]);
      const screenAngle = toDegrees(Math.atan2(aheadPx.x - originPx.x, -(aheadPx.y - originPx.y)));
      // The marker is a flat deck: it must use the same foreshortening as the map plane.
      vessel.style.transform = isometricView
        ? `perspective(360px) rotateX(42deg) rotate(${screenAngle}deg)`
        : `rotate(${screenAngle}deg)`;
      vessel.style.setProperty("--main-sheet", `${voyage?.mainSheet ?? 70}%`);
      vessel.style.setProperty("--genoa-sheet", `${voyage?.genoaSheet ?? 70}%`);
      vessel.style.setProperty("--main-sail", `${voyage?.mainSail ?? 0}%`);
      vessel.style.setProperty("--genoa-sail", `${voyage?.genoaSail ?? 0}%`);
    }
    const centerKey = `${position.lat.toFixed(6)},${position.lon.toFixed(6)}`;
    if (voyage && followRef.current && lastMapCenterRef.current !== centerKey) {
      lastMapCenterRef.current = centerKey;
      map.easeTo({ center: [voyage.lon, voyage.lat], duration: 750 });
    } else if (!voyage) {
      lastMapCenterRef.current = null;
      map.flyTo({ center: [selectedPort.lon, selectedPort.lat], zoom: 8.2 });
    }
  }, [isometricView, selectedPort, voyage]);
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    if (map.getLayer("satellite-imagery")) map.setLayoutProperty("satellite-imagery", "visibility", satelliteLayer ? "visible" : "none");
    if (map.getLayer("open-seamap")) map.setLayoutProperty("open-seamap", "visibility", nauticalLayer ? "visible" : "none");
    map.easeTo({ pitch: isometricView ? 56 : 0, bearing: isometricView ? -34 : 0, duration: 850 });
  }, [mapReady, satelliteLayer, nauticalLayer, isometricView]);
  useEffect(() => { const map = mapRef.current; if (!mapReady || !map) return; const coordinates = voyage?.trail.map((entry) => [entry.lon, entry.lat]) ?? []; const source = map.getSource("voyage-trail") as { setData?: (data: object) => void } | undefined; const data = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }; if (source?.setData) source.setData(data); else { map.addSource("voyage-trail", { type: "geojson", data }); map.addLayer({ id: "voyage-trail", type: "line", source: "voyage-trail", paint: { "line-color": "#e8c476", "line-width": 2.4, "line-opacity": 0.82 } }); } }, [mapReady, voyage?.trail]);
  const startVoyage = () => {
    if (developerStart === undefined) return;
    const timestamp = Date.now();
    const launchPoint = developerStart ?? selectedPort;
    const base: Voyage = { portId: selectedPort.id, lat: launchPoint.lat, lon: launchPoint.lon, heading: selectedPort.heading, rudder: 0, mainSail: 0, genoaSail: 0, mainSheet: 0, genoaSheet: 0, motor: 0, autopilot: false, targetHeading: null, speedKn: 0, sailSpeedKn: 0, distanceNm: 0, grounded: false, trail: [{ lat: launchPoint.lat, lon: launchPoint.lon }], startedAt: timestamp, updatedAt: timestamp };
    const next = advanceVoyage(base, conditions, timestamp);
    setVoyage(next); setFollowBoat(true); window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    mapRef.current?.flyTo({ center: [next.lon, next.lat], zoom: 10.5, duration: 1500 });
  };
  const centerBoat = () => { if (!voyage) return; mapRef.current?.flyTo({ center: [voyage.lon, voyage.lat], zoom: Math.max(mapRef.current.getZoom(), 9.5) }); };
  const toggleFollowBoat = () => { const next = !followBoat; setFollowBoat(next); if (next) centerBoat(); };
  const assignKey = (binding: KeyBindingName, code: string) => {
    if (code === "Escape") { setCapturingKey(null); return; }
    if (["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(code)) return;
    setKeyBindings((current) => {
      const other: KeyBindingName = binding === "rudderLeft" ? "rudderRight" : "rudderLeft";
      const next: KeyBindings = { ...current, [binding]: code };
      if (current[other] === code) next[other] = current[binding];
      window.localStorage.setItem(KEY_BINDINGS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    setCapturingKey(null);
  };
  const resetKeyBindings = () => { setKeyBindings(DEFAULT_KEY_BINDINGS); setCapturingKey(null); window.localStorage.removeItem(KEY_BINDINGS_STORAGE_KEY); };
  const beginPanelDrag = (panel: FloatingPanelName, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const windowElement = event.currentTarget.closest<HTMLElement>("[data-floating-panel]"); if (!windowElement) return;
    const rect = windowElement.getBoundingClientRect(); panelDragRef.current = { panel, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, width: rect.width, height: rect.height };
    setActivePanel(panel); event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
  };
  const movePanel = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = panelDragRef.current; if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const position = { x: clamp(event.clientX - drag.offsetX, 8, Math.max(8, window.innerWidth - drag.width - 8)), y: clamp(event.clientY - drag.offsetY, 8, Math.max(8, window.innerHeight - drag.height - 8)) };
    const next = { ...panelPositionsRef.current, [drag.panel]: position }; panelPositionsRef.current = next; setPanelPositions(next);
  };
  const endPanelDrag = (event: ReactPointerEvent<HTMLElement>) => { if (!panelDragRef.current) return; panelDragRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); window.localStorage.setItem(PANEL_POSITIONS_STORAGE_KEY, JSON.stringify(panelPositionsRef.current)); };
  const resetPanelPosition = (panel: FloatingPanelName) => { const next = { ...panelPositionsRef.current }; delete next[panel]; panelPositionsRef.current = next; setPanelPositions(next); window.localStorage.setItem(PANEL_POSITIONS_STORAGE_KEY, JSON.stringify(next)); };
  const floatingPanelStyle = (panel: FloatingPanelName): CSSProperties => { const position = panelPositions[panel]; return { ...(position ? { left: position.x, top: position.y, right: "auto", bottom: "auto", transform: "none" } : {}), zIndex: activePanel === panel ? 12 : 7 }; };
  const resetVoyage = () => { if (!window.confirm("¿Finalizar este viaje y volver a elegir puerto?")) return; window.localStorage.removeItem(STORAGE_KEY); setVoyage(null); setFollowBoat(true); };
  const utcTime = now ? new Date(now).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" }) : "--:--:--";
  return <main className={`game-shell ${voyage ? "is-sailing" : "is-docked"}`}><div ref={mapContainerRef} className="world-map" aria-label="Mapa mundial interactivo de Sailward" /><div className="ocean-vignette" aria-hidden="true" />
    <header className="brand-bar"><button type="button" className="brand-lockup brand-button" aria-label="Abrir ajustes de Sailward" title="Ajustes" onClick={() => setSettingsOpen(true)}><span className="brand-mark" aria-hidden="true">S</span><div><strong>SAILWARD <em>v{APP_VERSION}</em></strong><span>REAL-TIME SAILING</span></div></button><div className="world-clock"><span className="live-dot" /><span>{utcTime} UTC</span><small>TIEMPO REAL · 1×</small></div></header>
    {settingsOpen && <div className="settings-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) { setCapturingKey(null); setSettingsOpen(false); } }}><section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title"><header className="settings-header"><div><span>SAILWARD</span><h2 id="settings-title">Ajustes</h2></div><button type="button" aria-label="Cerrar ajustes" onClick={() => { setCapturingKey(null); setSettingsOpen(false); }}>×</button></header><div className="settings-layout"><nav aria-label="Secciones de ajustes"><button type="button" className="is-active"><span aria-hidden="true">⌨</span> TECLAS</button></nav><div className="settings-content"><span className="settings-eyebrow">CONTROLES</span><h3>Teclas</h3><p>Elegí una acción y luego presioná la tecla que quieras asignar.</p><div className="key-binding-list">{([ ["rudderLeft", "Timón a babor"], ["rudderRight", "Timón a estribor"] ] as const).map(([binding, label]) => <div className="key-binding-row" key={binding}><div><strong>{label}</strong><small>{binding === "rudderLeft" ? "Girar hacia la izquierda" : "Girar hacia la derecha"}</small></div><button type="button" className={capturingKey === binding ? "is-capturing" : ""} aria-label={`Cambiar tecla para ${label}`} onClick={() => setCapturingKey(binding)} onKeyDown={(event) => { if (capturingKey !== binding) return; event.preventDefault(); event.stopPropagation(); assignKey(binding, event.code); }}>{capturingKey === binding ? "PRESIONÁ…" : keyLabel(keyBindings[binding])}</button></div>)}</div><div className="settings-footer"><small>Los próximos comandos aparecerán en esta sección.</small><button type="button" onClick={resetKeyBindings}>RESTAURAR A / D</button></div></div></div></section></div>}
    {!hydrated && <section className="departure-panel loading-panel"><span className="eyebrow">SAILWARD</span><h1>Preparando el mundo.</h1></section>}
    {hydrated && !voyage && <section className="departure-panel">
      <span className="eyebrow">PUERTO DE PARTIDA</span>
      <h1>El mar ya está en movimiento.</h1>
      <p className="departure-copy">Elegí un puerto real. El timón gobierna el giro; el barco responde a las velas, el viento y la corriente.</p>
      <label className="field-label" htmlFor="port">Zarpar desde</label>
      <div className="port-select-wrap"><select id="port" value={selectedPortId} onChange={(event) => setSelectedPortId(event.target.value)}>{PORTS.map((port) => <option key={port.id} value={port.id}>{port.name}, {port.country}</option>)}</select></div>
      <details className="developer-gps">
        <summary>Desarrollador · GPS de arranque temporal</summary>
        <p>Reemplaza el punto del puerto sólo para esta travesía.</p>
        <div className="developer-gps__fields">
          <label>Latitud<input inputMode="decimal" placeholder={selectedPort.lat.toFixed(5)} value={developerLatitude} onChange={(event) => setDeveloperLatitude(event.target.value)} /></label>
          <label>Longitud<input inputMode="decimal" placeholder={selectedPort.lon.toFixed(5)} value={developerLongitude} onChange={(event) => setDeveloperLongitude(event.target.value)} /></label>
        </div>
        {developerStart === undefined && <small className="developer-gps__error">Ingresá una latitud entre −90 y 90 y una longitud entre −180 y 180.</small>}
      </details>
      <div className="departure-weather"><div><span>VIENTO</span><strong>{conditions.windKn.toFixed(0)} kn</strong></div><div><span>OLAS</span><strong>{conditions.waveHeight.toFixed(1)} m</strong></div><div><span>FONDO</span><strong>~{conditions.depthM} m</strong></div></div>
      <button className="primary-action" disabled={developerStart === undefined} onClick={startVoyage}><span>INICIAR TRAVESÍA</span><span>→</span></button>
      <div className="feature-row"><span>Viento real</span><span>Polars</span><span>Cartografía náutica</span></div>
    </section>}
    {voyage && <>
      <aside className="voyage-card floating-window" data-floating-panel="voyage" style={floatingPanelStyle("voyage")} onPointerDownCapture={() => setActivePanel("voyage")}><div className="floating-window-bar"><span>TRAVESÍA ACTIVA</span><button type="button" className="window-drag-handle" aria-label="Mover ventana de travesía" title="Arrastrar para mover · doble clic para restaurar" onPointerDown={(event) => beginPanelDrag("voyage", event)} onPointerMove={movePanel} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag} onDoubleClick={() => resetPanelPosition("voyage")}>⠿</button></div><strong>{PORTS.find((port) => port.id === voyage.portId)?.name}</strong><span>{voyage.autopilot ? `PILOTO · ${compassPoint(voyage.targetHeading ?? voyage.heading)}` : "MANUAL · TIMÓN"}</span><div className="voyage-distance">{voyage.distanceNm.toFixed(1)} <small>MN</small></div></aside>
      <aside className="conditions-card floating-window" data-floating-panel="conditions" style={floatingPanelStyle("conditions")} onPointerDownCapture={() => setActivePanel("conditions")}><div className="conditions-title"><div><span className="live-dot" /> CONDICIONES</div><div className="floating-window-actions"><button type="button" className="window-drag-handle" aria-label="Mover ventana de condiciones" title="Arrastrar para mover · doble clic para restaurar" onPointerDown={(event) => beginPanelDrag("conditions", event)} onPointerMove={movePanel} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag} onDoubleClick={() => resetPanelPosition("conditions")}>⠿</button><button title="Actualizar condiciones" onClick={() => void refreshConditions(voyage.lat, voyage.lon)}>↻</button></div></div><dl><div><dt>Viento</dt><dd>{conditions.windKn.toFixed(0)} kn · {compassPoint(conditions.windDirection)}</dd></div><div><dt>Olas</dt><dd>{conditions.waveHeight.toFixed(1)} m</dd></div><div><dt>Corriente</dt><dd>{conditions.currentKn.toFixed(1)} kn · {compassPoint(conditions.currentDirection)}</dd></div><div><dt>Prof. est.</dt><dd>~{conditions.depthM} m</dd></div></dl><small>{conditionsBusy ? "Actualizando…" : conditions.source === "live" ? "Datos meteorológicos en vivo" : "Datos estimados · profundidad de juego"}</small></aside>
      <div className="sail-control floating-window" data-floating-panel="sails" style={floatingPanelStyle("sails")} onPointerDownCapture={() => setActivePanel("sails")}><div className="sail-window-content"><div className="control-heading"><span>APAREJO Y MOTOR</span><strong>{Math.round(voyage.mainSail + voyage.genoaSail) / 2}%</strong><small>VELAS</small><button type="button" className="window-drag-handle" aria-label="Mover ventana de velas" title="Arrastrar para mover · doble clic para restaurar" onPointerDown={(event) => beginPanelDrag("sails", event)} onPointerMove={movePanel} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag} onDoubleClick={() => resetPanelPosition("sails")}>⠿</button></div>{([ ["Mayor", "mainSail", "mainSheet"], ["Genoa", "genoaSail", "genoaSheet"] ] as const).map(([name, sailKey, sheetKey]) => <div className="sail-row" key={name}><label>{name} <b>{Math.round(voyage[sailKey])}%</b></label><input aria-label={`${name} desplegada`} type="range" min="0" max="100" value={voyage[sailKey]} onChange={(event) => updateVoyage((current) => ({ ...current, [sailKey]: Number(event.target.value) }))} /><label className="sheet-label">Escota <b>{Math.round(voyage[sheetKey])}%</b></label><input aria-label={`Escota de ${name}`} type="range" min="0" max="100" value={voyage[sheetKey]} onChange={(event) => updateVoyage((current) => ({ ...current, [sheetKey]: Number(event.target.value) }))} /></div>)}<div className="motor-row"><label htmlFor="motor">Motor <b>{Math.round(voyage.motor)}%</b></label><input id="motor" type="range" min="0" max="100" value={voyage.motor} onChange={(event) => updateVoyage((current) => ({ ...current, motor: Number(event.target.value) }))} /></div></div></div>
      <section className="control-dock floating-window" data-floating-panel="helm" style={floatingPanelStyle("helm")} onPointerDownCapture={() => setActivePanel("helm")}><div className="floating-window-bar floating-window-bar--helm"><span>CONTROL DE NAVEGACIÓN</span><button type="button" className="window-drag-handle" aria-label="Mover ventana del timón" title="Arrastrar para mover · doble clic para restaurar" onPointerDown={(event) => beginPanelDrag("helm", event)} onPointerMove={movePanel} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag} onDoubleClick={() => resetPanelPosition("helm")}>⠿</button></div><div className="course-control"><div className="control-heading"><span>TIMÓN</span><strong>{voyage.rudder > 0 ? "+" : ""}{Math.round(voyage.rudder)}°</strong><small>{voyage.autopilot ? "PILOTO" : "MANUAL"}</small></div><div className="helm-row"><button className="helm" aria-label="Mover timón" aria-valuemin={-35} aria-valuemax={35} aria-valuenow={Math.round(voyage.rudder)} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const rect = event.currentTarget.getBoundingClientRect(); updateVoyage((current) => ({ ...current, rudder: clamp(((event.clientX - rect.left) / rect.width - .5) * 70, -35, 35) })); }} onPointerMove={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const rect = event.currentTarget.getBoundingClientRect(); updateVoyage((current) => ({ ...current, rudder: clamp(((event.clientX - rect.left) / rect.width - .5) * 70, -35, 35) })); }}><span style={{ transform: `rotate(${voyage.rudder * 3}deg)` }} /></button><div className="step-buttons"><button onClick={() => updateVoyage((current) => ({ ...current, rudder: clamp(current.rudder - 1, -35, 35) }))}>−1°</button><button onClick={() => updateVoyage((current) => ({ ...current, rudder: clamp(current.rudder - 10, -35, 35) }))}>−10°</button><button onClick={() => updateVoyage((current) => ({ ...current, rudder: clamp(current.rudder + 10, -35, 35) }))}>+10°</button><button onClick={() => updateVoyage((current) => ({ ...current, rudder: clamp(current.rudder + 1, -35, 35) }))}>+1°</button><button className="center-helm-button" onClick={() => updateVoyage((current) => ({ ...current, rudder: 0 }))}>CENTRAR</button></div></div><button className="autopilot-button" onClick={() => updateVoyage((current) => ({ ...current, autopilot: !current.autopilot, targetHeading: !current.autopilot ? current.heading : null, rudder: !current.autopilot ? 0 : current.rudder }))}>{voyage.autopilot ? `DESACTIVAR PILOTO (${Math.round(voyage.targetHeading ?? voyage.heading)}°)` : "FIJAR RUMBO · PILOTO AUTOMÁTICO"}</button><small className="map-hint">{keyLabel(keyBindings.rudderLeft)} / {keyLabel(keyBindings.rudderRight)} ajustan el timón. El rumbo sólo se fija con piloto.</small></div>
        <div className="telemetry"><div className="speed-readout"><span>VEL. SOBRE FONDO</span><strong>{voyage.speedKn.toFixed(1)}</strong><small>NUDOS</small></div><div className="position-readout"><span>{formatCoordinate(voyage.lat, "N", "S")}</span><span>{formatCoordinate(voyage.lon, "E", "O")}</span><span>Rumbo {Math.round(voyage.heading)}° · Vela {voyage.sailSpeedKn.toFixed(1)} kn</span>{voyage.grounded && <span className="grounded">TIERRA: SIN AVANCE</span>}</div><div className="dock-actions"><button onClick={centerBoat}>CENTRAR BARCO</button><button onClick={resetVoyage}>FINALIZAR</button></div></div></section></>}
    <div className="north-indicator" aria-label="Indicador de norte">
      <span className="north-indicator__needle" aria-hidden="true" />
      <strong>N</strong>
      <small>NORTE</small>
    </div>
    <div className="map-tools">
      <button className={satelliteLayer ? "is-active" : ""} aria-label="Alternar vista satelital" aria-pressed={satelliteLayer} title="Vista satelital" onClick={() => setSatelliteLayer((value) => !value)}><span className="map-tool-icon map-tool-icon--satellite" aria-hidden="true">◉</span></button>
      <button className={nauticalLayer ? "is-active" : ""} aria-label="Alternar carta náutica" aria-pressed={nauticalLayer} title="Carta náutica" onClick={() => setNauticalLayer((value) => !value)}><span className="map-tool-icon map-tool-icon--nautical" aria-hidden="true">⚓</span></button>
      {voyage && <button className={followBoat ? "is-active" : ""} aria-label={followBoat ? "Desactivar seguimiento del barco" : "Seguir barco"} aria-pressed={followBoat} title={followBoat ? "Desactivar seguimiento" : "Seguir barco"} onClick={toggleFollowBoat}><span className="map-tool-icon map-tool-icon--follow" aria-hidden="true">⌖</span></button>}
    </div>{mapError && <div className="map-notice">No se pudo cargar una capa del mapa. El simulador sigue disponible.</div>}<div className="version-tag">SAILWARD · v{APP_VERSION} · ALPHA</div>
  </main>;
}

"use client";
/* eslint-disable jsx-a11y/role-supports-aria-props, @typescript-eslint/no-unused-vars */

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Map as MapInstance, Marker as MarkerInstance } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { feature } from "topojson-client";
import landTopology from "world-atlas/land-110m.json";

const APP_VERSION = "0.3.8";
const STORAGE_KEY = "sailward.voyage";
const LEGACY_STORAGE_KEY = "sailward.voyage.0.1.0";
const KEY_BINDINGS_STORAGE_KEY = "sailward.keybindings.v1";
const PANEL_POSITIONS_STORAGE_KEY = "sailward.panelPositions.v1";
const PANEL_SIZES_STORAGE_KEY = "sailward.panelSizes.v1";
const MINIMIZED_PANELS_STORAGE_KEY = "sailward.minimizedPanels.v1";
const BOAT_PROFILE_STORAGE_KEY = "sailward.boatProfile.v1";
const DEPTH_ALARM_STORAGE_KEY = "sailward.depthAlarm.v1";
const BASE_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const BOAT_SPRITE_SIZE_PX = 72;
const MAX_ANCHOR_RODE_M = 160;
const ANCHOR_RELEASE_MPS = 1.2;
const ANCHOR_RETRIEVE_M_PER_TURN = 1.1;

type Port = { id: string; name: string; country: string; lat: number; lon: number; heading: number };
type TrailPoint = { lat: number; lon: number };
type AnchorId = 1 | 2;
type BoatProfile = { id: string; name: string; motorMaxKn: number; rudderMaxDeg: number; rudderTurnRate: number };
type Voyage = {
  portId: string; lat: number; lon: number; heading: number; rudder: number; rudderSensitivity: number;
  mainSail: number; genoaSail: number; mainSheet: number; genoaSheet: number; linePercentages?: Record<string, number>;
  motor: number; engineRunning: boolean; autopilot: boolean; targetHeading: number | null;
  boatProfile: BoatProfile;
  speedKn: number; sailSpeedKn: number; distanceNm: number; grounded: boolean;
  selectedAnchor: AnchorId; anchorRelease: AnchorId | 0; anchor1RodeM: number; anchor2RodeM: number;
  waterL: number; waterReserveL: number; fuelL: number; fuelReserveL: number; foodDays: number; foodReserveDays: number; cargoKg: number;
  trail: TrailPoint[]; startedAt: number; updatedAt: number;
};
type Conditions = {
  windKn: number; windDirection: number; waveHeight: number; currentKn: number;
  currentDirection: number; depthM: number; source: "live" | "estimated"; updatedAt: number;
};
type KeyBindingName = "rudderLeft" | "rudderRight";
type KeyBindings = Record<KeyBindingName, string>;
type DepthAlarm = { thresholdM: number; armed: boolean };
type WinchId = "winchMainPort" | "winchMainStarboard" | "winchPort" | "winchStarboard";
const FLOATING_PANELS = ["voyage", "conditions", "engine", "helm", "autopilot", "anchor", "rigging", "resources", "depth", "compass", "gps", "wind", "winchMainPort", "winchMainStarboard", "winchPort", "winchStarboard"] as const;
type FloatingPanelName = (typeof FLOATING_PANELS)[number];
type PanelPosition = { x: number; y: number };
type PanelPositions = Partial<Record<FloatingPanelName, PanelPosition>>;
type PanelSize = { width: number; height: number };
type PanelSizes = Partial<Record<FloatingPanelName, PanelSize>>;
type MinimizedPanels = Partial<Record<FloatingPanelName, boolean>>;
type PanelDrag = { panel: FloatingPanelName; offsetX: number; offsetY: number; width: number; height: number };
type PanelResize = { panel: FloatingPanelName; edge: string; startX: number; startY: number; width: number; height: number; left: number; top: number };
type AnchorWinchDrag = { pointerId: number; lastAngle: number };

const DEFAULT_KEY_BINDINGS: KeyBindings = { rudderLeft: "KeyA", rudderRight: "KeyD" };
const DEFAULT_DEPTH_ALARM: DepthAlarm = { thresholdM: 8, armed: true };
const DEFAULT_BOAT_PROFILE: BoatProfile = { id: "sailward-01", name: "Sailward 01", motorMaxKn: 6.5, rudderMaxDeg: 35, rudderTurnRate: 10 };
const WINCHES = [
  { id: "winchMainPort", title: "WINCH 1 · HARKEN 40", side: "COCKPIT · BABOR", lines: ["DRIZA MAYOR", "RIZO 1"] },
  { id: "winchMainStarboard", title: "WINCH 2 · HARKEN 40", side: "COCKPIT · ESTRIBOR", lines: ["RIZO 2", "DRIZA SPINNAKER"] },
  { id: "winchPort", title: "WINCH 3 · HARKEN 46", side: "BANDA · BABOR", lines: ["ESCOTA GENOA BABOR", "ENROLLADOR GENOA"] },
  { id: "winchStarboard", title: "WINCH 4 · HARKEN 46", side: "BANDA · ESTRIBOR", lines: ["ESCOTA GENOA ESTRIBOR"] }
] as const;

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
function normalizeBoatProfile(saved?: Partial<BoatProfile>): BoatProfile { return { id: typeof saved?.id === "string" ? saved.id : DEFAULT_BOAT_PROFILE.id, name: typeof saved?.name === "string" && saved.name.trim() ? saved.name.trim().slice(0, 32) : DEFAULT_BOAT_PROFILE.name, motorMaxKn: clamp(numeric(saved?.motorMaxKn, DEFAULT_BOAT_PROFILE.motorMaxKn), 2, 12), rudderMaxDeg: clamp(numeric(saved?.rudderMaxDeg, DEFAULT_BOAT_PROFILE.rudderMaxDeg), 20, 45), rudderTurnRate: clamp(numeric(saved?.rudderTurnRate, DEFAULT_BOAT_PROFILE.rudderTurnRate), 4, 24) }; }

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
function winchLinePercentage(voyage: Voyage, line: string) {
  if (line === "DRIZA MAYOR") return voyage.mainSail;
  if (line === "ESCOTA MAYOR") return voyage.mainSheet;
  if (line === "ENROLLADOR GENOA") return voyage.genoaSail;
  if (line === "ESCOTA GENOA BABOR" || line === "ESCOTA GENOA ESTRIBOR") return voyage.linePercentages?.[line] ?? voyage.genoaSheet;
  return voyage.linePercentages?.[line] ?? 0;
}
function adjustWinchLine(voyage: Voyage, line: string, amount: number) {
  const value = clamp(winchLinePercentage(voyage, line) + amount, 0, 100);
  if (line === "DRIZA MAYOR") return { ...voyage, mainSail: value };
  if (line === "ESCOTA MAYOR") return { ...voyage, mainSheet: value };
  if (line === "ENROLLADOR GENOA") return { ...voyage, genoaSail: value };
  if (line === "ESCOTA GENOA BABOR" || line === "ESCOTA GENOA ESTRIBOR") return { ...voyage, genoaSheet: value, linePercentages: { ...(voyage.linePercentages ?? {}), [line]: value } };
  return { ...voyage, linePercentages: { ...(voyage.linePercentages ?? {}), [line]: value } };
}
function motion(voyage: Voyage, conditions: Conditions) {
  const underSail = sailSpeed(voyage, conditions);
  const motorSpeed = voyage.engineRunning && voyage.fuelL > 0 ? voyage.motor * voyage.boatProfile.motorMaxKn / 100 : 0;
  return { sailSpeedKn: underSail, speedKn: underSail + motorSpeed };
}
function headingAfter(voyage: Voyage, conditions: Conditions, seconds: number) {
  const drive = Math.max(1.2, voyage.speedKn);
  const rudderTurn = (voyage.rudder / voyage.boatProfile.rudderMaxDeg) * drive * voyage.boatProfile.rudderTurnRate * voyage.rudderSensitivity * (voyage.speedKn < 0 ? -0.75 : 1);
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
function anchorRode(voyage: Voyage, anchor: AnchorId) { return anchor === 1 ? voyage.anchor1RodeM : voyage.anchor2RodeM; }
function anchorSetLengthM(conditions: Conditions) { return clamp(conditions.depthM * 1.8, 4, MAX_ANCHOR_RODE_M); }
function anchorIsHolding(voyage: Voyage, conditions: Conditions) {
  const setLength = anchorSetLengthM(conditions);
  return voyage.anchor1RodeM >= setLength || voyage.anchor2RodeM >= setLength;
}
function anchorStatus(voyage: Voyage, conditions: Conditions, anchor: AnchorId) {
  const rode = anchorRode(voyage, anchor);
  if (voyage.anchorRelease === anchor) return "LIBERANDO";
  if (rode >= anchorSetLengthM(conditions)) return "FONDEADA";
  if (rode >= conditions.depthM) return "EN FONDO · FALTA CADENA";
  if (rode > 0.05) return "SUSPENDIDA";
  return "ESTIBADA";
}
function advanceVoyage(voyage: Voyage, conditions: Conditions, now: number) {
  let remaining = Math.min(Math.max(0, (now - voyage.updatedAt) / 1000), 3600);
  let next = { ...voyage, trail: [...voyage.trail] };
  while (remaining > 0.001) {
    const stepSeconds = Math.min(remaining, 4);
    if (next.anchorRelease !== 0) {
      const rodeKey = next.anchorRelease === 1 ? "anchor1RodeM" : "anchor2RodeM";
      next = { ...next, [rodeKey]: clamp(next[rodeKey] + ANCHOR_RELEASE_MPS * stepSeconds, 0, MAX_ANCHOR_RODE_M) };
    }
    const speed = motion(next, conditions);
    const heading = headingAfter({ ...next, ...speed }, conditions, stepSeconds);
    if (anchorIsHolding(next, conditions)) {
      next = { ...next, heading, speedKn: 0, sailSpeedKn: speed.sailSpeedKn, grounded: false };
      remaining -= stepSeconds;
      continue;
    }
    const throughWater = speed.speedKn * stepSeconds / 3600;
    const waterPoint = destinationPoint(next.lat, next.lon, heading, throughWater);
    const candidate = destinationPoint(waterPoint.lat, waterPoint.lon, conditions.currentDirection, conditions.currentKn * stepSeconds / 3600);
    if (throughWater > 0 && isOnLand(candidate.lat, candidate.lon)) return { ...next, heading, speedKn: 0, sailSpeedKn: speed.sailSpeedKn, grounded: true, updatedAt: now };
    next = { ...next, ...candidate, heading, speedKn: speed.speedKn, sailSpeedKn: speed.sailSpeedKn, grounded: false, distanceNm: next.distanceNm + Math.abs(throughWater), trail: appendTrail(next.trail, candidate) };
    remaining -= stepSeconds;
  }
  return { ...next, updatedAt: now };
}
function normalizeVoyage(saved: Partial<Voyage> & { sail?: number }): Voyage {
  const timestamp = numeric(saved.updatedAt, Date.now()); const main = numeric(saved.mainSail, numeric(saved.sail, 72)); const boatProfile = normalizeBoatProfile(saved.boatProfile);
  const linePercentages = Object.fromEntries(Object.entries(saved.linePercentages ?? {}).filter(([, value]) => typeof value === "number" && Number.isFinite(value)).map(([line, value]) => [line, clamp(value as number, 0, 100)]));
  return { portId: typeof saved.portId === "string" ? saved.portId : PORTS[0].id, lat: numeric(saved.lat, PORTS[0].lat), lon: numeric(saved.lon, PORTS[0].lon), heading: normalizeHeading(numeric(saved.heading, PORTS[0].heading)), rudder: clamp(numeric(saved.rudder, 0), -boatProfile.rudderMaxDeg, boatProfile.rudderMaxDeg), rudderSensitivity: clamp(numeric(saved.rudderSensitivity, 1.6), 0.5, 2.5), mainSail: clamp(main, 0, 100), genoaSail: clamp(numeric(saved.genoaSail, main), 0, 100), mainSheet: clamp(numeric(saved.mainSheet, 70), 0, 100), genoaSheet: clamp(numeric(saved.genoaSheet, 70), 0, 100), linePercentages, motor: clamp(numeric(saved.motor, 0), -100, 100), engineRunning: Boolean(saved.engineRunning), autopilot: Boolean(saved.autopilot), targetHeading: typeof saved.targetHeading === "number" ? normalizeHeading(saved.targetHeading) : null, boatProfile, speedKn: numeric(saved.speedKn, 0), sailSpeedKn: numeric(saved.sailSpeedKn, 0), distanceNm: numeric(saved.distanceNm, 0), grounded: Boolean(saved.grounded), selectedAnchor: saved.selectedAnchor === 2 ? 2 : 1, anchorRelease: saved.anchorRelease === 1 || saved.anchorRelease === 2 ? saved.anchorRelease : 0, anchor1RodeM: clamp(numeric(saved.anchor1RodeM, 0), 0, MAX_ANCHOR_RODE_M), anchor2RodeM: clamp(numeric(saved.anchor2RodeM, 0), 0, MAX_ANCHOR_RODE_M), waterL: clamp(numeric(saved.waterL, 180), 0, 220), waterReserveL: clamp(numeric(saved.waterReserveL, 90), 0, 200), fuelL: clamp(numeric(saved.fuelL, 95), 0, 120), fuelReserveL: clamp(numeric(saved.fuelReserveL, 55), 0, 120), foodDays: clamp(numeric(saved.foodDays, 14), 0, 30), foodReserveDays: clamp(numeric(saved.foodReserveDays, 21), 0, 60), cargoKg: clamp(numeric(saved.cargoKg, 0), 0, 420), trail: Array.isArray(saved.trail) ? saved.trail.filter((item): item is TrailPoint => Boolean(item) && typeof item.lat === "number" && typeof item.lon === "number").slice(-700) : [], startedAt: numeric(saved.startedAt, timestamp), updatedAt: timestamp };
}
function compassPoint(heading: number) { const points = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"]; return points[Math.round(normalizeHeading(heading) / 45) % 8]; }
function formatCoordinate(value: number, positive: string, negative: string) { return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`; }
function velocityVector(speedKn: number, direction: number) {
  return { east: speedKn * Math.sin(toRadians(direction)), north: speedKn * Math.cos(toRadians(direction)) };
}
function gpsNavigation(voyage: Voyage, conditions: Conditions) {
  if (voyage.grounded || anchorIsHolding(voyage, conditions)) return { course: voyage.heading, speedKn: 0 };
  const boat = velocityVector(voyage.speedKn, voyage.heading); const current = velocityVector(conditions.currentKn, conditions.currentDirection);
  const east = boat.east + current.east; const north = boat.north + current.north; const speedKn = Math.hypot(east, north);
  return { course: speedKn > 0.01 ? normalizeHeading(toDegrees(Math.atan2(east, north))) : voyage.heading, speedKn };
}
function apparentWind(trueSpeedKn: number, trueDirection: number, gpsSpeedKn: number, gpsCourse: number) {
  const trueWind = velocityVector(trueSpeedKn, normalizeHeading(trueDirection + 180)); const boat = velocityVector(gpsSpeedKn, gpsCourse);
  const east = trueWind.east - boat.east; const north = trueWind.north - boat.north; const speedKn = Math.hypot(east, north);
  const directionToward = speedKn > 0.01 ? normalizeHeading(toDegrees(Math.atan2(east, north))) : normalizeHeading(trueDirection + 180);
  return { direction: normalizeHeading(directionToward + 180), speedKn };
}
function keyLabel(code: string) {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return ({ ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Space: "ESPACIO", Enter: "ENTER" } as Record<string, string>)[code] ?? code.replace(/Left$|Right$/, "").toUpperCase();
}
function parsePanelPositions(raw: string, viewportWidth: number, viewportHeight: number): PanelPositions {
  const saved = JSON.parse(raw) as PanelPositions; const next: PanelPositions = {};
  for (const panel of FLOATING_PANELS) { const position = saved[panel]; if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) next[panel] = { x: clamp(position.x, 8, Math.max(8, viewportWidth - 80)), y: clamp(position.y, 8, Math.max(8, viewportHeight - 50)) }; }
  return next;
}
function parsePanelSizes(raw: string, viewportWidth: number, viewportHeight: number): PanelSizes {
  const saved = JSON.parse(raw) as PanelSizes; const next: PanelSizes = {};
  for (const panel of FLOATING_PANELS) { const size = saved[panel]; if (size && Number.isFinite(size.width) && Number.isFinite(size.height)) next[panel] = { width: clamp(size.width, 160, Math.max(160, viewportWidth - 16)), height: clamp(size.height, 46, Math.max(46, viewportHeight - 16)) }; }
  return next;
}
function parseMinimizedPanels(raw: string): MinimizedPanels {
  const saved = JSON.parse(raw) as MinimizedPanels; const next: MinimizedPanels = {};
  for (const panel of FLOATING_PANELS) if (saved[panel] === true) next[panel] = true;
  return next;
}

export default function Home() {
  const mapContainerRef = useRef<HTMLDivElement>(null); const mapRef = useRef<MapInstance | null>(null); const boatMarkerRef = useRef<MarkerInstance | null>(null);
  const voyageRef = useRef<Voyage | null>(null); const conditionsRef = useRef(DEFAULT_CONDITIONS); const followRef = useRef(true); const lastMapCenterRef = useRef<string | null>(null); const toolsClosedOnStartRef = useRef(false);
  const panelPositionsRef = useRef<PanelPositions>({}); const panelSizesRef = useRef<PanelSizes>({}); const panelDragRef = useRef<PanelDrag | null>(null); const panelResizeRef = useRef<PanelResize | null>(null); const anchorWinchDragRef = useRef<AnchorWinchDrag | null>(null); const deckWinchDragRef = useRef<Partial<Record<WinchId, AnchorWinchDrag>>>({});
  const [hydrated, setHydrated] = useState(false); const [selectedPortId, setSelectedPortId] = useState(PORTS[0].id); const [developerLatitude, setDeveloperLatitude] = useState(""); const [developerLongitude, setDeveloperLongitude] = useState(""); const [voyage, setVoyage] = useState<Voyage | null>(null);
  const [conditions, setConditions] = useState(DEFAULT_CONDITIONS); const [followBoat, setFollowBoat] = useState(true); const [satelliteLayer, setSatelliteLayer] = useState(true); const [nauticalLayer, setNauticalLayer] = useState(true); const isometricView = true;
  const [mapReady, setMapReady] = useState(false); const [mapError, setMapError] = useState(false); const [conditionsBusy, setConditionsBusy] = useState(false); const [now, setNow] = useState(0);
  const [panelPositions, setPanelPositions] = useState<PanelPositions>({}); const [panelSizes, setPanelSizes] = useState<PanelSizes>({}); const [activePanel, setActivePanel] = useState<FloatingPanelName>("helm");
  const [minimizedPanels, setMinimizedPanels] = useState<MinimizedPanels>({});
  const [anchorWinchRotation, setAnchorWinchRotation] = useState(0); const [winchRotation, setWinchRotation] = useState<Record<WinchId, number>>({ winchMainPort: 0, winchMainStarboard: 0, winchPort: 0, winchStarboard: 0 }); const [winchLine, setWinchLine] = useState<Record<WinchId, string>>({ winchMainPort: "DRIZA MAYOR", winchMainStarboard: "RIZO 2", winchPort: "ESCOTA GENOA BABOR", winchStarboard: "ESCOTA GENOA ESTRIBOR" }); const [winchFiling, setWinchFiling] = useState<Record<WinchId, boolean>>({ winchMainPort: false, winchMainStarboard: false, winchPort: false, winchStarboard: false });
  const [settingsOpen, setSettingsOpen] = useState(false); const [toolsOpen, setToolsOpen] = useState(false); const [inventoryFolders, setInventoryFolders] = useState<string[]>([]); const [openInventoryFolders, setOpenInventoryFolders] = useState<string[]>([]); const [inventoryFolderTools, setInventoryFolderTools] = useState<Record<string, string[]>>({}); const [newInventoryFolder, setNewInventoryFolder] = useState(""); const [capturingKey, setCapturingKey] = useState<KeyBindingName | null>(null); const [keyBindings, setKeyBindings] = useState<KeyBindings>(DEFAULT_KEY_BINDINGS);
  const [depthAlarm, setDepthAlarm] = useState<DepthAlarm>(DEFAULT_DEPTH_ALARM);
  const [boatProfile, setBoatProfile] = useState<BoatProfile>(DEFAULT_BOAT_PROFILE);
  const selectedPort = useMemo(() => PORTS.find((port) => port.id === selectedPortId) ?? PORTS[0], [selectedPortId]);
  const developerStart = useMemo(() => {
    if (!developerLatitude.trim() && !developerLongitude.trim()) return null;
    const lat = Number(developerLatitude); const lon = Number(developerLongitude);
    return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? { lat, lon } : undefined;
  }, [developerLatitude, developerLongitude]);
  useEffect(() => { followRef.current = followBoat; }, [followBoat]); useEffect(() => { voyageRef.current = voyage; }, [voyage]); useEffect(() => { conditionsRef.current = conditions; }, [conditions]);
  useEffect(() => { if (!voyage) { toolsClosedOnStartRef.current = false; return; } if (toolsClosedOnStartRef.current) return; const timer = window.setTimeout(() => { document.querySelectorAll("[data-floating-panel]").forEach((item) => item.classList.add("is-tool-closed")); toolsClosedOnStartRef.current = true; }, 0); return () => window.clearTimeout(timer); }, [voyage]);
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
  useEffect(() => { const timer = window.setTimeout(() => { const timestamp = Date.now(); setNow(timestamp); try { const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY); if (raw) { const restored = advanceVoyage(normalizeVoyage(JSON.parse(raw) as Partial<Voyage>), conditionsRef.current, timestamp); voyageRef.current = restored; setVoyage(restored); setSelectedPortId(restored.portId); } } catch { window.localStorage.removeItem(STORAGE_KEY); } try { const raw = window.localStorage.getItem(KEY_BINDINGS_STORAGE_KEY); if (raw) { const saved = JSON.parse(raw) as Partial<KeyBindings>; if (typeof saved.rudderLeft === "string" && typeof saved.rudderRight === "string") setKeyBindings({ rudderLeft: saved.rudderLeft, rudderRight: saved.rudderRight }); } } catch { window.localStorage.removeItem(KEY_BINDINGS_STORAGE_KEY); } try { const raw = window.localStorage.getItem(PANEL_POSITIONS_STORAGE_KEY); if (raw) { const saved = parsePanelPositions(raw, window.innerWidth, window.innerHeight); panelPositionsRef.current = saved; setPanelPositions(saved); } } catch { window.localStorage.removeItem(PANEL_POSITIONS_STORAGE_KEY); } try { const raw = window.localStorage.getItem(PANEL_SIZES_STORAGE_KEY); if (raw) { const saved = parsePanelSizes(raw, window.innerWidth, window.innerHeight); panelSizesRef.current = saved; setPanelSizes(saved); } } catch { window.localStorage.removeItem(PANEL_SIZES_STORAGE_KEY); } try { const raw = window.localStorage.getItem(MINIMIZED_PANELS_STORAGE_KEY); if (raw) setMinimizedPanels(parseMinimizedPanels(raw)); } catch { window.localStorage.removeItem(MINIMIZED_PANELS_STORAGE_KEY); } try { const raw = window.localStorage.getItem(DEPTH_ALARM_STORAGE_KEY); if (raw) { const saved = JSON.parse(raw) as Partial<DepthAlarm>; if (typeof saved.armed === "boolean" || typeof saved.thresholdM === "number") setDepthAlarm({ armed: typeof saved.armed === "boolean" ? saved.armed : DEFAULT_DEPTH_ALARM.armed, thresholdM: clamp(numeric(saved.thresholdM, DEFAULT_DEPTH_ALARM.thresholdM), 1, 100) }); } } catch { window.localStorage.removeItem(DEPTH_ALARM_STORAGE_KEY); } setHydrated(true); }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => { const timer = window.setTimeout(() => { try { const raw = window.localStorage.getItem(BOAT_PROFILE_STORAGE_KEY); if (raw) setBoatProfile(normalizeBoatProfile(JSON.parse(raw) as Partial<BoatProfile>)); } catch { window.localStorage.removeItem(BOAT_PROFILE_STORAGE_KEY); } }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => { const onResize = () => { const next: PanelPositions = {}; for (const panel of FLOATING_PANELS) { const position = panelPositionsRef.current[panel]; if (position) next[panel] = { x: clamp(position.x, 8, Math.max(8, window.innerWidth - 80)), y: clamp(position.y, 8, Math.max(8, window.innerHeight - 50)) }; } panelPositionsRef.current = next; setPanelPositions(next); }; window.addEventListener("resize", onResize); return () => window.removeEventListener("resize", onResize); }, []);
  useEffect(() => { if (!hydrated) return; const refresh = () => { const target = voyageRef.current ?? selectedPort; void refreshConditions(target.lat, target.lon); }; refresh(); const interval = window.setInterval(refresh, 15 * 60 * 1000); return () => window.clearInterval(interval); }, [hydrated, refreshConditions, selectedPort]);
  useEffect(() => { const interval = window.setInterval(() => { const timestamp = Date.now(); setNow(timestamp); setVoyage((current) => current ? advanceVoyage(current, conditionsRef.current, timestamp) : current); }, 1000); return () => window.clearInterval(interval); }, []);
  useEffect(() => { if (!hydrated) return; const save = () => { if (voyageRef.current) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(voyageRef.current)); }; const interval = window.setInterval(save, 5000); window.addEventListener("beforeunload", save); return () => { save(); window.clearInterval(interval); window.removeEventListener("beforeunload", save); }; }, [hydrated]);
  // Helm, sails and motor are commands. They must never run the geographic
  // simulation for every pixel crossed by a range input; the 1 Hz loop does that.
  const updateVoyage = useCallback((change: (current: Voyage) => Voyage) => setVoyage((current) => current ? change(current) : current), []);
  const updateDepthAlarm = (change: (current: DepthAlarm) => DepthAlarm) => setDepthAlarm((current) => { const next = change(current); window.localStorage.setItem(DEPTH_ALARM_STORAGE_KEY, JSON.stringify(next)); return next; });
  const updateBoatProfile = (change: (current: BoatProfile) => BoatProfile) => setBoatProfile((current) => { const next = normalizeBoatProfile(change(current)); window.localStorage.setItem(BOAT_PROFILE_STORAGE_KEY, JSON.stringify(next)); setVoyage((active) => active ? { ...active, boatProfile: next, rudder: clamp(active.rudder, -next.rudderMaxDeg, next.rudderMaxDeg) } : active); return next; });
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (settingsOpen) { if (event.code === "Escape" && !capturingKey) setSettingsOpen(false); return; } if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLButtonElement) return; if (event.code === keyBindings.rudderLeft) { event.preventDefault(); updateVoyage((current) => ({ ...current, rudder: clamp(current.rudder - 2, -current.boatProfile.rudderMaxDeg, current.boatProfile.rudderMaxDeg) })); } else if (event.code === keyBindings.rudderRight) { event.preventDefault(); updateVoyage((current) => ({ ...current, rudder: clamp(current.rudder + 2, -current.boatProfile.rudderMaxDeg, current.boatProfile.rudderMaxDeg) })); } }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [capturingKey, keyBindings, settingsOpen, updateVoyage]);
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
    const base: Voyage = { portId: selectedPort.id, lat: launchPoint.lat, lon: launchPoint.lon, heading: selectedPort.heading, rudder: 0, rudderSensitivity: 1.6, mainSail: 0, genoaSail: 0, mainSheet: 0, genoaSheet: 0, motor: 0, engineRunning: false, autopilot: false, targetHeading: null, boatProfile, speedKn: 0, sailSpeedKn: 0, distanceNm: 0, grounded: false, selectedAnchor: 1, anchorRelease: 0, anchor1RodeM: 0, anchor2RodeM: 0, waterL: 180, waterReserveL: 90, fuelL: 95, fuelReserveL: 55, foodDays: 14, foodReserveDays: 21, cargoKg: 0, trail: [{ lat: launchPoint.lat, lon: launchPoint.lon }], startedAt: timestamp, updatedAt: timestamp };
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
  useEffect(() => {
    const panelFromTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return null;
      const element = target.closest<HTMLElement>("[data-floating-panel]"); const panel = element?.dataset.floatingPanel as FloatingPanelName | undefined;
      return element && panel && FLOATING_PANELS.includes(panel) ? { element, panel } : null;
    };
    const saveLayout = () => { window.localStorage.setItem(PANEL_POSITIONS_STORAGE_KEY, JSON.stringify(panelPositionsRef.current)); window.localStorage.setItem(PANEL_SIZES_STORAGE_KEY, JSON.stringify(panelSizesRef.current)); };
    const edgeAt = (element: HTMLElement, event: PointerEvent) => { const rect = element.getBoundingClientRect(); const edgeMargin = 10; return `${event.clientY - rect.top < edgeMargin ? "t" : ""}${rect.bottom - event.clientY < edgeMargin ? "b" : ""}${event.clientX - rect.left < edgeMargin ? "l" : ""}${rect.right - event.clientX < edgeMargin ? "r" : ""}`; };
    const resizeCursor = (edge: string) => edge === "tl" || edge === "br" ? "nwse-resize" : edge === "tr" || edge === "bl" ? "nesw-resize" : edge.includes("l") || edge.includes("r") ? "ew-resize" : "ns-resize";
    const resizeCursorClasses = ["resize-cursor--ns", "resize-cursor--ew", "resize-cursor--nwse", "resize-cursor--nesw"];
    let cursorPanel: HTMLElement | null = null;
    const setResizeCursor = (element: HTMLElement | null, edge = "") => { if (cursorPanel) cursorPanel.classList.remove(...resizeCursorClasses); cursorPanel = element; if (cursorPanel && edge) cursorPanel.classList.add(`resize-cursor--${resizeCursor(edge).replace("-resize", "")}`); };
    const updateResizeCursor = (event: PointerEvent) => { if (event.pointerType !== "mouse" || !(event.target instanceof HTMLElement) || event.target.closest("button, input, select, label, a")) { setResizeCursor(null); return; } const found = panelFromTarget(event.target); if (!found || found.element.classList.contains("is-minimized")) { setResizeCursor(null); return; } const edge = edgeAt(found.element, event); setResizeCursor(edge ? found.element : null, edge); };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof HTMLElement) || event.target.closest("button, input, select, label, a")) return;
      const found = panelFromTarget(event.target); if (!found) return;
      const { element, panel } = found; const rect = element.getBoundingClientRect(); const edge = edgeAt(element, event);
      if (edge) {
        const positions = { ...panelPositionsRef.current, [panel]: { x: rect.left, y: rect.top } }; panelPositionsRef.current = positions; setPanelPositions(positions);
        panelResizeRef.current = { panel, edge, startX: event.clientX, startY: event.clientY, width: rect.width, height: rect.height, left: rect.left, top: rect.top }; setResizeCursor(element, edge);
      } else if (event.target.closest(".floating-window-bar, .conditions-title")) {
        panelDragRef.current = { panel, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, width: rect.width, height: rect.height };
      } else return;
      setActivePanel(panel); element.setPointerCapture(event.pointerId); event.preventDefault();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!panelResizeRef.current && !panelDragRef.current) updateResizeCursor(event);
      const resize = panelResizeRef.current;
      if (resize) {
        const minWidth = 160; const minHeight = 46; let left = resize.left; let top = resize.top; let width = resize.width; let height = resize.height;
        if (resize.edge.includes("r")) width = clamp(resize.width + event.clientX - resize.startX, minWidth, window.innerWidth - left - 8);
        if (resize.edge.includes("b")) height = clamp(resize.height + event.clientY - resize.startY, minHeight, window.innerHeight - top - 8);
        if (resize.edge.includes("l")) { left = clamp(resize.left + event.clientX - resize.startX, 8, resize.left + resize.width - minWidth); width = resize.width - (left - resize.left); }
        if (resize.edge.includes("t")) { top = clamp(resize.top + event.clientY - resize.startY, 8, resize.top + resize.height - minHeight); height = resize.height - (top - resize.top); }
        const positions = { ...panelPositionsRef.current, [resize.panel]: { x: left, y: top } }; const sizes = { ...panelSizesRef.current, [resize.panel]: { width, height } };
        panelPositionsRef.current = positions; panelSizesRef.current = sizes; setPanelPositions(positions); setPanelSizes(sizes); return;
      }
      const drag = panelDragRef.current; if (!drag) return;
      const positions = { ...panelPositionsRef.current, [drag.panel]: { x: clamp(event.clientX - drag.offsetX, 8, Math.max(8, window.innerWidth - drag.width - 8)), y: clamp(event.clientY - drag.offsetY, 8, Math.max(8, window.innerHeight - drag.height - 8)) } }; panelPositionsRef.current = positions; setPanelPositions(positions);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!panelResizeRef.current && !panelDragRef.current) return;
      const found = panelFromTarget(event.target); if (found?.element.hasPointerCapture(event.pointerId)) found.element.releasePointerCapture(event.pointerId);
      panelResizeRef.current = null; panelDragRef.current = null; setResizeCursor(null); saveLayout();
    };
    document.addEventListener("pointerdown", onPointerDown); document.addEventListener("pointermove", onPointerMove); document.addEventListener("pointerup", onPointerUp); document.addEventListener("pointercancel", onPointerUp);
    return () => { setResizeCursor(null); document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("pointermove", onPointerMove); document.removeEventListener("pointerup", onPointerUp); document.removeEventListener("pointercancel", onPointerUp); };
  }, []);
  useEffect(() => { const toggleFolder = (event: MouseEvent) => { const heading = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>(".tools-inventory section > b") : null; if (heading) heading.parentElement?.classList.toggle("is-open"); }; document.addEventListener("click", toggleFolder); return () => document.removeEventListener("click", toggleFolder); }, []);
  useEffect(() => { const timer = window.setTimeout(() => { try { const saved = JSON.parse(window.localStorage.getItem("sailward.inventoryFolders.v1") ?? "[]"); if (Array.isArray(saved)) setInventoryFolders(saved.filter((item): item is string => typeof item === "string")); const savedTools = JSON.parse(window.localStorage.getItem("sailward.inventoryFolderTools.v1") ?? "{}"); if (savedTools && typeof savedTools === "object") setInventoryFolderTools(savedTools as Record<string, string[]>); } catch { window.localStorage.removeItem("sailward.inventoryFolders.v1"); window.localStorage.removeItem("sailward.inventoryFolderTools.v1"); } }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => { if (!toolsOpen) return; const inventory = document.querySelector<HTMLElement>(".tools-inventory"); if (!inventory) return; const baseTools = [...inventory.querySelectorAll<HTMLButtonElement>("section:not(.inventory-personal) > div > button")]; const folders = [...inventory.querySelectorAll<HTMLButtonElement>(".inventory-folder-toggle")]; baseTools.forEach((button) => { button.draggable = true; button.addEventListener("dragstart", (event) => { event.dataTransfer?.setData("text/plain", button.textContent?.replace("▸", "").trim() ?? ""); event.dataTransfer?.setData("application/x-sailward-tool", button.getAttribute("data-floating-panel") ?? button.textContent ?? ""); }); }); folders.forEach((folder) => { const name = folder.dataset.folder ?? ""; folder.addEventListener("dragover", (event) => { event.preventDefault(); folder.classList.add("is-drop-target"); }); folder.addEventListener("dragleave", () => folder.classList.remove("is-drop-target")); folder.addEventListener("drop", (event) => { event.preventDefault(); folder.classList.remove("is-drop-target"); const tool = event.dataTransfer?.getData("text/plain")?.trim(); if (!tool || !name) return; setInventoryFolderTools((current) => { const next = { ...current, [name]: [...new Set([...(current[name] ?? []), tool])] }; window.localStorage.setItem("sailward.inventoryFolderTools.v1", JSON.stringify(next)); return next; }); }); }); }, [toolsOpen, inventoryFolders]);
  useEffect(() => { if (!toolsOpen) return; document.querySelectorAll<HTMLButtonElement>(".tools-inventory section > div > button").forEach((button) => { if (button.textContent?.trim().toLowerCase() === "▸ sails") button.style.display = "none"; }); }, [toolsOpen]);
  useEffect(() => { if (!toolsOpen) return; const form = document.querySelector<HTMLFormElement>(".inventory-new-folder"); const input = form?.querySelector<HTMLInputElement>("input"); const confirm = form?.querySelector<HTMLButtonElement>("button[type=submit]"); if (!form || !input || !confirm) return; input.style.display = "none"; confirm.textContent = "+"; confirm.classList.add("inventory-add-folder"); const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "inventory-cancel-folder"; cancel.textContent = "×"; cancel.style.display = "none"; form.append(cancel); const open = (event: MouseEvent) => { if (input.style.display !== "none") return; event.preventDefault(); input.style.display = "block"; cancel.style.display = "block"; confirm.textContent = "✓"; input.focus(); }; const close = () => { input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true })); input.style.display = "none"; cancel.style.display = "none"; confirm.textContent = "+"; }; confirm.addEventListener("click", open); cancel.addEventListener("click", close); return () => { confirm.removeEventListener("click", open); cancel.removeEventListener("click", close); cancel.remove(); }; }, [toolsOpen]);
  useEffect(() => {
    const onDoubleClick = (event: MouseEvent) => {
      if (!(event.target instanceof HTMLElement) || event.target.closest("button, input, select, label, a")) return;
      const bar = event.target.closest<HTMLElement>(".floating-window-bar, .conditions-title"); const element = event.target.closest<HTMLElement>("[data-floating-panel]"); const panel = element?.dataset.floatingPanel as FloatingPanelName | undefined;
      if (!bar || !element || !panel || !FLOATING_PANELS.includes(panel)) return;
      event.preventDefault(); setActivePanel(panel);
      if (panelPositionsRef.current[panel] || panelSizesRef.current[panel]) {
        const positions = { ...panelPositionsRef.current }; const sizes = { ...panelSizesRef.current }; delete positions[panel]; delete sizes[panel]; panelPositionsRef.current = positions; panelSizesRef.current = sizes; setPanelPositions(positions); setPanelSizes(sizes); window.localStorage.setItem(PANEL_POSITIONS_STORAGE_KEY, JSON.stringify(positions)); window.localStorage.setItem(PANEL_SIZES_STORAGE_KEY, JSON.stringify(sizes));
      } else {
        setMinimizedPanels((current) => { const next = { ...current, [panel]: !current[panel] }; window.localStorage.setItem(MINIMIZED_PANELS_STORAGE_KEY, JSON.stringify(next)); return next; });
      }
    };
    document.addEventListener("dblclick", onDoubleClick); return () => document.removeEventListener("dblclick", onDoubleClick);
  }, []);
  useEffect(() => {
    const enhanceWindows = () => document.querySelectorAll<HTMLElement>("[data-floating-panel]").forEach((windowElement) => {
      const actions = windowElement.querySelector<HTMLElement>(".floating-window-actions"); if (!actions || actions.querySelector(".window-close-button")) return;
      const close = document.createElement("button"); close.type = "button"; close.className = "window-close-button"; close.setAttribute("aria-label", "Cerrar ventana"); close.title = "Cerrar ventana"; close.textContent = "×"; close.onclick = () => { windowElement.classList.add("is-tool-closed"); };
      actions.prepend(close);
    });
    enhanceWindows(); const observer = new MutationObserver(enhanceWindows); observer.observe(document.body, { childList: true, subtree: true }); return () => observer.disconnect();
  }, []);
  useEffect(() => { const shell = document.querySelector<HTMLElement>(".game-shell"); if (!shell) return; const tab = document.createElement("button"); tab.type = "button"; tab.className = `inventory-dock-tab ${toolsOpen ? "is-open" : ""}`; tab.textContent = "INVENTARIO"; tab.setAttribute("aria-label", toolsOpen ? "Ocultar inventario" : "Abrir inventario"); tab.setAttribute("aria-expanded", String(toolsOpen)); tab.onclick = () => setToolsOpen((open) => !open); shell.append(tab); return () => tab.remove(); }, [toolsOpen]);
  useEffect(() => { if (!settingsOpen) return; const content = document.querySelector<HTMLElement>(".settings-content"); if (!content) return; const section = document.createElement("section"); section.className = "map-layer-settings"; section.innerHTML = `<span>MAPA</span><strong>Capas cartográficas</strong><small>Elegí las capas que querés ver durante la travesía.</small>`; const satellite = document.createElement("button"); satellite.type = "button"; satellite.className = satelliteLayer ? "is-active" : ""; satellite.textContent = `SATELITAL · ${satelliteLayer ? "ACTIVA" : "OCULTA"}`; satellite.onclick = () => setSatelliteLayer((active) => !active); const nautical = document.createElement("button"); nautical.type = "button"; nautical.className = nauticalLayer ? "is-active" : ""; nautical.textContent = `CARTA NÁUTICA · ${nauticalLayer ? "ACTIVA" : "OCULTA"}`; nautical.onclick = () => setNauticalLayer((active) => !active); section.append(satellite, nautical); content.prepend(section); return () => section.remove(); }, [settingsOpen, satelliteLayer, nauticalLayer]);
  useEffect(() => { if (!voyage) return; const brand = document.querySelector<HTMLElement>(".brand-bar"); const lockup = brand?.querySelector<HTMLElement>(".brand-lockup"); if (!brand || !lockup) return; const center = document.createElement("button"); center.type = "button"; center.className = `brand-follow-button ${followBoat ? "is-active" : ""}`; center.textContent = "⌖"; center.setAttribute("aria-label", followBoat ? "Desactivar seguimiento del barco" : "Centrar y seguir barco"); center.title = followBoat ? "Desactivar seguimiento" : "Centrar barco"; center.onclick = toggleFollowBoat; lockup.after(center); return () => center.remove(); }, [voyage, followBoat]);
  const beginAnchorWinch = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect(); const angle = toDegrees(Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2)));
    anchorWinchDragRef.current = { pointerId: event.pointerId, lastAngle: angle }; event.currentTarget.setPointerCapture(event.pointerId); updateVoyage((current) => ({ ...current, anchorRelease: 0 })); event.preventDefault();
  };
  const moveAnchorWinch = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = anchorWinchDragRef.current; if (!drag || drag.pointerId !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const rect = event.currentTarget.getBoundingClientRect(); const angle = toDegrees(Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2))); const delta = signedAngle(drag.lastAngle, angle); drag.lastAngle = angle;
    if (Math.abs(delta) < 0.05) return;
    setAnchorWinchRotation((current) => current + delta);
    const meters = Math.abs(delta) / 360 * ANCHOR_RETRIEVE_M_PER_TURN;
    updateVoyage((current) => { const rodeKey = current.selectedAnchor === 1 ? "anchor1RodeM" : "anchor2RodeM"; return { ...current, anchorRelease: 0, [rodeKey]: Math.max(0, current[rodeKey] - meters) }; });
  };
  const endAnchorWinch = (event: ReactPointerEvent<HTMLButtonElement>) => { if (!anchorWinchDragRef.current) return; anchorWinchDragRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); };
  useEffect(() => { const winchFrom = (target: EventTarget | null) => { const button = target instanceof HTMLElement ? target.closest<HTMLButtonElement>(".deck-winch") : null; const id = button?.closest<HTMLElement>("[data-floating-panel]")?.dataset.floatingPanel as WinchId | undefined; return button && id && WINCHES.some((winch) => winch.id === id) ? { button, id } : null; }; const down = (event: PointerEvent) => { const found = winchFrom(event.target); if (!found || event.button !== 0) return; const rect = found.button.getBoundingClientRect(); deckWinchDragRef.current[found.id] = { pointerId: event.pointerId, lastAngle: toDegrees(Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2))) }; found.button.setPointerCapture(event.pointerId); event.stopPropagation(); }; const move = (event: PointerEvent) => { for (const [id, drag] of Object.entries(deckWinchDragRef.current) as [WinchId, AnchorWinchDrag][]) { const button = document.querySelector<HTMLButtonElement>(`[data-floating-panel="${id}"] .deck-winch`); if (!button || !drag || !button.hasPointerCapture(event.pointerId)) continue; const rect = button.getBoundingClientRect(); const angle = toDegrees(Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2))); const delta = signedAngle(drag.lastAngle, angle); drag.lastAngle = angle; if (Math.abs(delta) > .05) setWinchRotation((current) => ({ ...current, [id]: current[id] + delta })); event.stopPropagation(); } }; const up = (event: PointerEvent) => { for (const [id, drag] of Object.entries(deckWinchDragRef.current) as [WinchId, AnchorWinchDrag][]) if (drag.pointerId === event.pointerId) { delete deckWinchDragRef.current[id]; const button = document.querySelector<HTMLButtonElement>(`[data-floating-panel="${id}"] .deck-winch`); if (button?.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId); event.stopPropagation(); } }; document.addEventListener("pointerdown", down, true); document.addEventListener("pointermove", move, true); document.addEventListener("pointerup", up, true); document.addEventListener("pointercancel", up, true); return () => { document.removeEventListener("pointerdown", down, true); document.removeEventListener("pointermove", move, true); document.removeEventListener("pointerup", up, true); document.removeEventListener("pointercancel", up, true); }; }, []);
  useEffect(() => { if (!voyage) return; WINCHES.forEach(({ id }) => { const host = document.querySelector<HTMLElement>(`[data-floating-panel="${id}"] .winch-control > div`); if (!host) return; let readout = host.querySelector<HTMLElement>(".winch-line-percent"); if (!readout) { readout = document.createElement("strong"); readout.className = "winch-line-percent"; host.append(readout); } const line = winchLine[id]; readout.textContent = `${line} · ${Math.round(winchLinePercentage(voyage, line))}%`; }); }, [voyage, winchLine]);
  useEffect(() => { const move = (event: PointerEvent) => { const winch = event.target instanceof HTMLElement ? event.target.closest<HTMLButtonElement>(".deck-winch") : null; const id = winch?.closest<HTMLElement>("[data-floating-panel]")?.dataset.floatingPanel as WinchId | undefined; if (!winch || !id || !winch.hasPointerCapture(event.pointerId) || Math.abs(event.movementX) < 0.1) return; updateVoyage((current) => adjustWinchLine(current, winchLine[id], event.movementX * 0.45)); }; document.addEventListener("pointermove", move, true); return () => document.removeEventListener("pointermove", move, true); }, [updateVoyage, winchLine]);
  const resetPanelPosition = (panel: FloatingPanelName) => { const next = { ...panelPositionsRef.current }; delete next[panel]; panelPositionsRef.current = next; setPanelPositions(next); window.localStorage.setItem(PANEL_POSITIONS_STORAGE_KEY, JSON.stringify(next)); };
  const togglePanelMinimized = (panel: FloatingPanelName) => { setMinimizedPanels((current) => { const next = { ...current, [panel]: !current[panel] }; window.localStorage.setItem(MINIMIZED_PANELS_STORAGE_KEY, JSON.stringify(next)); return next; }); setActivePanel(panel); };
  const floatingPanelStyle = (panel: FloatingPanelName): CSSProperties => { const position = panelPositions[panel]; const size = panelSizes[panel]; return { ...(position ? { left: position.x, top: position.y, right: "auto", bottom: "auto", transform: "none" } : {}), ...(size && !minimizedPanels[panel] ? { width: size.width, height: size.height } : {}), zIndex: activePanel === panel ? 12 : 7 }; };
  const resetVoyage = () => { if (!window.confirm("¿Finalizar este viaje y volver a elegir puerto?")) return; window.localStorage.removeItem(STORAGE_KEY); setVoyage(null); setFollowBoat(true); };
  const utcTime = now ? new Date(now).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" }) : "--:--:--";
  const gps = voyage ? gpsNavigation(voyage, conditions) : { course: 0, speedKn: 0 };
  const apparent = apparentWind(conditions.windKn, conditions.windDirection, gps.speedKn, gps.course);
  const shallowDepth = depthAlarm.armed && conditions.depthM <= depthAlarm.thresholdM;
  const cargoCapacityKg = 420;
  const cargoFreeKg = Math.max(0, cargoCapacityKg - (voyage?.cargoKg ?? 0));
  const engineLoad = Math.abs(voyage?.motor ?? 0);
  const engineTemperatureC = voyage?.engineRunning ? Math.round(62 + engineLoad * 0.28) : 22;
  const engineOilPressureBar = voyage?.engineRunning ? (2.2 + engineLoad * 0.024).toFixed(1) : "0.0";
  const engineGear = voyage?.motor === 0 ? "PUNTO MUERTO" : (voyage?.motor ?? 0) < 0 ? "REVERSA" : "ADELANTE";
  const selectedAnchor = voyage?.selectedAnchor ?? 1; const selectedAnchorRode = voyage ? anchorRode(voyage, selectedAnchor) : 0; const selectedAnchorStatus = voyage ? anchorStatus(voyage, conditions, selectedAnchor) : "ESTIBADA";
  return <main className={`game-shell ${voyage ? "is-sailing" : "is-docked"}`}><div ref={mapContainerRef} className="world-map" aria-label="Mapa mundial interactivo de Sailward" /><div className="ocean-vignette" aria-hidden="true" />
    <header className="brand-bar"><button type="button" className="brand-lockup brand-button" aria-label="Abrir ajustes de Sailward" title="Ajustes" onClick={() => setSettingsOpen(true)}><span className="brand-mark" aria-hidden="true">S</span><div><strong>SAILWARD <em>v{APP_VERSION}</em></strong><span>REAL-TIME SAILING</span></div></button><div className="world-clock"><span className="live-dot" /><span>{utcTime} UTC</span><small>TIEMPO REAL · 1×</small></div></header>
    {voyage && WINCHES.map((winch) => <section key={winch.id} className={`instrument-window winch-window floating-window ${minimizedPanels[winch.id] ? "is-minimized" : ""}`} data-floating-panel={winch.id} style={floatingPanelStyle(winch.id)} onPointerDownCapture={() => setActivePanel(winch.id)}><div className="floating-window-bar"><span>{winch.title} <strong className="minimized-summary">{winchLine[winch.id]}</strong></span><div className="floating-window-actions"><button type="button" className="window-minimize-button" aria-label={minimizedPanels[winch.id] ? `Restaurar ${winch.title}` : `Minimizar ${winch.title}`} onClick={() => togglePanelMinimized(winch.id)}>{minimizedPanels[winch.id] ? "□" : "—"}</button></div></div><div className="winch-window-content floating-window-content"><span>{winch.side}</span><div className="winch-line-selector">{winch.lines.map((line) => <button type="button" key={line} className={winchLine[winch.id] === line ? "is-active" : ""} onClick={() => setWinchLine((current) => ({ ...current, [winch.id]: line }))}>{line}</button>)}</div><div className="winch-control"><button type="button" className="deck-winch" aria-label={`Girar ${winch.title}`} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); }} onPointerMove={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; setWinchRotation((current) => ({ ...current, [winch.id]: current[winch.id] + event.movementX * 2 })); }} onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)} onPointerCancel={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}><i style={{ transform: `rotate(${winchRotation[winch.id]}deg)` }} /></button><div><strong>{winchFiling[winch.id] ? "FILANDO" : "EN FRENO"}</strong><small>{winchFiling[winch.id] ? "Girá para soltar cabo" : "Girá para cobrar cabo"}</small><button type="button" className={winchFiling[winch.id] ? "is-filing" : ""} aria-pressed={winchFiling[winch.id]} onClick={() => setWinchFiling((current) => ({ ...current, [winch.id]: !current[winch.id] }))}>{winchFiling[winch.id] ? "TOMAR FRENO" : "FILAR"}</button></div></div></div></section>)}
    {settingsOpen && <div className="settings-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) { setCapturingKey(null); setSettingsOpen(false); } }}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="settings-header"><div><span>SAILWARD</span><h2 id="settings-title">Ajustes</h2></div><button type="button" aria-label="Cerrar ajustes" onClick={() => { setCapturingKey(null); setSettingsOpen(false); }}>×</button></header>
        <div className="settings-layout"><nav aria-label="Secciones de ajustes"><button type="button" className="is-active"><span aria-hidden="true">⌨</span> TECLAS</button></nav>
          <div className="settings-content">
            <span className="settings-eyebrow">CONTROLES</span><h3>Teclas</h3><p>Elegí una acción y luego presioná la tecla que quieras asignar.</p>
            <div className="key-binding-list">{([ ["rudderLeft", "Timón a babor"], ["rudderRight", "Timón a estribor"] ] as const).map(([binding, label]) => <div className="key-binding-row" key={binding}><div><strong>{label}</strong><small>{binding === "rudderLeft" ? "Girar hacia la izquierda" : "Girar hacia la derecha"}</small></div><button type="button" className={capturingKey === binding ? "is-capturing" : ""} aria-label={`Cambiar tecla para ${label}`} onClick={() => setCapturingKey(binding)} onKeyDown={(event) => { if (capturingKey !== binding) return; event.preventDefault(); event.stopPropagation(); assignKey(binding, event.code); }}>{capturingKey === binding ? "PRESIONÁ…" : keyLabel(keyBindings[binding])}</button></div>)}</div>
            {voyage && <label className="settings-range"><span><strong>Sensibilidad de timón</strong><small>{Math.round(voyage.rudderSensitivity * 100)}% · Influencia del timón en el giro.</small></span><input aria-label="Sensibilidad de timón" type="range" min="0.5" max="2.5" step="0.1" value={voyage.rudderSensitivity} onChange={(event) => updateVoyage((current) => ({ ...current, rudderSensitivity: Number(event.target.value) }))} /></label>}
            <section className="boat-profile-settings"><div className="boat-profile-heading"><div><span>PERFIL DE BARCO</span><strong>1 perfil guardado</strong></div><small>Se aplicará a la travesía actual y a las próximas.</small></div><label className="boat-profile-name"><span>NOMBRE</span><input aria-label="Nombre del perfil del barco" value={boatProfile.name} onChange={(event) => updateBoatProfile((current) => ({ ...current, name: event.target.value }))} /></label><label className="boat-profile-range"><span><strong>Velocidad máxima del motor</strong><b>{boatProfile.motorMaxKn.toFixed(1)} kn</b></span><input aria-label="Velocidad máxima del motor" type="range" min="2" max="12" step="0.1" value={boatProfile.motorMaxKn} onChange={(event) => updateBoatProfile((current) => ({ ...current, motorMaxKn: Number(event.target.value) }))} /></label><label className="boat-profile-range"><span><strong>Ángulo máximo de timón</strong><b>{boatProfile.rudderMaxDeg}°</b></span><input aria-label="Ángulo máximo de timón" type="range" min="20" max="45" step="1" value={boatProfile.rudderMaxDeg} onChange={(event) => updateBoatProfile((current) => ({ ...current, rudderMaxDeg: Number(event.target.value) }))} /></label><label className="boat-profile-range"><span><strong>Velocidad de giro</strong><b>{boatProfile.rudderTurnRate}°/min</b></span><input aria-label="Velocidad de giro" type="range" min="4" max="24" step="1" value={boatProfile.rudderTurnRate} onChange={(event) => updateBoatProfile((current) => ({ ...current, rudderTurnRate: Number(event.target.value) }))} /></label><small className="boat-profile-note">Guardado en este dispositivo. Podrás añadir más perfiles más adelante.</small></section>
            <div className="settings-footer"><small>Los próximos comandos aparecerán en esta sección.</small><button type="button" onClick={resetKeyBindings}>RESTAURAR A / D</button></div>{voyage && <div className="settings-danger-zone"><div><span>SIMULACIÓN</span><small>Finalizá el viaje actual y volvé a elegir un puerto.</small></div><button type="button" onClick={resetVoyage}>FINALIZAR SIMULACIÓN</button></div>}
          </div>
        </div>
      </section>
    </div>}
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
      <aside className={`voyage-card floating-window ${minimizedPanels.voyage ? "is-minimized" : ""}`} data-floating-panel="voyage" style={floatingPanelStyle("voyage")} onPointerDownCapture={() => setActivePanel("voyage")}><div className="floating-window-bar"><span>TRAVESÍA ACTIVA</span><div className="floating-window-actions"><button type="button" className="window-drag-handle" aria-label="Mover ventana de travesía" title="Arrastrar para mover · doble clic para restaurar" onPointerDown={(event) => beginPanelDrag("voyage", event)} onPointerMove={movePanel} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag} onDoubleClick={() => resetPanelPosition("voyage")}>⠿</button><button type="button" className="window-minimize-button" aria-label={minimizedPanels.voyage ? "Restaurar ventana de travesía" : "Minimizar ventana de travesía"} aria-expanded={!minimizedPanels.voyage} onClick={() => togglePanelMinimized("voyage")}>{minimizedPanels.voyage ? "□" : "—"}</button></div></div><div className="floating-window-content"><strong>{PORTS.find((port) => port.id === voyage.portId)?.name}</strong><span>{voyage.autopilot ? `PILOTO · ${compassPoint(voyage.targetHeading ?? voyage.heading)}` : "MANUAL · TIMÓN"}</span><div className="voyage-distance">{voyage.distanceNm.toFixed(1)} <small>MN</small></div></div></aside>
      <aside className={`instrument-window compass-window floating-window ${minimizedPanels.compass ? "is-minimized" : ""}`} data-floating-panel="compass" style={floatingPanelStyle("compass")} onPointerDownCapture={() => setActivePanel("compass")}>
        <div className="floating-window-bar"><span>COMPASS <strong className="minimized-summary">{Math.round(voyage.heading).toString().padStart(3, "0")}° · {compassPoint(voyage.heading)}</strong></span><div className="floating-window-actions"><button type="button" className="window-drag-handle" aria-label="Mover ventana del compás" title="Arrastrar para mover · doble clic para restaurar" onPointerDown={(event) => beginPanelDrag("compass", event)} onPointerMove={movePanel} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag} onDoubleClick={() => resetPanelPosition("compass")}>⠿</button><button type="button" className="window-minimize-button" aria-label={minimizedPanels.compass ? "Restaurar ventana del compás" : "Minimizar ventana del compás"} aria-expanded={!minimizedPanels.compass} onClick={() => togglePanelMinimized("compass")}>{minimizedPanels.compass ? "□" : "—"}</button></div></div>
        <div className="instrument-window-content floating-window-content"><div className="compass-dial" aria-hidden="true"><span style={{ transform: `rotate(${voyage.heading}deg)` }} /></div><div className="instrument-primary"><strong>{Math.round(voyage.heading).toString().padStart(3, "0")}°</strong><span>{compassPoint(voyage.heading)} · HEADING</span></div></div>
      </aside>
      <aside className={`instrument-window gps-window floating-window ${minimizedPanels.gps ? "is-minimized" : ""}`} data-floating-panel="gps" style={floatingPanelStyle("gps")} onPointerDownCapture={() => setActivePanel("gps")}>
        <div className="floating-window-bar"><span>GPS <strong className="minimized-summary">COG {Math.round(gps.course).toString().padStart(3, "0")}° · SOG {gps.speedKn.toFixed(1)} kn</strong></span><div className="floating-window-actions"><button type="button" className="window-drag-handle" aria-label="Mover ventana GPS" title="Arrastrar para mover · doble clic para restaurar" onPointerDown={(event) => beginPanelDrag("gps", event)} onPointerMove={movePanel} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag} onDoubleClick={() => resetPanelPosition("gps")}>⠿</button><button type="button" className="window-minimize-button" aria-label={minimizedPanels.gps ? "Restaurar ventana GPS" : "Minimizar ventana GPS"} aria-expanded={!minimizedPanels.gps} onClick={() => togglePanelMinimized("gps")}>{minimizedPanels.gps ? "□" : "—"}</button></div></div>
        <div className="instrument-window-content gps-content floating-window-content"><div className="instrument-grid"><div><span>RUMBO GPS · COG</span><strong>{Math.round(gps.course).toString().padStart(3, "0")}° · {compassPoint(gps.course)}</strong></div><div><span>VELOCIDAD GPS · SOG</span><strong>{gps.speedKn.toFixed(1)} kn</strong></div></div><div className="gps-coordinates"><span>{formatCoordinate(voyage.lat, "N", "S")}</span><span>{formatCoordinate(voyage.lon, "E", "O")}</span></div>{voyage.grounded && <span className="grounded">TIERRA: SIN AVANCE</span>}</div>
      </aside>
      <aside className={`instrument-window wind-window floating-window ${minimizedPanels.wind ? "is-minimized" : ""}`} data-floating-panel="wind" style={floatingPanelStyle("wind")} onPointerDownCapture={() => setActivePanel("wind")}>
        <div className="floating-window-bar"><span><span className="live-dot" /> VIENTO <strong className="minimized-summary">R {conditions.windKn.toFixed(1)} kn/{Math.round(conditions.windDirection).toString().padStart(3, "0")}° · A {apparent.speedKn.toFixed(1)} kn/{Math.round(apparent.direction).toString().padStart(3, "0")}°</strong></span><div className="floating-window-actions"><button type="button" className="window-drag-handle" aria-label="Mover ventana de viento" title="Arrastrar para mover · doble clic para restaurar" onPointerDown={(event) => beginPanelDrag("wind", event)} onPointerMove={movePanel} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag} onDoubleClick={() => resetPanelPosition("wind")}>⠿</button><button type="button" className="instrument-refresh" aria-label="Actualizar viento" title="Actualizar viento" onClick={() => void refreshConditions(voyage.lat, voyage.lon)}>↻</button><button type="button" className="window-minimize-button" aria-label={minimizedPanels.wind ? "Restaurar ventana de viento" : "Minimizar ventana de viento"} aria-expanded={!minimizedPanels.wind} onClick={() => togglePanelMinimized("wind")}>{minimizedPanels.wind ? "□" : "—"}</button></div></div>
        <div className="instrument-window-content wind-content floating-window-content"><div className="wind-reading"><span>VIENTO REAL</span><strong>{conditions.windKn.toFixed(1)} kn</strong><small>{Math.round(conditions.windDirection).toString().padStart(3, "0")}° · {compassPoint(conditions.windDirection)}</small></div><div className="wind-reading"><span>VIENTO APARENTE</span><strong>{apparent.speedKn.toFixed(1)} kn</strong><small>{Math.round(apparent.direction).toString().padStart(3, "0")}° · {compassPoint(apparent.direction)}</small></div><small className="instrument-source">{conditionsBusy ? "Actualizando…" : conditions.source === "live" ? "Datos en vivo" : "Datos estimados"}</small></div>
      </aside>
      <aside className={`instrument-window rigging-window floating-window ${minimizedPanels.rigging ? "is-minimized" : ""}`} data-floating-panel="rigging" style={floatingPanelStyle("rigging")} onPointerDownCapture={() => setActivePanel("rigging")}>
        <div className="floating-window-bar"><span>SUPERFICIES Y LÍNEAS <strong className="minimized-summary">MY {Math.round(voyage.mainSail)}% · GE {Math.round(voyage.genoaSail)}% · EM {Math.round(voyage.mainSheet)}% · EG {Math.round(voyage.genoaSheet)}%</strong></span><div className="floating-window-actions"><button type="button" className="window-drag-handle" aria-label="Mover ventana de superficies y líneas" title="Arrastrar para mover · doble clic para restaurar" onPointerDown={(event) => beginPanelDrag("rigging", event)} onPointerMove={movePanel} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag} onDoubleClick={() => resetPanelPosition("rigging")}>⠿</button><button type="button" className="window-minimize-button" aria-label={minimizedPanels.rigging ? "Restaurar ventana de superficies y líneas" : "Minimizar ventana de superficies y líneas"} aria-expanded={!minimizedPanels.rigging} onClick={() => togglePanelMinimized("rigging")}>{minimizedPanels.rigging ? "□" : "—"}</button></div></div>
        <div className="rigging-window-content floating-window-content"><section><span>SUPERFICIES</span><div className="rigging-values"><div><small>MAYOR</small><strong>{Math.round(voyage.mainSail)}%</strong></div><div><small>GENOA</small><strong>{Math.round(voyage.genoaSail)}%</strong></div></div></section><section><span>LÍNEAS</span><div className="rigging-values rigging-values--lines"><div><small>DRIZA MAYOR</small><strong>{Math.round(voyage.mainSail)}%</strong></div><div><small>ENROLLADOR GENOA</small><strong>{Math.round(voyage.genoaSail)}%</strong></div><div><small>ESCOTA MAYOR</small><strong>{Math.round(voyage.mainSheet)}%</strong></div><div><small>ESCOTA GENOA BABOR</small><strong>{Math.round(voyage.genoaSheet)}%</strong></div><div><small>ESCOTA GENOA ESTRIBOR</small><strong>{Math.round(voyage.genoaSheet)}%</strong></div></div></section></div>
      </aside>
      <aside className={`instrument-window resources-window floating-window ${minimizedPanels.resources ? "is-minimized" : ""}`} data-floating-panel="resources" style={floatingPanelStyle("resources")} onPointerDownCapture={() => setActivePanel("resources")}>
        <div className="floating-window-bar"><span>RECURSOS Y BODEGA <strong className="minimized-summary">A {Math.round(voyage.waterL)} L · C {Math.round(voyage.fuelL)} L · F {Math.round(voyage.foodDays)} d</strong></span><div className="floating-window-actions"><button type="button" className="window-drag-handle" aria-label="Mover ventana de recursos y bodega" title="Arrastrar para mover · doble clic para restaurar" onPointerDown={(event) => beginPanelDrag("resources", event)} onPointerMove={movePanel} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag} onDoubleClick={() => resetPanelPosition("resources")}>⠿</button><button type="button" className="window-minimize-button" aria-label={minimizedPanels.resources ? "Restaurar ventana de recursos y bodega" : "Minimizar ventana de recursos y bodega"} aria-expanded={!minimizedPanels.resources} onClick={() => togglePanelMinimized("resources")}>{minimizedPanels.resources ? "□" : "—"}</button></div></div>
        <div className="resources-window-content floating-window-content"><section className="resource-list" aria-label="Recursos a bordo"><div className="resource-row"><span>AGUA</span><strong>{Math.round(voyage.waterL)} <small>/ 220 L</small></strong><i><b style={{ width: `${(voyage.waterL / 220) * 100}%` }} /></i><em>Reserva: {Math.round(voyage.waterReserveL)} L</em></div><div className="resource-row"><span>COMBUSTIBLE</span><strong>{Math.round(voyage.fuelL)} <small>/ 120 L</small></strong><i><b style={{ width: `${(voyage.fuelL / 120) * 100}%` }} /></i><em>Reserva: {Math.round(voyage.fuelReserveL)} L</em></div><div className="resource-row"><span>COMIDA</span><strong>{Math.round(voyage.foodDays)} <small>días</small></strong><i><b style={{ width: `${(voyage.foodDays / 30) * 100}%` }} /></i><em>Reserva: {Math.round(voyage.foodReserveDays)} días</em></div></section><section className="cargo-summary"><div><span>BODEGA</span><strong>{Math.round(voyage.cargoKg)} <small>/ {cargoCapacityKg} kg</small></strong></div><i><b style={{ width: `${(voyage.cargoKg / cargoCapacityKg) * 100}%` }} /></i><small>{Math.round(cargoFreeKg)} kg libres · Reservas y mercancía próximamente.</small></section></div>
      </aside>
      <aside className={`instrument-window depth-window floating-window ${minimizedPanels.depth ? "is-minimized" : ""} ${shallowDepth ? "is-shallow" : ""}`} data-floating-panel="depth" style={floatingPanelStyle("depth")} onPointerDownCapture={() => setActivePanel("depth")}>
        <div className="floating-window-bar"><span>DEPTH SOUNDER <strong className="minimized-summary">{conditions.depthM} m · {depthAlarm.armed ? `Alarma ${depthAlarm.thresholdM} m` : "Alarma OFF"}</strong></span><div className="floating-window-actions"><button type="button" className="window-drag-handle" aria-label="Mover ventana de sonda de profundidad" title="Arrastrar para mover · doble clic para restaurar" onPointerDown={(event) => beginPanelDrag("depth", event)} onPointerMove={movePanel} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag} onDoubleClick={() => resetPanelPosition("depth")}>⠿</button><button type="button" className="window-minimize-button" aria-label={minimizedPanels.depth ? "Restaurar ventana de sonda de profundidad" : "Minimizar ventana de sonda de profundidad"} aria-expanded={!minimizedPanels.depth} onClick={() => togglePanelMinimized("depth")}>{minimizedPanels.depth ? "□" : "—"}</button></div></div>
        <div className="depth-window-content floating-window-content"><div className="depth-reading"><span>PROFUNDIDAD</span><strong>{conditions.depthM}</strong><small>METROS</small></div><div className={`depth-alarm-status ${shallowDepth ? "is-alert" : ""}`}>{shallowDepth ? "ALARMA · BAJA PROFUNDIDAD" : depthAlarm.armed ? "ALARMA ARMADA" : "ALARMA DESACTIVADA"}</div><label className="depth-threshold"><span>ALARMA A PARTIR DE</span><div><input aria-label="Profundidad de alarma" type="number" min="1" max="100" value={depthAlarm.thresholdM} onChange={(event) => updateDepthAlarm((current) => ({ ...current, thresholdM: clamp(Number(event.target.value) || 1, 1, 100) }))} /><small>m</small></div></label><input aria-label="Umbral de alarma de profundidad" type="range" min="1" max="100" value={depthAlarm.thresholdM} onChange={(event) => updateDepthAlarm((current) => ({ ...current, thresholdM: Number(event.target.value) }))} /><button type="button" className={`depth-alarm-toggle ${depthAlarm.armed ? "is-active" : ""}`} aria-pressed={depthAlarm.armed} onClick={() => updateDepthAlarm((current) => ({ ...current, armed: !current.armed }))}>{depthAlarm.armed ? "DESACTIVAR ALARMA" : "ACTIVAR ALARMA"}</button><small className="depth-note">Estimación de profundidad del entorno.</small></div>
      </aside>
      <aside className={`conditions-card meteorology-window floating-window ${minimizedPanels.conditions ? "is-minimized" : ""}`} data-floating-panel="conditions" style={floatingPanelStyle("conditions")} onPointerDownCapture={() => setActivePanel("conditions")}><div className="conditions-title"><div><span className="live-dot" /> METEOROLOGÍA <strong className="minimized-summary">V {conditions.windKn.toFixed(0)} kn · O {conditions.waveHeight.toFixed(1)} m · C {conditions.currentKn.toFixed(1)} kn</strong></div><div className="floating-window-actions"><button type="button" className="window-drag-handle" aria-label="Mover ventana de meteorología" title="Arrastrar para mover · doble clic para restaurar" onPointerDown={(event) => beginPanelDrag("conditions", event)} onPointerMove={movePanel} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag} onDoubleClick={() => resetPanelPosition("conditions")}>⠿</button><button title="Actualizar meteorología" onClick={() => void refreshConditions(voyage.lat, voyage.lon)}>↻</button><button type="button" className="window-minimize-button" aria-label={minimizedPanels.conditions ? "Restaurar ventana de meteorología" : "Minimizar ventana de meteorología"} aria-expanded={!minimizedPanels.conditions} onClick={() => togglePanelMinimized("conditions")}>{minimizedPanels.conditions ? "□" : "—"}</button></div></div><div className="floating-window-content"><dl><div><dt>Viento real</dt><dd>{conditions.windKn.toFixed(1)} kn · {Math.round(conditions.windDirection).toString().padStart(3, "0")}°</dd></div><div><dt>Olas</dt><dd>{conditions.waveHeight.toFixed(1)} m</dd></div><div><dt>Corriente</dt><dd>{conditions.currentKn.toFixed(1)} kn · {Math.round(conditions.currentDirection).toString().padStart(3, "0")}°</dd></div></dl><small>{conditionsBusy ? "Actualizando…" : conditions.source === "live" ? "Información local en vivo" : "Información local estimada"}</small></div></aside>
      <section className={`instrument-window engine-window floating-window ${minimizedPanels.engine ? "is-minimized" : ""}`} data-floating-panel="engine" style={floatingPanelStyle("engine")} onPointerDownCapture={() => setActivePanel("engine")}>
        <div className="floating-window-bar"><span>MOTOR <strong className="minimized-summary">{voyage.engineRunning ? `${engineGear} · ${Math.abs(Math.round(voyage.motor))}%` : "APAGADO"}</strong></span><div className="floating-window-actions"><button type="button" className="window-drag-handle" aria-label="Mover ventana de motor" title="Arrastrar para mover · doble clic para restaurar" onPointerDown={(event) => beginPanelDrag("engine", event)} onPointerMove={movePanel} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag} onDoubleClick={() => resetPanelPosition("engine")}>⠿</button><button type="button" className="window-minimize-button" aria-label={minimizedPanels.engine ? "Restaurar ventana de motor" : "Minimizar ventana de motor"} aria-expanded={!minimizedPanels.engine} onClick={() => togglePanelMinimized("engine")}>{minimizedPanels.engine ? "□" : "—"}</button></div></div>
        <div className="engine-window-content floating-window-content"><div className="engine-state"><span className={voyage.engineRunning ? "is-running" : ""} /> <strong>{voyage.engineRunning ? "ENCENDIDO" : "APAGADO"}</strong><button type="button" disabled={!voyage.engineRunning && voyage.fuelL <= 0} onClick={() => updateVoyage((current) => ({ ...current, engineRunning: !current.engineRunning && current.fuelL > 0 }))}>{voyage.engineRunning ? "APAGAR" : voyage.fuelL > 0 ? "ENCENDER" : "SIN COMBUSTIBLE"}</button></div><div className="engine-gauges"><div><span>COMBUSTIBLE</span><strong>{Math.round(voyage.fuelL)} <small>/ 120 L</small></strong><i><b style={{ width: `${(voyage.fuelL / 120) * 100}%` }} /></i></div><div><span>TEMPERATURA</span><strong>{engineTemperatureC}<small>°C</small></strong><i><b style={{ width: `${Math.min(100, engineTemperatureC / 105 * 100)}%` }} /></i></div><div><span>PRESIÓN DE ACEITE</span><strong>{engineOilPressureBar}<small> bar</small></strong><i><b style={{ width: `${Math.min(100, Number(engineOilPressureBar) / 5 * 100)}%` }} /></i></div></div><label className={`engine-throttle ${engineGear === "REVERSA" ? "is-reverse" : ""}`}><span>ACELERADOR · {engineGear}</span><strong>{engineGear === "REVERSA" ? "−" : ""}{Math.abs(Math.round(voyage.motor))}%</strong><input aria-label="Acelerador del motor con reversa" type="range" min="-100" max="100" value={voyage.motor} disabled={!voyage.engineRunning} onChange={(event) => updateVoyage((current) => ({ ...current, motor: Number(event.target.value) }))} /><small>REVERSA ← · PUNTO MUERTO · ADELANTE →</small></label></div>
      </section>
      <div className={`sail-control floating-window ${minimizedPanels.sails ? "is-minimized" : ""}`} data-floating-panel="sails" style={floatingPanelStyle("sails")} onPointerDownCapture={() => setActivePanel("sails")}><div className="floating-window-bar"><span>VELAS</span><div className="floating-window-actions"><button type="button" className="window-drag-handle" aria-label="Mover ventana de velas" title="Arrastrar para mover · doble clic para restaurar" onPointerDown={(event) => beginPanelDrag("sails", event)} onPointerMove={movePanel} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag} onDoubleClick={() => resetPanelPosition("sails")}>⠿</button><button type="button" className="window-minimize-button" aria-label={minimizedPanels.sails ? "Restaurar ventana de velas" : "Minimizar ventana de velas"} aria-expanded={!minimizedPanels.sails} onClick={() => togglePanelMinimized("sails")}>{minimizedPanels.sails ? "□" : "—"}</button></div></div><div className="sail-window-content floating-window-content"><div className="control-heading"><span>APAREJO</span><strong>{Math.round(voyage.mainSail + voyage.genoaSail) / 2}%</strong><small>VELAS</small></div>{([ ["Mayor", "mainSail", "mainSheet"], ["Genoa", "genoaSail", "genoaSheet"] ] as const).map(([name, sailKey, sheetKey]) => <div className="sail-row" key={name}><label>{name} <b>{Math.round(voyage[sailKey])}%</b></label><input aria-label={`${name} desplegada`} type="range" min="0" max="100" value={voyage[sailKey]} onChange={(event) => updateVoyage((current) => ({ ...current, [sailKey]: Number(event.target.value) }))} /><label className="sheet-label">Escota <b>{Math.round(voyage[sheetKey])}%</b></label><input aria-label={`Escota de ${name}`} type="range" min="0" max="100" value={voyage[sheetKey]} onChange={(event) => updateVoyage((current) => ({ ...current, [sheetKey]: Number(event.target.value) }))} /></div>)}</div></div>
      <section className={`instrument-window anchor-window floating-window ${minimizedPanels.anchor ? "is-minimized" : ""}`} data-floating-panel="anchor" style={floatingPanelStyle("anchor")} onPointerDownCapture={() => setActivePanel("anchor")}>
        <div className="floating-window-bar"><span>ANCLA <strong className="minimized-summary">A{selectedAnchor} · {selectedAnchorRode.toFixed(1)} m · {selectedAnchorStatus}</strong></span><div className="floating-window-actions"><button type="button" className="window-drag-handle" aria-label="Mover ventana de ancla" title="Arrastrar para mover · doble clic para restaurar" onPointerDown={(event) => beginPanelDrag("anchor", event)} onPointerMove={movePanel} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag} onDoubleClick={() => resetPanelPosition("anchor")}>⠿</button><button type="button" className="window-minimize-button" aria-label={minimizedPanels.anchor ? "Restaurar ventana de ancla" : "Minimizar ventana de ancla"} aria-expanded={!minimizedPanels.anchor} onClick={() => togglePanelMinimized("anchor")}>{minimizedPanels.anchor ? "□" : "—"}</button></div></div>
        <div className="anchor-window-content floating-window-content"><div className="anchor-selector" aria-label="Seleccionar ancla">{([1, 2] as const).map((anchor) => <button type="button" className={selectedAnchor === anchor ? "is-active" : ""} aria-pressed={selectedAnchor === anchor} key={anchor} onClick={() => updateVoyage((current) => ({ ...current, selectedAnchor: anchor, anchorRelease: 0 }))}><span>ANCLA {anchor}</span><small>{anchorRode(voyage, anchor).toFixed(1)} m</small></button>)}</div><div className="anchor-control"><button type="button" className="anchor-winch" aria-label={`Girar molinete para recoger el ancla ${selectedAnchor}`} onPointerDown={beginAnchorWinch} onPointerMove={moveAnchorWinch} onPointerUp={endAnchorWinch} onPointerCancel={endAnchorWinch}><span className="anchor-winch-handle" style={{ transform: `rotate(${anchorWinchRotation}deg)` }}><b /></span></button><div className="anchor-readout"><span>CADENA</span><strong>{selectedAnchorRode.toFixed(1)} m</strong><small>{selectedAnchorStatus}</small><small>Fondeo: ~{anchorSetLengthM(conditions).toFixed(0)} m</small></div></div><button type="button" className={`anchor-release-button ${voyage.anchorRelease === selectedAnchor ? "is-active" : ""}`} aria-pressed={voyage.anchorRelease === selectedAnchor} disabled={selectedAnchorRode >= MAX_ANCHOR_RODE_M && voyage.anchorRelease !== selectedAnchor} onClick={() => updateVoyage((current) => ({ ...current, anchorRelease: current.anchorRelease === current.selectedAnchor ? 0 : current.selectedAnchor }))}>{voyage.anchorRelease === selectedAnchor ? "DETENER LIBERACIÓN" : "LIBERAR ANCLA"}</button><small className="anchor-instruction">Girá el molinete con el mouse para cobrar cadena.</small></div>
      </section>
      <section className={`control-dock floating-window ${minimizedPanels.helm ? "is-minimized" : ""}`} data-floating-panel="helm" style={floatingPanelStyle("helm")} onPointerDownCapture={() => setActivePanel("helm")}>
        <div className="floating-window-bar floating-window-bar--helm"><span>TIMÓN</span><div className="floating-window-actions"><button type="button" className="window-drag-handle" aria-label="Mover ventana del timón" title="Arrastrar para mover · doble clic para restaurar" onPointerDown={(event) => beginPanelDrag("helm", event)} onPointerMove={movePanel} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag} onDoubleClick={() => resetPanelPosition("helm")}>⠿</button><button type="button" className="window-minimize-button" aria-label={minimizedPanels.helm ? "Restaurar ventana del timón" : "Minimizar ventana del timón"} aria-expanded={!minimizedPanels.helm} onClick={() => togglePanelMinimized("helm")}>{minimizedPanels.helm ? "□" : "—"}</button></div></div>
        <div className="helm-window-content floating-window-content"><div className="course-control"><div className="control-heading"><span>ÁNGULO DE TIMÓN</span><strong>{voyage.rudder > 0 ? "+" : ""}{Math.round(voyage.rudder)}°</strong><small>{voyage.autopilot ? "PILOTO" : "MANUAL"}</small></div><div className="helm-layout"><div className="helm-step-column"><button onClick={() => updateVoyage((current) => ({ ...current, rudder: clamp(current.rudder - 1, -current.boatProfile.rudderMaxDeg, current.boatProfile.rudderMaxDeg) }))}>−1°</button><button onClick={() => updateVoyage((current) => ({ ...current, rudder: clamp(current.rudder - 10, -current.boatProfile.rudderMaxDeg, current.boatProfile.rudderMaxDeg) }))}>−10°</button><button className="helm-full-button" onClick={() => updateVoyage((current) => ({ ...current, rudder: -current.boatProfile.rudderMaxDeg }))}>−FULL</button></div><div className="helm-center"><button className="helm" aria-label="Mover timón" aria-valuetext={`${Math.round(voyage.rudder)}° de ${voyage.boatProfile.rudderMaxDeg}°`} aria-valuenow={Math.round(voyage.rudder)} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const rect = event.currentTarget.getBoundingClientRect(); updateVoyage((current) => ({ ...current, rudder: clamp(((event.clientX - rect.left) / rect.width - .5) * current.boatProfile.rudderMaxDeg * 2, -current.boatProfile.rudderMaxDeg, current.boatProfile.rudderMaxDeg) })); }} onPointerMove={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const rect = event.currentTarget.getBoundingClientRect(); updateVoyage((current) => ({ ...current, rudder: clamp(((event.clientX - rect.left) / rect.width - .5) * current.boatProfile.rudderMaxDeg * 2, -current.boatProfile.rudderMaxDeg, current.boatProfile.rudderMaxDeg) })); }}><span style={{ transform: `rotate(${voyage.rudder * 3}deg)` }} /></button><button className="center-helm-button" onClick={() => updateVoyage((current) => ({ ...current, rudder: 0 }))}>CENTRAR</button></div><div className="helm-step-column"><button onClick={() => updateVoyage((current) => ({ ...current, rudder: clamp(current.rudder + 1, -current.boatProfile.rudderMaxDeg, current.boatProfile.rudderMaxDeg) }))}>+1°</button><button onClick={() => updateVoyage((current) => ({ ...current, rudder: clamp(current.rudder + 10, -current.boatProfile.rudderMaxDeg, current.boatProfile.rudderMaxDeg) }))}>+10°</button><button className="helm-full-button" onClick={() => updateVoyage((current) => ({ ...current, rudder: current.boatProfile.rudderMaxDeg }))}>+FULL</button></div></div><small className="map-hint">{keyLabel(keyBindings.rudderLeft)} / {keyLabel(keyBindings.rudderRight)} ajustan el timón.</small></div>
          </div>
      </section>
      <section className={`instrument-window autopilot-window floating-window ${minimizedPanels.autopilot ? "is-minimized" : ""}`} data-floating-panel="autopilot" style={floatingPanelStyle("autopilot")} onPointerDownCapture={() => setActivePanel("autopilot")}>
        <div className="floating-window-bar"><span>PILOTO AUTOMÁTICO <strong className="minimized-summary">{voyage.autopilot ? `ACTIVO · ${Math.round(voyage.targetHeading ?? voyage.heading).toString().padStart(3, "0")}°` : "APAGADO"}</strong></span><div className="floating-window-actions"><button type="button" className="window-drag-handle" aria-label="Mover ventana del piloto automático" title="Arrastrar para mover · doble clic para restaurar" onPointerDown={(event) => beginPanelDrag("autopilot", event)} onPointerMove={movePanel} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag} onDoubleClick={() => resetPanelPosition("autopilot")}>⠿</button><button type="button" className="window-minimize-button" aria-label={minimizedPanels.autopilot ? "Restaurar ventana del piloto automático" : "Minimizar ventana del piloto automático"} aria-expanded={!minimizedPanels.autopilot} onClick={() => togglePanelMinimized("autopilot")}>{minimizedPanels.autopilot ? "□" : "—"}</button></div></div>
        <div className="autopilot-window-content floating-window-content"><div className="autopilot-status"><span>ESTADO</span><strong>{voyage.autopilot ? "ACTIVO" : "APAGADO"}</strong><small>{voyage.autopilot ? `Rumbo fijado ${Math.round(voyage.targetHeading ?? voyage.heading).toString().padStart(3, "0")}° · ${compassPoint(voyage.targetHeading ?? voyage.heading)}` : `Heading actual ${Math.round(voyage.heading).toString().padStart(3, "0")}°`}</small></div><button className="autopilot-button" onClick={() => updateVoyage((current) => ({ ...current, autopilot: !current.autopilot, targetHeading: !current.autopilot ? current.heading : null, rudder: !current.autopilot ? 0 : current.rudder }))}>{voyage.autopilot ? "DESACTIVAR PILOTO" : "FIJAR HEADING ACTUAL"}</button><small className="autopilot-note">Sólo el piloto automático puede fijar un rumbo.</small></div>
      </section></>}
    {toolsOpen && <aside className="tools-inventory"><header><strong>HERRAMIENTAS</strong><button onClick={() => setToolsOpen(false)}>×</button></header><small>ÁRBOL BASE</small>{[["Navegación", ["compass", "gps", "autopilot", "depth"]], ["Maniobra", ["helm", "engine", "anchor"]], ["Jarcia", ["sails", "rigging", "winchMainPort", "winchMainStarboard", "winchPort", "winchStarboard"]], ["Barco", ["resources", "conditions"]]].map(([name, panels]) => <section key={name as string}><b>{name as string}</b><div>{(panels as string[]).map((panel) => <button key={panel} onClick={() => document.querySelector(`[data-floating-panel="${panel}"]`)?.classList.remove("is-tool-closed")}>▸ {panel.replace("winch", "Winch ")}</button>)}</div></section>)}<div className="inventory-personal-heading"><small>CARPETAS PERSONALES</small><form className="inventory-new-folder" onSubmit={(event) => { event.preventDefault(); const name = newInventoryFolder.trim().slice(0, 28); if (!name || inventoryFolders.includes(name)) return; const next = [...inventoryFolders, name]; setInventoryFolders(next); setOpenInventoryFolders((current) => [...current, name]); window.localStorage.setItem("sailward.inventoryFolders.v1", JSON.stringify(next)); setNewInventoryFolder(""); }}><input aria-label="Nombre de nueva carpeta" value={newInventoryFolder} onChange={(event) => setNewInventoryFolder(event.target.value)} placeholder="Nueva carpeta" /><button type="submit">+ CREAR</button></form></div><section className="inventory-personal is-open"><div>{inventoryFolders.map((folder) => { const open = openInventoryFolders.includes(folder); const assignedTools = inventoryFolderTools[folder] ?? []; return <div className={`inventory-folder-node ${open ? "is-open" : ""}`} key={folder}><div className="inventory-folder-row"><button className="inventory-folder-toggle" data-folder={folder} title={assignedTools.length ? `${assignedTools.length} herramienta${assignedTools.length === 1 ? "" : "s"} asignada${assignedTools.length === 1 ? "" : "s"}` : "Soltá herramientas aquí"} onClick={() => setOpenInventoryFolders((current) => current.includes(folder) ? current.filter((item) => item !== folder) : [...current, folder])}>{open ? "▾ 📂" : "▸ 📁"} {folder}<span>{assignedTools.length}</span></button><button className="inventory-folder-delete" aria-label={`Eliminar carpeta ${folder}`} title="Eliminar carpeta" onClick={() => { const next = inventoryFolders.filter((item) => item !== folder); setInventoryFolders(next); setOpenInventoryFolders((current) => current.filter((item) => item !== folder)); setInventoryFolderTools((current) => { const { [folder]: _deleted, ...rest } = current; window.localStorage.setItem("sailward.inventoryFolderTools.v1", JSON.stringify(rest)); return rest; }); window.localStorage.setItem("sailward.inventoryFolders.v1", JSON.stringify(next)); }}>×</button></div>{open && <div className="inventory-folder-contents">{assignedTools.length ? assignedTools.map((tool) => <span key={tool}>▸ {tool}</span>) : <small>Arrastrá herramientas aquí</small>}</div>}</div>; })}</div></section><small>CONFIGURACIONES</small><button className="tools-group" onClick={() => { document.querySelectorAll("[data-floating-panel]").forEach((item) => item.classList.add("is-tool-closed")); ["helm", "engine", "sails", "anchor"].forEach((panel) => document.querySelector(`[data-floating-panel="${panel}"]`)?.classList.remove("is-tool-closed")); }}>MANIOBRA</button></aside>}
    <div className="map-tools"><button className={toolsOpen ? "is-active" : ""} aria-label="Abrir herramientas" title="Herramientas" onClick={() => setToolsOpen((value) => !value)}>▣</button>
      <button className={satelliteLayer ? "is-active" : ""} aria-label="Alternar vista satelital" aria-pressed={satelliteLayer} title="Vista satelital" onClick={() => setSatelliteLayer((value) => !value)}><span className="map-tool-icon map-tool-icon--satellite" aria-hidden="true">◉</span></button>
      <button className={nauticalLayer ? "is-active" : ""} aria-label="Alternar carta náutica" aria-pressed={nauticalLayer} title="Carta náutica" onClick={() => setNauticalLayer((value) => !value)}><span className="map-tool-icon map-tool-icon--nautical" aria-hidden="true">⚓</span></button>
      {voyage && <button className={followBoat ? "is-active" : ""} aria-label={followBoat ? "Desactivar seguimiento del barco" : "Seguir barco"} aria-pressed={followBoat} title={followBoat ? "Desactivar seguimiento" : "Seguir barco"} onClick={toggleFollowBoat}><span className="map-tool-icon map-tool-icon--follow" aria-hidden="true">⌖</span></button>}
    </div>{mapError && <div className="map-notice">No se pudo cargar una capa del mapa. El simulador sigue disponible.</div>}<div className="version-tag">SAILWARD · v{APP_VERSION} · ALPHA</div>
  </main>;
}

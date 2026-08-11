"use client";

import type {
  Map as MapInstance,
  MapMouseEvent,
  Marker as MarkerInstance,
} from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const APP_VERSION = "0.1.0";
const STORAGE_KEY = `sailward.voyage.${APP_VERSION}`;
const BASE_STYLE = "https://tiles.openfreemap.org/styles/liberty";

type Port = {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  heading: number;
};

type Voyage = {
  portId: string;
  lat: number;
  lon: number;
  heading: number;
  sail: number;
  speedKn: number;
  distanceNm: number;
  startedAt: number;
  updatedAt: number;
};

type Conditions = {
  windKn: number;
  windDirection: number;
  waveHeight: number;
  currentKn: number;
  currentDirection: number;
  source: "live" | "estimated";
  updatedAt: number;
};

const PORTS: Port[] = [
  {
    id: "las-palmas",
    name: "Las Palmas",
    country: "Islas Canarias",
    lat: 28.137,
    lon: -15.416,
    heading: 55,
  },
  {
    id: "miami",
    name: "Miami",
    country: "Estados Unidos",
    lat: 25.769,
    lon: -80.15,
    heading: 105,
  },
  {
    id: "barcelona",
    name: "Barcelona",
    country: "España",
    lat: 41.341,
    lon: 2.183,
    heading: 135,
  },
  {
    id: "cape-town",
    name: "Ciudad del Cabo",
    country: "Sudáfrica",
    lat: -33.899,
    lon: 18.433,
    heading: 320,
  },
  {
    id: "sydney",
    name: "Sídney",
    country: "Australia",
    lat: -33.844,
    lon: 151.238,
    heading: 75,
  },
  {
    id: "papeete",
    name: "Papeete",
    country: "Polinesia Francesa",
    lat: -17.535,
    lon: -149.565,
    heading: 330,
  },
  {
    id: "ushuaia",
    name: "Ushuaia",
    country: "Argentina",
    lat: -54.816,
    lon: -68.292,
    heading: 95,
  },
  {
    id: "singapore",
    name: "Singapur",
    country: "Singapur",
    lat: 1.247,
    lon: 103.86,
    heading: 110,
  },
];

const DEFAULT_CONDITIONS: Conditions = {
  windKn: 13,
  windDirection: 65,
  waveHeight: 0.9,
  currentKn: 0.4,
  currentDirection: 110,
  source: "estimated",
  updatedAt: Date.now(),
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;
const normalizeHeading = (heading: number) => ((heading % 360) + 360) % 360;

function angleDifference(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function calculateSpeed(
  windKn: number,
  windDirection: number,
  heading: number,
  sail: number,
) {
  if (sail === 0) return 0;
  const angle = angleDifference(windDirection, heading);
  let efficiency = 0.08;
  if (angle >= 35 && angle < 55) efficiency = 0.34;
  else if (angle < 85) efficiency = 0.52;
  else if (angle < 125) efficiency = 0.61;
  else if (angle < 160) efficiency = 0.5;
  else if (angle >= 160) efficiency = 0.38;
  return Math.min(8.6, windKn * efficiency * (sail / 100));
}

function destinationPoint(
  lat: number,
  lon: number,
  heading: number,
  distanceNm: number,
) {
  const radiusNm = 3440.065;
  const angularDistance = distanceNm / radiusNm;
  const bearing = toRadians(heading);
  const lat1 = toRadians(lat);
  const lon1 = toRadians(lon);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );
  return {
    lat: toDegrees(lat2),
    lon: ((toDegrees(lon2) + 540) % 360) - 180,
  };
}

function bearingTo(lat1: number, lon1: number, lat2: number, lon2: number) {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaLon = toRadians(lon2 - lon1);
  return normalizeHeading(
    toDegrees(
      Math.atan2(
        Math.sin(deltaLon) * Math.cos(phi2),
        Math.cos(phi1) * Math.sin(phi2) -
          Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLon),
      ),
    ),
  );
}

function advanceVoyage(voyage: Voyage, now: number) {
  const elapsedHours = Math.max(0, (now - voyage.updatedAt) / 3_600_000);
  if (elapsedHours === 0 || voyage.speedKn === 0) {
    return { ...voyage, updatedAt: now };
  }
  const distanceNm = voyage.speedKn * elapsedHours;
  const next = destinationPoint(
    voyage.lat,
    voyage.lon,
    voyage.heading,
    distanceNm,
  );
  return {
    ...voyage,
    ...next,
    distanceNm: voyage.distanceNm + distanceNm,
    updatedAt: now,
  };
}

function numeric(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function compassPoint(heading: number) {
  const points = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return points[Math.round(normalizeHeading(heading) / 45) % 8];
}

function formatCoordinate(value: number, positive: string, negative: string) {
  return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`;
}

export default function Home() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const boatMarkerRef = useRef<MarkerInstance | null>(null);
  const voyageRef = useRef<Voyage | null>(null);
  const conditionsRef = useRef(DEFAULT_CONDITIONS);
  const followRef = useRef(true);

  const [hydrated, setHydrated] = useState(false);
  const [selectedPortId, setSelectedPortId] = useState(PORTS[0].id);
  const [voyage, setVoyage] = useState<Voyage | null>(null);
  const [conditions, setConditions] = useState(DEFAULT_CONDITIONS);
  const [followBoat, setFollowBoat] = useState(true);
  const [nauticalLayer, setNauticalLayer] = useState(true);
  const [isometricView, setIsometricView] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [conditionsBusy, setConditionsBusy] = useState(false);
  const [now, setNow] = useState(0);

  const selectedPort = useMemo(
    () => PORTS.find((port) => port.id === selectedPortId) ?? PORTS[0],
    [selectedPortId],
  );

  useEffect(() => {
    followRef.current = followBoat;
  }, [followBoat]);

  useEffect(() => {
    voyageRef.current = voyage;
  }, [voyage]);

  useEffect(() => {
    conditionsRef.current = conditions;
  }, [conditions]);

  const refreshConditions = useCallback(async (lat: number, lon: number) => {
    setConditionsBusy(true);
    try {
      const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
      weatherUrl.searchParams.set("latitude", lat.toString());
      weatherUrl.searchParams.set("longitude", lon.toString());
      weatherUrl.searchParams.set(
        "current",
        "wind_speed_10m,wind_direction_10m",
      );
      weatherUrl.searchParams.set("wind_speed_unit", "kn");
      weatherUrl.searchParams.set("timezone", "UTC");

      const marineUrl = new URL("https://marine-api.open-meteo.com/v1/marine");
      marineUrl.searchParams.set("latitude", lat.toString());
      marineUrl.searchParams.set("longitude", lon.toString());
      marineUrl.searchParams.set(
        "current",
        "wave_height,ocean_current_velocity,ocean_current_direction",
      );
      marineUrl.searchParams.set("velocity_unit", "kn");
      marineUrl.searchParams.set("timezone", "UTC");

      const [weatherResponse, marineResponse] = await Promise.all([
        fetch(weatherUrl),
        fetch(marineUrl),
      ]);
      if (!weatherResponse.ok || !marineResponse.ok) throw new Error("weather");
      const weather = (await weatherResponse.json()) as {
        current?: Record<string, unknown>;
      };
      const marine = (await marineResponse.json()) as {
        current?: Record<string, unknown>;
      };
      const next: Conditions = {
        windKn: numeric(weather.current?.wind_speed_10m, 13),
        windDirection: numeric(weather.current?.wind_direction_10m, 65),
        waveHeight: numeric(marine.current?.wave_height, 0.9),
        currentKn: numeric(marine.current?.ocean_current_velocity, 0.4),
        currentDirection: numeric(marine.current?.ocean_current_direction, 110),
        source: "live",
        updatedAt: Date.now(),
      };
      setConditions(next);
    } catch {
      setConditions((current) => ({
        ...current,
        source: "estimated",
        updatedAt: Date.now(),
      }));
    } finally {
      setConditionsBusy(false);
    }
  }, []);

  useEffect(() => {
    const initialization = window.setTimeout(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const restored = advanceVoyage(JSON.parse(saved) as Voyage, timestamp);
          voyageRef.current = restored;
          setVoyage(restored);
          setSelectedPortId(restored.portId);
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(initialization);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const initialRefresh = window.setTimeout(() => {
      const target = voyageRef.current ?? selectedPort;
      void refreshConditions(target.lat, target.lon);
    }, 0);
    const interval = window.setInterval(() => {
      const current = voyageRef.current;
      const point = current ?? selectedPort;
      void refreshConditions(point.lat, point.lon);
    }, 15 * 60 * 1000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, [hydrated, refreshConditions, selectedPort]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      setVoyage((current) => {
        if (!current) return current;
        const advanced = advanceVoyage(current, timestamp);
        const latestConditions = conditionsRef.current;
        return {
          ...advanced,
          speedKn: calculateSpeed(
            latestConditions.windKn,
            latestConditions.windDirection,
            advanced.heading,
            advanced.sail,
          ),
        };
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const save = () => {
      if (voyageRef.current) {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(voyageRef.current),
        );
      }
    };
    const interval = window.setInterval(save, 5000);
    window.addEventListener("beforeunload", save);
    return () => {
      save();
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", save);
    };
  }, [hydrated]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    let disposed = false;
    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (disposed || !mapContainerRef.current) return;
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: BASE_STYLE,
        center: [selectedPort.lon, selectedPort.lat],
        zoom: 8.2,
        pitch: 56,
        bearing: -34,
        maxPitch: 70,
        attributionControl: false,
      });
      map.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        "bottom-right",
      );
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: true }),
        "top-right",
      );

      const markerRoot = document.createElement("div");
      markerRoot.className = "boat-marker";
      markerRoot.setAttribute("aria-label", "Posición de tu barco");
      const vessel = document.createElement("span");
      vessel.className = "boat-marker__vessel";
      markerRoot.appendChild(vessel);
      const marker = new maplibregl.Marker({ element: markerRoot, anchor: "center" })
        .setLngLat([selectedPort.lon, selectedPort.lat])
        .addTo(map);

      const onMapClick = (event: MapMouseEvent) => {
        setVoyage((current) => {
          if (!current) return current;
          const advanced = advanceVoyage(current, Date.now());
          const heading = bearingTo(
            advanced.lat,
            advanced.lon,
            event.lngLat.lat,
            event.lngLat.lng,
          );
          const speedKn = calculateSpeed(
            conditionsRef.current.windKn,
            conditionsRef.current.windDirection,
            heading,
            advanced.sail,
          );
          return { ...advanced, heading, speedKn };
        });
      };

      map.on("load", () => {
        try {
          map.addSource("open-seamap", {
            type: "raster",
            tiles: [
              "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution: "© OpenSeaMap contributors",
          });
          map.addLayer({
            id: "open-seamap",
            type: "raster",
            source: "open-seamap",
            paint: { "raster-opacity": 0.88 },
          });
        } catch {
          // The base map remains playable if the optional nautical layer fails.
        }
        setMapReady(true);
      });
      map.on("error", () => setMapError(true));
      map.on("click", onMapClick);
      mapRef.current = map;
      boatMarkerRef.current = marker;
    });
    return () => {
      disposed = true;
      boatMarkerRef.current?.remove();
      mapRef.current?.remove();
      boatMarkerRef.current = null;
      mapRef.current = null;
    };
  }, [selectedPort.lat, selectedPort.lon]);

  useEffect(() => {
    const map = mapRef.current;
    const marker = boatMarkerRef.current;
    const point = voyage ?? selectedPort;
    if (!map || !marker) return;
    marker.setLngLat([point.lon, point.lat]);
    const vessel = marker.getElement().querySelector<HTMLElement>(
      ".boat-marker__vessel",
    );
    if (vessel) vessel.style.transform = `rotate(${voyage?.heading ?? point.heading}deg)`;
    if (voyage && followRef.current) {
      map.easeTo({ center: [voyage.lon, voyage.lat], duration: 900 });
    } else if (!voyage) {
      map.flyTo({ center: [selectedPort.lon, selectedPort.lat], zoom: 8.2 });
    }
  }, [selectedPort, voyage]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map?.getLayer("open-seamap")) return;
    map.setLayoutProperty(
      "open-seamap",
      "visibility",
      nauticalLayer ? "visible" : "none",
    );
  }, [mapReady, nauticalLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    map.easeTo({
      pitch: isometricView ? 56 : 0,
      bearing: isometricView ? -34 : 0,
      duration: 850,
    });
  }, [isometricView, mapReady]);

  const startVoyage = () => {
    const timestamp = Date.now();
    const speedKn = calculateSpeed(
      conditions.windKn,
      conditions.windDirection,
      selectedPort.heading,
      72,
    );
    const next: Voyage = {
      portId: selectedPort.id,
      lat: selectedPort.lat,
      lon: selectedPort.lon,
      heading: selectedPort.heading,
      sail: 72,
      speedKn,
      distanceNm: 0,
      startedAt: timestamp,
      updatedAt: timestamp,
    };
    setVoyage(next);
    setFollowBoat(true);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    mapRef.current?.flyTo({
      center: [next.lon, next.lat],
      zoom: 10.5,
      duration: 1800,
    });
  };

  const updateHeading = (heading: number) => {
    setVoyage((current) => {
      if (!current) return current;
      const advanced = advanceVoyage(current, Date.now());
      const normalized = normalizeHeading(heading);
      return {
        ...advanced,
        heading: normalized,
        speedKn: calculateSpeed(
          conditions.windKn,
          conditions.windDirection,
          normalized,
          advanced.sail,
        ),
      };
    });
  };

  const updateSail = (sail: number) => {
    setVoyage((current) => {
      if (!current) return current;
      const advanced = advanceVoyage(current, Date.now());
      return {
        ...advanced,
        sail,
        speedKn: calculateSpeed(
          conditions.windKn,
          conditions.windDirection,
          advanced.heading,
          sail,
        ),
      };
    });
  };

  const centerBoat = () => {
    if (!voyage) return;
    setFollowBoat(true);
    mapRef.current?.flyTo({
      center: [voyage.lon, voyage.lat],
      zoom: Math.max(mapRef.current.getZoom(), 9.5),
    });
  };

  const resetVoyage = () => {
    if (!window.confirm("¿Finalizar este viaje y volver a elegir puerto?")) return;
    window.localStorage.removeItem(STORAGE_KEY);
    setVoyage(null);
    setFollowBoat(true);
  };

  const utcTime = now
    ? new Date(now).toLocaleTimeString("es", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "UTC",
      })
    : "--:--:--";

  return (
    <main className={`game-shell ${voyage ? "is-sailing" : "is-docked"}`}>
      <div
        ref={mapContainerRef}
        className="world-map"
        aria-label="Mapa mundial interactivo de Sailward"
      />
      <div className="ocean-vignette" aria-hidden="true" />

      <header className="brand-bar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <div>
            <strong>SAILWARD</strong>
            <span>REAL-TIME SAILING</span>
          </div>
        </div>
        <div className="world-clock">
          <span className="live-dot" />
          <span>{utcTime} UTC</span>
          <small>TIEMPO REAL · 1×</small>
        </div>
      </header>

      {mapError && (
        <div className="map-notice" role="status">
          El mapa está reintentando conectarse. La simulación sigue activa.
        </div>
      )}

      {!hydrated ? (
        <section className="departure-panel loading-panel" aria-live="polite">
          <span className="eyebrow">CARGANDO CARTAS</span>
          <h1>Preparando el mundo…</h1>
        </section>
      ) : !voyage ? (
        <section className="departure-panel">
          <span className="eyebrow">PRIMERA TRAVESÍA</span>
          <h1>El mundo es tu ruta.</h1>
          <p className="departure-copy">
            Elegí un puerto real. El viento y el reloj siguen avanzando aunque
            cierres la página.
          </p>

          <label className="field-label" htmlFor="departure-port">
            Puerto de salida
          </label>
          <div className="port-select-wrap">
            <select
              id="departure-port"
              value={selectedPortId}
              onChange={(event) => setSelectedPortId(event.target.value)}
            >
              {PORTS.map((port) => (
                <option key={port.id} value={port.id}>
                  {port.name} · {port.country}
                </option>
              ))}
            </select>
          </div>

          <div className="departure-weather">
            <div>
              <span>VIENTO</span>
              <strong>{conditions.windKn.toFixed(1)} kn</strong>
            </div>
            <div>
              <span>DIRECCIÓN</span>
              <strong>
                {Math.round(conditions.windDirection)}° {compassPoint(conditions.windDirection)}
              </strong>
            </div>
            <div>
              <span>OLAS</span>
              <strong>{conditions.waveHeight.toFixed(1)} m</strong>
            </div>
          </div>

          <button className="primary-action" type="button" onClick={startVoyage}>
            <span>Zarpar desde {selectedPort.name}</span>
            <span aria-hidden="true">→</span>
          </button>

          <div className="feature-row" aria-label="Características de la simulación">
            <span>Mapa real</span>
            <span>Clima mundial</span>
            <span>Viaje persistente</span>
          </div>
        </section>
      ) : (
        <>
          <section className="voyage-card" aria-label="Estado del viaje">
            <span className="eyebrow">EN TRAVESÍA</span>
            <strong>{PORTS.find((port) => port.id === voyage.portId)?.name}</strong>
            <span>Puerto de partida</span>
            <div className="voyage-distance">
              {voyage.distanceNm.toFixed(2)} <small>MN</small>
            </div>
            <span>distancia navegada</span>
          </section>

          <section className="conditions-card" aria-label="Condiciones actuales">
            <div className="conditions-title">
              <div>
                <span className={`live-dot ${conditions.source !== "live" ? "is-muted" : ""}`} />
                <strong>CONDICIONES</strong>
              </div>
              <button
                type="button"
                onClick={() => void refreshConditions(voyage.lat, voyage.lon)}
                disabled={conditionsBusy}
                aria-label="Actualizar condiciones"
              >
                {conditionsBusy ? "···" : "↻"}
              </button>
            </div>
            <dl>
              <div>
                <dt>Viento</dt>
                <dd>{conditions.windKn.toFixed(1)} kn</dd>
              </div>
              <div>
                <dt>Desde</dt>
                <dd>{Math.round(conditions.windDirection)}°</dd>
              </div>
              <div>
                <dt>Olas</dt>
                <dd>{conditions.waveHeight.toFixed(1)} m</dd>
              </div>
              <div>
                <dt>Corriente</dt>
                <dd>{conditions.currentKn.toFixed(1)} kn</dd>
              </div>
            </dl>
            <small>
              {conditions.source === "live"
                ? "Modelo meteorológico actualizado"
                : "Condiciones estimadas · reintentando"}
            </small>
          </section>

          <section className="control-dock" aria-label="Controles del barco">
            <div className="course-control">
              <div className="control-heading">
                <span>RUMBO</span>
                <strong>{Math.round(voyage.heading).toString().padStart(3, "0")}°</strong>
                <small>{compassPoint(voyage.heading)}</small>
              </div>
              <div className="step-buttons">
                <button type="button" onClick={() => updateHeading(voyage.heading - 10)}>
                  −10°
                </button>
                <button type="button" onClick={() => updateHeading(voyage.heading + 10)}>
                  +10°
                </button>
              </div>
              <input
                aria-label="Rumbo del barco en grados"
                type="range"
                min="0"
                max="359"
                value={Math.round(voyage.heading)}
                onChange={(event) => updateHeading(Number(event.target.value))}
              />
              <span className="map-hint">También podés hacer clic en el mapa para fijar rumbo.</span>
            </div>

            <div className="sail-control">
              <div className="control-heading">
                <span>VELAS</span>
                <strong>{voyage.sail}%</strong>
                <small>{voyage.sail === 0 ? "DETENIDO" : "DESPLEGADAS"}</small>
              </div>
              <input
                aria-label="Porcentaje de velas desplegadas"
                type="range"
                min="0"
                max="100"
                step="2"
                value={voyage.sail}
                onChange={(event) => updateSail(Number(event.target.value))}
              />
              <button
                type="button"
                className="stop-button"
                onClick={() => updateSail(voyage.sail === 0 ? 72 : 0)}
              >
                {voyage.sail === 0 ? "Desplegar velas" : "Arriar velas"}
              </button>
            </div>

            <div className="telemetry">
              <div className="speed-readout">
                <span>VELOCIDAD</span>
                <strong>{voyage.speedKn.toFixed(1)}</strong>
                <small>NUDOS</small>
              </div>
              <div className="position-readout">
                <span>{formatCoordinate(voyage.lat, "N", "S")}</span>
                <span>{formatCoordinate(voyage.lon, "E", "O")}</span>
              </div>
              <div className="dock-actions">
                <button type="button" onClick={centerBoat}>
                  Centrar barco
                </button>
                <button type="button" onClick={resetVoyage}>
                  Nuevo viaje
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      <div className="map-tools">
        <button
          type="button"
          className={isometricView ? "is-active" : ""}
          onClick={() => setIsometricView((enabled) => !enabled)}
          aria-pressed={isometricView}
          title="Alternar entre cámara isométrica y vista cenital"
        >
          {isometricView ? "Vista isométrica" : "Vista cenital"}
        </button>
        <button
          type="button"
          className={nauticalLayer ? "is-active" : ""}
          onClick={() => setNauticalLayer((visible) => !visible)}
          aria-pressed={nauticalLayer}
        >
          Carta náutica
        </button>
        {voyage && (
          <button
            type="button"
            className={followBoat ? "is-active" : ""}
            onClick={() => setFollowBoat((following) => !following)}
            aria-pressed={followBoat}
          >
            Seguir barco
          </button>
        )}
      </div>

      <footer className="version-tag">
        SAILWARD ALPHA · v{APP_VERSION} · SIMULACIÓN, NO USAR PARA NAVEGACIÓN
      </footer>
    </main>
  );
}

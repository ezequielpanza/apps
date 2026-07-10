(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const ui = {
    onlinePill: $("onlinePill"), gpsState: $("gpsState"), gpsButton: $("gpsButton"), gpsMessage: $("gpsMessage"),
    latitude: $("latitude"), longitude: $("longitude"), accuracy: $("accuracy"), speed: $("speed"),
    heading: $("heading"), altitude: $("altitude"), visibilityState: $("visibilityState"), focusState: $("focusState"),
    watchState: $("watchState"), lastGps: $("lastGps"), wakeState: $("wakeState"), contextNote: $("contextNote"),
    saveNoteButton: $("saveNoteButton"), noteSaved: $("noteSaved"), companionButton: $("companionButton"), installHint: $("installHint")
  };

  const state = {
    watchId: null,
    wakeLock: null,
    lastPosition: null,
    lastGpsAt: null,
    companionMode: false,
    deferredInstallPrompt: null
  };

  const STORAGE = {
    note: "contextum.activeNote",
    lastPosition: "contextum.lastPosition",
    companionMode: "contextum.companionMode"
  };

  const toDegrees = (radians) => radians * 180 / Math.PI;
  const toRadians = (degrees) => degrees * Math.PI / 180;

  function formatCoordinate(value) {
    return Number.isFinite(value) ? value.toFixed(6) : "—";
  }

  function formatAge(date) {
    if (!date) return "Nunca";
    const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
    if (seconds < 2) return "Ahora";
    if (seconds < 60) return `${seconds} s`;
    return `${Math.floor(seconds / 60)} min`;
  }

  function bearingBetween(a, b) {
    if (!a || !b) return null;
    const lat1 = toRadians(a.latitude);
    const lat2 = toRadians(b.latitude);
    const dLon = toRadians(b.longitude - a.longitude);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (toDegrees(Math.atan2(y, x)) + 360) % 360;
  }

  function distanceMeters(a, b) {
    if (!a || !b) return null;
    const radius = 6371000;
    const dLat = toRadians(b.latitude - a.latitude);
    const dLon = toRadians(b.longitude - a.longitude);
    const lat1 = toRadians(a.latitude);
    const lat2 = toRadians(b.latitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function deriveSpeed(coords, timestamp) {
    if (Number.isFinite(coords.speed) && coords.speed >= 0) return coords.speed;
    const previous = state.lastPosition;
    if (!previous) return null;
    const elapsed = (timestamp - previous.timestamp) / 1000;
    if (elapsed <= 0) return null;
    const distance = distanceMeters(previous.coords, coords);
    return Number.isFinite(distance) ? distance / elapsed : null;
  }

  function setGpsBadge(text, kind) {
    ui.gpsState.textContent = text;
    ui.gpsState.className = `status-badge ${kind}`;
  }

  function renderRuntime() {
    ui.visibilityState.textContent = document.visibilityState === "visible" ? "Sí" : "No";
    ui.focusState.textContent = document.hasFocus() ? "Sí" : "No";
    ui.watchState.textContent = state.watchId === null ? "Inactivo" : "Activo";
    ui.lastGps.textContent = formatAge(state.lastGpsAt);
    ui.wakeState.textContent = state.wakeLock ? "Activo" : "Inactivo";
  }

  function renderOnline() {
    const online = navigator.onLine;
    ui.onlinePill.classList.toggle("offline", !online);
    ui.onlinePill.querySelector("span:last-child").textContent = online ? "Online" : "Offline";
  }

  function saveLastPosition(payload) {
    try { localStorage.setItem(STORAGE.lastPosition, JSON.stringify(payload)); } catch (_) { /* best effort */ }
  }

  function renderPosition(position) {
    const coords = position.coords;
    const speedMps = deriveSpeed(coords, position.timestamp);
    let heading = Number.isFinite(coords.heading) ? coords.heading : null;
    if (heading === null && state.lastPosition && distanceMeters(state.lastPosition.coords, coords) > 3) {
      heading = bearingBetween(state.lastPosition.coords, coords);
    }

    ui.latitude.textContent = formatCoordinate(coords.latitude);
    ui.longitude.textContent = formatCoordinate(coords.longitude);
    ui.accuracy.textContent = Number.isFinite(coords.accuracy) ? `±${Math.round(coords.accuracy)} m` : "—";
    ui.speed.textContent = Number.isFinite(speedMps) ? `${(speedMps * 3.6).toFixed(1)} km/h` : "—";
    ui.heading.textContent = Number.isFinite(heading) ? `${Math.round(heading)}°` : "—";
    ui.altitude.textContent = Number.isFinite(coords.altitude) ? `${Math.round(coords.altitude)} m` : "—";

    state.lastPosition = { coords: { latitude: coords.latitude, longitude: coords.longitude }, timestamp: position.timestamp };
    state.lastGpsAt = new Date(position.timestamp);
    setGpsBadge("Activo", "active");
    ui.gpsMessage.textContent = "GPS activo. En v0.1.0 los datos se guardan solo en este dispositivo.";
    saveLastPosition({
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      speedKmh: Number.isFinite(speedMps) ? speedMps * 3.6 : null,
      heading,
      altitude: coords.altitude,
      timestamp: position.timestamp
    });
    renderRuntime();
  }

  function handleGpsError(error) {
    const messages = {
      1: "Permiso de ubicación denegado.",
      2: "No se pudo determinar la ubicación.",
      3: "La lectura GPS tardó demasiado."
    };
    setGpsBadge("Error", "error");
    ui.gpsMessage.textContent = messages[error.code] || "Error de ubicación desconocido.";
  }

  function startGps() {
    if (!("geolocation" in navigator)) {
      setGpsBadge("No disponible", "error");
      ui.gpsMessage.textContent = "Este dispositivo no expone Geolocation API.";
      return;
    }
    if (state.watchId !== null) return;

    setGpsBadge("Solicitando…", "idle");
    ui.gpsMessage.textContent = "Esperando permiso y primera lectura GPS…";
    state.watchId = navigator.geolocation.watchPosition(renderPosition, handleGpsError, {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 15000
    });
    ui.gpsButton.textContent = "Detener GPS";
    renderRuntime();
  }

  function stopGps() {
    if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
    ui.gpsButton.textContent = "Activar GPS";
    setGpsBadge("Inactivo", "idle");
    ui.gpsMessage.textContent = "GPS detenido. La última lectura local se conserva.";
    renderRuntime();
  }

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) {
      ui.wakeState.textContent = "No disponible";
      return false;
    }
    try {
      state.wakeLock = await navigator.wakeLock.request("screen");
      state.wakeLock.addEventListener("release", () => {
        state.wakeLock = null;
        renderRuntime();
      });
      renderRuntime();
      return true;
    } catch (_) {
      state.wakeLock = null;
      renderRuntime();
      return false;
    }
  }

  async function releaseWakeLock() {
    if (state.wakeLock) {
      try { await state.wakeLock.release(); } catch (_) { /* no-op */ }
    }
    state.wakeLock = null;
    renderRuntime();
  }

  async function setCompanionMode(enabled) {
    state.companionMode = enabled;
    document.body.classList.toggle("companion", enabled);
    ui.companionButton.textContent = enabled ? "Desactivar" : "Activar";
    ui.companionButton.classList.toggle("active", enabled);
    localStorage.setItem(STORAGE.companionMode, String(enabled));
    if (enabled) {
      startGps();
      await requestWakeLock();
    } else {
      await releaseWakeLock();
    }
  }

  function restoreLocalState() {
    ui.contextNote.value = localStorage.getItem(STORAGE.note) || "";
    const savedCompanion = localStorage.getItem(STORAGE.companionMode) === "true";
    if (savedCompanion) setCompanionMode(true);

    const raw = localStorage.getItem(STORAGE.lastPosition);
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        ui.latitude.textContent = formatCoordinate(saved.latitude);
        ui.longitude.textContent = formatCoordinate(saved.longitude);
        ui.accuracy.textContent = Number.isFinite(saved.accuracy) ? `±${Math.round(saved.accuracy)} m` : "—";
        ui.speed.textContent = Number.isFinite(saved.speedKmh) ? `${saved.speedKmh.toFixed(1)} km/h` : "—";
        ui.heading.textContent = Number.isFinite(saved.heading) ? `${Math.round(saved.heading)}°` : "—";
        ui.altitude.textContent = Number.isFinite(saved.altitude) ? `${Math.round(saved.altitude)} m` : "—";
        state.lastGpsAt = Number.isFinite(saved.timestamp) ? new Date(saved.timestamp) : null;
      } catch (_) { /* ignore malformed local cache */ }
    }
  }

  ui.gpsButton.addEventListener("click", () => state.watchId === null ? startGps() : stopGps());
  ui.saveNoteButton.addEventListener("click", () => {
    localStorage.setItem(STORAGE.note, ui.contextNote.value.trim());
    ui.noteSaved.textContent = `Guardado ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  });
  ui.contextNote.addEventListener("input", () => { ui.noteSaved.textContent = "Cambios sin guardar"; });
  ui.companionButton.addEventListener("click", () => setCompanionMode(!state.companionMode));

  document.addEventListener("visibilitychange", async () => {
    renderRuntime();
    if (document.visibilityState === "visible" && state.companionMode && !state.wakeLock) await requestWakeLock();
  });
  window.addEventListener("focus", renderRuntime);
  window.addEventListener("blur", renderRuntime);
  window.addEventListener("online", renderOnline);
  window.addEventListener("offline", renderOnline);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    ui.installHint.textContent = "Contextum está lista para instalarse.";
  });

  window.addEventListener("appinstalled", () => {
    state.deferredInstallPrompt = null;
    ui.installHint.textContent = "Contextum instalada.";
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
  }

  restoreLocalState();
  renderOnline();
  renderRuntime();
  setInterval(renderRuntime, 1000);
})();

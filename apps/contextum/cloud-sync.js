(() => {
  "use strict";

  const STORAGE = {
    enabled: "contextum.cloudEnabled",
    key: "contextum.cloudKey",
    position: "contextum.lastPosition",
    note: "contextum.activeNote",
    companion: "contextum.companionMode"
  };

  const ui = {
    state: document.getElementById("syncState"),
    last: document.getElementById("lastSync"),
    toggle: document.getElementById("syncToggleButton"),
    pair: document.getElementById("pairButton"),
    pairBox: document.getElementById("pairBox"),
    pairCode: document.getElementById("pairCode"),
    pairExpiry: document.getElementById("pairExpiry")
  };

  let timer = null;
  let busy = false;
  let lastSyncAt = null;

  function setState(text, kind = "idle") {
    if (!ui.state) return;
    ui.state.textContent = text;
    ui.state.className = `status-badge ${kind}`;
  }

  function randomKey() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function getKey() {
    let key = localStorage.getItem(STORAGE.key);
    if (!key || key.length < 40) {
      key = randomKey();
      localStorage.setItem(STORAGE.key, key);
    }
    return key;
  }

  function readJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function buildSnapshot() {
    const saved = readJson(STORAGE.position);
    const location = saved ? {
      latitude: Number.isFinite(saved.latitude) ? saved.latitude : null,
      longitude: Number.isFinite(saved.longitude) ? saved.longitude : null,
      accuracyM: Number.isFinite(saved.accuracyM) ? saved.accuracyM : (Number.isFinite(saved.accuracy) ? saved.accuracy : null),
      speedKmh: Number.isFinite(saved.speedKmh) ? saved.speedKmh : null,
      headingDeg: Number.isFinite(saved.headingDeg) ? saved.headingDeg : (Number.isFinite(saved.heading) ? saved.heading : null),
      altitudeM: Number.isFinite(saved.altitudeM) ? saved.altitudeM : (Number.isFinite(saved.altitude) ? saved.altitude : null),
      timestamp: Number.isFinite(saved.timestamp) ? new Date(saved.timestamp).toISOString() : (saved.timestamp || null)
    } : null;

    return {
      schemaVersion: 1,
      appVersion: "0.2.0",
      capturedAt: new Date().toISOString(),
      location,
      context: { activeNote: localStorage.getItem(STORAGE.note) || null },
      runtime: {
        visible: document.visibilityState === "visible",
        focused: document.hasFocus(),
        companionMode: localStorage.getItem(STORAGE.companion) === "true"
      }
    };
  }

  async function syncNow() {
    if (!navigator.onLine || busy || localStorage.getItem(STORAGE.enabled) !== "true") return false;
    busy = true;
    setState("Sincronizando", "pending");
    try {
      const response = await fetch("/api/context", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Contextum-Key": getKey()
        },
        body: JSON.stringify(buildSnapshot()),
        cache: "no-store"
      });
      if (!response.ok) throw new Error(String(response.status));
      lastSyncAt = new Date();
      setState("Conectado", "active");
      if (ui.last) ui.last.textContent = `Actualizado ${lastSyncAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
      return true;
    } catch (_) {
      setState("Error nube", "error");
      if (ui.last) ui.last.textContent = "No se pudo sincronizar";
      return false;
    } finally {
      busy = false;
    }
  }

  function stopLoop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function startLoop() {
    stopLoop();
    syncNow();
    timer = setInterval(syncNow, 5000);
  }

  function renderEnabled() {
    const enabled = localStorage.getItem(STORAGE.enabled) === "true";
    if (ui.toggle) {
      ui.toggle.textContent = enabled ? "Desactivar nube" : "Activar nube";
      ui.toggle.classList.toggle("active", enabled);
    }
    if (ui.pair) ui.pair.disabled = !enabled;
    if (enabled) {
      setState(lastSyncAt ? "Conectado" : "Preparando", lastSyncAt ? "active" : "pending");
      startLoop();
    } else {
      stopLoop();
      setState("Desactivado", "idle");
      if (ui.last) ui.last.textContent = "Los datos no salen del teléfono";
      if (ui.pairBox) ui.pairBox.hidden = true;
    }
  }

  async function generatePairCode() {
    if (localStorage.getItem(STORAGE.enabled) !== "true") return;
    if (ui.pair) {
      ui.pair.disabled = true;
      ui.pair.textContent = "Generando…";
    }
    try {
      const ok = await syncNow();
      if (!ok && !lastSyncAt) throw new Error("sync-required");
      const response = await fetch("/api/pair", {
        method: "POST",
        headers: { "X-Contextum-Key": getKey() },
        cache: "no-store"
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      ui.pairCode.textContent = data.code;
      ui.pairExpiry.textContent = `Vence en ${Math.round(data.expiresIn / 60)} min`;
      ui.pairBox.hidden = false;
    } catch (_) {
      setState("Error nube", "error");
      if (ui.last) ui.last.textContent = "No se pudo generar código";
    } finally {
      if (ui.pair) {
        ui.pair.disabled = false;
        ui.pair.textContent = "Código de prueba";
      }
    }
  }

  if (ui.toggle) ui.toggle.addEventListener("click", () => {
    const next = localStorage.getItem(STORAGE.enabled) !== "true";
    localStorage.setItem(STORAGE.enabled, String(next));
    if (next) getKey();
    renderEnabled();
  });

  if (ui.pair) ui.pair.addEventListener("click", generatePairCode);
  window.addEventListener("online", () => { if (localStorage.getItem(STORAGE.enabled) === "true") syncNow(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && localStorage.getItem(STORAGE.enabled) === "true") syncNow(); });

  renderEnabled();
})();
(() => {
  if (window.WanderRawTrack) return;

  const context = window.WanderContext;
  const sessionsEngine = window.WanderSessionEngine;
  if (!context || !sessionsEngine) return;

  const ACTIVE_KEY = 'wander.rawTrack.active.v1';
  const HISTORY_KEY = 'wander.rawTracks.sessions.v1';
  const SETTINGS_KEY = 'wander.rawTracks.settings.v1';
  const DEFAULT_SETTINGS = Object.freeze({ smoothingEnabled: false });
  const MAX_ACCURACY_M = 120;
  const MIN_INTERVAL_MS = 750;
  const MAX_POINTS_PER_SESSION = 200000;
  const listeners = new Set();

  let settings = loadObject(SETTINGS_KEY, DEFAULT_SETTINGS);
  let active = loadObject(ACTIVE_KEY, null);
  let history = loadArray(HISTORY_KEY);
  let lastSessionSnapshot = sessionsEngine.snapshot?.() || { active: null, sessions: [] };

  function loadObject(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
    } catch { return fallback; }
  }

  function loadArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function effectivePoint() {
    const location = context.getEffectiveLocation?.();
    const lat = finite(location?.lat);
    const lng = finite(location?.lng);
    if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    const accuracy = finite(location?.accuracy);
    if (accuracy !== null && accuracy > MAX_ACCURACY_M) return null;
    const at = Date.parse(location?.updatedAt || '') || Date.now();
    return {
      lat: Number(lat.toFixed(7)),
      lng: Number(lng.toFixed(7)),
      at,
      accuracy,
      speedKmh: finite(context.value?.('motion.speedKmh')),
      heading: finite(location?.heading),
      motion: String(context.value?.('motion.status') || 'pending').toLowerCase(),
      source: location?.source || 'unknown',
    };
  }

  function ensureActive(session) {
    if (!session?.id) return null;
    if (active?.sessionId === session.id) return active;
    if (active?.sessionId) finalizeActive(active.sessionId, active.endedAt || Date.now());
    active = {
      schemaVersion: 1,
      id: `raw-${session.id}`,
      sessionId: session.id,
      name: session.name || `Recorrido ${new Date(session.startedAt || Date.now()).toLocaleString('es-AR')}`,
      startedAt: Number(session.startedAt) || Date.now(),
      endedAt: null,
      points: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    persist();
    return active;
  }

  function appendPoint(point) {
    const session = sessionsEngine.getActive?.();
    if (!session?.id || !point) return false;
    const track = ensureActive(session);
    const last = track.points[track.points.length - 1];
    if (last) {
      if (point.at <= Number(last.at || 0)) return false;
      if (point.at - Number(last.at || 0) < MIN_INTERVAL_MS) return false;
      if (point.lat === last.lat && point.lng === last.lng && point.at - Number(last.at || 0) < 5000) return false;
    }
    track.points.push(point);
    if (track.points.length > MAX_POINTS_PER_SESSION) track.points.splice(0, track.points.length - MAX_POINTS_PER_SESSION);
    track.updatedAt = Date.now();
    persist();
    return true;
  }

  function finalizeActive(sessionId, endedAt = Date.now()) {
    if (!active || (sessionId && active.sessionId !== sessionId)) return null;
    active.endedAt = Math.max(Number(active.startedAt || endedAt), Number(endedAt) || Date.now());
    active.updatedAt = Date.now();
    history.push(active);
    history = history.slice(-500);
    const completed = active;
    active = null;
    persist();
    return clone(completed);
  }

  function reconcileSessions(snapshot = sessionsEngine.snapshot?.()) {
    if (!snapshot) return;
    const previousActiveId = lastSessionSnapshot?.active?.id || null;
    const nextActiveId = snapshot?.active?.id || null;
    if (nextActiveId) ensureActive(snapshot.active);
    if (previousActiveId && !nextActiveId) {
      const completed = (snapshot.sessions || []).find((session) => session.id === previousActiveId);
      finalizeActive(previousActiveId, completed?.endedAt || Date.now());
    }
    lastSessionSnapshot = snapshot;
  }

  function persist() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      if (active) localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {}
    const snapshot = apiSnapshot();
    listeners.forEach((listener) => { try { listener(snapshot); } catch {} });
    window.dispatchEvent(new CustomEvent('wander:raw-track-changed', { detail: snapshot }));
    window.dispatchEvent(new CustomEvent('wander:cloud-data-changed', { detail: { source: 'raw-track' } }));
  }

  function smoothPoints(points) {
    if (!Array.isArray(points) || points.length < 3) return clone(points || []);
    const result = [];
    const radius = 2;
    for (let index = 0; index < points.length; index += 1) {
      const from = Math.max(0, index - radius);
      const to = Math.min(points.length - 1, index + radius);
      let weightSum = 0;
      let lat = 0;
      let lng = 0;
      for (let cursor = from; cursor <= to; cursor += 1) {
        const point = points[cursor];
        const accuracy = Math.max(3, finite(point.accuracy) || 10);
        const distance = Math.abs(cursor - index);
        const weight = (1 / accuracy) * (radius + 1 - distance);
        lat += point.lat * weight;
        lng += point.lng * weight;
        weightSum += weight;
      }
      result.push({ ...points[index], lat: lat / weightSum, lng: lng / weightSum });
    }
    return result;
  }

  function setSmoothingEnabled(enabled) {
    settings = { ...settings, smoothingEnabled: Boolean(enabled) };
    persist();
    return settings.smoothingEnabled;
  }

  function apiSnapshot() {
    return {
      active: clone(active),
      sessions: clone(history),
      settings: { ...settings },
    };
  }

  context.subscribe?.((key) => {
    if (key === 'location.effective' || key.startsWith('location.effective.')) appendPoint(effectivePoint());
  });
  sessionsEngine.subscribe?.((snapshot) => reconcileSessions(snapshot));
  window.addEventListener('pagehide', persist);

  reconcileSessions(lastSessionSnapshot);
  appendPoint(effectivePoint());

  window.WanderRawTrack = Object.freeze({
    snapshot: apiSnapshot,
    getActive: () => clone(active),
    list: () => clone(history),
    getSession(sessionId) {
      if (active?.sessionId === sessionId) return clone(active);
      return clone(history.find((item) => item.sessionId === sessionId) || null);
    },
    displayPoints(track) {
      const points = track?.points || [];
      return settings.smoothingEnabled ? smoothPoints(points) : clone(points);
    },
    rawPoints(track) { return clone(track?.points || []); },
    smoothPoints,
    setSmoothingEnabled,
    isSmoothingEnabled: () => Boolean(settings.smoothingEnabled),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    storageKeys: Object.freeze({ active: ACTIVE_KEY, sessions: HISTORY_KEY, settings: SETTINGS_KEY }),
  });

  window.dispatchEvent(new CustomEvent('wander:raw-track-ready', { detail: apiSnapshot() }));
})();

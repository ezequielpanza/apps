(() => {
  if (window.WanderRawTrack) return;

  const context = window.WanderContext;
  const sessionsEngine = window.WanderSessionEngine;
  if (!context || !sessionsEngine) return;

  const ACTIVE_KEY = 'wander.rawTrack.active.v1';
  const HISTORY_KEY = 'wander.rawTracks.sessions.v1';
  const SETTINGS_KEY = 'wander.rawTracks.settings.v1';
  const MIGRATION_KEY = 'wander.rawTracks.segmentMigration.v1';
  const DEFAULT_SETTINGS = Object.freeze({ smoothingEnabled: false });
  const MAX_ACCURACY_M = 120;
  const MIN_INTERVAL_MS = 750;
  const MAX_POINTS_PER_SESSION = 200000;
  const PERSIST_DELAY_MS = 1500;
  const listeners = new Set();

  let settings = loadObject(SETTINGS_KEY, DEFAULT_SETTINGS);
  let active = loadObject(ACTIVE_KEY, null);
  let history = loadArray(HISTORY_KEY);
  let lastSessionSnapshot = sessionsEngine.snapshot?.() || { active: null, sessions: [] };
  let persistTimer = null;

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

  function validPoint(point) {
    const lat = finite(point?.lat);
    const lng = finite(point?.lng);
    return lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  function normalizedPoint(point, fallback = {}) {
    if (!validPoint(point)) return null;
    return {
      lat: Number(Number(point.lat).toFixed(7)),
      lng: Number(Number(point.lng).toFixed(7)),
      at: Number(point.at) || Number(fallback.at) || Date.now(),
      accuracy: finite(point.accuracy),
      speedKmh: finite(point.speedKmh),
      heading: finite(point.heading),
      motion: String(point.motion || fallback.motion || 'unknown').toLowerCase(),
      source: point.source || fallback.source || 'legacy',
    };
  }

  function effectivePoint() {
    const location = context.getEffectiveLocation?.();
    const accuracy = finite(location?.accuracy);
    if (accuracy !== null && accuracy > MAX_ACCURACY_M) return null;
    return normalizedPoint({
      lat: location?.lat,
      lng: location?.lng,
      at: Date.parse(location?.updatedAt || '') || Date.now(),
      accuracy,
      speedKmh: finite(context.value?.('motion.speedKmh')),
      heading: finite(location?.heading),
      motion: context.value?.('motion.status'),
      source: location?.source || 'unknown',
    });
  }

  function legacyPoints(session) {
    const points = [];
    (session?.segments || []).forEach((segment) => {
      if (segment?.type !== 'movement') return;
      (segment.points || []).forEach((point) => {
        const normalized = normalizedPoint(point, { motion: 'moving', source: 'legacy-segment' });
        if (normalized) points.push(normalized);
      });
    });
    return points.sort((a, b) => a.at - b.at).filter((point, index, values) => {
      if (!index) return true;
      const previous = values[index - 1];
      return point.at !== previous.at || point.lat !== previous.lat || point.lng !== previous.lng;
    });
  }

  function migrateLegacySessions(snapshot) {
    try {
      if (localStorage.getItem(MIGRATION_KEY) === 'done') return;
      const known = new Set(history.map((track) => track.sessionId));
      for (const session of snapshot?.sessions || []) {
        if (!session?.id || known.has(session.id)) continue;
        const points = legacyPoints(session);
        if (!points.length) continue;
        history.push({
          schemaVersion: 1,
          id: `raw-${session.id}`,
          sessionId: session.id,
          name: session.name || 'Recorrido Wander',
          startedAt: Number(session.startedAt) || points[0].at,
          endedAt: Number(session.endedAt) || points[points.length - 1].at,
          points,
          migratedFromSegments: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        known.add(session.id);
      }
      if (!active && snapshot?.active?.id) {
        const points = legacyPoints(snapshot.active);
        active = {
          schemaVersion: 1,
          id: `raw-${snapshot.active.id}`,
          sessionId: snapshot.active.id,
          name: snapshot.active.name || 'Recorrido Wander',
          startedAt: Number(snapshot.active.startedAt) || points[0]?.at || Date.now(),
          endedAt: null,
          points,
          migratedFromSegments: points.length > 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      }
      history = history.slice(-500);
      localStorage.setItem(MIGRATION_KEY, 'done');
      persistNow();
    } catch {}
  }

  function ensureActive(session) {
    if (!session?.id) return null;
    if (active?.sessionId === session.id) return active;
    if (active?.sessionId) finalizeActive(active.sessionId, active.endedAt || Date.now());
    const seeded = legacyPoints(session);
    active = {
      schemaVersion: 1,
      id: `raw-${session.id}`,
      sessionId: session.id,
      name: session.name || `Recorrido ${new Date(session.startedAt || Date.now()).toLocaleString('es-AR')}`,
      startedAt: Number(session.startedAt) || seeded[0]?.at || Date.now(),
      endedAt: null,
      points: seeded,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    persistNow();
    return active;
  }

  function notify() {
    const snapshot = apiSnapshot();
    listeners.forEach((listener) => { try { listener(snapshot); } catch {} });
    window.dispatchEvent(new CustomEvent('wander:raw-track-changed', { detail: snapshot }));
  }

  function schedulePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persistNow();
    }, PERSIST_DELAY_MS);
  }

  function persistNow() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = null;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      if (active) localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {}
    notify();
    window.dispatchEvent(new CustomEvent('wander:cloud-data-changed', { detail: { source: 'raw-track' } }));
  }

  function appendPoint(point) {
    const session = sessionsEngine.getActive?.();
    if (!session?.id || !point) return false;
    const track = ensureActive(session);
    const last = track.points[track.points.length - 1];
    if (last) {
      if (point.at <= Number(last.at || 0)) return false;
      if (point.at - Number(last.at || 0) < MIN_INTERVAL_MS) return false;
    }
    track.points.push(point);
    if (track.points.length > MAX_POINTS_PER_SESSION) track.points.splice(0, track.points.length - MAX_POINTS_PER_SESSION);
    track.updatedAt = Date.now();
    notify();
    schedulePersist();
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
    persistNow();
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
    persistNow();
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
  window.addEventListener('pagehide', persistNow);
  document.addEventListener?.('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistNow();
  });

  migrateLegacySessions(lastSessionSnapshot);
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
    persist: persistNow,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    storageKeys: Object.freeze({ active: ACTIVE_KEY, sessions: HISTORY_KEY, settings: SETTINGS_KEY }),
  });

  window.dispatchEvent(new CustomEvent('wander:raw-track-ready', { detail: apiSnapshot() }));
})();

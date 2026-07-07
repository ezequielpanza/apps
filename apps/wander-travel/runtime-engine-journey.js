(() => {
  const STORAGE_KEY = 'wander.engine.journey.v1';
  const POLICY = Object.freeze({
    endAfterStationaryMs: 1800000,
    resumeGapMs: 1800000,
    maxSampleGapMs: 120000,
    maxCompleted: 200,
  });

  let data = load();
  let persistTimer = null;

  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (stored?.schemaVersion === 1) return stored;
    } catch {}
    return { schemaVersion: 1, active: null, completed: [] };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function persistSoon() {
    if (persistTimer) return;
    persistTimer = setTimeout(flush, 1500);
  }

  function flush() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  }

  function finiteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function point(situation, at) {
    const lat = finiteNumber(situation?.lat);
    const lng = finiteNumber(situation?.lng);
    return lat === null || lng === null ? null : { lat, lng, at };
  }

  function distanceMeters(a, b) {
    if (!a || !b) return 0;
    const r = 6371000;
    const p1 = a.lat * Math.PI / 180;
    const p2 = b.lat * Math.PI / 180;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
    return r * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function stableMotion(situation, transitionState) {
    const stable = transitionState?.stableMotion;
    if (stable?.status === 'moving' || stable?.status === 'stationary') return stable;
    const current = situation?.motion;
    if (current?.status === 'moving' || current?.status === 'stationary') return current;
    return null;
  }

  function mobilityMode(situation) {
    return situation?.mobility?.mode || 'unknown';
  }

  function makeEvent(type, at, extra = {}) {
    return { type, at: new Date(at).toISOString(), ...extra };
  }

  function startJourney(situation, location, at) {
    const mode = mobilityMode(situation);
    data.active = {
      id: 'journey_' + at.toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      state: 'active',
      startedAt: new Date(at).toISOString(),
      lastObservedAt: at,
      lastSampleAt: at,
      pauseStartedAt: null,
      distanceM: 0,
      movingDurationMs: 0,
      stationaryDurationMs: 0,
      lastPoint: location,
      mobilitySegments: [{ mode, startedAt: new Date(at).toISOString(), endedAt: null }],
    };
    persistSoon();
    return data.active;
  }

  function updateMobility(active, situation, at) {
    const mode = mobilityMode(situation);
    const last = active.mobilitySegments[active.mobilitySegments.length - 1];
    if (last?.mode === mode) return;
    if (last && !last.endedAt) last.endedAt = new Date(at).toISOString();
    active.mobilitySegments.push({ mode, startedAt: new Date(at).toISOString(), endedAt: null });
  }

  function closeJourney(at, reason, events) {
    const active = data.active;
    if (!active) return null;
    data.active = null;
    const last = active.mobilitySegments[active.mobilitySegments.length - 1];
    if (last && !last.endedAt) last.endedAt = new Date(at).toISOString();
    const startedAt = Date.parse(active.startedAt);
    const completed = {
      id: active.id,
      startedAt: active.startedAt,
      endedAt: new Date(at).toISOString(),
      durationMs: Math.max(0, at - startedAt),
      distanceM: Math.round(active.distanceM),
      movingDurationMs: Math.round(active.movingDurationMs),
      stationaryDurationMs: Math.round(active.stationaryDurationMs),
      mobilitySegments: active.mobilitySegments,
      endReason: reason,
    };
    data.completed.push(completed);
    if (data.completed.length > POLICY.maxCompleted) data.completed.splice(0, data.completed.length - POLICY.maxCompleted);
    events.push(makeEvent('journey.ended', at, {
      journeyId: completed.id,
      reason,
      durationMs: completed.durationMs,
      distanceM: completed.distanceM,
      confidence: 0.9,
    }));
    persistSoon();
    return completed;
  }

  function update({ situation, transitionState } = {}, at = Date.now()) {
    const events = [];
    const activeBefore = data.active;
    if (activeBefore && at - activeBefore.lastObservedAt > POLICY.resumeGapMs) {
      closeJourney(activeBefore.lastObservedAt, 'observation_gap', events);
    }

    const motion = stableMotion(situation, transitionState);
    const location = point(situation, at);
    if (!motion || !situation?.locationAvailable) return { events, ...snapshot() };

    if (motion.status === 'moving') {
      let active = data.active;
      if (!active) {
        active = startJourney(situation, location, finiteNumber(motion.sinceAt) ?? at);
        events.push(makeEvent('journey.started', at, { journeyId: active.id, confidence: 0.9 }));
      } else if (active.state === 'paused') {
        active.state = 'active';
        active.pauseStartedAt = null;
        events.push(makeEvent('journey.resumed', at, { journeyId: active.id, confidence: 0.9 }));
      }

      const deltaMs = Math.max(0, Math.min(at - active.lastSampleAt, POLICY.maxSampleGapMs));
      active.movingDurationMs += deltaMs;
      if (location && active.lastPoint) active.distanceM += distanceMeters(active.lastPoint, location);
      active.lastPoint = location || active.lastPoint;
      active.lastSampleAt = at;
      active.lastObservedAt = at;
      updateMobility(active, situation, at);
      persistSoon();
      return { events, ...snapshot() };
    }

    const active = data.active;
    if (!active) return { events, ...snapshot() };

    const deltaMs = Math.max(0, Math.min(at - active.lastSampleAt, POLICY.maxSampleGapMs));
    active.stationaryDurationMs += deltaMs;
    active.lastSampleAt = at;
    active.lastObservedAt = at;
    if (active.state !== 'paused') {
      active.state = 'paused';
      active.pauseStartedAt = finiteNumber(motion.sinceAt) ?? at;
      events.push(makeEvent('journey.paused', at, { journeyId: active.id, confidence: 0.88 }));
    }

    if (at - active.pauseStartedAt >= POLICY.endAfterStationaryMs) {
      closeJourney(active.pauseStartedAt + POLICY.endAfterStationaryMs, 'sustained_stationary', events);
    }
    persistSoon();
    return { events, ...snapshot() };
  }

  function snapshot() {
    const active = data.active ? clone(data.active) : null;
    return {
      active,
      lastCompleted: data.completed.length ? clone(data.completed[data.completed.length - 1]) : null,
      completedCount: data.completed.length,
      nextCheckAt: active?.state === 'paused' && Number.isFinite(active.pauseStartedAt)
        ? active.pauseStartedAt + POLICY.endAfterStationaryMs
        : null,
    };
  }

  function getState() {
    return clone(data);
  }

  function reset() {
    data = { schemaVersion: 1, active: null, completed: [] };
    flush();
  }

  window.addEventListener('pagehide', flush);
  window.WanderEngineJourney = { policy: POLICY, update, snapshot, getState, reset, flush };
})();

(() => {
  const STORAGE_KEY = 'wander.engine.memory.v1';
  const CELL_SIZE_M = 250;
  const MAX_SAMPLE_GAP_MS = 120000;
  const REVISIT_GAP_MS = 1800000;
  const ACTIVE_RESUME_GAP_MS = 1800000;
  const MIN_MOVEMENT_EPISODE_MS = 30000;
  const MIN_MOVEMENT_DISTANCE_M = 30;
  const MIN_STAY_EPISODE_MS = 120000;
  const MAX_MOVEMENT_EPISODES = 300;
  const MAX_STAY_EPISODES = 500;
  const MAX_CELLS = 5000;
  const MAX_PATH_POINTS = 300;
  const MAX_RECENT_VISITS = 12;

  const EMPTY = {
    schemaVersion: 1,
    episodes: { movement: [], stays: [] },
    spatial: { cells: {} },
    active: { movement: null, stay: null, cell: null },
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!stored || stored.schemaVersion !== EMPTY.schemaVersion) return clone(EMPTY);
      return {
        ...clone(EMPTY),
        ...stored,
        episodes: {
          movement: Array.isArray(stored.episodes?.movement) ? stored.episodes.movement : [],
          stays: Array.isArray(stored.episodes?.stays) ? stored.episodes.stays : [],
        },
        spatial: { cells: stored.spatial?.cells || {} },
        active: {
          movement: stored.active?.movement || null,
          stay: stored.active?.stay || null,
          cell: stored.active?.cell || null,
        },
      };
    } catch {
      return clone(EMPTY);
    }
  }

  let memory = load();
  let persistTimer = null;

  const iso = (at) => new Date(at).toISOString();

  function finiteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function pointFromSituation(situation, at) {
    const lat = finiteNumber(situation?.lat);
    const lng = finiteNumber(situation?.lng);
    if (lat === null || lng === null) return null;
    return {
      lat,
      lng,
      accuracy: finiteNumber(situation?.accuracy),
      at,
    };
  }

  function distanceMeters(a, b) {
    if (!a || !b) return 0;
    const radius = 6371000;
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function cellId(lat, lng) {
    const radius = 6378137;
    const safeLat = Math.max(-85, Math.min(85, lat));
    const x = radius * lng * Math.PI / 180;
    const y = radius * Math.log(Math.tan(Math.PI / 4 + safeLat * Math.PI / 360));
    return Math.floor(x / CELL_SIZE_M) + ':' + Math.floor(y / CELL_SIZE_M);
  }

  function schedulePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(memory)); } catch {}
    }, 1500);
  }

  function flush() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(memory)); } catch {}
  }

  function makeId(prefix, at) {
    return prefix + '_' + at.toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function pruneCells() {
    const keys = Object.keys(memory.spatial.cells);
    if (keys.length <= MAX_CELLS) return;
    keys.sort((a, b) => Date.parse(memory.spatial.cells[a].lastSeenAt || 0) - Date.parse(memory.spatial.cells[b].lastSeenAt || 0));
    keys.slice(0, keys.length - MAX_CELLS).forEach((key) => delete memory.spatial.cells[key]);
  }

  function cellRecord(key, at) {
    let record = memory.spatial.cells[key];
    if (!record) {
      record = memory.spatial.cells[key] = {
        firstSeenAt: iso(at),
        lastSeenAt: iso(at),
        visitCount: 0,
        totalDurationMs: 0,
        samples: 0,
        stayCount: 0,
        movementCount: 0,
        recentVisits: [],
      };
      pruneCells();
    }
    return record;
  }

  function openCellVisit(record, key, point, motion, at) {
    record.visitCount += 1;
    record.recentVisits.push(iso(at));
    if (record.recentVisits.length > MAX_RECENT_VISITS) record.recentVisits.splice(0, record.recentVisits.length - MAX_RECENT_VISITS);
    if (motion?.status === 'stationary') record.stayCount += 1;
    if (motion?.status === 'moving') record.movementCount += 1;
    memory.active.cell = {
      key,
      enteredAt: at,
      lastSampleAt: at,
      lastPoint: { lat: point.lat, lng: point.lng },
    };
  }

  function updateSpatial(point, motion, at) {
    const key = cellId(point.lat, point.lng);
    const record = cellRecord(key, at);
    const active = memory.active.cell;
    const gapMs = active ? at - active.lastSampleAt : Infinity;
    const newVisit = !active || active.key !== key || gapMs > REVISIT_GAP_MS;

    if (newVisit) openCellVisit(record, key, point, motion, at);
    else {
      const durationMs = Math.max(0, Math.min(gapMs, MAX_SAMPLE_GAP_MS));
      record.totalDurationMs += durationMs;
      active.lastSampleAt = at;
      active.lastPoint = { lat: point.lat, lng: point.lng };
    }

    record.lastSeenAt = iso(at);
    record.samples += 1;
    schedulePersist();
    return key;
  }

  function thinPath(path) {
    if (path.length <= MAX_PATH_POINTS) return path;
    const thinned = path.filter((_, index) => index === 0 || index === path.length - 1 || index % 2 === 0);
    return thinned.slice(-MAX_PATH_POINTS);
  }

  function startMovement(point, mode, startedAt, source) {
    memory.active.movement = {
      id: makeId('move', startedAt),
      type: 'movement',
      startedAt: iso(startedAt),
      lastObservedAt: startedAt,
      mode: mode || 'unknown',
      modes: [mode || 'unknown'],
      source: source || 'unknown',
      distanceM: 0,
      path: [{ lat: point.lat, lng: point.lng, at: iso(startedAt) }],
      lastPoint: { lat: point.lat, lng: point.lng, at: startedAt },
    };
  }

  function updateMovement(point, mode, at) {
    const active = memory.active.movement;
    if (!active) return;
    if (mode && !active.modes.includes(mode)) active.modes.push(mode);
    if (mode) active.mode = mode;

    const previous = active.lastPoint;
    const stepM = distanceMeters(previous, point);
    const elapsedMs = Math.max(1, at - previous.at);
    const accuracy = point.accuracy ?? 10;
    const noiseFloorM = Math.max(3, Math.min(25, accuracy * 0.5));
    const plausibleMaxM = Math.max(250, elapsedMs / 1000 * 80);

    if (stepM >= noiseFloorM && stepM <= plausibleMaxM) active.distanceM += stepM;

    const lastPath = active.path[active.path.length - 1];
    const pathDistanceM = distanceMeters(lastPath, point);
    const pathElapsedMs = at - Date.parse(lastPath.at);
    if (pathDistanceM >= 75 || pathElapsedMs >= 60000) {
      active.path.push({ lat: point.lat, lng: point.lng, at: iso(at) });
      active.path = thinPath(active.path);
    }

    active.lastPoint = { lat: point.lat, lng: point.lng, at };
    active.lastObservedAt = at;
  }

  function closeMovement(endedAt) {
    const active = memory.active.movement;
    if (!active) return null;
    memory.active.movement = null;

    const startedAt = Date.parse(active.startedAt);
    const endAt = Math.max(startedAt, endedAt);
    const durationMs = endAt - startedAt;
    if (durationMs < MIN_MOVEMENT_EPISODE_MS || active.distanceM < MIN_MOVEMENT_DISTANCE_M) return null;

    const episode = {
      id: active.id,
      type: 'movement',
      startedAt: active.startedAt,
      endedAt: iso(endAt),
      durationMs,
      mode: active.mode,
      modes: active.modes,
      source: active.source,
      distanceM: Math.round(active.distanceM),
      path: active.path,
    };
    memory.episodes.movement.push(episode);
    if (memory.episodes.movement.length > MAX_MOVEMENT_EPISODES) memory.episodes.movement.splice(0, memory.episodes.movement.length - MAX_MOVEMENT_EPISODES);
    return episode;
  }

  function startStay(point, startedAt, source) {
    memory.active.stay = {
      id: makeId('stay', startedAt),
      type: 'stay',
      startedAt: iso(startedAt),
      lastObservedAt: startedAt,
      source: source || 'unknown',
      center: { lat: point.lat, lng: point.lng },
      radiusM: 0,
      samples: 1,
    };
  }

  function updateStay(point, at) {
    const active = memory.active.stay;
    if (!active) return;
    const nextSamples = active.samples + 1;
    const previousCenter = { ...active.center };
    active.center.lat += (point.lat - active.center.lat) / nextSamples;
    active.center.lng += (point.lng - active.center.lng) / nextSamples;
    active.samples = nextSamples;
    active.radiusM = Math.max(active.radiusM, distanceMeters(previousCenter, point), distanceMeters(active.center, point));
    active.lastObservedAt = at;
  }

  function closeStay(endedAt) {
    const active = memory.active.stay;
    if (!active) return null;
    memory.active.stay = null;

    const startedAt = Date.parse(active.startedAt);
    const endAt = Math.max(startedAt, endedAt);
    const durationMs = endAt - startedAt;
    if (durationMs < MIN_STAY_EPISODE_MS) return null;

    const episode = {
      id: active.id,
      type: 'stay',
      startedAt: active.startedAt,
      endedAt: iso(endAt),
      durationMs,
      source: active.source,
      center: active.center,
      radiusM: Math.round(active.radiusM),
      samples: active.samples,
    };
    memory.episodes.stays.push(episode);
    if (memory.episodes.stays.length > MAX_STAY_EPISODES) memory.episodes.stays.splice(0, memory.episodes.stays.length - MAX_STAY_EPISODES);
    return episode;
  }

  function recoverExpiredActive(at) {
    const movement = memory.active.movement;
    if (movement && at - movement.lastObservedAt > ACTIVE_RESUME_GAP_MS) closeMovement(movement.lastObservedAt);
    const stay = memory.active.stay;
    if (stay && at - stay.lastObservedAt > ACTIVE_RESUME_GAP_MS) closeStay(stay.lastObservedAt);
  }

  function stableMotion(situation, transitionState) {
    const stable = transitionState?.stableMotion;
    if (stable?.status === 'moving' || stable?.status === 'stationary') return stable;
    const current = situation?.motion;
    if (current?.status === 'moving' || current?.status === 'stationary') return current;
    return null;
  }

  function syncEpisodes(point, situation, transitionState, at) {
    const motion = stableMotion(situation, transitionState);
    if (!motion) return;
    const sinceAt = finiteNumber(motion.sinceAt) ?? at;

    if (motion.status === 'moving') {
      closeStay(sinceAt);
      if (!memory.active.movement) startMovement(point, motion.mode, sinceAt, situation.source);
      updateMovement(point, motion.mode, at);
      return;
    }

    closeMovement(sinceAt);
    if (!memory.active.stay) startStay(point, sinceAt, situation.source);
    updateStay(point, at);
  }

  function previousVisitAt(record, enteredAt) {
    const visits = record.recentVisits || [];
    for (let index = visits.length - 1; index >= 0; index -= 1) {
      const at = Date.parse(visits[index]);
      if (Number.isFinite(at) && at < enteredAt - 1000) return visits[index];
    }
    return null;
  }

  function familiarityFor(record, priorVisitCount) {
    if (priorVisitCount <= 0) return 'first_visit';
    if (record.visitCount >= 10 || record.totalDurationMs >= 72000000) return 'frequent';
    if (record.visitCount >= 3 || record.totalDurationMs >= 14400000) return 'familiar';
    return 'returning';
  }

  function currentAreaSummary(situation, at = Date.now()) {
    const point = pointFromSituation(situation, at);
    if (!point) return null;
    const key = cellId(point.lat, point.lng);
    const record = memory.spatial.cells[key];
    if (!record) return null;

    const activeCell = memory.active.cell?.key === key ? memory.active.cell : null;
    const enteredAt = activeCell?.enteredAt ?? at;
    const previous = previousVisitAt(record, enteredAt);
    const priorVisitCount = Math.max(0, record.visitCount - 1);
    const familiarity = familiarityFor(record, priorVisitCount);

    return {
      cellId: key,
      cellSizeM: CELL_SIZE_M,
      familiarity,
      seenBefore: priorVisitCount > 0,
      visitCount: record.visitCount,
      priorVisitCount,
      firstSeenAt: record.firstSeenAt,
      lastSeenAt: record.lastSeenAt,
      previousVisitAt: previous,
      returnGapMs: previous ? Math.max(0, at - Date.parse(previous)) : null,
      totalDurationMs: Math.round(record.totalDurationMs),
      stayCount: record.stayCount,
      movementCount: record.movementCount,
      coverage: familiarity === 'first_visit' ? 'new' : familiarity === 'returning' ? 'revisited' : 'known',
    };
  }

  function observe({ situation, transitionState } = {}, at = Date.now()) {
    recoverExpiredActive(at);
    const point = pointFromSituation(situation, at);
    if (!point || !situation?.locationAvailable) {
      schedulePersist();
      return { currentArea: null, closedEpisodes: [] };
    }

    const motion = stableMotion(situation, transitionState);
    updateSpatial(point, motion, at);
    const beforeMovement = memory.episodes.movement.length;
    const beforeStays = memory.episodes.stays.length;
    syncEpisodes(point, situation, transitionState, at);
    schedulePersist();

    return {
      currentArea: currentAreaSummary(situation, at),
      closedEpisodes: [
        ...memory.episodes.movement.slice(beforeMovement),
        ...memory.episodes.stays.slice(beforeStays),
      ],
    };
  }

  function hasVisited(lat, lng) {
    const numericLat = finiteNumber(lat);
    const numericLng = finiteNumber(lng);
    if (numericLat === null || numericLng === null) return false;
    return Boolean(memory.spatial.cells[cellId(numericLat, numericLng)]);
  }

  function snapshot() {
    return clone(memory);
  }

  function reset() {
    memory = clone(EMPTY);
    flush();
  }

  window.addEventListener('pagehide', flush);

  window.WanderEngineMemory = {
    observe,
    snapshot,
    reset,
    flush,
    hasVisited,
    getCurrentAreaSummary: currentAreaSummary,
    cellSizeM: CELL_SIZE_M,
  };
})();

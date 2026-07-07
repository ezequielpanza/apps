(() => {
  const STORAGE_KEY = 'wander.engine.memory.v2';
  const CELL_SIZE_M = 250;
  const POLICY = Object.freeze({
    maxSampleGapMs: 120000,
    encounterResumeGapMs: 1800000,
    stopMinMs: 120000,
    visitMinMs: 1200000,
    stayMinMs: 14400000,
    exploreMovingMinMs: 300000,
    exploreMixedMovingMinMs: 180000,
    exploreMixedStationaryMinMs: 180000,
    explorePathMinM: 250,
    maxCells: 5000,
    maxInteractions: 1200,
    maxRecentJourneyIds: 20,
  });

  const EMPTY = {
    schemaVersion: 2,
    spatial: { cells: {} },
    interactions: [],
    active: { encounter: null },
  };

  let memory = load();
  let persistTimer = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (stored?.schemaVersion === 2) {
        return {
          schemaVersion: 2,
          spatial: { cells: stored.spatial?.cells || {} },
          interactions: Array.isArray(stored.interactions) ? stored.interactions : [],
          active: { encounter: stored.active?.encounter || null },
        };
      }
    } catch {}
    return clone(EMPTY);
  }

  function finiteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function iso(at) {
    return new Date(at).toISOString();
  }

  function pointFromSituation(situation, at) {
    const lat = finiteNumber(situation?.lat);
    const lng = finiteNumber(situation?.lng);
    if (lat === null || lng === null) return null;
    return {
      lat,
      lng,
      accuracy: finiteNumber(situation?.accuracy),
      heading: finiteNumber(situation?.heading),
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

  function headingDelta(a, b) {
    if (a === null || b === null) return 0;
    const delta = Math.abs(a - b) % 360;
    return delta > 180 ? 360 - delta : delta;
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
    persistTimer = setTimeout(flush, 1500);
  }

  function flush() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(memory)); } catch {}
  }

  function makeId(prefix, at) {
    return prefix + '_' + at.toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function baseCellRecord(at) {
    return {
      firstSeenAt: iso(at),
      lastSeenAt: iso(at),
      samples: 0,
      totalObservedMs: 0,
      encounterCount: 0,
      passThroughCount: 0,
      stopCount: 0,
      exploreCount: 0,
      visitCount: 0,
      stayCount: 0,
      routeDurationMs: 0,
      placeDurationMs: 0,
      lastPassThroughAt: null,
      lastVisitedAt: null,
      lastStayedAt: null,
      recentJourneyIds: [],
    };
  }

  function pruneCells() {
    const keys = Object.keys(memory.spatial.cells);
    if (keys.length <= POLICY.maxCells) return;
    keys.sort((a, b) => Date.parse(memory.spatial.cells[a].lastSeenAt || 0) - Date.parse(memory.spatial.cells[b].lastSeenAt || 0));
    keys.slice(0, keys.length - POLICY.maxCells).forEach((key) => delete memory.spatial.cells[key]);
  }

  function cellRecord(key, at) {
    let record = memory.spatial.cells[key];
    if (!record) {
      record = memory.spatial.cells[key] = baseCellRecord(at);
      pruneCells();
    }
    return record;
  }

  function routeFamiliarity(record) {
    if (record.passThroughCount <= 0) return 'route_new';
    if (record.passThroughCount >= 10 || record.routeDurationMs >= 18000000) return 'route_frequent';
    if (record.passThroughCount >= 3 || record.routeDurationMs >= 3600000) return 'route_familiar';
    return 'route_returning';
  }

  function placeFamiliarity(record) {
    const meaningfulCount = record.exploreCount + record.visitCount + record.stayCount;
    if (meaningfulCount <= 0) return 'unexplored';
    if (meaningfulCount >= 10 || record.placeDurationMs >= 72000000) return 'frequent';
    if (meaningfulCount >= 3 || record.placeDurationMs >= 14400000) return 'familiar';
    if (meaningfulCount === 1) return 'first_visit';
    return 'returning';
  }

  function stableMotion(situation, transitionState) {
    const stable = transitionState?.stableMotion;
    if (stable?.status === 'moving' || stable?.status === 'stationary') return stable;
    const current = situation?.motion;
    if (current?.status === 'moving' || current?.status === 'stationary') return current;
    return null;
  }

  function journeyId(journeyState) {
    return journeyState?.active?.id || null;
  }

  function makeEvent(type, at, key, record, extras = {}) {
    return {
      type,
      at: iso(at),
      cellId: key,
      cellSizeM: CELL_SIZE_M,
      routeFamiliarity: routeFamiliarity(record),
      placeFamiliarity: placeFamiliarity(record),
      ...extras,
    };
  }

  function openEncounter(key, record, location, motion, journeyState, at, events) {
    const previousSeenAt = record.lastSeenAt;
    const hadHistory = record.samples > 0;
    record.encounterCount += 1;
    memory.active.encounter = {
      id: makeId('encounter', at),
      key,
      enteredAt: at,
      lastSampleAt: at,
      entryPoint: { lat: location.lat, lng: location.lng },
      lastPoint: { lat: location.lat, lng: location.lng },
      pathDistanceM: 0,
      movingMs: 0,
      stationaryMs: 0,
      samples: 0,
      headingChangeDeg: 0,
      lastHeading: location.heading,
      journeyId: journeyId(journeyState),
    };

    if (!hadHistory) {
      events.push(makeEvent('area.first_seen', at, key, record, { confidence: 0.96 }));
    } else {
      const gapMs = Math.max(0, at - Date.parse(previousSeenAt || iso(at)));
      const placeKnown = placeFamiliarity(record) !== 'unexplored';
      if (placeKnown && gapMs > POLICY.encounterResumeGapMs) {
        events.push(makeEvent('area.place_returned', at, key, record, {
          previousVisitAt: record.lastVisitedAt || record.lastStayedAt,
          returnGapMs: gapMs,
          confidence: 0.92,
        }));
      } else if (!placeKnown && record.passThroughCount > 0 && gapMs > POLICY.encounterResumeGapMs) {
        events.push(makeEvent('area.route_returned', at, key, record, {
          previousPassThroughAt: record.lastPassThroughAt,
          returnGapMs: gapMs,
          confidence: 0.88,
        }));
      }
    }

    if (motion?.status === 'stationary') memory.active.encounter.stationaryMs = 0;
  }

  function interactionType(encounter) {
    const durationMs = Math.max(0, encounter.lastSampleAt - encounter.enteredAt);
    const directM = distanceMeters(encounter.entryPoint, encounter.lastPoint);
    const directness = encounter.pathDistanceM > 0 ? Math.min(1, directM / encounter.pathDistanceM) : 1;
    const explored = (
      encounter.movingMs >= POLICY.exploreMovingMinMs &&
      encounter.pathDistanceM >= POLICY.explorePathMinM &&
      (directness < 0.65 || encounter.headingChangeDeg >= 180)
    ) || (
      encounter.movingMs >= POLICY.exploreMixedMovingMinMs &&
      encounter.stationaryMs >= POLICY.exploreMixedStationaryMinMs &&
      encounter.pathDistanceM >= 150
    );

    if (encounter.stationaryMs >= POLICY.stayMinMs) return { type: 'stayed', durationMs, directness };
    if (explored) return { type: 'explored', durationMs, directness };
    if (encounter.stationaryMs >= POLICY.visitMinMs) return { type: 'visited', durationMs, directness };
    if (encounter.stationaryMs >= POLICY.stopMinMs) return { type: 'stopped', durationMs, directness };
    if (encounter.movingMs >= 30000) return { type: 'passed_through', durationMs, directness };
    return { type: 'encountered', durationMs, directness };
  }

  function pushRecentJourney(record, id) {
    if (!id || record.recentJourneyIds.includes(id)) return false;
    record.recentJourneyIds.push(id);
    if (record.recentJourneyIds.length > POLICY.maxRecentJourneyIds) {
      record.recentJourneyIds.splice(0, record.recentJourneyIds.length - POLICY.maxRecentJourneyIds);
    }
    return true;
  }

  function closeEncounter(at, reason, events, closedInteractions) {
    const encounter = memory.active.encounter;
    if (!encounter) return;
    memory.active.encounter = null;

    const record = memory.spatial.cells[encounter.key];
    if (!record) return;

    const beforeRoute = routeFamiliarity(record);
    const beforePlace = placeFamiliarity(record);
    const classification = interactionType(encounter);
    const interaction = {
      id: encounter.id,
      type: classification.type,
      cellId: encounter.key,
      startedAt: iso(encounter.enteredAt),
      endedAt: iso(at),
      durationMs: classification.durationMs,
      movingMs: Math.round(encounter.movingMs),
      stationaryMs: Math.round(encounter.stationaryMs),
      pathDistanceM: Math.round(encounter.pathDistanceM),
      directness: Number(classification.directness.toFixed(2)),
      headingChangeDeg: Math.round(encounter.headingChangeDeg),
      journeyId: encounter.journeyId,
      endReason: reason,
    };

    const journeyIsNew = pushRecentJourney(record, encounter.journeyId);
    if (classification.type === 'passed_through') {
      if (!encounter.journeyId || journeyIsNew) record.passThroughCount += 1;
      record.routeDurationMs += classification.durationMs;
      record.lastPassThroughAt = iso(at);
    } else if (classification.type === 'stopped') {
      record.stopCount += 1;
    } else if (classification.type === 'explored') {
      record.exploreCount += 1;
      record.visitCount += 1;
      record.placeDurationMs += classification.durationMs;
      record.lastVisitedAt = iso(at);
    } else if (classification.type === 'visited') {
      record.visitCount += 1;
      record.placeDurationMs += classification.durationMs;
      record.lastVisitedAt = iso(at);
    } else if (classification.type === 'stayed') {
      record.stayCount += 1;
      record.visitCount += 1;
      record.placeDurationMs += classification.durationMs;
      record.lastVisitedAt = iso(at);
      record.lastStayedAt = iso(at);
    }

    memory.interactions.push(interaction);
    if (memory.interactions.length > POLICY.maxInteractions) {
      memory.interactions.splice(0, memory.interactions.length - POLICY.maxInteractions);
    }
    closedInteractions.push(interaction);

    const eventName = 'area.' + classification.type;
    events.push(makeEvent(eventName, at, encounter.key, record, {
      interactionId: interaction.id,
      durationMs: interaction.durationMs,
      journeyId: interaction.journeyId,
      confidence: classification.type === 'encountered' ? 0.7 : 0.9,
    }));

    const afterRoute = routeFamiliarity(record);
    const afterPlace = placeFamiliarity(record);
    if (beforeRoute !== afterRoute && (afterRoute === 'route_familiar' || afterRoute === 'route_frequent')) {
      events.push(makeEvent('area.' + afterRoute, at, encounter.key, record, { confidence: 0.9 }));
    }
    if (beforePlace !== afterPlace && (afterPlace === 'familiar' || afterPlace === 'frequent')) {
      events.push(makeEvent('area.place_' + afterPlace, at, encounter.key, record, { confidence: 0.93 }));
    }
  }

  function updateEncounter(encounter, record, location, motion, at) {
    const deltaMs = Math.max(0, Math.min(at - encounter.lastSampleAt, POLICY.maxSampleGapMs));
    record.totalObservedMs += deltaMs;

    if (motion?.status === 'moving') {
      encounter.movingMs += deltaMs;
      const stepM = distanceMeters(encounter.lastPoint, location);
      const accuracy = location.accuracy ?? 10;
      const noiseFloorM = Math.max(3, Math.min(30, accuracy * 0.5));
      const plausibleMaxM = Math.max(300, deltaMs / 1000 * 120);
      if (stepM >= noiseFloorM && stepM <= plausibleMaxM) encounter.pathDistanceM += stepM;
    } else if (motion?.status === 'stationary') {
      encounter.stationaryMs += deltaMs;
    }

    encounter.headingChangeDeg += headingDelta(encounter.lastHeading, location.heading);
    encounter.lastHeading = location.heading;
    encounter.lastPoint = { lat: location.lat, lng: location.lng };
    encounter.lastSampleAt = at;
    encounter.samples += 1;
    record.samples += 1;
    record.lastSeenAt = iso(at);
  }

  function recoverExpired(at, events, closedInteractions) {
    const active = memory.active.encounter;
    if (!active) return;
    if (at - active.lastSampleAt > POLICY.encounterResumeGapMs) {
      closeEncounter(active.lastSampleAt, 'observation_gap', events, closedInteractions);
    }
  }

  function activeInteractionState(encounter) {
    if (!encounter) return 'unknown';
    if (encounter.stationaryMs >= POLICY.stayMinMs) return 'staying';
    if (encounter.stationaryMs >= POLICY.visitMinMs) return 'visiting';
    if (encounter.stationaryMs >= POLICY.stopMinMs) return 'stopped';
    const directM = distanceMeters(encounter.entryPoint, encounter.lastPoint);
    const directness = encounter.pathDistanceM > 0 ? directM / encounter.pathDistanceM : 1;
    if (encounter.movingMs >= POLICY.exploreMovingMinMs && encounter.pathDistanceM >= POLICY.explorePathMinM && directness < 0.65) return 'exploring_candidate';
    if (encounter.movingMs > 0) return 'moving_through';
    return 'observed';
  }

  function currentAreaSummary(situation, at = Date.now()) {
    const location = pointFromSituation(situation, at);
    if (!location) return null;
    const key = cellId(location.lat, location.lng);
    const record = memory.spatial.cells[key];
    if (!record) return null;
    const active = memory.active.encounter?.key === key ? memory.active.encounter : null;

    return {
      cellId: key,
      cellSizeM: CELL_SIZE_M,
      seenBefore: record.encounterCount > 1 || record.samples > 1,
      routeFamiliarity: routeFamiliarity(record),
      placeFamiliarity: placeFamiliarity(record),
      interactionState: activeInteractionState(active),
      encounterCount: record.encounterCount,
      passThroughCount: record.passThroughCount,
      stopCount: record.stopCount,
      exploreCount: record.exploreCount,
      visitCount: record.visitCount,
      stayCount: record.stayCount,
      firstSeenAt: record.firstSeenAt,
      lastSeenAt: record.lastSeenAt,
      lastPassThroughAt: record.lastPassThroughAt,
      lastVisitedAt: record.lastVisitedAt,
      lastStayedAt: record.lastStayedAt,
      totalObservedMs: Math.round(record.totalObservedMs),
      routeDurationMs: Math.round(record.routeDurationMs),
      placeDurationMs: Math.round(record.placeDurationMs),
    };
  }

  function observe({ situation, transitionState, journeyState } = {}, at = Date.now()) {
    const events = [];
    const closedInteractions = [];
    recoverExpired(at, events, closedInteractions);

    const location = pointFromSituation(situation, at);
    if (!location || !situation?.locationAvailable) {
      schedulePersist();
      return { currentArea: null, areaEvents: events, closedInteractions };
    }

    const key = cellId(location.lat, location.lng);
    const record = cellRecord(key, at);
    const motion = stableMotion(situation, transitionState);
    const active = memory.active.encounter;

    if (!active || active.key !== key) {
      if (active) closeEncounter(at, 'cell_changed', events, closedInteractions);
      openEncounter(key, record, location, motion, journeyState, at, events);
    }

    updateEncounter(memory.active.encounter, record, location, motion, at);
    schedulePersist();

    return {
      currentArea: currentAreaSummary(situation, at),
      areaEvents: events,
      closedInteractions,
    };
  }

  function hasVisited(lat, lng) {
    const numericLat = finiteNumber(lat);
    const numericLng = finiteNumber(lng);
    if (numericLat === null || numericLng === null) return false;
    const record = memory.spatial.cells[cellId(numericLat, numericLng)];
    return Boolean(record && (record.visitCount > 0 || record.exploreCount > 0 || record.stayCount > 0));
  }

  function hasSeen(lat, lng) {
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
    policy: POLICY,
    observe,
    snapshot,
    reset,
    flush,
    hasSeen,
    hasVisited,
    getCurrentAreaSummary: currentAreaSummary,
    cellSizeM: CELL_SIZE_M,
  };
})();

(() => {
  const STORAGE_KEY = 'wander.engine.place.v1';
  const LEVELS = ['country', 'city', 'zone'];
  const POLICY = Object.freeze({
    maxSampleGapMs: 120000,
    changeStableMs: {
      country: 60000,
      city: 30000,
      zone: 20000,
    },
    resumeGapMs: {
      country: 172800000,
      city: 86400000,
      zone: 21600000,
    },
    maxRecords: {
      country: 200,
      city: 1500,
      zone: 4000,
    },
    maxCompletedSessions: 1500,
  });

  const EMPTY = {
    schemaVersion: 1,
    records: { country: {}, city: {}, zone: {} },
    active: { country: null, city: null, zone: null },
    candidates: { country: null, city: null, zone: null },
    completedSessions: [],
  };

  let data = load();
  let persistTimer = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (stored?.schemaVersion === 1) {
        return {
          schemaVersion: 1,
          records: {
            country: stored.records?.country || {},
            city: stored.records?.city || {},
            zone: stored.records?.zone || {},
          },
          active: {
            country: stored.active?.country || null,
            city: stored.active?.city || null,
            zone: stored.active?.zone || null,
          },
          candidates: {
            country: stored.candidates?.country || null,
            city: stored.candidates?.city || null,
            zone: stored.candidates?.zone || null,
          },
          completedSessions: Array.isArray(stored.completedSessions) ? stored.completedSessions : [],
        };
      }
    } catch {}
    return clone(EMPTY);
  }

  function schedulePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(flush, 1500);
  }

  function flush() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  }

  function iso(at) {
    return new Date(at).toISOString();
  }

  function makeId(prefix, at) {
    return prefix + '_' + at.toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function makeEvent(type, at, payload = {}) {
    return { type, at: iso(at), ...payload };
  }

  function descriptorFor(level, place) {
    if (!place) return null;
    if (level === 'country') {
      return place.countryId ? {
        id: place.countryId,
        name: place.country || null,
        parentId: null,
      } : null;
    }
    if (level === 'city') {
      return place.cityId ? {
        id: place.cityId,
        name: place.city || null,
        parentId: place.regionId || place.countryId || null,
      } : null;
    }
    return place.zoneId ? {
      id: place.zoneId,
      name: place.zone || null,
      parentId: place.cityId || place.regionId || place.countryId || null,
    } : null;
  }

  function baseRecord(level, descriptor, at) {
    return {
      id: descriptor.id,
      level,
      name: descriptor.name,
      parentId: descriptor.parentId,
      firstSeenAt: iso(at),
      lastSeenAt: iso(at),
      encounterCount: 0,
      passThroughCount: 0,
      stopCount: 0,
      exploreCount: 0,
      visitCount: 0,
      stayCount: 0,
      totalObservedMs: 0,
      totalVisitedMs: 0,
      lastInteraction: null,
      lastInteractionAt: null,
      lastPassThroughAt: null,
      lastVisitAt: null,
      lastStayAt: null,
    };
  }

  function pruneRecords(level) {
    const records = data.records[level];
    const keys = Object.keys(records);
    const limit = POLICY.maxRecords[level];
    if (keys.length <= limit) return;
    keys
      .sort((a, b) => Date.parse(records[a].lastSeenAt || 0) - Date.parse(records[b].lastSeenAt || 0))
      .slice(0, keys.length - limit)
      .forEach((key) => delete records[key]);
  }

  function ensureRecord(level, descriptor, at) {
    let record = data.records[level][descriptor.id];
    if (!record) {
      record = data.records[level][descriptor.id] = baseRecord(level, descriptor, at);
      pruneRecords(level);
    } else {
      record.name = descriptor.name || record.name;
      record.parentId = descriptor.parentId || record.parentId;
    }
    return record;
  }

  function routeFamiliarity(record) {
    if (!record || record.passThroughCount <= 0) return 'route_new';
    if (record.passThroughCount >= 10) return 'route_frequent';
    if (record.passThroughCount >= 3) return 'route_familiar';
    return 'route_returning';
  }

  function familiarity(level, record) {
    if (!record || record.visitCount <= 0) return 'unexplored';

    const thresholds = {
      country: { familiarCount: 3, familiarMs: 604800000, frequentCount: 10, frequentMs: 2592000000 },
      city: { familiarCount: 3, familiarMs: 86400000, frequentCount: 10, frequentMs: 604800000 },
      zone: { familiarCount: 3, familiarMs: 28800000, frequentCount: 10, frequentMs: 172800000 },
    }[level];

    if (record.visitCount >= thresholds.frequentCount || record.totalVisitedMs >= thresholds.frequentMs) return 'frequent';
    if (record.visitCount >= thresholds.familiarCount || record.totalVisitedMs >= thresholds.familiarMs) return 'familiar';
    if (record.visitCount === 1) return 'first_visit';
    return 'returning';
  }

  function stableMotion(situation, transitionState) {
    const stable = transitionState?.stableMotion;
    if (stable?.status === 'moving' || stable?.status === 'stationary') return stable;
    const current = situation?.motion;
    if (current?.status === 'moving' || current?.status === 'stationary') return current;
    return null;
  }

  function activeJourneyId(journeyState) {
    return journeyState?.active?.id || null;
  }

  function baseEvidence() {
    return {
      encountered: 0,
      passed_through: 0,
      stopped: 0,
      explored: 0,
      visited: 0,
      stayed: 0,
    };
  }

  function openSession(level, descriptor, at, journeyState, events) {
    const record = ensureRecord(level, descriptor, at);
    const priorFamiliarity = familiarity(level, record);
    const priorVisitAt = record.lastVisitAt || record.lastStayAt;

    record.encounterCount += 1;
    record.lastSeenAt = iso(at);

    const session = {
      id: makeId(level, at),
      level,
      placeId: descriptor.id,
      name: descriptor.name,
      parentId: descriptor.parentId,
      enteredAt: at,
      lastSeenAt: at,
      lastSampleAt: at,
      observedMs: 0,
      movingMs: 0,
      stationaryMs: 0,
      meaningfulMs: 0,
      journeyIds: [],
      cellIds: [],
      evidence: baseEvidence(),
      emittedInteraction: null,
    };

    const journeyId = activeJourneyId(journeyState);
    if (journeyId) session.journeyIds.push(journeyId);
    data.active[level] = session;
    data.candidates[level] = null;

    events.push(makeEvent(level + '.entered', at, {
      level,
      placeId: descriptor.id,
      name: descriptor.name,
      parentId: descriptor.parentId,
      firstSeen: record.encounterCount === 1,
      familiarity: priorFamiliarity,
      routeFamiliarity: routeFamiliarity(record),
      confidence: 0.9,
    }));

    if (record.visitCount > 0 && priorVisitAt) {
      const previousAt = Date.parse(priorVisitAt);
      events.push(makeEvent(level + '.returned', at, {
        level,
        placeId: descriptor.id,
        name: descriptor.name,
        previousVisitAt: priorVisitAt,
        returnGapMs: Number.isFinite(previousAt) ? Math.max(0, at - previousAt) : null,
        familiarity: priorFamiliarity,
        confidence: 0.94,
      }));
    }

    return session;
  }

  function pushUnique(list, value, max = 100) {
    if (!value || list.includes(value)) return;
    list.push(value);
    if (list.length > max) list.splice(0, list.length - max);
  }

  function consumeInteraction(session, interaction) {
    if (!interaction?.type) return;
    const endedAt = Date.parse(interaction.endedAt || interaction.startedAt || '');
    if (Number.isFinite(endedAt) && endedAt < session.enteredAt) return;

    if (Object.prototype.hasOwnProperty.call(session.evidence, interaction.type)) {
      session.evidence[interaction.type] += 1;
    }
    if (interaction.type === 'explored' || interaction.type === 'visited' || interaction.type === 'stayed') {
      session.meaningfulMs += Math.max(0, Number(interaction.durationMs) || 0);
    }
    pushUnique(session.cellIds, interaction.cellId, 250);
    pushUnique(session.journeyIds, interaction.journeyId, 50);
  }

  function updateSession(session, situation, transitionState, journeyState, memoryResult, at) {
    const deltaMs = Math.max(0, Math.min(at - session.lastSampleAt, POLICY.maxSampleGapMs));
    const motion = stableMotion(situation, transitionState);

    session.observedMs += deltaMs;
    if (motion?.status === 'moving') session.movingMs += deltaMs;
    else if (motion?.status === 'stationary') session.stationaryMs += deltaMs;

    session.lastSampleAt = at;
    session.lastSeenAt = at;

    const journeyId = activeJourneyId(journeyState);
    if (journeyId) pushUnique(session.journeyIds, journeyId, 50);

    (memoryResult?.closedInteractions || []).forEach((interaction) => consumeInteraction(session, interaction));
    const currentArea = memoryResult?.currentArea;
    if (currentArea?.cellId) pushUnique(session.cellIds, currentArea.cellId, 250);

    if (currentArea?.interactionState === 'stopped') session.evidence.stopped = Math.max(1, session.evidence.stopped);
    if (currentArea?.interactionState === 'visiting') session.evidence.visited = Math.max(1, session.evidence.visited);
    if (currentArea?.interactionState === 'staying') session.evidence.stayed = Math.max(1, session.evidence.stayed);
  }

  function classifySession(session) {
    if (session.evidence.stayed > 0 || session.stationaryMs >= 14400000) return 'stayed';
    if (session.evidence.explored > 0) return 'explored';
    if (session.evidence.visited > 0 || session.stationaryMs >= 1200000) return 'visited';
    if (session.evidence.stopped > 0 || session.stationaryMs >= 120000) return 'stopped';
    if (session.evidence.passed_through > 0 || session.movingMs >= 30000) return 'passed_through';
    return 'encountered';
  }

  function interactionRank(type) {
    return {
      encountered: 0,
      passed_through: 1,
      stopped: 2,
      visited: 3,
      explored: 4,
      stayed: 5,
    }[type] ?? 0;
  }

  function maybeEmitPromotion(level, session, record, at, events) {
    const type = classifySession(session);
    if (type === 'encountered' || type === 'passed_through') return;
    if (interactionRank(type) <= interactionRank(session.emittedInteraction)) return;

    const before = familiarity(level, record);
    events.push(makeEvent(level + '.' + type, at, {
      level,
      placeId: session.placeId,
      name: session.name,
      sessionId: session.id,
      firstMeaningfulVisit: record.visitCount === 0,
      familiarity: before,
      routeFamiliarity: routeFamiliarity(record),
      confidence: type === 'stopped' ? 0.86 : 0.93,
    }));
    session.emittedInteraction = type;
  }

  function meaningfulDuration(session, type) {
    if (session.meaningfulMs > 0) return session.meaningfulMs;
    if (type === 'explored') return Math.max(0, session.movingMs);
    if (type === 'visited' || type === 'stayed') return Math.max(0, session.stationaryMs);
    return 0;
  }

  function countFinalInteraction(record, type, session, at) {
    record.totalObservedMs += Math.max(0, session.observedMs);
    record.lastSeenAt = iso(at);
    record.lastInteraction = type;
    record.lastInteractionAt = iso(at);

    if (type === 'passed_through') {
      record.passThroughCount += 1;
      record.lastPassThroughAt = iso(at);
    } else if (type === 'stopped') {
      record.stopCount += 1;
    } else if (type === 'explored') {
      record.exploreCount += 1;
      record.visitCount += 1;
      record.totalVisitedMs += meaningfulDuration(session, type);
      record.lastVisitAt = iso(at);
    } else if (type === 'visited') {
      record.visitCount += 1;
      record.totalVisitedMs += meaningfulDuration(session, type);
      record.lastVisitAt = iso(at);
    } else if (type === 'stayed') {
      record.stayCount += 1;
      record.visitCount += 1;
      record.totalVisitedMs += meaningfulDuration(session, type);
      record.lastVisitAt = iso(at);
      record.lastStayAt = iso(at);
    }
  }

  function closeSession(level, at, reason, events, closedSessions) {
    const session = data.active[level];
    if (!session) return null;
    data.active[level] = null;
    data.candidates[level] = null;

    const record = data.records[level][session.placeId];
    if (!record) return null;

    const finalType = classifySession(session);
    const before = familiarity(level, record);
    const routeBefore = routeFamiliarity(record);

    if (interactionRank(finalType) > interactionRank(session.emittedInteraction)) {
      events.push(makeEvent(level + '.' + finalType, at, {
        level,
        placeId: session.placeId,
        name: session.name,
        sessionId: session.id,
        firstMeaningfulVisit: record.visitCount === 0 && ['visited', 'explored', 'stayed'].includes(finalType),
        familiarity: before,
        routeFamiliarity: routeBefore,
        confidence: finalType === 'encountered' ? 0.72 : 0.92,
      }));
    }

    countFinalInteraction(record, finalType, session, at);
    const after = familiarity(level, record);
    const routeAfter = routeFamiliarity(record);

    const completed = {
      id: session.id,
      level,
      placeId: session.placeId,
      name: session.name,
      parentId: session.parentId,
      enteredAt: iso(session.enteredAt),
      exitedAt: iso(at),
      durationMs: Math.max(0, at - session.enteredAt),
      observedMs: Math.round(session.observedMs),
      movingMs: Math.round(session.movingMs),
      stationaryMs: Math.round(session.stationaryMs),
      interaction: finalType,
      journeyIds: [...session.journeyIds],
      cellCount: session.cellIds.length,
      reason,
    };

    data.completedSessions.push(completed);
    if (data.completedSessions.length > POLICY.maxCompletedSessions) {
      data.completedSessions.splice(0, data.completedSessions.length - POLICY.maxCompletedSessions);
    }
    closedSessions.push(completed);

    events.push(makeEvent(level + '.exited', at, {
      level,
      placeId: session.placeId,
      name: session.name,
      sessionId: session.id,
      interaction: finalType,
      durationMs: completed.durationMs,
      familiarity: after,
      routeFamiliarity: routeAfter,
      confidence: 0.92,
    }));

    if (before !== after && (after === 'familiar' || after === 'frequent')) {
      events.push(makeEvent(level + '.' + after, at, {
        level,
        placeId: session.placeId,
        name: session.name,
        familiarity: after,
        confidence: 0.95,
      }));
    }

    if (routeBefore !== routeAfter && (routeAfter === 'route_familiar' || routeAfter === 'route_frequent')) {
      events.push(makeEvent(level + '.' + routeAfter, at, {
        level,
        placeId: session.placeId,
        name: session.name,
        routeFamiliarity: routeAfter,
        confidence: 0.9,
      }));
    }

    return completed;
  }

  function recoverExpired(at, events, closedSessions) {
    LEVELS.forEach((level) => {
      const session = data.active[level];
      if (!session) return;
      if (at - session.lastSeenAt > POLICY.resumeGapMs[level]) {
        closeSession(level, session.lastSeenAt, 'observation_gap', events, closedSessions);
      }
    });
  }

  function candidateMatches(candidate, descriptor) {
    return Boolean(candidate && candidate.placeId === (descriptor?.id || null));
  }

  function reconcileLevel(level, descriptor, placeAvailable, situation, transitionState, journeyState, memoryResult, at, events, closedSessions) {
    const active = data.active[level];

    if (!active) {
      data.candidates[level] = null;
      if (placeAvailable && descriptor) {
        const session = openSession(level, descriptor, at, journeyState, events);
        updateSession(session, situation, transitionState, journeyState, memoryResult, at);
        maybeEmitPromotion(level, session, data.records[level][session.placeId], at, events);
      }
      return;
    }

    if (!placeAvailable) return;

    if (descriptor?.id === active.placeId) {
      data.candidates[level] = null;
      updateSession(active, situation, transitionState, journeyState, memoryResult, at);
      const record = data.records[level][active.placeId];
      if (record) {
        record.lastSeenAt = iso(at);
        maybeEmitPromotion(level, active, record, at, events);
      }
      return;
    }

    const candidate = data.candidates[level];
    if (!candidateMatches(candidate, descriptor)) {
      data.candidates[level] = {
        placeId: descriptor?.id || null,
        descriptor: descriptor ? clone(descriptor) : null,
        startedAt: at,
      };
      return;
    }

    if (at - candidate.startedAt < POLICY.changeStableMs[level]) return;

    closeSession(level, at, descriptor ? 'place_changed' : 'place_unavailable', events, closedSessions);
    if (descriptor) {
      const session = openSession(level, descriptor, at, journeyState, events);
      updateSession(session, situation, transitionState, journeyState, memoryResult, at);
      maybeEmitPromotion(level, session, data.records[level][session.placeId], at, events);
    }
  }

  function recordSummary(level, record, activeSession = null) {
    if (!record) return null;
    return {
      level,
      placeId: record.id,
      name: record.name,
      parentId: record.parentId,
      familiarity: familiarity(level, record),
      routeFamiliarity: routeFamiliarity(record),
      encounterCount: record.encounterCount,
      passThroughCount: record.passThroughCount,
      stopCount: record.stopCount,
      exploreCount: record.exploreCount,
      visitCount: record.visitCount,
      stayCount: record.stayCount,
      totalObservedMs: Math.round(record.totalObservedMs),
      totalVisitedMs: Math.round(record.totalVisitedMs),
      firstSeenAt: record.firstSeenAt,
      lastSeenAt: record.lastSeenAt,
      lastInteraction: record.lastInteraction,
      lastInteractionAt: record.lastInteractionAt,
      lastVisitAt: record.lastVisitAt,
      lastStayAt: record.lastStayAt,
      session: activeSession ? {
        id: activeSession.id,
        enteredAt: iso(activeSession.enteredAt),
        durationMs: Math.max(0, Date.now() - activeSession.enteredAt),
        interaction: classifySession(activeSession),
        journeyIds: [...activeSession.journeyIds],
        cellCount: activeSession.cellIds.length,
      } : null,
    };
  }

  function currentSummary() {
    const out = {};
    LEVELS.forEach((level) => {
      const session = data.active[level];
      if (!session) return;
      const record = data.records[level][session.placeId];
      if (record) out[level] = recordSummary(level, record, session);
    });
    return Object.keys(out).length ? out : null;
  }

  function nextCheckAt() {
    const checks = [];
    LEVELS.forEach((level) => {
      const candidate = data.candidates[level];
      if (candidate) checks.push(candidate.startedAt + POLICY.changeStableMs[level]);
    });
    return checks.length ? Math.min(...checks) : null;
  }

  function update({ place, placeStatus, situation, transitionState, journeyState, memoryResult } = {}, at = Date.now()) {
    const events = [];
    const closedSessions = [];
    recoverExpired(at, events, closedSessions);

    const placeAvailable = placeStatus === 'available' && Boolean(place);
    LEVELS.forEach((level) => {
      reconcileLevel(
        level,
        descriptorFor(level, place),
        placeAvailable,
        situation,
        transitionState,
        journeyState,
        memoryResult,
        at,
        events,
        closedSessions,
      );
    });

    schedulePersist();
    return {
      events,
      closedSessions,
      current: currentSummary(),
      nextCheckAt: nextCheckAt(),
    };
  }

  function snapshot() {
    return clone(data);
  }

  function getCurrentSummary() {
    return currentSummary();
  }

  function getRecord(level, placeId) {
    const record = data.records?.[level]?.[placeId];
    return record ? clone(record) : null;
  }

  function reset() {
    data = clone(EMPTY);
    flush();
  }

  window.addEventListener('pagehide', flush);
  window.WanderEnginePlace = {
    policy: POLICY,
    update,
    snapshot,
    getCurrentSummary,
    getRecord,
    reset,
    flush,
  };
})();

(() => {
  const POLICY = Object.freeze({
    locationStableMs: 5000,
    movingStableMs: 10000,
    stoppedStableMs: 60000,
    modeChangeStableMs: 15000,
    significantMovementMs: 300000,
    possibleArrivalMs: 90000,
    confirmedArrivalMs: 180000,
    defaultArrivalDriftM: 75,
  });

  let stableAvailability = null;
  let availabilityCandidate = null;
  let stableMotion = null;
  let motionCandidate = null;
  let movementSession = null;
  let arrivalCandidate = null;
  let lastTransition = null;

  function finiteNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function motionObservation(situation) {
    const status = situation?.motion?.status;
    if (status !== 'moving' && status !== 'stationary') return null;
    return {
      status,
      mode: status === 'moving' ? situation.motion.mode || 'unknown' : 'stationary',
    };
  }

  function sameMotion(a, b) {
    return Boolean(a && b && a.status === b.status && a.mode === b.mode);
  }

  function distanceMeters(a, b) {
    if (!a || !b) return null;
    const lat1 = finiteNumber(a.lat);
    const lng1 = finiteNumber(a.lng);
    const lat2 = finiteNumber(b.lat);
    const lng2 = finiteNumber(b.lng);
    if (lat1 === null || lng1 === null || lat2 === null || lng2 === null) return null;

    const radius = 6371000;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
    return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function locationPoint(situation) {
    const lat = finiteNumber(situation?.lat);
    const lng = finiteNumber(situation?.lng);
    return lat === null || lng === null ? null : { lat, lng };
  }

  function arrivalDriftLimit(situation) {
    const accuracy = finiteNumber(situation?.accuracy);
    if (accuracy === null) return POLICY.defaultArrivalDriftM;
    return Math.max(50, Math.min(150, accuracy * 2));
  }

  function event(type, at, payload = {}) {
    return {
      type,
      at: new Date(at).toISOString(),
      ...payload,
    };
  }

  function motionThreshold(from, to) {
    if (!from) return 0;
    if (from.status === 'stationary' && to.status === 'moving') return POLICY.movingStableMs;
    if (from.status === 'moving' && to.status === 'stationary') return POLICY.stoppedStableMs;
    return POLICY.modeChangeStableMs;
  }

  function updateAvailability(situation, at, events) {
    const available = Boolean(situation?.locationAvailable);

    if (stableAvailability === null) {
      stableAvailability = { available, sinceAt: at };
      return;
    }

    if (stableAvailability.available === available) {
      availabilityCandidate = null;
      return;
    }

    if (!availabilityCandidate || availabilityCandidate.available !== available) {
      availabilityCandidate = { available, startedAt: at };
      return;
    }

    if (at - availabilityCandidate.startedAt < POLICY.locationStableMs) return;

    const from = stableAvailability.available;
    const sinceAt = availabilityCandidate.startedAt;
    stableAvailability = { available, sinceAt };
    availabilityCandidate = null;

    events.push(event(available ? 'location.available' : 'location.lost', at, {
      from,
      to: available,
      stableForMs: at - sinceAt,
      confidence: 0.9,
    }));

    if (!available) {
      stableMotion = null;
      motionCandidate = null;
      movementSession = null;
      arrivalCandidate = null;
    }
  }

  function beginMovementSession(at, observation) {
    movementSession = {
      startedAt: at,
      lastMovingAt: at,
      mode: observation.mode,
    };
    arrivalCandidate = null;
  }

  function commitMotionTransition(observation, situation, at, events) {
    const from = stableMotion;
    const startedAt = motionCandidate.startedAt;
    const startedSituation = motionCandidate.startedSituation;
    const stableForMs = at - startedAt;
    stableMotion = { ...observation, sinceAt: startedAt };
    motionCandidate = null;

    if (from.status === 'stationary' && observation.status === 'moving') {
      beginMovementSession(startedAt, observation);
      events.push(event('movement.started', at, {
        from: from.mode,
        to: observation.mode,
        stableForMs,
        confidence: 0.85,
      }));
      return;
    }

    if (from.status === 'moving' && observation.status === 'stationary') {
      const movementDurationMs = movementSession ? Math.max(0, startedAt - movementSession.startedAt) : 0;
      const significant = movementDurationMs >= POLICY.significantMovementMs;

      events.push(event('movement.stopped', at, {
        from: from.mode,
        to: 'stationary',
        stableForMs,
        movementDurationMs,
        significant,
        confidence: significant ? 0.92 : 0.86,
      }));

      if (significant) {
        arrivalCandidate = {
          stoppedAt: startedAt,
          priorMode: from.mode,
          movementDurationMs,
          anchor: locationPoint(startedSituation) || locationPoint(situation),
          driftLimitM: arrivalDriftLimit(startedSituation || situation),
          maxDriftM: 0,
          possibleEmitted: false,
          confirmedEmitted: false,
        };
      } else {
        arrivalCandidate = null;
      }

      movementSession = null;
      return;
    }

    if (from.status === 'moving' && observation.status === 'moving' && from.mode !== observation.mode) {
      if (movementSession) movementSession.mode = observation.mode;
      events.push(event('movement.mode_changed', at, {
        from: from.mode,
        to: observation.mode,
        stableForMs,
        confidence: 0.78,
      }));
    }
  }

  function updateMotion(situation, at, events) {
    const observation = motionObservation(situation);
    if (!observation || !situation?.locationAvailable) return;

    if (!stableMotion) {
      stableMotion = { ...observation, sinceAt: at };
      if (observation.status === 'moving') beginMovementSession(at, observation);
      return;
    }

    if (sameMotion(stableMotion, observation)) {
      motionCandidate = null;
      if (observation.status === 'moving') {
        if (!movementSession) beginMovementSession(stableMotion.sinceAt, observation);
        movementSession.lastMovingAt = at;
        movementSession.mode = observation.mode;
        arrivalCandidate = null;
      }
      return;
    }

    if (!motionCandidate || !sameMotion(motionCandidate.observation, observation)) {
      motionCandidate = {
        observation,
        startedAt: at,
        startedSituation: situation,
      };
      return;
    }

    const requiredStableMs = motionThreshold(stableMotion, observation);
    if (at - motionCandidate.startedAt < requiredStableMs) return;
    commitMotionTransition(observation, situation, at, events);
  }

  function updateArrival(situation, at, events) {
    if (!arrivalCandidate || stableMotion?.status !== 'stationary' || !situation?.locationAvailable) return;

    const point = locationPoint(situation);
    const driftM = distanceMeters(arrivalCandidate.anchor, point);
    if (driftM !== null) arrivalCandidate.maxDriftM = Math.max(arrivalCandidate.maxDriftM, driftM);

    if (driftM !== null && driftM > arrivalCandidate.driftLimitM) {
      arrivalCandidate = null;
      return;
    }

    const stationaryForMs = at - arrivalCandidate.stoppedAt;

    if (!arrivalCandidate.possibleEmitted && stationaryForMs >= POLICY.possibleArrivalMs) {
      arrivalCandidate.possibleEmitted = true;
      events.push(event('arrival.possible', at, {
        from: arrivalCandidate.priorMode,
        stationaryForMs,
        priorMovementDurationMs: arrivalCandidate.movementDurationMs,
        maxDriftM: Math.round(arrivalCandidate.maxDriftM),
        confidence: 0.82,
      }));
      return;
    }

    if (arrivalCandidate.possibleEmitted && !arrivalCandidate.confirmedEmitted && stationaryForMs >= POLICY.confirmedArrivalMs) {
      arrivalCandidate.confirmedEmitted = true;
      events.push(event('arrival.confirmed', at, {
        from: arrivalCandidate.priorMode,
        stationaryForMs,
        priorMovementDurationMs: arrivalCandidate.movementDurationMs,
        maxDriftM: Math.round(arrivalCandidate.maxDriftM),
        confidence: 0.95,
      }));
    }
  }

  function nextCheckAt() {
    const checks = [];
    if (availabilityCandidate) checks.push(availabilityCandidate.startedAt + POLICY.locationStableMs);
    if (motionCandidate) checks.push(motionCandidate.startedAt + motionThreshold(stableMotion, motionCandidate.observation));
    if (arrivalCandidate) {
      if (!arrivalCandidate.possibleEmitted) checks.push(arrivalCandidate.stoppedAt + POLICY.possibleArrivalMs);
      else if (!arrivalCandidate.confirmedEmitted) checks.push(arrivalCandidate.stoppedAt + POLICY.confirmedArrivalMs);
    }
    return checks.length ? Math.min(...checks) : null;
  }

  function snapshot() {
    return {
      stableAvailability: stableAvailability ? { ...stableAvailability } : null,
      stableMotion: stableMotion ? { ...stableMotion } : null,
      pending: {
        availability: availabilityCandidate ? { ...availabilityCandidate } : null,
        motion: motionCandidate ? {
          observation: { ...motionCandidate.observation },
          startedAt: motionCandidate.startedAt,
        } : null,
        arrival: arrivalCandidate ? {
          ...arrivalCandidate,
          anchor: arrivalCandidate.anchor ? { ...arrivalCandidate.anchor } : null,
        } : null,
      },
      lastTransition: lastTransition ? { ...lastTransition } : null,
      nextCheckAt: nextCheckAt(),
    };
  }

  function update(situation, at = Date.now()) {
    const events = [];
    updateAvailability(situation, at, events);
    updateMotion(situation, at, events);
    updateArrival(situation, at, events);

    if (events.length) lastTransition = events[events.length - 1];

    return {
      events,
      ...snapshot(),
    };
  }

  function reset() {
    stableAvailability = null;
    availabilityCandidate = null;
    stableMotion = null;
    motionCandidate = null;
    movementSession = null;
    arrivalCandidate = null;
    lastTransition = null;
  }

  window.WanderEngineTransition = {
    policy: POLICY,
    update,
    snapshot,
    reset,
  };
})();

(() => {
  if (window.WanderPedestrianMotion) return;

  const inference = window.WanderEngineInference;
  if (!inference?.inferSituation) return;

  const originalInferSituation = inference.inferSituation.bind(inference);
  const SAMPLE_WINDOW_MS = 45 * 1000;
  const MIN_INTERVAL_MS = 4000;
  const START_MOVING_MS = 4000;
  const START_STATIONARY_MS = 6000;
  const STOP_MOVING_MS = 25000;

  const state = {
    samples: [],
    status: 'pending',
    movingCandidateAt: null,
    stationaryCandidateAt: null,
    evidence: ['waiting_for_location_samples'],
  };

  function finite(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function sampleTime(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : Date.now();
  }

  function distanceMeters(a, b) {
    const radius = 6371000;
    const p1 = a.lat * Math.PI / 180;
    const p2 = b.lat * Math.PI / 180;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
    return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function metrics() {
    const latest = state.samples[state.samples.length - 1];
    if (!latest) return null;

    let anchor = state.samples[0];
    for (const candidate of state.samples) {
      if (latest.at - candidate.at >= MIN_INTERVAL_MS) {
        anchor = candidate;
        break;
      }
    }

    const elapsedMs = Math.max(0, latest.at - anchor.at);
    const netDistanceM = distanceMeters(anchor, latest);
    const accuracies = [anchor.accuracy, latest.accuracy].filter(Number.isFinite);
    const accuracyM = accuracies.length ? accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length : 8;
    const noiseAllowanceM = clamp(accuracyM * 0.45, 3, 15);
    const adjustedDistanceM = Math.max(0, netDistanceM - noiseAllowanceM);
    const derivedSpeedKmh = elapsedMs >= MIN_INTERVAL_MS ? adjustedDistanceM / (elapsedMs / 3600000) : 0;

    return {
      sampleAt: latest.at,
      sampleCount: state.samples.length,
      elapsedMs,
      netDistanceM,
      adjustedDistanceM,
      accuracyM,
      noiseAllowanceM,
      rawSpeedKmh: latest.rawSpeedKmh,
      derivedSpeedKmh,
    };
  }

  function addSample(effective) {
    const lat = finite(effective?.lat);
    const lng = finite(effective?.lng);
    if (lat === null || lng === null) return { isNew: false, metrics: null };

    const at = sampleTime(effective?.updatedAt);
    const key = `${lat.toFixed(7)}|${lng.toFixed(7)}|${at}`;
    const last = state.samples[state.samples.length - 1];
    if (last?.key === key) return { isNew: false, metrics: metrics() };

    const rawSpeedMps = finite(effective?.speedMps);
    state.samples.push({
      key,
      at,
      lat,
      lng,
      accuracy: finite(effective?.accuracy),
      rawSpeedKmh: rawSpeedMps === null ? null : Math.max(0, rawSpeedMps * 3.6),
    });

    const cutoff = at - SAMPLE_WINDOW_MS;
    while (state.samples.length > 2 && state.samples[0].at < cutoff) state.samples.shift();
    return { isNew: true, metrics: metrics() };
  }

  function resolveMotion(speedKmh, currentMetrics, isNew) {
    if (!currentMetrics) {
      return { status: 'pending', activity: 'pending', label: 'Preparando contexto', confidence: 0.4 };
    }

    const speed = finite(speedKmh);
    const derived = finite(currentMetrics.derivedSpeedKmh) || 0;
    const strongMovement = (speed !== null && speed >= 1.4) ||
      (currentMetrics.elapsedMs >= MIN_INTERVAL_MS && currentMetrics.adjustedDistanceM >= 5 && derived >= 0.8);
    const movementEvidence = strongMovement || (speed !== null && speed >= 0.7) ||
      (currentMetrics.elapsedMs >= MIN_INTERVAL_MS && currentMetrics.adjustedDistanceM >= 3.5 && derived >= 0.55);
    const stationaryEvidence = (speed === null || speed <= 0.45) && derived <= 0.35 &&
      currentMetrics.netDistanceM <= currentMetrics.noiseAllowanceM + 4;

    if (isNew) {
      if (movementEvidence) {
        state.stationaryCandidateAt = null;
        if (state.status === 'moving') {
          state.movingCandidateAt = null;
        } else if (strongMovement) {
          state.status = 'moving';
          state.movingCandidateAt = null;
        } else {
          if (!state.movingCandidateAt) state.movingCandidateAt = currentMetrics.sampleAt;
          if (currentMetrics.sampleAt - state.movingCandidateAt >= START_MOVING_MS) {
            state.status = 'moving';
            state.movingCandidateAt = null;
          }
        }
        state.evidence = strongMovement
          ? ['walking_speed_or_displacement', 'movement_confirmed']
          : ['consistent_displacement', 'movement_candidate'];
      } else if (stationaryEvidence) {
        state.movingCandidateAt = null;
        if (!state.stationaryCandidateAt) state.stationaryCandidateAt = currentMetrics.sampleAt;
        const requiredMs = state.status === 'moving' ? STOP_MOVING_MS : START_STATIONARY_MS;
        if (currentMetrics.sampleAt - state.stationaryCandidateAt >= requiredMs) {
          state.status = 'stationary';
          state.stationaryCandidateAt = null;
        }
        state.evidence = ['low_speed', 'position_within_accuracy_noise'];
      } else {
        state.evidence = ['ambiguous_gps_sample', 'previous_motion_state_preserved'];
      }
    }

    if (state.status === 'moving') {
      return {
        status: 'moving', activity: 'moving', label: 'En movimiento',
        confidence: strongMovement ? 0.94 : 0.84,
        source: 'pedestrian-speed-and-displacement', evidence: [...state.evidence],
      };
    }
    if (state.status === 'stationary') {
      return {
        status: 'stationary', activity: 'paused', label: 'En pausa', confidence: 0.9,
        source: 'pedestrian-speed-and-displacement', evidence: [...state.evidence],
      };
    }
    return {
      status: 'pending', activity: 'pending', label: 'Preparando contexto', confidence: 0.5,
      source: 'pedestrian-speed-and-displacement', evidence: [...state.evidence],
    };
  }

  inference.inferSituation = (context) => {
    const original = originalInferSituation(context);
    if (!original?.locationAvailable) return original;

    const effective = context.getEffectiveLocation?.();
    const sample = addSample(effective);
    const providerSpeedKmh = finite(context.value?.('mobility.provider.speedKmh', null));
    const rawSpeedMps = finite(effective?.speedMps);
    const rawSpeedKmh = rawSpeedMps === null ? null : Math.max(0, rawSpeedMps * 3.6);
    const derivedSpeedKmh = sample.metrics?.elapsedMs >= MIN_INTERVAL_MS ? finite(sample.metrics.derivedSpeedKmh) : null;
    const speedCandidates = [providerSpeedKmh, rawSpeedKmh, derivedSpeedKmh].filter((value) => value !== null && value >= 0);
    let speedKmh = speedCandidates.length ? Math.max(...speedCandidates) : original.speedKmh;
    const motion = resolveMotion(speedKmh, sample.metrics, sample.isNew);

    const providerMode = String(context.value?.('mobility.provider.mode', '') || '').toLowerCase();
    const providerConfidence = finite(context.value?.('mobility.provider.confidence', null));
    const providerSaysStationary = providerMode === 'stationary' && providerConfidence !== null && providerConfidence >= 0.6;
    if (providerSaysStationary && motion.status !== 'moving') speedKmh = 0;

    let mobility = original.mobility;
    if (motion.status === 'moving' && String(mobility?.mode || '').toLowerCase() === 'stationary') {
      mobility = { mode: 'unknown', confidence: 0.35, source: 'engine', evidence: ['displacement_overrode_stationary_provider'] };
    }

    return {
      ...original,
      speedKmh,
      motion,
      mobility,
      motionEvidence: {
        rawSpeedKmh,
        providerSpeedKmh,
        derivedSpeedKmh,
        sampleCount: sample.metrics?.sampleCount || 0,
        displacementM: sample.metrics ? Math.round(sample.metrics.netDistanceM * 10) / 10 : null,
        adjustedDisplacementM: sample.metrics ? Math.round(sample.metrics.adjustedDistanceM * 10) / 10 : null,
        accuracyM: sample.metrics ? Math.round(sample.metrics.accuracyM * 10) / 10 : null,
      },
    };
  };

  window.WanderPedestrianMotion = Object.freeze({
    policy: {
      sampleWindowMs: SAMPLE_WINDOW_MS,
      movingConfirmMs: START_MOVING_MS,
      stoppedConfirmMs: STOP_MOVING_MS,
      profile: 'pedestrian-first',
    },
    getState: () => ({ status: state.status, evidence: [...state.evidence], sampleCount: state.samples.length }),
  });

  window.WanderEngine?.run?.('pedestrian-motion-installed');
  window.dispatchEvent(new CustomEvent('wander:pedestrian-motion-ready'));
})();
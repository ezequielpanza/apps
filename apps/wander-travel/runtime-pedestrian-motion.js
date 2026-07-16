(() => {
  if (window.WanderPedestrianMotion) return;

  const inference = window.WanderEngineInference;
  if (!inference?.inferSituation) return;

  const originalInferSituation = inference.inferSituation.bind(inference);
  const SAMPLE_WINDOW_MS = 45 * 1000;
  const RAW_SPEED_WINDOW_MS = 15 * 1000;
  const MIN_INTERVAL_MS = 4000;
  const STARTUP_WAIT_MS = 10000;
  const MIN_STARTUP_SAMPLES = 3;
  const RESUME_RESET_MS = 2 * 60 * 1000;
  const START_MOVING_MS = 4000;
  const START_STATIONARY_MS = 6000;
  const STOP_MOVING_MS = 25000;
  const HIGH_SPEED_KMH = 25;

  const state = {
    samples: [],
    status: 'pending',
    movingCandidateAt: null,
    stationaryCandidateAt: null,
    calibrationStartedAt: null,
    lastSampleAt: null,
    evidence: ['waiting_for_location_samples'],
  };
  let calibrationTimer = null;

  function finite(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
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

  function scheduleCalibrationCheck() {
    if (calibrationTimer) clearTimeout(calibrationTimer);
    calibrationTimer = setTimeout(() => {
      calibrationTimer = null;
      window.WanderEngine?.run?.('pedestrian-motion-calibration-timeout');
    }, STARTUP_WAIT_MS + 100);
  }

  function reset(at = Date.now(), reason = 'startup_calibration') {
    state.samples = [];
    state.status = 'pending';
    state.movingCandidateAt = null;
    state.stationaryCandidateAt = null;
    state.calibrationStartedAt = at;
    state.lastSampleAt = null;
    state.evidence = [reason];
    scheduleCalibrationCheck();
  }

  function segmentMetrics(samples) {
    const speeds = [];
    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1];
      const current = samples[index];
      const elapsedMs = current.at - previous.at;
      if (elapsedMs < 1800 || elapsedMs > 20000) continue;
      const accuracy = Math.max(previous.accuracy || 8, current.accuracy || 8);
      const adjusted = Math.max(0, distanceMeters(previous, current) - clamp(accuracy * .65, 3, 30));
      speeds.push(adjusted / (elapsedMs / 3600000));
    }
    const fastCount = speeds.filter((speed) => speed >= 12).length;
    return {
      count: speeds.length,
      medianSpeedKmh: median(speeds),
      fastCount,
      fastRatio: speeds.length ? fastCount / speeds.length : 0,
    };
  }

  function metrics() {
    const latest = state.samples[state.samples.length - 1];
    if (!latest) return null;
    let anchor = state.samples[0];
    for (const candidate of state.samples) {
      if (latest.at - candidate.at >= MIN_INTERVAL_MS) { anchor = candidate; break; }
    }
    const elapsedMs = Math.max(0, latest.at - anchor.at);
    const netDistanceM = distanceMeters(anchor, latest);
    const accuracyValues = [anchor.accuracy, latest.accuracy].filter(Number.isFinite);
    const accuracyM = accuracyValues.length ? accuracyValues.reduce((sum, value) => sum + value, 0) / accuracyValues.length : 8;
    const noiseAllowanceM = clamp(accuracyM * .45, 3, 15);
    const adjustedDistanceM = Math.max(0, netDistanceM - noiseAllowanceM);
    const derivedSpeedKmh = elapsedMs >= MIN_INTERVAL_MS ? adjustedDistanceM / (elapsedMs / 3600000) : 0;
    const rawSpeeds = state.samples
      .filter((sample) => latest.at - sample.at <= RAW_SPEED_WINDOW_MS)
      .map((sample) => sample.rawSpeedKmh)
      .filter((speed) => Number.isFinite(speed) && speed >= 0 && speed <= 220);
    const segments = segmentMetrics(state.samples);
    const calibrationElapsedMs = Math.max(0, Date.now() - Number(state.calibrationStartedAt || Date.now()));
    return {
      sampleAt: latest.at,
      sampleCount: state.samples.length,
      elapsedMs,
      netDistanceM,
      adjustedDistanceM,
      accuracyM,
      noiseAllowanceM,
      rawSpeedMedianKmh: median(rawSpeeds),
      rawSpeedSampleCount: rawSpeeds.length,
      derivedSpeedKmh,
      segmentCount: segments.count,
      segmentMedianSpeedKmh: segments.medianSpeedKmh,
      fastSegmentCount: segments.fastCount,
      fastSegmentRatio: segments.fastRatio,
      calibrationElapsedMs,
      calibrationReady: state.samples.length >= MIN_STARTUP_SAMPLES || calibrationElapsedMs >= STARTUP_WAIT_MS,
    };
  }

  function addSample(effective) {
    const lat = finite(effective?.lat);
    const lng = finite(effective?.lng);
    if (lat === null || lng === null) return { isNew: false, metrics: null };
    let at = sampleTime(effective?.updatedAt);
    if (state.lastSampleAt && at - state.lastSampleAt > RESUME_RESET_MS) reset(at, 'resumed_after_background');
    if (!state.calibrationStartedAt) {
      state.calibrationStartedAt = Date.now();
      scheduleCalibrationCheck();
    }
    const last = state.samples[state.samples.length - 1];
    if (last && at < last.at) at = Date.now();
    const key = `${lat.toFixed(7)}|${lng.toFixed(7)}|${at}`;
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
    state.lastSampleAt = at;
    const cutoff = at - SAMPLE_WINDOW_MS;
    while (state.samples.length > 2 && state.samples[0].at < cutoff) state.samples.shift();
    return { isNew: true, metrics: metrics() };
  }

  function filterSpeed(currentMetrics, providerSpeedKmh, providerMode, providerConfidence) {
    if (!currentMetrics?.calibrationReady) {
      return { speedKmh: 0, positionStationary: false, fastPositionConfirmed: false, evidence: ['startup_calibration'] };
    }
    const derived = finite(currentMetrics.derivedSpeedKmh) || 0;
    const rawMedian = finite(currentMetrics.rawSpeedMedianKmh);
    const providerSpeed = finite(providerSpeedKmh);
    const providerMoving = providerMode && !['stationary', 'unknown', ''].includes(providerMode);
    const providerTrusted = providerMoving && providerConfidence !== null && providerConfidence >= .7;
    const ready = currentMetrics.elapsedMs >= MIN_INTERVAL_MS;
    const timedOut = currentMetrics.calibrationElapsedMs >= STARTUP_WAIT_MS;
    const reportedLow = (rawMedian === null || rawMedian <= .45) &&
      (providerSpeed === null || providerSpeed <= .45 || providerMode === 'stationary');
    const positionStationary = (ready && derived <= .35 && currentMetrics.netDistanceM <= currentMetrics.noiseAllowanceM + 4) ||
      (timedOut && currentMetrics.sampleCount >= 1 && reportedLow);
    const positionMoving = ready && currentMetrics.adjustedDistanceM >= 3.5 && derived >= .55;
    const fastPositionConfirmed = currentMetrics.segmentCount >= 2 && currentMetrics.fastSegmentCount >= 2 && currentMetrics.fastSegmentRatio >= .66 && finite(currentMetrics.segmentMedianSpeedKmh) >= 12;

    if (positionStationary) {
      const rejected = [rawMedian, providerSpeed].some((speed) => speed !== null && speed >= 1.4);
      return {
        speedKmh: 0,
        positionStationary: true,
        fastPositionConfirmed,
        evidence: rejected ? ['position_stationary', 'uncorroborated_speed_rejected'] : ['position_stationary'],
      };
    }

    const candidates = [];
    if (positionMoving && (derived <= HIGH_SPEED_KMH || fastPositionConfirmed)) candidates.push(derived);
    if (rawMedian !== null && currentMetrics.rawSpeedSampleCount >= 2 && positionMoving && (rawMedian <= 15 || fastPositionConfirmed)) candidates.push(rawMedian);
    if (providerTrusted && providerSpeed !== null && positionMoving && (providerSpeed <= 15 || fastPositionConfirmed)) candidates.push(providerSpeed);
    if (!candidates.length) return { speedKmh: 0, positionStationary: false, fastPositionConfirmed, evidence: ['speed_unconfirmed', 'position_corroboration_required'] };
    return {
      speedKmh: Math.max(0, median(candidates)),
      positionStationary: false,
      fastPositionConfirmed,
      evidence: fastPositionConfirmed ? ['consistent_multi_segment_movement', 'speed_confirmed'] : ['displacement_confirmed', 'speed_filtered'],
    };
  }

  function resolveMotion(speedKmh, currentMetrics, isNew, filtered) {
    if (!currentMetrics?.calibrationReady) {
      state.status = 'pending';
      state.evidence = ['startup_calibration', `${currentMetrics?.sampleCount || 0}_valid_samples`];
      return { status: 'pending', activity: 'pending', label: 'Preparando contexto', confidence: .5, source: 'pedestrian-speed-and-displacement', evidence: [...state.evidence] };
    }
    const speed = finite(speedKmh);
    const derived = finite(currentMetrics.derivedSpeedKmh) || 0;
    const strongMovement = (speed !== null && speed >= 1.4) ||
      (currentMetrics.elapsedMs >= MIN_INTERVAL_MS && currentMetrics.adjustedDistanceM >= 5 && derived >= .8 && derived <= HIGH_SPEED_KMH) ||
      Boolean(filtered.fastPositionConfirmed);
    const movementEvidence = strongMovement || (speed !== null && speed >= .7) ||
      (currentMetrics.elapsedMs >= MIN_INTERVAL_MS && currentMetrics.adjustedDistanceM >= 3.5 && derived >= .55 && derived <= HIGH_SPEED_KMH);
    const stationaryEvidence = Boolean(filtered.positionStationary) ||
      ((speed === null || speed <= .45) && derived <= .35 && currentMetrics.netDistanceM <= currentMetrics.noiseAllowanceM + 4);
    const timedStationary = state.status === 'pending' && stationaryEvidence && currentMetrics.calibrationElapsedMs >= STARTUP_WAIT_MS;

    if (timedStationary) {
      state.status = 'stationary';
      state.movingCandidateAt = null;
      state.stationaryCandidateAt = null;
      state.evidence = [...filtered.evidence, 'startup_wait_completed', 'stationary_confirmed'];
    } else if (isNew) {
      if (movementEvidence) {
        state.stationaryCandidateAt = null;
        if (state.status === 'moving' || strongMovement) {
          state.status = 'moving';
          state.movingCandidateAt = null;
        } else {
          if (!state.movingCandidateAt) state.movingCandidateAt = currentMetrics.sampleAt;
          if (currentMetrics.sampleAt - state.movingCandidateAt >= START_MOVING_MS) {
            state.status = 'moving';
            state.movingCandidateAt = null;
          }
        }
        state.evidence = [...filtered.evidence, 'movement_confirmed'];
      } else if (stationaryEvidence) {
        state.movingCandidateAt = null;
        if (!state.stationaryCandidateAt) state.stationaryCandidateAt = currentMetrics.sampleAt;
        const rejectedOutlier = filtered.evidence.includes('uncorroborated_speed_rejected');
        const requiredMs = state.status === 'moving' && !rejectedOutlier ? STOP_MOVING_MS : START_STATIONARY_MS;
        if (currentMetrics.sampleAt - state.stationaryCandidateAt >= requiredMs) {
          state.status = 'stationary';
          state.stationaryCandidateAt = null;
        }
        state.evidence = [...filtered.evidence, 'low_speed', 'position_within_accuracy_noise'];
      } else {
        state.evidence = [...filtered.evidence, 'ambiguous_gps_sample', 'previous_motion_state_preserved'];
      }
    }

    if (state.status === 'moving') return { status: 'moving', activity: 'moving', label: 'En movimiento', confidence: strongMovement ? .94 : .84, source: 'pedestrian-speed-and-displacement', evidence: [...state.evidence] };
    if (state.status === 'stationary') return { status: 'stationary', activity: 'paused', label: 'En pausa', confidence: .92, source: 'pedestrian-speed-and-displacement', evidence: [...state.evidence] };
    return { status: 'pending', activity: 'pending', label: 'Preparando contexto', confidence: .55, source: 'pedestrian-speed-and-displacement', evidence: [...state.evidence] };
  }

  inference.inferSituation = (context) => {
    const original = originalInferSituation(context);
    if (!original?.locationAvailable) return original;
    const effective = context.getEffectiveLocation?.();
    const sample = addSample(effective);
    const providerSpeedKmh = finite(context.value?.('mobility.provider.speedKmh', null));
    const providerMode = String(context.value?.('mobility.provider.mode', '') || '').toLowerCase();
    const providerConfidence = finite(context.value?.('mobility.provider.confidence', null));
    const rawSpeedMps = finite(effective?.speedMps);
    const rawSpeedKmh = rawSpeedMps === null ? null : Math.max(0, rawSpeedMps * 3.6);
    const filtered = filterSpeed(sample.metrics, providerSpeedKmh, providerMode, providerConfidence);
    let speedKmh = filtered.speedKmh;
    const motion = resolveMotion(speedKmh, sample.metrics, sample.isNew, filtered);
    if (motion.status !== 'moving') speedKmh = 0;
    let mobility = original.mobility;
    if (motion.status === 'pending') mobility = { mode: 'unknown', confidence: .2, source: 'startup-calibration', evidence: ['waiting_for_stable_samples'] };
    else if (motion.status === 'stationary') mobility = { mode: 'stationary', confidence: .96, source: 'filtered-motion', evidence: ['position_stationary'] };
    else if (String(mobility?.mode || '').toLowerCase() === 'stationary') mobility = { mode: 'unknown', confidence: .35, source: 'engine', evidence: ['displacement_overrode_stationary_provider'] };

    return {
      ...original,
      speedKmh,
      motion,
      mobility,
      motionEvidence: {
        rawSpeedKmh,
        rawSpeedMedianKmh: sample.metrics?.rawSpeedMedianKmh ?? null,
        rawSpeedSampleCount: sample.metrics?.rawSpeedSampleCount || 0,
        providerSpeedKmh,
        derivedSpeedKmh: sample.metrics?.derivedSpeedKmh ?? null,
        segmentMedianSpeedKmh: sample.metrics?.segmentMedianSpeedKmh ?? null,
        segmentCount: sample.metrics?.segmentCount || 0,
        fastSegmentCount: sample.metrics?.fastSegmentCount || 0,
        sampleCount: sample.metrics?.sampleCount || 0,
        calibrationElapsedMs: sample.metrics?.calibrationElapsedMs || 0,
        calibrationReady: Boolean(sample.metrics?.calibrationReady),
        displacementM: sample.metrics ? Math.round(sample.metrics.netDistanceM * 10) / 10 : null,
        adjustedDisplacementM: sample.metrics ? Math.round(sample.metrics.adjustedDistanceM * 10) / 10 : null,
        accuracyM: sample.metrics ? Math.round(sample.metrics.accuracyM * 10) / 10 : null,
        filterEvidence: [...(filtered.evidence || [])],
      },
    };
  };

  window.WanderPedestrianMotion = Object.freeze({
    policy: {
      sampleWindowMs: SAMPLE_WINDOW_MS,
      startupWaitMs: STARTUP_WAIT_MS,
      minimumStartupSamples: MIN_STARTUP_SAMPLES,
      resumeResetMs: RESUME_RESET_MS,
      movingConfirmMs: START_MOVING_MS,
      stoppedConfirmMs: STOP_MOVING_MS,
      profile: 'pedestrian-first-calibrated',
    },
    reset: () => reset(Date.now(), 'manual_reset'),
    getState: () => ({ status: state.status, evidence: [...state.evidence], sampleCount: state.samples.length, calibrationStartedAt: state.calibrationStartedAt }),
  });

  reset(Date.now());
  window.WanderEngine?.run?.('pedestrian-motion-installed');
  window.dispatchEvent(new CustomEvent('wander:pedestrian-motion-ready'));
})();

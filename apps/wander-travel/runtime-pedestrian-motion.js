(() => {
  if (window.WanderPedestrianMotion) return;

  const inference = window.WanderEngineInference;
  if (!inference?.inferSituation) return;

  const originalInferSituation = inference.inferSituation.bind(inference);
  const SAMPLE_WINDOW_MS = 45 * 1000;
  const RAW_SPEED_WINDOW_MS = 15 * 1000;
  const MIN_INTERVAL_MS = 4000;
  const MIN_SEGMENT_MS = 1800;
  const MAX_SEGMENT_MS = 20000;
  const START_MOVING_MS = 4000;
  const START_STATIONARY_MS = 6000;
  const STOP_MOVING_MS = 25000;
  const HIGH_SPEED_KMH = 25;
  const MAX_PLAUSIBLE_SPEED_KMH = 220;

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

  function segmentMetrics(samples) {
    const speeds = [];
    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1];
      const current = samples[index];
      const elapsedMs = current.at - previous.at;
      if (elapsedMs < MIN_SEGMENT_MS || elapsedMs > MAX_SEGMENT_MS) continue;

      const distanceM = distanceMeters(previous, current);
      const accuracyM = Math.max(
        Number.isFinite(previous.accuracy) ? previous.accuracy : 8,
        Number.isFinite(current.accuracy) ? current.accuracy : 8
      );
      const noiseM = clamp(accuracyM * 0.65, 3, 30);
      const adjustedDistanceM = Math.max(0, distanceM - noiseM);
      speeds.push(adjustedDistanceM / (elapsedMs / 3600000));
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

    const rawSpeeds = state.samples
      .filter((sample) => latest.at - sample.at <= RAW_SPEED_WINDOW_MS)
      .map((sample) => sample.rawSpeedKmh)
      .filter((speed) => Number.isFinite(speed) && speed >= 0 && speed <= MAX_PLAUSIBLE_SPEED_KMH);
    const segments = segmentMetrics(state.samples);

    return {
      sampleAt: latest.at,
      sampleCount: state.samples.length,
      elapsedMs,
      netDistanceM,
      adjustedDistanceM,
      accuracyM,
      noiseAllowanceM,
      rawSpeedKmh: latest.rawSpeedKmh,
      rawSpeedMedianKmh: median(rawSpeeds),
      rawSpeedSampleCount: rawSpeeds.length,
      derivedSpeedKmh,
      segmentCount: segments.count,
      segmentMedianSpeedKmh: segments.medianSpeedKmh,
      fastSegmentCount: segments.fastCount,
      fastSegmentRatio: segments.fastRatio,
    };
  }

  function addSample(effective) {
    const lat = finite(effective?.lat);
    const lng = finite(effective?.lng);
    if (lat === null || lng === null) return { isNew: false, metrics: null };

    let at = sampleTime(effective?.updatedAt);
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

    const cutoff = at - SAMPLE_WINDOW_MS;
    while (state.samples.length > 2 && state.samples[0].at < cutoff) state.samples.shift();
    return { isNew: true, metrics: metrics() };
  }

  function filterSpeed(currentMetrics, providerSpeedKmh, providerMode, providerConfidence, originalSpeedKmh) {
    if (!currentMetrics) {
      return { speedKmh: finite(originalSpeedKmh), evidence: ['waiting_for_position_history'] };
    }

    const ready = currentMetrics.elapsedMs >= MIN_INTERVAL_MS;
    const derived = finite(currentMetrics.derivedSpeedKmh) || 0;
    const rawMedian = finite(currentMetrics.rawSpeedMedianKmh);
    const providerSpeed = finite(providerSpeedKmh);
    const providerMoving = providerMode && !['stationary', 'unknown', ''].includes(providerMode);
    const providerTrusted = providerMoving && providerConfidence !== null && providerConfidence >= 0.7;

    const positionStationary = ready && derived <= 0.35 &&
      currentMetrics.netDistanceM <= currentMetrics.noiseAllowanceM + 4;
    const positionMoving = ready && currentMetrics.adjustedDistanceM >= 3.5 && derived >= 0.55;
    const fastPositionConfirmed = currentMetrics.segmentCount >= 2 &&
      currentMetrics.fastSegmentCount >= 2 && currentMetrics.fastSegmentRatio >= 0.66 &&
      finite(currentMetrics.segmentMedianSpeedKmh) >= 12;

    if (positionStationary) {
      const rejected = [rawMedian, providerSpeed].some((speed) => speed !== null && speed >= 1.4);
      return {
        speedKmh: 0,
        evidence: rejected
          ? ['position_stationary', 'uncorroborated_speed_rejected']
          : ['position_stationary'],
        positionStationary: true,
        fastPositionConfirmed,
      };
    }

    const candidates = [];
    if (positionMoving && (derived <= HIGH_SPEED_KMH || fastPositionConfirmed)) candidates.push(derived);

    const rawLowTrusted = rawMedian !== null && currentMetrics.rawSpeedSampleCount >= 2 && rawMedian <= 15 && positionMoving;
    const rawHighTrusted = rawMedian !== null && currentMetrics.rawSpeedSampleCount >= 3 && rawMedian > 15 && fastPositionConfirmed;
    if (rawLowTrusted || rawHighTrusted) candidates.push(rawMedian);

    const providerLowTrusted = providerTrusted && providerSpeed !== null && providerSpeed <= 15 && positionMoving;
    const providerHighTrusted = providerTrusted && providerSpeed !== null && providerSpeed > 15 && fastPositionConfirmed;
    if (providerLowTrusted || providerHighTrusted) candidates.push(providerSpeed);

    if (!candidates.length) {
      return {
        speedKmh: 0,
        evidence: ['speed_unconfirmed', 'position_corroboration_required'],
        positionStationary: false,
        fastPositionConfirmed,
      };
    }

    return {
      speedKmh: Math.max(0, median(candidates)),
      evidence: fastPositionConfirmed
        ? ['consistent_multi_segment_movement', 'speed_confirmed']
        : ['displacement_confirmed', 'speed_filtered'],
      positionStationary: false,
      fastPositionConfirmed,
    };
  }

  function resolveMotion(speedKmh, currentMetrics, isNew, filterResult) {
    if (!currentMetrics) {
      return { status: 'pending', activity: 'pending', label: 'Preparando contexto', confidence: 0.4 };
    }

    const speed = finite(speedKmh);
    const derived = finite(currentMetrics.derivedSpeedKmh) || 0;
    const strongMovement = (speed !== null && speed >= 1.4) ||
      (currentMetrics.elapsedMs >= MIN_INTERVAL_MS && currentMetrics.adjustedDistanceM >= 5 && derived >= 0.8 && derived <= HIGH_SPEED_KMH) ||
      Boolean(filterResult?.fastPositionConfirmed);
    const movementEvidence = strongMovement || (speed !== null && speed >= 0.7) ||
      (currentMetrics.elapsedMs >= MIN_INTERVAL_MS && currentMetrics.adjustedDistanceM >= 3.5 && derived >= 0.55 && derived <= HIGH_SPEED_KMH);
    const stationaryEvidence = Boolean(filterResult?.positionStationary) ||
      ((speed === null || speed <= 0.45) && derived <= 0.35 && currentMetrics.netDistanceM <= currentMetrics.noiseAllowanceM + 4);

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
        state.evidence = [...(filterResult?.evidence || []), 'movement_confirmed'];
      } else if (stationaryEvidence) {
        state.movingCandidateAt = null;
        if (!state.stationaryCandidateAt) state.stationaryCandidateAt = currentMetrics.sampleAt;
        const rejectedOutlier = filterResult?.evidence?.includes('uncorroborated_speed_rejected');
        const requiredMs = state.status === 'moving' && !rejectedOutlier ? STOP_MOVING_MS : START_STATIONARY_MS;
        if (currentMetrics.sampleAt - state.stationaryCandidateAt >= requiredMs) {
          state.status = 'stationary';
          state.stationaryCandidateAt = null;
        }
        state.evidence = [...(filterResult?.evidence || []), 'low_speed', 'position_within_accuracy_noise'];
      } else {
        state.evidence = [...(filterResult?.evidence || []), 'ambiguous_gps_sample', 'previous_motion_state_preserved'];
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
        status: 'stationary', activity: 'paused', label: 'En pausa', confidence: 0.92,
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
    const providerMode = String(context.value?.('mobility.provider.mode', '') || '').toLowerCase();
    const providerConfidence = finite(context.value?.('mobility.provider.confidence', null));
    const rawSpeedMps = finite(effective?.speedMps);
    const rawSpeedKmh = rawSpeedMps === null ? null : Math.max(0, rawSpeedMps * 3.6);
    const derivedSpeedKmh = sample.metrics?.elapsedMs >= MIN_INTERVAL_MS ? finite(sample.metrics.derivedSpeedKmh) : null;

    const filtered = filterSpeed(sample.metrics, providerSpeedKmh, providerMode, providerConfidence, original.speedKmh);
    let speedKmh = filtered.speedKmh;
    const motion = resolveMotion(speedKmh, sample.metrics, sample.isNew, filtered);

    const providerSaysStationary = providerMode === 'stationary' && providerConfidence !== null && providerConfidence >= 0.6;
    if ((providerSaysStationary && motion.status !== 'moving') || motion.status === 'stationary') speedKmh = 0;

    let mobility = original.mobility;
    if (motion.status === 'stationary') {
      mobility = { mode: 'stationary', confidence: 0.96, source: 'filtered-motion', evidence: ['position_stationary'] };
    } else if (motion.status === 'moving' && String(mobility?.mode || '').toLowerCase() === 'stationary') {
      mobility = { mode: 'unknown', confidence: 0.35, source: 'engine', evidence: ['displacement_overrode_stationary_provider'] };
    }

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
        derivedSpeedKmh,
        segmentMedianSpeedKmh: sample.metrics?.segmentMedianSpeedKmh ?? null,
        segmentCount: sample.metrics?.segmentCount || 0,
        fastSegmentCount: sample.metrics?.fastSegmentCount || 0,
        sampleCount: sample.metrics?.sampleCount || 0,
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
      rawSpeedWindowMs: RAW_SPEED_WINDOW_MS,
      movingConfirmMs: START_MOVING_MS,
      stoppedConfirmMs: STOP_MOVING_MS,
      highSpeedKmh: HIGH_SPEED_KMH,
      profile: 'pedestrian-first-with-speed-sanity',
    },
    getState: () => ({ status: state.status, evidence: [...state.evidence], sampleCount: state.samples.length }),
  });

  window.WanderEngine?.run?.('pedestrian-motion-installed');
  window.dispatchEvent(new CustomEvent('wander:pedestrian-motion-ready'));
})();
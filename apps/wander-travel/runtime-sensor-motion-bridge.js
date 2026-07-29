(() => {
  const context = window.WanderContext;
  const inference = window.WanderEngineInference;
  if (!context || !inference?.inferSituation || window.WanderSensorMotionBridge) return;

  const originalInferSituation = inference.inferSituation.bind(inference);
  const SENSOR_START_CONFIRM_MS = 6000;
  const SENSOR_HOLD_MS = 5000;
  const SENSOR_FRESH_MS = 4000;
  const MIN_SAMPLE_COUNT = 8;
  const MIN_WINDOW_MS = 3500;
  const STARTUP_GUARD_MS = 20000;
  const MOVING_CONFIRM_MS = 6000;
  const STRONG_MOVING_CONFIRM_MS = 2500;
  const STOP_CONFIRM_MS = 20000;
  const STOP_MIN_RADIUS_M = 8;
  const STOP_MAX_RADIUS_M = 25;
  const STOP_MAX_ACCURACY_M = 40;
  const WALK_STOP_SPEED_KMH = 1.5;
  const VEHICLE_STOP_SPEED_KMH = 3;

  const state = {
    startedAt: Date.now(),
    candidateAt: null,
    confirmedAt: null,
    lastActiveAt: null,
    active: false,
    stableStatus: 'pending',
    movingCandidateAt: null,
    stationaryCandidateAt: null,
    evidence: ['waiting_for_sustained_sensor_motion'],
  };

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function sensorSignal() {
    const summary = context.value('motion.sensor.summary', null);
    const status = String(context.value('motion.sensor.status', '') || '').toLowerCase();
    const updatedAt = Date.parse(summary?.updatedAt || '');
    const fresh = status === 'available' && Number.isFinite(updatedAt) && Date.now() - updatedAt <= SENSOR_FRESH_MS;
    if (!fresh) return { active: false, strong: false, confidence: 0, evidence: ['sensor_unavailable_or_stale'], summary };

    const sampleCount = finite(summary?.sampleCount) || 0;
    const windowMs = finite(summary?.windowMs) || 0;
    const rms = finite(summary?.rms) || 0;
    const variance = finite(summary?.variance) || 0;
    const peak = finite(summary?.peak) || 0;
    const activeRatio = finite(summary?.activeRatio) || 0;
    const lastActivity = finite(summary?.last?.activity) || 0;
    const enoughHistory = sampleCount >= MIN_SAMPLE_COUNT && windowMs >= MIN_WINDOW_MS;
    const active = enoughHistory && activeRatio >= .5 && rms >= .24 && variance >= .012 && peak >= .62 &&
      (lastActivity >= .14 || activeRatio >= .7);
    const strong = active && activeRatio >= .68 && rms >= .4 && variance >= .03 && peak >= 1;
    const confidence = active ? Math.min(.92, .6 + activeRatio * .25 + Math.min(.08, rms / 10)) : 0;

    return {
      active,
      strong,
      confidence,
      summary,
      evidence: active
        ? ['sustained_accelerometer_activity', `${Math.round(activeRatio * 100)}pct_active_samples`]
        : ['accelerometer_below_movement_threshold'],
    };
  }

  function updateSensorState(signal, now = Date.now()) {
    if (signal.active) {
      state.lastActiveAt = now;
      if (!state.candidateAt) state.candidateAt = now;
      if (signal.strong || now - state.candidateAt >= SENSOR_START_CONFIRM_MS) {
        state.active = true;
        state.confirmedAt = state.confirmedAt || now;
        state.evidence = [...signal.evidence, signal.strong ? 'strong_sensor_activity_confirmed' : 'sustained_sensor_activity_confirmed'];
      } else {
        state.evidence = [...signal.evidence, 'sensor_activity_candidate'];
      }
      return;
    }

    state.candidateAt = null;
    if (state.active && state.lastActiveAt && now - state.lastActiveAt <= SENSOR_HOLD_MS) {
      state.evidence = ['sensor_activity_hold'];
      return;
    }
    state.active = false;
    state.confirmedAt = null;
    state.evidence = [...signal.evidence];
  }

  function movementEvidence(result) {
    const evidence = result?.motionEvidence || {};
    const adjusted = finite(evidence.adjustedDisplacementM) || 0;
    const displacement = finite(evidence.displacementM) || 0;
    const accuracy = Math.max(5, finite(evidence.accuracyM) || 10);
    const derived = finite(evidence.derivedSpeedKmh) || 0;
    const segmentMedian = finite(evidence.segmentMedianSpeedKmh) || 0;
    const segmentCount = finite(evidence.segmentCount) || 0;
    const providerSpeed = finite(evidence.providerSpeedKmh) || 0;
    const rawMedian = finite(evidence.rawSpeedMedianKmh) || 0;
    const minimumDisplacement = Math.max(12, Math.min(35, accuracy * 1.4));
    const multiSegment = segmentCount >= 2 && adjusted >= 8 && displacement >= minimumDisplacement &&
      (derived >= 1.4 || segmentMedian >= 1.4);
    const fastMovement = segmentCount >= 2 && adjusted >= 10 && (segmentMedian >= 8 || derived >= 8);
    const providerConfirmed = segmentCount >= 1 && adjusted >= 8 && providerSpeed >= 6;
    const rawConfirmed = segmentCount >= 2 && adjusted >= 8 && rawMedian >= 4;
    return {
      confirmed: multiSegment || fastMovement || providerConfirmed || rawConfirmed,
      strong: fastMovement || providerConfirmed,
      evidence: [
        ...(multiSegment ? ['multi_segment_displacement_confirmed'] : []),
        ...(fastMovement ? ['fast_position_movement_confirmed'] : []),
        ...(providerConfirmed ? ['provider_speed_with_displacement_confirmed'] : []),
        ...(rawConfirmed ? ['raw_speed_with_displacement_confirmed'] : []),
      ],
    };
  }

  function stopSpeedThresholdKmh() {
    const mode = String(context.value('mobility.methodId') || context.value('mobility.mode') || '').toLowerCase();
    return ['car', 'driving', 'vehicle', 'boat', 'sailing', 'motorboat', 'cycling', 'bicycle', 'bus', 'train'].includes(mode)
      ? VEHICLE_STOP_SPEED_KMH
      : WALK_STOP_SPEED_KMH;
  }

  function stationaryEvidence(result) {
    const evidence = result?.motionEvidence || {};
    const motionStatus = String(result?.motion?.status || '').toLowerCase();
    const speed = finite(result?.speedKmh) || 0;
    const spread = finite(evidence.stationaryWindowSpreadM);
    const accuracy = Math.max(3, finite(evidence.accuracyM) || 10);
    if (accuracy > STOP_MAX_ACCURACY_M) return false;
    const radiusM = Math.max(STOP_MIN_RADIUS_M, Math.min(STOP_MAX_RADIUS_M, accuracy * 1.5));
    const stableCluster = Number.isFinite(spread) && spread <= radiusM;
    const lowSpeed = speed <= stopSpeedThresholdKmh();
    const sensorQuiet = !state.active;
    return stableCluster && (motionStatus === 'stationary' || (lowSpeed && sensorQuiet));
  }

  function applyStableMotion(result, status, extraEvidence = []) {
    const baseEvidence = Array.isArray(result?.motion?.evidence) ? result.motion.evidence : [];
    const sensorFusion = {
      active: state.active,
      confidence: state.active ? .75 : 0,
      evidence: [...state.evidence],
      corroborationRequired: true,
    };
    if (status === 'moving') {
      return {
        ...result,
        motion: {
          ...result.motion,
          status: 'moving',
          activity: 'moving',
          label: 'En movimiento',
          evidence: [...baseEvidence, ...extraEvidence, 'stable_movement_confirmed'],
        },
        motionEvidence: { ...(result.motionEvidence || {}), sensorFusion },
      };
    }
    if (status === 'stationary') {
      return {
        ...result,
        speedKmh: 0,
        heading: null,
        motion: {
          status: 'stationary',
          activity: 'paused',
          label: 'En pausa',
          confidence: .94,
          source: 'motion-stability-gate',
          evidence: [...baseEvidence, ...extraEvidence, 'stable_stationary_confirmed'],
        },
        mobility: { mode: 'stationary', confidence: .94, source: 'motion-stability-gate', evidence: ['stationary_confirmed'] },
        motionEvidence: { ...(result.motionEvidence || {}), sensorFusion },
      };
    }
    return {
      ...result,
      speedKmh: 0,
      heading: null,
      motion: {
        status: 'pending',
        activity: 'pending',
        label: 'Estabilizando posición',
        confidence: .62,
        source: 'motion-stability-gate',
        evidence: [...baseEvidence, ...extraEvidence, 'startup_or_transition_guard'],
      },
      mobility: { mode: 'unknown', confidence: .25, source: 'motion-stability-gate', evidence: ['movement_not_confirmed'] },
      motionEvidence: { ...(result.motionEvidence || {}), sensorFusion },
    };
  }

  function stabilize(result, corroboration, now = Date.now()) {
    const startup = now - state.startedAt < STARTUP_GUARD_MS;
    const requested = String(result?.motion?.status || 'pending').toLowerCase();
    const wantsMoving = requested === 'moving' && corroboration.confirmed;
    const wantsStationary = stationaryEvidence(result);

    if (state.stableStatus === 'pending') {
      if (wantsMoving) {
        state.stationaryCandidateAt = null;
        state.movingCandidateAt = state.movingCandidateAt || now;
        const required = corroboration.strong ? STRONG_MOVING_CONFIRM_MS : MOVING_CONFIRM_MS;
        if (now - state.movingCandidateAt >= required) {
          state.stableStatus = 'moving';
          state.movingCandidateAt = null;
        }
      } else {
        state.movingCandidateAt = null;
        if (!startup && wantsStationary) state.stableStatus = 'stationary';
      }
    } else if (state.stableStatus === 'stationary') {
      if (wantsMoving) {
        state.movingCandidateAt = state.movingCandidateAt || now;
        const required = corroboration.strong ? STRONG_MOVING_CONFIRM_MS : MOVING_CONFIRM_MS;
        if (now - state.movingCandidateAt >= required) {
          state.stableStatus = 'moving';
          state.movingCandidateAt = null;
        }
      } else {
        state.movingCandidateAt = null;
      }
    } else if (state.stableStatus === 'moving') {
      if (wantsMoving) {
        state.stationaryCandidateAt = null;
      } else if (wantsStationary) {
        state.stationaryCandidateAt = state.stationaryCandidateAt || now;
        if (now - state.stationaryCandidateAt >= STOP_CONFIRM_MS) {
          state.stableStatus = 'stationary';
          state.stationaryCandidateAt = null;
        }
      } else {
        state.stationaryCandidateAt = null;
      }
    }

    return applyStableMotion(result, state.stableStatus, [
      ...(startup ? ['startup_guard_active'] : []),
      ...corroboration.evidence,
      ...(state.active && !corroboration.confirmed ? ['accelerometer_without_position_corroboration'] : []),
    ]);
  }

  inference.inferSituation = (sourceContext) => {
    const original = originalInferSituation(sourceContext);
    if (!original?.locationAvailable || String(original.source || '').toLowerCase() === 'simulator') return original;

    const now = Date.now();
    const signal = sensorSignal();
    updateSensorState(signal, now);
    const corroboration = movementEvidence(original);
    return stabilize(original, corroboration, now);
  };

  context.subscribe((key) => {
    if (key === 'motion.sensor.summary' || key === 'motion.sensor.status') {
      window.WanderEngine?.run?.('sensor-motion-evidence-updated');
    }
  });

  window.WanderSensorMotionBridge = Object.freeze({
    getState: () => ({ ...state, evidence: [...state.evidence] }),
    signal: sensorSignal,
    movementEvidence,
    constants: {
      SENSOR_START_CONFIRM_MS,
      SENSOR_HOLD_MS,
      SENSOR_FRESH_MS,
      MIN_SAMPLE_COUNT,
      MIN_WINDOW_MS,
      STARTUP_GUARD_MS,
      MOVING_CONFIRM_MS,
      STRONG_MOVING_CONFIRM_MS,
      STOP_CONFIRM_MS,
      STOP_MIN_RADIUS_M,
      STOP_MAX_RADIUS_M,
      STOP_MAX_ACCURACY_M,
      WALK_STOP_SPEED_KMH,
      VEHICLE_STOP_SPEED_KMH,
    },
  });
})();

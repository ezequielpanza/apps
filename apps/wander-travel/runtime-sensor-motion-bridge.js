(() => {
  const context = window.WanderContext;
  const inference = window.WanderEngineInference;
  if (!context || !inference?.inferSituation || window.WanderSensorMotionBridge) return;

  const originalInferSituation = inference.inferSituation.bind(inference);
  const SENSOR_START_CONFIRM_MS = 2500;
  const SENSOR_HOLD_MS = 3500;
  const SENSOR_FRESH_MS = 3500;
  const MIN_SAMPLE_COUNT = 6;
  const MIN_WINDOW_MS = 2500;

  const state = {
    candidateAt: null,
    confirmedAt: null,
    lastActiveAt: null,
    active: false,
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
    const active = enoughHistory && activeRatio >= .45 && rms >= .22 && variance >= .01 && peak >= .55 &&
      (lastActivity >= .12 || activeRatio >= .65);
    const strong = active && activeRatio >= .6 && rms >= .35 && variance >= .025 && peak >= .9;
    const confidence = active ? Math.min(.92, .62 + activeRatio * .25 + Math.min(.08, rms / 10)) : 0;

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
        state.evidence = [...signal.evidence, signal.strong ? 'strong_sensor_motion_confirmed' : 'sustained_sensor_motion_confirmed'];
      } else {
        state.evidence = [...signal.evidence, 'sensor_motion_candidate'];
      }
      return;
    }

    state.candidateAt = null;
    if (state.active && state.lastActiveAt && now - state.lastActiveAt <= SENSOR_HOLD_MS) {
      state.evidence = ['sensor_motion_hold'];
      return;
    }
    state.active = false;
    state.confirmedAt = null;
    state.evidence = [...signal.evidence];
  }

  inference.inferSituation = (sourceContext) => {
    const original = originalInferSituation(sourceContext);
    if (!original?.locationAvailable || String(original.source || '').toLowerCase() === 'simulator') return original;

    const signal = sensorSignal();
    updateSensorState(signal);
    if (!state.active || original.motion?.status === 'moving') {
      return {
        ...original,
        motionEvidence: {
          ...(original.motionEvidence || {}),
          sensorFusion: { active: state.active, confidence: signal.confidence, evidence: [...state.evidence] },
        },
      };
    }

    const originalSpeed = finite(original.speedKmh);
    const mobility = String(original.mobility?.mode || '').toLowerCase() === 'stationary'
      ? {
          mode: 'unknown',
          confidence: .45,
          source: 'motion-sensor-fusion',
          evidence: ['accelerometer_overrode_stationary_provider'],
        }
      : original.mobility;

    return {
      ...original,
      speedKmh: originalSpeed !== null && originalSpeed > .3 ? originalSpeed : 0,
      motion: {
        status: 'moving',
        activity: 'moving',
        label: 'En movimiento',
        confidence: Math.max(.76, signal.confidence || 0),
        source: 'motion-sensor-fusion',
        evidence: [...state.evidence, 'gps_speed_pending'],
      },
      mobility,
      motionEvidence: {
        ...(original.motionEvidence || {}),
        sensorFusion: { active: true, confidence: signal.confidence, evidence: [...state.evidence] },
      },
    };
  };

  context.subscribe((key) => {
    if (key === 'motion.sensor.summary' || key === 'motion.sensor.status') {
      window.WanderEngine?.run?.('sensor-motion-evidence-updated');
    }
  });

  window.WanderSensorMotionBridge = Object.freeze({
    getState: () => ({ ...state, evidence: [...state.evidence] }),
    signal: sensorSignal,
    constants: { SENSOR_START_CONFIRM_MS, SENSOR_HOLD_MS, SENSOR_FRESH_MS, MIN_SAMPLE_COUNT, MIN_WINDOW_MS },
  });
})();

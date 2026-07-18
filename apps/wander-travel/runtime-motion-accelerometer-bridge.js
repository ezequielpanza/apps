(() => {
  const context = window.WanderContext;
  const inference = window.WanderEngineInference;
  if (!context || !inference?.inferSituation || window.WanderAccelerometerMotionBridge) return;

  const originalInferSituation = inference.inferSituation.bind(inference);
  const START_CONFIRM_MS = 2500;
  const SENSOR_FRESH_MS = 5500;
  const ACTIVE_RATIO_MIN = 0.34;
  const RMS_MIN = 0.22;
  const PEAK_MIN = 0.65;
  const MIN_SENSOR_SAMPLES = 8;
  const TICK_MS = 700;

  let activeCandidateAt = null;
  let sensorMoving = false;
  let timer = null;

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function sensorEvidence(summary) {
    if (!summary || typeof summary !== 'object') return { active: false, reason: 'sensor_unavailable' };
    const updatedAt = Date.parse(summary.updatedAt || '');
    const ageMs = Number.isFinite(updatedAt) ? Math.max(0, Date.now() - updatedAt) : Infinity;
    const sampleCount = finite(summary.sampleCount) || 0;
    const activeRatio = finite(summary.activeRatio) || 0;
    const rms = finite(summary.rms) || 0;
    const peak = finite(summary.peak) || 0;
    const fresh = ageMs <= SENSOR_FRESH_MS;
    const active = fresh && sampleCount >= MIN_SENSOR_SAMPLES && activeRatio >= ACTIVE_RATIO_MIN && rms >= RMS_MIN && peak >= PEAK_MIN;
    return {
      active,
      fresh,
      ageMs,
      sampleCount,
      activeRatio,
      rms,
      peak,
      reason: active ? 'sustained_accelerometer_activity' : 'accelerometer_below_threshold',
    };
  }

  function scheduleTick() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      window.WanderEngine?.run?.('accelerometer-motion-transition');
    }, TICK_MS);
  }

  function resetCandidate() {
    activeCandidateAt = null;
    sensorMoving = false;
    if (timer) clearTimeout(timer);
    timer = null;
  }

  inference.inferSituation = (ctx) => {
    const situation = originalInferSituation(ctx);
    if (!situation?.locationAvailable || String(situation.source || '').toLowerCase() === 'simulator') {
      resetCandidate();
      return situation;
    }

    const summary = ctx.value?.('motion.sensor.summary', null);
    const sensor = sensorEvidence(summary);
    const now = Date.now();
    const baseMoving = situation.motion?.status === 'moving';

    if (baseMoving) {
      resetCandidate();
      return {
        ...situation,
        motionEvidence: {
          ...(situation.motionEvidence || {}),
          accelerometerBridge: { ...sensor, promoted: false, baseMoving: true },
        },
      };
    }

    if (sensor.active) {
      if (!activeCandidateAt) activeCandidateAt = now;
      const elapsedMs = now - activeCandidateAt;
      sensorMoving = elapsedMs >= START_CONFIRM_MS;
      if (!sensorMoving) scheduleTick();

      if (sensorMoving) {
        const evidence = [
          ...(Array.isArray(situation.motion?.evidence) ? situation.motion.evidence : []),
          'sustained_accelerometer_activity',
          'movement_promoted_before_gps_corroboration',
        ];
        return {
          ...situation,
          motion: {
            status: 'moving',
            activity: 'moving',
            label: 'En movimiento',
            confidence: 0.78,
            source: 'accelerometer-and-location',
            evidence,
          },
          mobility: String(situation.mobility?.mode || '').toLowerCase() === 'stationary'
            ? { mode: 'unknown', confidence: 0.45, source: 'accelerometer', evidence: ['sensor_movement_detected'] }
            : situation.mobility,
          motionEvidence: {
            ...(situation.motionEvidence || {}),
            accelerometerBridge: { ...sensor, promoted: true, elapsedMs },
          },
        };
      }

      return {
        ...situation,
        motion: {
          status: 'pending',
          activity: 'pending',
          label: 'Confirmando movimiento',
          confidence: 0.65,
          source: 'accelerometer-and-location',
          evidence: ['accelerometer_movement_candidate'],
        },
        motionEvidence: {
          ...(situation.motionEvidence || {}),
          accelerometerBridge: { ...sensor, promoted: false, elapsedMs },
        },
      };
    }

    resetCandidate();
    return {
      ...situation,
      motionEvidence: {
        ...(situation.motionEvidence || {}),
        accelerometerBridge: { ...sensor, promoted: false },
      },
    };
  };

  context.subscribe((key) => {
    if (key === 'motion.sensor.summary') window.WanderEngine?.run?.('accelerometer-motion-sample');
  });

  window.WanderAccelerometerMotionBridge = Object.freeze({
    getState: () => ({ activeCandidateAt, sensorMoving }),
    policy: {
      startConfirmMs: START_CONFIRM_MS,
      sensorFreshMs: SENSOR_FRESH_MS,
      activeRatioMin: ACTIVE_RATIO_MIN,
      rmsMin: RMS_MIN,
      peakMin: PEAK_MIN,
      minimumSensorSamples: MIN_SENSOR_SAMPLES,
    },
  });
})();

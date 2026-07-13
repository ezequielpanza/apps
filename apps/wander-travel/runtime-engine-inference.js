(() => {
  function finiteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function inferMotionState(speedKmh) {
    const speed = finiteNumber(speedKmh);
    if (speed === null) {
      return {
        status: 'pending',
        activity: 'pending',
        label: 'Preparando contexto',
        confidence: 0.4,
      };
    }

    if (speed <= 0.3) {
      return {
        status: 'stationary',
        activity: 'paused',
        label: 'En pausa',
        confidence: 0.95,
      };
    }

    return {
      status: 'moving',
      activity: 'moving',
      label: 'En movimiento',
      confidence: 0.9,
    };
  }

  function inferMobility(context, motion) {
    const explicitMode = context.value?.('mobility.override.mode', null);
    if (explicitMode) {
      return {
        mode: String(explicitMode),
        confidence: 1,
        source: 'explicit',
        evidence: ['user_or_provider_override'],
      };
    }

    const providerMode = context.value?.('mobility.provider.mode', null);
    const providerConfidence = finiteNumber(context.value?.('mobility.provider.confidence', null));
    if (providerMode && providerConfidence !== null && providerConfidence >= 0.6) {
      return {
        mode: String(providerMode),
        confidence: Math.min(1, Math.max(0, providerConfidence)),
        source: 'provider',
        evidence: ['provider_signal'],
      };
    }

    return {
      mode: 'unknown',
      confidence: motion.status === 'stationary' ? 0.8 : 0.2,
      source: 'engine',
      evidence: motion.status === 'stationary' ? ['stationary_no_transport_needed'] : ['insufficient_evidence'],
    };
  }

  function inferSituation(context) {
    const effective = context.getEffectiveLocation?.();
    if (!effective) {
      const motion = inferMotionState(null);
      return {
        locationAvailable: false,
        source: null,
        lat: null,
        lng: null,
        accuracy: null,
        speedKmh: null,
        heading: null,
        motion,
        mobility: inferMobility(context, motion),
      };
    }

    const rawSpeedMps = finiteNumber(effective.speedMps);
    const rawSpeedKmh = rawSpeedMps === null ? null : Math.max(0, rawSpeedMps * 3.6);
    const providerSpeedKmh = finiteNumber(context.value?.('mobility.provider.speedKmh', null));
    const providerMode = context.value?.('mobility.provider.mode', null);
    const providerConfidence = finiteNumber(context.value?.('mobility.provider.confidence', null));

    let speedKmh = providerSpeedKmh !== null ? Math.max(0, providerSpeedKmh) : rawSpeedKmh;
    if (providerMode === 'stationary' && providerConfidence !== null && providerConfidence >= 0.6) speedKmh = 0;

    const heading = finiteNumber(effective.heading);
    const motion = inferMotionState(speedKmh);

    return {
      locationAvailable: true,
      source: effective.source || 'unknown',
      lat: finiteNumber(effective.lat),
      lng: finiteNumber(effective.lng),
      accuracy: finiteNumber(effective.accuracy),
      speedKmh,
      heading,
      motion,
      mobility: inferMobility(context, motion),
    };
  }

  window.WanderEngineInference = {
    inferMotionState,
    inferMobility: (context) => {
      const situation = inferSituation(context);
      return situation.mobility;
    },
    inferSituation,
  };
})();
(() => {
  function finiteNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function inferMotionProfile(speedKmh) {
    const speed = finiteNumber(speedKmh);
    if (speed === null) {
      return {
        status: 'pending',
        mode: 'unknown',
        activity: 'pending',
        label: 'Preparando contexto',
        confidence: 0.4,
      };
    }

    if (speed <= 0.3) {
      return {
        status: 'stationary',
        mode: 'unknown',
        activity: 'paused',
        label: 'En pausa',
        confidence: 0.95,
      };
    }

    if (speed < 8) {
      return {
        status: 'moving',
        mode: 'walking',
        activity: 'walking',
        label: 'Caminando',
        confidence: 0.8,
      };
    }

    if (speed < 25) {
      return {
        status: 'moving',
        mode: 'cycling',
        activity: 'cycling',
        label: 'Andando en bicicleta',
        confidence: 0.7,
      };
    }

    return {
      status: 'moving',
      mode: 'driving',
      activity: 'driving',
      label: 'Conduciendo',
      confidence: 0.75,
    };
  }

  function inferSituation(context) {
    const effective = context.getEffectiveLocation?.();
    if (!effective) {
      return {
        locationAvailable: false,
        source: null,
        speedKmh: null,
        heading: null,
        motion: inferMotionProfile(null),
      };
    }

    const speedMps = finiteNumber(effective.speedMps);
    const speedKmh = speedMps === null ? 0 : speedMps * 3.6;
    const heading = finiteNumber(effective.heading);

    return {
      locationAvailable: true,
      source: effective.source || 'unknown',
      speedKmh,
      heading,
      motion: inferMotionProfile(speedKmh),
    };
  }

  window.WanderEngineInference = {
    inferMotionProfile,
    inferSituation,
  };
})();

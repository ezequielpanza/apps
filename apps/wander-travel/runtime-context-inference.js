(() => {
  const context = window.WanderContext;
  if (!context) return;

  function inferMotionProfile(speedKmh) {
    if (speedKmh <= 0.3) return { status: 'stationary', mode: 'unknown', label: 'En pausa', activity: 'paused', confidence: 0.95 };
    if (speedKmh < 8) return { status: 'moving', mode: 'walking', label: 'Caminando', activity: 'walking', confidence: 0.8 };
    if (speedKmh < 25) return { status: 'moving', mode: 'cycling', label: 'Andando en bicicleta', activity: 'cycling', confidence: 0.7 };
    return { status: 'moving', mode: 'driving', label: 'Conduciendo', activity: 'driving', confidence: 0.75 };
  }

  function inferFromEffectiveLocation() {
    const location = context.getEffectiveLocation();
    if (!location) {
      context.setMotion({ status: 'pending', mode: 'unknown', speedKmh: 0, heading: null, source: 'context' });
      context.setContext({ status: 'Preparando contexto', activity: 'pending', source: 'context', confidence: 1 });
      return null;
    }

    const speedKmh = Math.max(0, Number(location.speedMps || 0) * 3.6);
    const profile = inferMotionProfile(speedKmh);
    context.setMotion({
      status: profile.status,
      mode: profile.mode,
      speedKmh,
      heading: Number.isFinite(Number(location.heading)) ? Number(location.heading) : null,
      source: 'context',
    });
    context.setContext({
      status: profile.label,
      activity: profile.activity,
      source: 'context',
      confidence: location.source === 'simulator' ? 1 : profile.confidence,
    });
    return profile;
  }

  context.subscribe((key) => {
    if (key === 'location.effective' || key.startsWith('location.effective.')) inferFromEffectiveLocation();
  });

  Object.assign(context, {
    inferMotionProfile,
    inferFromEffectiveLocation,
  });

  inferFromEffectiveLocation();
})();
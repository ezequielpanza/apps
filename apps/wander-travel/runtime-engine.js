(() => {
  const context = window.WanderContext;
  if (!context) return;

  function profileForSpeed(kmh) {
    if (kmh <= 0.3) return { status: 'stationary', mode: 'unknown', label: 'En pausa', activity: 'paused' };
    if (kmh < 8) return { status: 'moving', mode: 'walking', label: 'Caminando', activity: 'walking' };
    if (kmh < 25) return { status: 'moving', mode: 'cycling', label: 'Andando en bicicleta', activity: 'cycling' };
    return { status: 'moving', mode: 'driving', label: 'Conduciendo', activity: 'driving' };
  }

  function interpretEffectiveLocation() {
    const location = context.getEffectiveLocation();
    if (!location) {
      context.setMotion({ status: 'pending', mode: 'unknown', speedKmh: 0, heading: null, source: 'engine' });
      context.setContext({ status: 'Preparando contexto', activity: 'pending', source: 'engine', confidence: 1 });
      return null;
    }

    const speedKmh = Math.max(0, Number(location.speedMps || 0) * 3.6);
    const profile = profileForSpeed(speedKmh);
    context.setMotion({
      status: profile.status,
      mode: profile.mode,
      speedKmh,
      heading: Number.isFinite(Number(location.heading)) ? Number(location.heading) : null,
      source: 'engine',
    });
    context.setContext({
      status: profile.label,
      activity: profile.activity,
      source: 'engine',
      confidence: location.source === 'simulator' ? 1 : 0.7,
    });
    return profile;
  }

  context.subscribe((key) => {
    if (key === 'location.effective' || key.startsWith('location.effective.')) interpretEffectiveLocation();
  });

  window.WanderEngine = {
    interpretEffectiveLocation,
    profileForSpeed,
  };

  interpretEffectiveLocation();
})();
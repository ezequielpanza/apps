(() => {
  const context = window.WanderContext;
  if (!context) return;

  function applyContainerFallback() {
    const container = context.value('container.current');
    const current = context.value('currentPOI.current');

    if (!container) return null;
    if (current && current.detectionMode === 'near_point') {
      if (!current.container || current.container.id !== container.id) {
        const options = {
          source: 'current-container-bridge',
          kind: 'inferred',
          ttlMs: 60000,
          confidence: 0.97,
        };
        const enriched = { ...current, container };
        context.set('currentPOI.current', enriched, options);
        context.set('currentPOI.value', enriched, options);
        context.set('currentPOI.container', container, options);
      }
      return current;
    }

    const accuracy = Math.max(5, Number(context.getEffectiveLocation?.()?.accuracy) || 50);
    const value = {
      id: container.id,
      name: container.name || 'Establecimiento',
      categories: [],
      location: container.location || null,
      address: null,
      distanceM: 0,
      accuracyM: Math.round(accuracy),
      detectionMode: 'inside_area',
      source: container.source || 'openstreetmap',
      container,
      detectedAt: new Date().toISOString(),
    };
    const options = {
      source: 'current-container-bridge',
      kind: 'observed',
      ttlMs: 60000,
      confidence: 0.97,
    };
    context.set('currentPOI.current', value, options);
    context.set('currentPOI.value', value, options);
    context.set('currentPOI.container', container, options);
    context.set('currentPOI.distanceM', 0, options);
    context.set('currentPOI.status', 'inside_container', options);
    return value;
  }

  context.subscribe((key) => {
    if (
      key === 'container.current' ||
      key === 'nearby.items' ||
      key === 'location.effective' ||
      key.startsWith('location.effective.')
    ) {
      queueMicrotask(applyContainerFallback);
    }
  });

  const providers = window.WanderProviders || (window.WanderProviders = {});
  providers.currentContainerBridge = Object.freeze({ apply: applyContainerFallback });
  applyContainerFallback();
})();

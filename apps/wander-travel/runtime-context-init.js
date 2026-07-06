(() => {
  const context = window.WanderContext;
  if (!context?.recomputeEffectiveLocation) return;

  context.set('simulation.status', 'inactive', {
    source: 'init',
    kind: 'observed',
    ttlMs: Infinity,
    confidence: 1,
  });

  context.setContext({
    status: 'Preparando contexto',
    activity: 'pending',
    source: 'init',
    confidence: 1,
  });

  context._write('location.real.status', 'pending', {
    source: 'init',
    kind: 'observed',
    confidence: 1,
  }, false);

  context._write('location.override.enabled', false, {
    source: 'init',
    kind: 'observed',
    ttlMs: Infinity,
    confidence: 1,
  }, false);

  context.recomputeEffectiveLocation();
  context.setMotion({ status: 'pending', mode: 'unknown', source: 'init' });
  context.set('places.items', [], {
    source: 'init',
    kind: 'derived',
    confidence: 0,
  });

  context.updateTime();
  setInterval(context.updateTime, 30000);
})();
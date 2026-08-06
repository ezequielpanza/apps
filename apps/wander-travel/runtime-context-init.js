(() => {
  const context = window.WanderContext;
  if (!context?.recomputeEffectiveLocation) return;

  context.set('simulation.status', 'inactive', {
    source: 'init', kind: 'observed', ttlMs: Infinity, confidence: 1,
  });
  context.setContext({ status: 'Preparando contexto', activity: 'pending', source: 'init', confidence: 1 });
  context._write('location.real.status', 'pending', { source: 'init', kind: 'observed', confidence: 1 }, false);
  context._write('location.override.enabled', false, { source: 'init', kind: 'observed', ttlMs: Infinity, confidence: 1 }, false);
  context.recomputeEffectiveLocation();
  context.setMotion({ status: 'pending', source: 'init' });
  context.setMobility({ mode: 'unknown', evidence: ['initializing'], source: 'init', confidence: 0 });
  context.set('place.status', 'pending', { source: 'init', kind: 'derived', confidence: 0 });
  context.set('places.items', [], { source: 'init', kind: 'derived', confidence: 0 });

  context.updateTime();
  setInterval(context.updateTime, 30000);

  function loadScript(src, marker) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[${marker}]`);
      if (existing) return resolve();
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.setAttribute(marker, 'true');
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  loadScript('runtime-raw-location-recorder.js?v=20260805-02', 'data-wander-raw-recorder')
    .then(() => loadScript('runtime-track-intelligence.js?v=20260805-01', 'data-wander-track-intelligence'))
    .then(() => loadScript('runtime-track-intelligence-poller.js?v=20260805-01', 'data-wander-track-intelligence-poller'))
    .then(() => loadScript('runtime-track-review-ui.js?v=20260805-01', 'data-wander-track-review-ui'))
    .then(() => loadScript('runtime-track-tree-ui.js?v=20260806-01', 'data-wander-track-tree-ui'))
    .then(() => loadScript('runtime-track-tree-bitacora-bridge.js?v=20260806-01', 'data-wander-track-tree-bitacora-bridge'))
    .catch(() => {
      context.set('sessions.trackIntelligenceStatus', 'error', {
        source: 'context-init', kind: 'observed', ttlMs: 60000, confidence: 1,
      });
    });
})();
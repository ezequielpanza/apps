(() => {
  if (window.WanderRuntimeResilience) return;

  const context = window.WanderContext;
  let mapRecoveryTimer = 0;
  let enforcingSimulator = false;

  function finite(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function simulationActive() {
    return context?.value?.('location.override.enabled', false) === true
      || context?.value?.('location.effective.source') === 'simulator';
  }

  function simulatorSnapshot() {
    if (!simulationActive()) return null;
    const location = context?.getEffectiveLocation?.() || null;
    const speedMps = finite(location?.speedMps) ?? finite(context?.value?.('location.override.speedMps')) ?? 0;
    const speedKmh = Math.max(0, speedMps * 3.6);
    const heading = finite(location?.heading) ?? finite(context?.value?.('location.override.heading'));
    return {
      speedKmh,
      heading: heading === null ? null : ((heading % 360) + 360) % 360,
      status: speedKmh > 0.25 ? 'moving' : 'stationary',
    };
  }

  function enforceSimulatorAuthority() {
    if (enforcingSimulator) return false;
    const snapshot = simulatorSnapshot();
    if (!snapshot || !context?.setMotion) return false;

    const statusEntry = context.get?.('motion.status');
    const speedEntry = context.get?.('motion.speedKmh');
    const headingEntry = context.get?.('motion.heading');
    const headingMatches = snapshot.heading === null
      ? headingEntry == null
      : headingEntry?.source === 'simulator' && Math.abs(Number(headingEntry?.value) - snapshot.heading) < 0.05;
    const alreadyAuthoritative = statusEntry?.source === 'simulator'
      && statusEntry?.value === snapshot.status
      && speedEntry?.source === 'simulator'
      && Math.abs(Number(speedEntry?.value || 0) - snapshot.speedKmh) < 0.05
      && headingMatches;
    if (alreadyAuthoritative) return false;

    enforcingSimulator = true;
    try {
      context.setMotion({
        status: snapshot.status,
        speedKmh: snapshot.speedKmh,
        heading: snapshot.heading,
        source: 'simulator',
        confidence: 1,
      });
      context.set('simulation.motionAuthority', true, {
        source: 'runtime-resilience', kind: 'derived', ttlMs: Infinity, confidence: 1,
      });
      window.WanderDirectionIndicator?.evaluate?.();
      return true;
    } finally {
      enforcingSimulator = false;
    }
  }

  function recoverMapNow() {
    const core = window.WanderMapCore;
    const map = core?.map;
    if (!map) return false;
    try {
      map.invalidateSize({ animate: false, pan: false, debounceMoveend: true });
      const activeName = core.getBaseLayer?.();
      const activeLayer = activeName ? core.baseLayers?.[activeName] : null;
      activeLayer?.redraw?.();
      window.WanderMapControls?.followPosition?.();
      return true;
    } catch {
      return false;
    }
  }

  function recoverMap() {
    if (mapRecoveryTimer) clearTimeout(mapRecoveryTimer);
    requestAnimationFrame(() => {
      recoverMapNow();
      setTimeout(recoverMapNow, 120);
      mapRecoveryTimer = setTimeout(() => {
        mapRecoveryTimer = 0;
        recoverMapNow();
      }, 500);
    });
  }

  context?.subscribe?.((key, entry) => {
    if (key === 'location.override.enabled' || key === 'location.effective' || key.startsWith('location.effective.')) {
      enforceSimulatorAuthority();
      return;
    }
    if (simulationActive() && (key === 'motion.status' || key === 'motion.speedKmh' || key === 'motion.heading')) {
      if (entry?.source !== 'simulator') enforceSimulatorAuthority();
    }
  });

  const simulatorGuard = setInterval(() => {
    if (simulationActive()) enforceSimulatorAuthority();
  }, 500);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      enforceSimulatorAuthority();
      window.WanderDirectionIndicator?.evaluate?.();
      recoverMap();
    }
  });
  document.addEventListener('resume', recoverMap);
  window.addEventListener('pageshow', recoverMap);
  window.addEventListener('focus', recoverMap);
  window.addEventListener('online', recoverMap);
  window.addEventListener('offline', recoverMap);

  window.WanderRuntimeResilience = Object.freeze({
    enforceSimulatorAuthority,
    recoverMap,
    destroy() { clearInterval(simulatorGuard); },
  });
})();
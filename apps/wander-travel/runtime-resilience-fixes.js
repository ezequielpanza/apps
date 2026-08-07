(() => {
  if (window.WanderRuntimeResilience) return;

  const context = window.WanderContext;
  let stableMarkerDisabled = false;
  let mapRecoveryTimer = 0;

  function finite(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function simulationActive() {
    return context?.value?.('location.override.enabled', false) === true
      || context?.value?.('location.effective.source') === 'simulator';
  }

  function syncSimulatorMotionToLocation() {
    if (!context?.recomputeEffectiveLocation || !simulationActive()) return false;

    const speedKmh = finite(context.value('motion.speedKmh'));
    const heading = finite(context.value('motion.heading'));
    let changed = false;

    if (speedKmh !== null) {
      const nextSpeedMps = Math.max(0, speedKmh) / 3.6;
      const currentSpeedMps = finite(context.value('location.override.speedMps'));
      if (currentSpeedMps === null || Math.abs(currentSpeedMps - nextSpeedMps) > 0.005) {
        context.set('location.override.speedMps', nextSpeedMps, {
          source: 'simulator', kind: 'observed', ttlMs: Infinity, confidence: 1,
        });
        changed = true;
      }
    }

    if (heading !== null) {
      const normalized = ((heading % 360) + 360) % 360;
      const currentHeading = finite(context.value('location.override.heading'));
      const delta = currentHeading === null ? Infinity : Math.abs((((normalized - currentHeading) + 540) % 360) - 180);
      if (delta > 0.25) {
        context.set('location.override.heading', normalized, {
          source: 'simulator', kind: 'observed', ttlMs: Infinity, confidence: 1,
        });
        changed = true;
      }
    }

    if (changed) context.recomputeEffectiveLocation();
    return changed;
  }

  function disableLegacyStableDirectionMarker() {
    if (stableMarkerDisabled) return true;
    const marker = window.WanderStableDirectionMarker;
    if (!marker?.destroy) return false;
    try {
      marker.destroy();
      stableMarkerDisabled = true;
      context?.set?.('direction.legacyStableMarkerDisabled', true, {
        source: 'runtime-resilience', kind: 'derived', ttlMs: Infinity, confidence: 1,
      });
      window.WanderDirectionIndicator?.evaluate?.();
      return true;
    } catch {
      return false;
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

  context?.subscribe?.((key) => {
    if (key === 'motion.speedKmh' || key === 'motion.heading' || key === 'location.override.enabled') {
      syncSimulatorMotionToLocation();
      window.WanderDirectionIndicator?.evaluate?.();
    }
  });

  const markerProbe = setInterval(() => {
    syncSimulatorMotionToLocation();
    if (disableLegacyStableDirectionMarker()) clearInterval(markerProbe);
  }, 250);
  setTimeout(() => clearInterval(markerProbe), 15000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncSimulatorMotionToLocation();
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
    syncSimulatorMotionToLocation,
    disableLegacyStableDirectionMarker,
    recoverMap,
  });
})();

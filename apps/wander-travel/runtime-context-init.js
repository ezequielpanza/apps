(() => {
  const context = window.WanderContext;
  if (!context?.recomputeEffectiveLocation) return;

  try {
    const key = 'wander.direction.indicator.v1';
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, JSON.stringify({ enabled: true, magneticEnabled: true, thresholdKmh: 5 }));
    }
  } catch {}

  // Recording is independent from UI refresh frequency. The simulator and the
  // map may update several times per second, but the session engine receives
  // location observations only when the selected recording profile allows it.
  // An absolute 1 Hz ceiling prevents high-speed distance thresholds from
  // generating more than one stored point per second.
  (() => {
    if (context.__wanderRecordingGateInstalled || typeof context.subscribe !== 'function') return;
    const originalSubscribe = context.subscribe.bind(context);
    let lastDelivered = null;

    function finite(value) {
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }

    function distanceMeters(a, b) {
      if (!a || !b) return 0;
      const radius = 6371008.8;
      const rad = (value) => value * Math.PI / 180;
      const dLat = rad(b.lat - a.lat);
      const dLng = rad(b.lng - a.lng);
      const lat1 = rad(a.lat);
      const lat2 = rad(b.lat);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      return radius * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    function recordingConfig() {
      const presets = {
        precise: { intervalSec: 1, distanceM: 0 },
        balanced: { intervalSec: 5, distanceM: 5 },
        vehicle: { intervalSec: 3, distanceM: 10 },
        saver: { intervalSec: 15, distanceM: 20 },
      };
      try {
        const stored = JSON.parse(localStorage.getItem('wander.recording.profile.v1') || 'null') || {};
        if (stored.profileId === 'manual') {
          return {
            intervalSec: Math.max(1, Math.min(60, Math.round(Number(stored.manualIntervalSec) || 5))),
            distanceM: Math.max(0, Math.min(100, Math.round(Number(stored.manualDistanceM) || 0))),
          };
        }
        return presets[stored.profileId] || presets.balanced;
      } catch {
        return presets.balanced;
      }
    }

    function currentLocation() {
      const location = context.getEffectiveLocation?.();
      const lat = finite(location?.lat);
      const lng = finite(location?.lng);
      if (lat === null || lng === null) return null;
      return { lat, lng, at: Date.now() };
    }

    function shouldDeliver() {
      const current = currentLocation();
      if (!current) return false;
      if (!lastDelivered) {
        lastDelivered = current;
        return true;
      }
      const elapsedMs = current.at - lastDelivered.at;
      if (elapsedMs < 1000) return false;
      const config = recordingConfig();
      const timeReached = elapsedMs >= Math.max(1, Number(config.intervalSec) || 1) * 1000;
      const distanceThreshold = Math.max(0, Number(config.distanceM) || 0);
      const distanceReached = distanceThreshold > 0 && distanceMeters(lastDelivered, current) >= distanceThreshold;
      if (!timeReached && !distanceReached) return false;
      lastDelivered = current;
      return true;
    }

    context.subscribe = function subscribeWithRecordingGate(listener) {
      if (typeof listener !== 'function') return originalSubscribe(listener);
      let source = '';
      try { source = Function.prototype.toString.call(listener); } catch {}
      const sessionListener = source.includes("observe('location')") && source.includes('motion.status');
      if (!sessionListener) return originalSubscribe(listener);
      return originalSubscribe((key, entry, previous) => {
        if (typeof key !== 'string') return listener(key, entry, previous);
        if (key === 'location.effective') {
          if (shouldDeliver()) listener(key, entry, previous);
          return;
        }
        if (key.startsWith('location.effective.')) return;
        listener(key, entry, previous);
      });
    };
    context.__wanderRecordingGateInstalled = true;
  })();

  // app.js still contains the retired stable-marker implementation for backwards
  // compatibility. Reserve its global before app initialization so it can never
  // create a second direction arrow. WanderDirectionIndicator is the sole owner
  // of the visible direction marker.
  if (!window.WanderStableDirectionMarker) {
    window.WanderStableDirectionMarker = Object.freeze({
      disabled: true,
      render() {},
      destroy() {},
      getState: () => ({ source: 'disabled', disabled: true }),
    });
  }

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

  loadScript('runtime-map-zoom-buttons.js?v=20260807-01', 'data-wander-map-zoom-buttons').catch(() => {});
  loadScript('runtime-resilience-fixes.js?v=20260807-01', 'data-wander-runtime-resilience').catch(() => {});

  loadScript('runtime-raw-location-recorder.js?v=20260805-02', 'data-wander-raw-recorder')
    .then(() => loadScript('runtime-track-intelligence.js?v=20260805-01', 'data-wander-track-intelligence'))
    .then(() => loadScript('runtime-track-intelligence-poller.js?v=20260805-01', 'data-wander-track-intelligence-poller'))
    .then(() => loadScript('runtime-track-review-ui.js?v=20260805-01', 'data-wander-track-review-ui'))
    .then(() => loadScript('runtime-track-tree-ui.js?v=20260806-01', 'data-wander-track-tree-ui'))
    .then(() => loadScript('runtime-bitacora-tree-mode.js?v=20260807-01', 'data-wander-bitacora-tree-mode'))
    .then(() => loadScript('runtime-unified-travel-log.js?v=20260807-01', 'data-wander-unified-travel-log'))
    .then(() => loadScript('runtime-active-track-log-bridge.js?v=20260807-01', 'data-wander-active-track-log-bridge'))
    .catch(() => {
      context.set('sessions.trackIntelligenceStatus', 'error', {
        source: 'context-init', kind: 'observed', ttlMs: 60000, confidence: 1,
      });
    });
})();

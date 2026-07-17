(() => {
  function initialize() {
    window.WanderProviders?.nearby?.configure?.({
      sources: ['google-places', 'openstreetmap', 'wikidata'],
    });

    window.WanderProviders?.nearby?.refresh?.(true);
    window.WanderProviders?.container?.refresh?.(true);
    window.WanderProviders?.googleContainer?.apply?.();
    window.WanderProviders?.currentPOI?.detect?.();
    window.WanderProviders?.currentContainerBridge?.apply?.();
    window.WanderCurrentPOIMotionGuard?.enforce?.();
    window.WanderContextDashboard?.restore?.();
    window.WanderSituationEngine?.evaluate?.();
    window.WanderSessionEngine?.observe?.('app-ready');

    window.WanderAppReady = true;
    window.dispatchEvent(new CustomEvent('wander:app-ready', {
      detail: { at: Date.now(), version: window.WanderVersion },
    }));
  }

  window.addEventListener('load', () => {
    requestAnimationFrame(() => requestAnimationFrame(initialize));
  }, { once: true });

  if (!('serviceWorker' in navigator)) return;

  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloadingForUpdate = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    const build = encodeURIComponent(window.WanderVersion || 'development');
    navigator.serviceWorker.register('./sw.js?build=' + build, { updateViaCache: 'none' }).then((registration) => {
      registration.update().catch(() => {});
      if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            worker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    }).catch(() => {});
  }, { once: true });
})();

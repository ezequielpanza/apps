(() => {
  const APP_BUILD = 'v0.92.47';
  const MAP_RUNTIME_VERSION = '20260708-03';

  document.write('<script src="runtime-map-core.js?v=' + MAP_RUNTIME_VERSION + '"><\/script>');
  document.write('<script src="runtime-map-position.js?v=' + MAP_RUNTIME_VERSION + '"><\/script>');
  document.write('<script src="runtime-map-controls.js?v=' + MAP_RUNTIME_VERSION + '"><\/script>');
  document.write('<script src="runtime-map.js?v=' + MAP_RUNTIME_VERSION + '"><\/script>');

  function loadRuntime(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', reject, { once: true });
      document.body.appendChild(script);
    });
  }

  function loadStyle(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  window.addEventListener('load', async () => {
    try {
      loadStyle('wander-dashboard-order.css?v=20260714-04');
      await loadRuntime('runtime-dashboard-order.js?v=20260714-04');
    } catch {}

    try {
      loadStyle('wander-rule-checker.css?v=20260714-05');
      await loadRuntime('runtime-situation-engine.js?v=20260714-08');
      await loadRuntime('runtime-rule-checker.js?v=20260714-05');
    } catch {}

    try {
      await loadRuntime('runtime-source-policy-google-places.js?v=20260713-01');
      await loadRuntime('runtime-poi-connector-google-places.js?v=20260713-02');
      window.WanderProviders?.nearby?.configure?.({ sources: ['google-places', 'openstreetmap', 'wikidata'] });
      await window.WanderProviders?.nearby?.refresh?.(true);
    } catch {}

    try {
      await loadRuntime('runtime-provider-container.js?v=20260713-01');
      await loadRuntime('runtime-provider-container-google.js?v=20260713-01');
    } catch {}

    try {
      await loadRuntime('runtime-provider-current-poi.js?v=20260713-03');
      await loadRuntime('runtime-provider-current-container-bridge.js?v=20260714-01');
      await loadRuntime('runtime-current-poi-motion-guard.js?v=20260714-06');
    } catch {}

    try { await loadRuntime('runtime-coordinate-format-ui.js?v=20260712-09'); } catch {}
    try { await loadRuntime('runtime-debug-overture.js?v=20260713-01'); } catch {}
    try { await loadRuntime('runtime-dashboard-viewport.js?v=20260711-08'); } catch {}

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.WanderProviders?.container?.refresh?.(true);
        window.WanderProviders?.googleContainer?.apply?.();
        window.WanderProviders?.currentPOI?.detect?.();
        window.WanderProviders?.currentContainerBridge?.apply?.();
        window.WanderCurrentPOIMotionGuard?.enforce?.();
        window.WanderDashboardViewport?.mount?.();
        window.WanderContextDashboard?.restore?.();
        window.WanderSituationEngine?.evaluate?.();
        window.WanderAppReady = true;
        window.dispatchEvent(new CustomEvent('wander:app-ready', { detail: { at: Date.now() } }));
      });
    });
  });

  if ('serviceWorker' in navigator) {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloadingForUpdate = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloadingForUpdate) return;
      reloadingForUpdate = true;
      window.location.reload();
    });

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js?build=' + encodeURIComponent(APP_BUILD), { updateViaCache: 'none' }).then((registration) => {
        registration.update().catch(() => {});
        if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) worker.postMessage({ type: 'SKIP_WAITING' });
          });
        });
      }).catch(() => {});
    });
  }
})();
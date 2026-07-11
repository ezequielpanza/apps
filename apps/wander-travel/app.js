(() => {
  const APP_BUILD = 'v0.85.8';
  const MAP_RUNTIME_VERSION = '20260708-03';

  document.write('<script src="runtime-map-core.js?v=' + MAP_RUNTIME_VERSION + '"><\/script>');
  document.write('<script src="runtime-map-position.js?v=' + MAP_RUNTIME_VERSION + '"><\/script>');
  document.write('<script src="runtime-map-controls.js?v=' + MAP_RUNTIME_VERSION + '"><\/script>');
  document.write('<script src="runtime-map.js?v=' + MAP_RUNTIME_VERSION + '"><\/script>');

  function afterAppLayout() {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.WanderDashboardHost?.mount?.();
        window.WanderContextDashboard?.restore?.();
        window.WanderAppReady = true;
        window.dispatchEvent(new CustomEvent('wander:app-ready', {
          detail: { at: Date.now() },
        }));
      });
    });
  }

  window.addEventListener('load', () => {
    const hostScript = document.createElement('script');
    hostScript.src = 'runtime-dashboard-host.js?v=20260711-08';
    hostScript.async = false;
    hostScript.addEventListener('load', () => {
      const debugScript = document.createElement('script');
      debugScript.src = 'runtime-dashboard-debug.js?v=20260711-08';
      debugScript.async = false;
      debugScript.addEventListener('load', afterAppLayout, { once: true });
      document.body.appendChild(debugScript);
    }, { once: true });
    document.body.appendChild(hostScript);
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
      navigator.serviceWorker.register('./sw.js?build=' + encodeURIComponent(APP_BUILD), {
        updateViaCache: 'none',
      }).then((registration) => {
        registration.update().catch(() => {});

        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

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
    });
  }
})();

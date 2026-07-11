(() => {
  const APP_BUILD = 'v0.87.2';
  const MAP_RUNTIME_VERSION = '20260708-03';

  document.write('<script src="runtime-map-core.js?v=' + MAP_RUNTIME_VERSION + '"><\/script>');
  document.write('<script src="runtime-map-position.js?v=' + MAP_RUNTIME_VERSION + '"><\/script>');
  document.write('<script src="runtime-map-controls.js?v=' + MAP_RUNTIME_VERSION + '"><\/script>');
  document.write('<script src="runtime-map.js?v=' + MAP_RUNTIME_VERSION + '"><\/script>');

  async function checkPublishedVersion() {
    try {
      const response = await fetch('./version.json?check=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      if (payload?.version && payload.version !== APP_BUILD) {
        window.location.replace('./?app=' + encodeURIComponent(payload.version) + '&refresh=' + Date.now());
      }
    } catch {}
  }

  if ('serviceWorker' in navigator) {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloadingForUpdate = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloadingForUpdate) return;
      reloadingForUpdate = true;
      window.location.reload();
    });

    window.addEventListener('load', () => {
      checkPublishedVersion();
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
  } else {
    window.addEventListener('load', checkPublishedVersion);
  }
})();

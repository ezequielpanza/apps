(() => {
  const LOCATION_SOURCE_LABELS = Object.freeze({
    gps: 'GPS',
    geolocation: 'GPS',
    network: 'Red',
    fused: 'Combinada',
    passive: 'Pasiva',
    simulator: 'Simulador',
  });

  function locationQualitySnapshot() {
    const context = window.WanderContext;
    const accuracy = Number(context?.value?.('location.effective.accuracy'));
    const provider = String(context?.value?.('location.effective.provider') || context?.value?.('location.effective.source') || '').trim().toLowerCase();
    const permissionPrecision = String(context?.value?.('location.effective.permissionPrecision') || '').trim().toLowerCase();
    return {
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
      provider,
      permissionPrecision,
    };
  }

  function accuracyLabel(snapshot) {
    if (snapshot.accuracy === null) return '—';
    const rounded = snapshot.accuracy < 10 ? snapshot.accuracy.toFixed(1) : String(Math.round(snapshot.accuracy));
    if (snapshot.permissionPrecision === 'approximate') return '≈' + rounded + ' m · aproximada';
    if (snapshot.provider === 'network') return rounded + ' m · red';
    return rounded + ' m';
  }

  function renderLocationQualityNow() {
    const snapshot = locationQualitySnapshot();
    const accuracy = document.querySelector('#metric-accuracy');
    if (accuracy) {
      accuracy.textContent = accuracyLabel(snapshot);
      accuracy.title = snapshot.permissionPrecision === 'approximate'
        ? 'Android está entregando ubicación aproximada.'
        : snapshot.provider
          ? 'Proveedor: ' + (LOCATION_SOURCE_LABELS[snapshot.provider] || snapshot.provider)
          : '';
    }
    const source = document.querySelector('#metric-location-source');
    if (source && snapshot.provider) source.textContent = LOCATION_SOURCE_LABELS[snapshot.provider] || snapshot.provider;
  }

  function renderLocationQuality() {
    queueMicrotask(renderLocationQualityNow);
  }

  function ensureTravelLogStyles() {
    if (document.querySelector('link[data-wander-travel-log]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './wander-travel-log.css?v=20260719-01';
    link.dataset.wanderTravelLog = 'true';
    document.head.appendChild(link);
  }

  function ensureDirectionStyles() {
    if (document.querySelector('link[data-wander-direction-indicator]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './wander-direction-indicator.css?v=20260722-01';
    link.dataset.wanderDirectionIndicator = 'true';
    document.head.appendChild(link);
  }

  function loadScript(src, marker) {
    const existing = document.querySelector(`script[data-${marker}]`);
    if (existing) return existing.dataset.loaded === 'true'
      ? Promise.resolve()
      : new Promise((resolve) => existing.addEventListener('load', resolve, { once: true }));
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset[marker.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = 'true';
      script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve(); }, { once: true });
      script.addEventListener('error', reject, { once: true });
      document.head.appendChild(script);
    });
  }

  async function loadTravelMemory() {
    ensureTravelLogStyles();
    await loadScript('./runtime-travel-log.js?v=20260719-01', 'wander-travel-log');
    await loadScript('./runtime-travel-log-screen.js?v=20260719-01', 'wander-travel-log-screen');
    await loadScript('./runtime-morning-briefing.js?v=20260719-01', 'wander-morning-briefing');
  }

  async function loadDirectionIndicator() {
    ensureDirectionStyles();
    await loadScript('./runtime-direction-indicator.js?v=20260722-01', 'wander-direction-indicator');
    await loadScript('./runtime-direction-indicator-settings.js?v=20260722-01', 'wander-direction-indicator-settings');
  }

  async function loadNotificationRouting() {
    await loadScript('./runtime-notification-router.js?v=20260722-01', 'wander-notification-router');
  }

  async function loadMapCacheSettings() {
    await loadScript('./runtime-map-cache-settings.js?v=20260722-01', 'wander-map-cache-settings');
  }

  async function initialize() {
    try { await loadTravelMemory(); }
    catch (error) { console.warn('Wander travel memory could not be loaded', error); }
    try { await loadDirectionIndicator(); }
    catch (error) { console.warn('Wander direction indicator could not be loaded', error); }
    try { await loadNotificationRouting(); }
    catch (error) { console.warn('Wander notification routing could not be loaded', error); }
    try { await loadMapCacheSettings(); }
    catch (error) { console.warn('Wander map cache settings could not be loaded', error); }

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
    renderLocationQuality();
    window.WanderSituationEngine?.evaluate?.();
    window.WanderSessionEngine?.observe?.('app-ready');

    window.WanderAppReady = true;
    window.dispatchEvent(new CustomEvent('wander:app-ready', {
      detail: { at: Date.now(), version: window.WanderVersion },
    }));
  }

  window.WanderContext?.subscribe((key) => {
    if (key === 'location.effective' || key.startsWith('location.effective.')) renderLocationQuality();
  });
  window.addEventListener('wander:screen-change', renderLocationQuality);
  window.WanderLocationQualityUI = Object.freeze({ render: renderLocationQuality, snapshot: locationQualitySnapshot });

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

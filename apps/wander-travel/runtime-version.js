(() => {
  const VERSION = 'v0.92.9';
  document.title = 'Wander Travel ' + VERSION;
  const drawerVersion = document.querySelector('#drawer-version');
  if (drawerVersion) drawerVersion.textContent = VERSION;
  if (window.WanderContext) window.WanderContext.set('app.version', VERSION, { source: 'runtime-version', ttlMs: Infinity, confidence: 1 });
  window.WanderVersion = VERSION;

  function loadStyle(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScript(src) {
    if (document.querySelector('script[src="' + src + '"]')) return;
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    document.body.appendChild(script);
  }

  function loadWhenReady({ ready, loaded, src }) {
    let attempts = 0;
    function tryLoad() {
      if (loaded()) return;
      if (!ready()) {
        attempts += 1;
        if (attempts < 160) setTimeout(tryLoad, 250);
        return;
      }
      loadScript(src);
    }
    tryLoad();
  }

  function bootstrap() {
    loadStyle('wander-message-top.css?v=20260714-11');
    loadStyle('wander-record-button.css?v=20260714-12');
    loadStyle('wander-simulator-dashboard-offset.css?v=20260714-13');
    loadStyle('wander-message-actions.css?v=20260714-14');
    loadStyle('wander-personal-poi-sheet.css?v=20260714-17');
    loadStyle('wander-track-delete.css?v=20260714-19');
    loadStyle('wander-dashboard-visibility.css?v=20260714-20');
    loadStyle('wander-message-timeout-settings.css?v=20260714-22');
    loadStyle('wander-map-selected-point.css?v=20260715-08');
    loadStyle('wander-top-dashboard-search.css?v=20260715-15');
    loadScript('runtime-top-dashboard-search.js?v=20260715-10');
    loadWhenReady({ ready: () => Boolean(window.WanderSituationEngine?.subscribe), loaded: () => Boolean(window.WanderMovementMethodRefinement), src: 'runtime-movement-method-refinement.js?v=20260714-09' });
    loadWhenReady({ ready: () => Boolean(window.WanderBase?.map && window.WanderTracks && window.WanderMapControls), loaded: () => Boolean(window.WanderPersonalPOIs), src: 'runtime-personal-map-tools.js?v=20260715-07' });
    loadWhenReady({ ready: () => Boolean(window.WanderBase?.map && window.WanderPersonalPOIs?.list), loaded: () => Boolean(window.WanderMapSelectedPoint), src: 'runtime-map-selected-point.js?v=20260715-09' });
    loadWhenReady({ ready: () => Boolean(window.WanderPersonalPOIs?.get && document.querySelector('.map-stage')), loaded: () => Boolean(window.WanderPersonalPOISheet), src: 'runtime-personal-poi-sheet.js?v=20260714-17' });
    loadWhenReady({ ready: () => Boolean(window.WanderUI?.getMessageTimeoutMs && document.querySelector('#settings-panel')), loaded: () => Boolean(window.WanderMessageTimeoutSettings), src: 'runtime-message-timeout-settings.js?v=20260714-22' });
    loadWhenReady({ ready: () => Boolean(document.querySelector('#context-dashboard') && document.querySelector('.wander-app')), loaded: () => Boolean(window.WanderDashboardVisibilityGuard), src: 'runtime-dashboard-visibility-guard.js?v=20260715-07' });
    loadWhenReady({ ready: () => Boolean(document.querySelector('#context-dashboard') && document.querySelector('#simulation-map-controls')), loaded: () => Boolean(window.WanderSimulatorDashboardOffset), src: 'runtime-simulator-dashboard-offset.js?v=20260714-13' });
  }

  if (document.readyState === 'complete') bootstrap();
  else window.addEventListener('load', bootstrap, { once: true });
})();
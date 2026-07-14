(() => {
  const VERSION = 'v0.89.3';
  document.title = 'Wander Travel ' + VERSION;
  const drawerVersion = document.querySelector('#drawer-version');
  if (drawerVersion) drawerVersion.textContent = VERSION;
  if (window.WanderContext) {
    window.WanderContext.set('app.version', VERSION, { source: 'runtime-version', ttlMs: Infinity, confidence: 1 });
  }
  window.WanderVersion = VERSION;

  function loadWhenReady({ ready, loaded, src }) {
    let attempts = 0;
    function tryLoad() {
      if (loaded()) return;
      if (!ready()) {
        attempts += 1;
        if (attempts < 160) setTimeout(tryLoad, 250);
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      document.body.appendChild(script);
    }
    tryLoad();
  }

  function bootstrap() {
    loadWhenReady({
      ready: () => Boolean(window.WanderSituationEngine?.subscribe),
      loaded: () => Boolean(window.WanderMovementMethodRefinement),
      src: 'runtime-movement-method-refinement.js?v=20260714-09',
    });
    loadWhenReady({
      ready: () => Boolean(window.WanderBase?.map && window.WanderTracks && window.WanderMapControls),
      loaded: () => Boolean(window.WanderPersonalPOIs),
      src: 'runtime-personal-map-tools.js?v=20260714-10',
    });
  }

  if (document.readyState === 'complete') bootstrap();
  else window.addEventListener('load', bootstrap, { once: true });
})();
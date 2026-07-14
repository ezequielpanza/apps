(() => {
  const VERSION = 'v0.89.5';
  document.title = 'Wander Travel ' + VERSION;
  const drawerVersion = document.querySelector('#drawer-version');
  if (drawerVersion) drawerVersion.textContent = VERSION;
  if (window.WanderContext) {
    window.WanderContext.set('app.version', VERSION, { source: 'runtime-version', ttlMs: Infinity, confidence: 1 });
  }
  window.WanderVersion = VERSION;

  function loadStyle(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
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
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      document.body.appendChild(script);
    }
    tryLoad();
  }

  function bootstrap() {
    loadStyle('wander-message-top.css?v=20260714-11');
    loadStyle('wander-record-button.css?v=20260714-12');
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
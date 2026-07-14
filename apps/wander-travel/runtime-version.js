(() => {
  const VERSION = 'v0.89.2';
  document.title = 'Wander Travel ' + VERSION;
  const drawerVersion = document.querySelector('#drawer-version');
  if (drawerVersion) drawerVersion.textContent = VERSION;
  if (window.WanderContext) {
    window.WanderContext.set('app.version', VERSION, { source: 'runtime-version', ttlMs: Infinity, confidence: 1 });
  }
  window.WanderVersion = VERSION;

  let attempts = 0;
  function loadMovementMethodRefinement() {
    if (window.WanderMovementMethodRefinement) return;
    if (!window.WanderSituationEngine?.subscribe) {
      attempts += 1;
      if (attempts < 120) setTimeout(loadMovementMethodRefinement, 250);
      return;
    }
    const script = document.createElement('script');
    script.src = 'runtime-movement-method-refinement.js?v=20260714-09';
    script.async = false;
    document.body.appendChild(script);
  }
  if (document.readyState === 'complete') loadMovementMethodRefinement();
  else window.addEventListener('load', loadMovementMethodRefinement, { once: true });
})();
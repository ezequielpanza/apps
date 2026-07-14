(() => {
  let attempts = 0;

  function load() {
    if (window.WanderMovementMethodRefinement) return;
    if (!window.WanderSituationEngine?.subscribe) {
      attempts += 1;
      if (attempts < 120) setTimeout(load, 250);
      return;
    }
    const script = document.createElement('script');
    script.src = 'runtime-movement-method-refinement.js?v=20260714-09';
    script.async = false;
    document.body.appendChild(script);
  }

  if (document.readyState === 'complete') load();
  else window.addEventListener('load', load, { once: true });
})();
(() => {
  const VERSION = 'v0.71.1';
  document.title = 'Wander Travel ' + VERSION;
  const drawerVersion = document.querySelector('#drawer-version');
  if (drawerVersion) drawerVersion.textContent = VERSION;
  window.WanderContext?.set('app.version', VERSION, { source: 'runtime-version', ttlMs: Infinity, confidence: 1 });
  window.WanderVersion = VERSION;

  window.addEventListener('load', () => {
    if (window.WanderSimulator || document.querySelector('script[data-wander-simulator-provider]')) return;
    const script = document.createElement('script');
    script.src = 'runtime-simulator-context.js?v=20260706-04';
    script.dataset.wanderSimulatorProvider = 'true';
    document.body.appendChild(script);
  });
})();
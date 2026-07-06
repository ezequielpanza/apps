(() => {
  const VERSION = 'v0.75.0';
  document.title = 'Wander Travel ' + VERSION;
  const drawerVersion = document.querySelector('#drawer-version');
  if (drawerVersion) drawerVersion.textContent = VERSION;
  window.WanderContext?.set('app.version', VERSION, { source: 'runtime-version', ttlMs: Infinity, confidence: 1 });
  window.WanderVersion = VERSION;
})();

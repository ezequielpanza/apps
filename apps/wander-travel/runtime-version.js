(() => {
  const VERSION = 'v0.100.0';
  const globalScope = typeof window !== 'undefined' ? window : self;
  globalScope.WanderVersion = VERSION;

  if (typeof document === 'undefined') return;

  document.title = 'Wander Travel ' + VERSION;
  const drawerVersion = document.querySelector('#drawer-version');
  if (drawerVersion) drawerVersion.textContent = VERSION;
  window.WanderContext?.set?.('app.version', VERSION, {
    source: 'runtime-version',
    ttlMs: Infinity,
    confidence: 1,
  });
})();

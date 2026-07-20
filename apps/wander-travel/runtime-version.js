(() => {
  const VERSION = 'v0.106.1';
  const globalScope = typeof window !== 'undefined' ? window : self;
  globalScope.WanderVersion = VERSION;
  globalScope.WanderWebVersion = VERSION;

  if (typeof document === 'undefined') return;

  document.title = 'Wander Travel ' + VERSION;
  const drawerVersion = document.querySelector('#drawer-version');
  if (drawerVersion) drawerVersion.textContent = 'Web ' + VERSION;
  const metadata = {
    source: 'runtime-version',
    ttlMs: Infinity,
    confidence: 1,
  };
  window.WanderContext?.set?.('app.version', VERSION, metadata);
  window.WanderContext?.set?.('app.webVersion', VERSION, metadata);
})();

(() => {
  const version = 'v0.59.2';
  document.title = `Wander Travel ${version}`;
  const badge = document.querySelector('.app-version');
  if (badge) badge.textContent = version;

  function load(src, key) {
    if (document.querySelector('script[data-' + key + ']')) return;
    const script = document.createElement('script');
    script.src = src;
    script.dataset[key] = 'true';
    document.body.appendChild(script);
  }

  load('runtime-context.js?v=20260703-2', 'runtimeContext');
  load('runtime-ui.js?v=20260703-2', 'runtimeUi');
  load('runtime-panel.js?v=20260703-1', 'runtimePanel');
  load('runtime-context-panel.js?v=20260703-2', 'runtimeContextPanel');
  load('runtime-topbar.js?v=20260703-9', 'runtimeTopbar');
  load('runtime-tracks.js?v=20260703-2', 'runtimeTracks');
  load('runtime-simulator.js?v=20260703-2', 'runtimeSimulator');
})();

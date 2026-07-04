(() => {
  const version = 'v0.60.0';
  document.title = `Wander Travel ${version}`;

  function load(src, key) {
    if (document.querySelector('script[data-' + key + ']')) return;
    const script = document.createElement('script');
    script.src = src;
    script.dataset[key] = 'true';
    document.body.appendChild(script);
  }

  load('runtime-context.js?v=20260703-10', 'runtimeContext');
  load('runtime-ui.js?v=20260703-10', 'runtimeUi');
  load('runtime-panel.js?v=20260703-10', 'runtimePanel');
  load('runtime-context-panel.js?v=20260703-10', 'runtimeContextPanel');
  load('runtime-topbar.js?v=20260703-10', 'runtimeTopbar');
  load('runtime-tracks.js?v=20260703-10', 'runtimeTracks');
  load('runtime-simulator.js?v=20260703-10', 'runtimeSimulator');
})();

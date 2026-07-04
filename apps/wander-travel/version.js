(() => {
  const version = 'v0.60.1';
  document.title = `Wander Travel ${version}`;

  function load(src, key) {
    if (document.querySelector('script[data-' + key + ']')) return;
    const script = document.createElement('script');
    script.src = src;
    script.dataset[key] = 'true';
    document.body.appendChild(script);
  }

  load('runtime-context.js?v=20260703-11', 'runtimeContext');
  load('runtime-ui.js?v=20260703-11', 'runtimeUi');
  load('runtime-panel.js?v=20260703-11', 'runtimePanel');
  load('runtime-context-panel.js?v=20260703-11', 'runtimeContextPanel');
  load('runtime-topbar.js?v=20260703-11', 'runtimeTopbar');
  load('runtime-tracks.js?v=20260703-11', 'runtimeTracks');
  load('runtime-simulator.js?v=20260703-11', 'runtimeSimulator');
})();

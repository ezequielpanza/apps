(() => {
  const version = 'v0.60.3';
  document.title = `Wander Travel ${version}`;

  function load(src, key) {
    if (document.querySelector('script[data-' + key + ']')) return;
    const script = document.createElement('script');
    script.src = src;
    script.dataset[key] = 'true';
    document.body.appendChild(script);
  }

  load('runtime-context.js?v=20260704-13', 'runtimeContext');
  load('runtime-ui.js?v=20260704-13', 'runtimeUi');
  load('runtime-panel.js?v=20260704-13', 'runtimePanel');
  load('runtime-context-panel.js?v=20260704-13', 'runtimeContextPanel');
  load('runtime-topbar.js?v=20260704-13', 'runtimeTopbar');
  load('runtime-tracks.js?v=20260704-13', 'runtimeTracks');
  load('runtime-simulator.js?v=20260704-13', 'runtimeSimulator');
})();

(() => {
  const version = 'v0.61.0';
  document.title = 'Wander Travel ' + version;

  const files = [
    ['runtime-context.js?v=20260704-15', 'runtimeContext'],
    ['runtime-ui.js?v=20260704-15', 'runtimeUi'],
    ['runtime-panel.js?v=20260704-15', 'runtimePanel'],
    ['runtime-context-panel.js?v=20260704-15', 'runtimeContextPanel'],
    ['runtime-topbar.js?v=20260704-15', 'runtimeTopbar'],
    ['runtime-tracks.js?v=20260704-15', 'runtimeTracks'],
    ['runtime-simulator.js?v=20260704-15', 'runtimeSimulator'],
  ];

  files.forEach(([src, key]) => {
    if (document.querySelector('script[data-' + key + ']')) return;
    const script = document.createElement('script');
    script.src = src;
    script.dataset[key] = 'true';
    document.body.appendChild(script);
  });
})();

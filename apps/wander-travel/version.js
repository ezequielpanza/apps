(() => {
  const version = 'v0.60.4';
  document.title = 'Wander Travel ' + version;

  const files = [
    ['runtime-context.js?v=20260704-14', 'runtimeContext'],
    ['runtime-ui.js?v=20260704-14', 'runtimeUi'],
    ['runtime-panel.js?v=20260704-14', 'runtimePanel'],
    ['runtime-context-panel.js?v=20260704-14', 'runtimeContextPanel'],
    ['runtime-topbar.js?v=20260704-14', 'runtimeTopbar'],
    ['runtime-tracks.js?v=20260704-14', 'runtimeTracks'],
    ['runtime-simulator.js?v=20260704-14', 'runtimeSimulator'],
  ];

  files.forEach(([src, key]) => {
    if (document.querySelector('script[data-' + key + ']')) return;
    const script = document.createElement('script');
    script.src = src;
    script.dataset[key] = 'true';
    document.body.appendChild(script);
  });
})();

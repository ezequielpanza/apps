(() => {
  const version = 'v0.28.0';
  document.title = `Wander Travel ${version}`;
  const badge = document.querySelector('.app-version');
  if (badge) badge.textContent = version;

  if (!document.querySelector('link[data-movement-overlay-width-fix]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'movement-overlay-width-fix.css?v=20260625-3';
    link.dataset.movementOverlayWidthFix = 'true';
    document.head.appendChild(link);
  }

  const loadScript = (src, dataKey) => {
    if (document.querySelector(`script[data-${dataKey}]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.dataset[dataKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = 'true';
    document.body.appendChild(script);
  };

  loadScript('companion-actions.js?v=20260625-2', 'companion-actions');
  loadScript('navigation.js?v=20260625-3', 'navigation');
  loadScript('weather-context.js?v=20260625-1', 'weather-context');
  loadScript('topic-actions.js?v=20260625-1', 'topic-actions');
  loadScript('system-controls.js?v=20260625-3', 'system-controls');
  loadScript('poi-interactions.js?v=20260625-1', 'poi-interactions');
  loadScript('developer-city.js?v=20260625-1', 'developer-city');
  loadScript('human-route-context.js?v=20260625-2', 'human-route-context');
  loadScript('city-welcome.js?v=20260625-1', 'city-welcome');
})();

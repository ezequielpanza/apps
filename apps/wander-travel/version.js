(() => {
  const version = 'v0.40.0';
  document.title = `Wander Travel ${version}`;
  const badge = document.querySelector('.app-version');
  if (badge) badge.textContent = version;
  const loadScript = (src, dataKey) => {
    if (document.querySelector(`script[data-${dataKey}]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.dataset[dataKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = 'true';
    document.body.appendChild(script);
  };
  loadScript('welcome-first-guard.js?v=20260625-1', 'welcome-first-guard');
  loadScript('companion-actions.js?v=20260625-2', 'companion-actions');
  loadScript('navigation.js?v=20260625-3', 'navigation');
  loadScript('weather-context.js?v=20260625-1', 'weather-context');
  loadScript('topic-actions.js?v=20260625-1', 'topic-actions');
  loadScript('system-controls.js?v=20260625-3', 'system-controls');
  loadScript('poi-interactions.js?v=20260625-1', 'poi-interactions');
  loadScript('poi-click-resolver.js?v=20260625-1', 'poi-click-resolver');
  loadScript('unified-poi-internet-bridge.js?v=20260625-1', 'unified-poi-internet-bridge');
  loadScript('developer-city.js?v=20260625-1', 'developer-city');
  loadScript('human-route-context.js?v=20260625-2', 'human-route-context');
  loadScript('city-welcome.js?v=20260625-2', 'city-welcome');
  loadScript('clean-mobile-ui.js?v=20260625-4', 'clean-mobile-ui-latest');
  loadScript('orientation-route-fix.js?v=20260625-3', 'heading-track');
})();
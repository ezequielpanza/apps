(() => {
  const version = 'v0.16.0';
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

  if (!document.querySelector('script[data-companion-actions]')) {
    const script = document.createElement('script');
    script.src = 'companion-actions.js?v=20260625-1';
    script.dataset.companionActions = 'true';
    document.body.appendChild(script);
  }

  if (!document.querySelector('script[data-navigation]')) {
    const script = document.createElement('script');
    script.src = 'navigation.js?v=20260625-1';
    script.dataset.navigation = 'true';
    document.body.appendChild(script);
  }
})();

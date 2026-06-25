(() => {
  const version = 'v0.12.5';
  document.title = `Wander Travel ${version}`;
  const badge = document.querySelector('.app-version');
  if (badge) badge.textContent = version;

  if (!document.querySelector('link[data-movement-overlay-width-fix]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'movement-overlay-width-fix.css?v=20260625-2';
    link.dataset.movementOverlayWidthFix = 'true';
    document.head.appendChild(link);
  }
})();

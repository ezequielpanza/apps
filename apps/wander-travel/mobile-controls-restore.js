(() => {
  if (document.querySelector('link[data-mobile-controls-restore]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'mobile-controls-restore.css?v=20260625-1';
  link.dataset.mobileControlsRestore = 'true';
  document.head.appendChild(link);
})();
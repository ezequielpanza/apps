(() => {
  const version = 'v0.56.0';
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

  loadScript('wander-runtime.js?v=20260701-1', 'wander-runtime');
})();
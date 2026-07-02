(() => {
  const version = 'v0.57.0';
  document.title = `Wander Travel ${version}`;
  const badge = document.querySelector('.app-version');
  if (badge) badge.textContent = version;

  const script = document.createElement('script');
  script.src = 'wander-runtime.js?v=20260702-1';
  script.dataset.wanderRuntime = 'true';
  document.body.appendChild(script);
})();

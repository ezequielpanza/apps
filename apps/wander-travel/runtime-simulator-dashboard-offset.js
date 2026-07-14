(() => {
  const dashboard = document.querySelector('#context-dashboard');
  const controls = document.querySelector('#simulation-map-controls');
  if (!dashboard || !controls) return;

  function updateOffset() {
    if (controls.hidden) return;
    const dashboardRect = dashboard.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const dashboardVisible = dashboardRect.height > 0 && dashboardRect.bottom > 0 && dashboardRect.top < viewportHeight;
    const dashboardTop = dashboardVisible ? dashboardRect.top : viewportHeight;
    const gap = 12;
    const bottom = Math.max(72, viewportHeight - dashboardTop + gap);
    controls.style.setProperty('--simulator-dashboard-offset', bottom + 'px');
  }

  const observer = new ResizeObserver(updateOffset);
  observer.observe(dashboard);
  observer.observe(document.documentElement);

  const mutationObserver = new MutationObserver(updateOffset);
  mutationObserver.observe(dashboard, { attributes: true, childList: true, subtree: true });
  mutationObserver.observe(controls, { attributes: true });

  window.addEventListener('resize', updateOffset);
  window.addEventListener('orientationchange', updateOffset);
  window.addEventListener('wander:app-ready', updateOffset);
  window.addEventListener('wander:dashboard-restored', updateOffset);

  requestAnimationFrame(() => requestAnimationFrame(updateOffset));
  window.setInterval(updateOffset, 1000);

  window.WanderSimulatorDashboardOffset = Object.freeze({ update: updateOffset });
})();
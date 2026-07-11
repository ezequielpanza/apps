(() => {
  function mountDashboardToViewport() {
    const dashboard = document.querySelector('#context-dashboard');
    const app = document.querySelector('.wander-app');
    if (!dashboard || !app) return false;

    if (dashboard.parentElement !== app) app.appendChild(dashboard);

    dashboard.hidden = false;
    dashboard.removeAttribute('hidden');
    dashboard.setAttribute('aria-hidden', 'false');
    dashboard.dataset.dashboardViewportMounted = 'true';
    dashboard.style.setProperty('position', 'fixed', 'important');
    dashboard.style.setProperty('left', '12px', 'important');
    dashboard.style.setProperty('bottom', 'calc(12px + env(safe-area-inset-bottom, 0px))', 'important');
    dashboard.style.setProperty('z-index', '120', 'important');
    dashboard.style.setProperty('display', 'flex', 'important');
    dashboard.style.setProperty('visibility', 'visible', 'important');
    dashboard.style.setProperty('opacity', '1', 'important');
    dashboard.style.setProperty('transform', 'translateZ(0)', 'important');

    window.WanderContextDashboard?.restore?.();
    return true;
  }

  function afterLayout() {
    requestAnimationFrame(() => requestAnimationFrame(mountDashboardToViewport));
  }

  window.addEventListener('load', afterLayout);
  window.addEventListener('pageshow', afterLayout);
  window.addEventListener('focus', afterLayout);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') afterLayout();
  });
  window.addEventListener('wander:app-ready', afterLayout);

  afterLayout();
  window.WanderDashboardViewport = Object.freeze({ mount: mountDashboardToViewport });
})();

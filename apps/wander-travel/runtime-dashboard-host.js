(() => {
  function mountDashboardToAppRoot() {
    const app = document.querySelector('.wander-app');
    const dashboard = document.querySelector('#context-dashboard');
    if (!app || !dashboard) return false;

    if (dashboard.parentElement !== app) app.appendChild(dashboard);

    dashboard.hidden = false;
    dashboard.removeAttribute('hidden');
    dashboard.setAttribute('aria-hidden', 'false');

    const style = dashboard.style;
    style.setProperty('position', 'fixed', 'important');
    style.setProperty('left', '12px', 'important');
    style.setProperty('bottom', 'calc(12px + env(safe-area-inset-bottom, 0px))', 'important');
    style.setProperty('right', 'auto', 'important');
    style.setProperty('top', 'auto', 'important');
    style.setProperty('z-index', '160', 'important');
    style.setProperty('display', 'flex', 'important');
    style.setProperty('visibility', 'visible', 'important');
    style.setProperty('opacity', '1', 'important');
    style.setProperty('transform', 'translateZ(0)', 'important');
    style.setProperty('will-change', 'transform', 'important');

    window.WanderContextDashboard?.restore?.();
    return true;
  }

  function mountAfterLayout() {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        mountDashboardToAppRoot();
        window.dispatchEvent(new CustomEvent('wander:dashboard-hosted', {
          detail: { at: Date.now() },
        }));
      });
    });
  }

  window.addEventListener('load', mountAfterLayout);
  window.addEventListener('pageshow', mountAfterLayout);
  window.addEventListener('wander:app-ready', mountAfterLayout);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') mountAfterLayout();
  });

  mountAfterLayout();

  window.WanderDashboardHost = Object.freeze({
    mount: mountDashboardToAppRoot,
    mountAfterLayout,
  });
})();

(() => {
  function mountDashboardToHeader() {
    const dashboard = document.querySelector('#context-dashboard');
    const header = document.querySelector('#wander-top-query-bar');
    const search = header?.querySelector('.wander-search-pill');
    if (!dashboard || !header) return false;

    if (dashboard.parentElement !== header) header.insertBefore(dashboard, search || null);

    dashboard.classList.add('wander-dashboard-in-header');
    dashboard.hidden = false;
    dashboard.removeAttribute('hidden');
    dashboard.setAttribute('aria-hidden', 'false');
    dashboard.dataset.dashboardViewportMounted = 'header';

    for (const property of ['position','left','right','top','bottom','width','max-width','min-width','z-index','display','visibility','opacity','transform']) {
      dashboard.style.removeProperty(property);
    }

    window.WanderContextDashboard?.restore?.();
    return true;
  }

  function afterLayout() {
    requestAnimationFrame(() => requestAnimationFrame(mountDashboardToHeader));
  }

  window.addEventListener('load', afterLayout);
  window.addEventListener('pageshow', afterLayout);
  window.addEventListener('focus', afterLayout);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') afterLayout();
  });
  window.addEventListener('wander:app-ready', afterLayout);
  window.addEventListener('wander:dashboard-restored', afterLayout);

  afterLayout();
  window.WanderDashboardViewport = Object.freeze({ mount: mountDashboardToHeader });
})();
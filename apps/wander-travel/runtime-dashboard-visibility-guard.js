(() => {
  const app = document.querySelector('.wander-app');
  const header = document.querySelector('#wander-top-query-bar');
  if (!app || !header) return;

  let applying = false;

  function shouldShow() {
    return app.dataset.screen === 'map' && app.dataset.menu !== 'open';
  }

  function apply() {
    if (applying) return;
    const dashboard = document.querySelector('#context-dashboard');
    if (!dashboard) return;

    applying = true;
    header.classList.add('wander-top-status-bar');
    if (dashboard.parentElement !== header) {
      const search = header.querySelector('.wander-search-pill');
      header.insertBefore(dashboard, search || null);
    }

    const visible = shouldShow();
    dashboard.hidden = !visible;
    dashboard.setAttribute('aria-hidden', String(!visible));
    if (visible) {
      dashboard.style.removeProperty('display');
      dashboard.style.removeProperty('visibility');
      dashboard.style.removeProperty('pointer-events');
    } else {
      dashboard.style.setProperty('display', 'none', 'important');
      dashboard.style.setProperty('visibility', 'hidden', 'important');
      dashboard.style.setProperty('pointer-events', 'none', 'important');
    }
    applying = false;
  }

  const observer = new MutationObserver(() => requestAnimationFrame(apply));
  observer.observe(app, { attributes: true, attributeFilter: ['data-screen', 'data-menu'], childList: true, subtree: true });

  document.addEventListener('click', () => requestAnimationFrame(apply), true);
  document.addEventListener('pointerup', () => requestAnimationFrame(apply), true);
  window.addEventListener('wander:app-ready', apply);
  window.addEventListener('wander:dashboard-restored', apply);
  window.addEventListener('pageshow', apply);

  requestAnimationFrame(() => requestAnimationFrame(apply));

  window.WanderDashboardVisibilityGuard = Object.freeze({ apply });
})();
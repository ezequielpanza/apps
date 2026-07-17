(() => {
  const $ = (selector) => document.querySelector(selector);
  const app = $('.wander-app');
  const menu = $('#main-menu');
  const menuButton = $('#main-menu-button');
  const reloadAppButton = $('#reload-app-button') || $('.drawer-logo');
  const contextDashboard = $('#context-dashboard');

  function screens() {
    return Array.from(document.querySelectorAll('[data-app-screen]'));
  }

  function setDashboardVisibility() {
    if (!contextDashboard || !app) return;
    const mapVisible = app.dataset.screen === 'map';
    const drawerClosed = app.dataset.menu !== 'open';
    contextDashboard.hidden = !(mapVisible && drawerClosed);
  }

  function setActiveNavigation(screenName) {
    menu?.querySelectorAll('[data-screen-target]').forEach((button) => {
      const active = button.dataset.screenTarget === screenName;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function dispatchScreenEvent(name, from, to) {
    window.dispatchEvent(new CustomEvent(name, { detail: { from, to } }));
  }

  function closeTransientLayers(nextScreen) {
    window.WanderUI?.hideWander?.();
    if (nextScreen !== 'map') window.WanderMapSelectedPoint?.clear?.();
    if (window.WanderPersonalPOISheet?.isOpen?.()) window.WanderPersonalPOISheet.hide?.();
  }

  function openScreen(name) {
    const target = screens().find((screen) => screen.dataset.appScreen === name);
    const normalized = target ? name : 'map';
    const previous = app?.dataset.screen || 'map';

    dispatchScreenEvent('wander:screen-will-change', previous, normalized);
    closeTransientLayers(normalized);

    screens().forEach((screen) => {
      screen.hidden = screen.dataset.appScreen !== normalized;
    });

    if (app) app.dataset.screen = normalized;
    setActiveNavigation(normalized);
    setMenuOpen(false);
    setDashboardVisibility();

    if (normalized === 'map') {
      setTimeout(() => {
        window.WanderBase?.map?.invalidateSize();
        window.WanderContextDashboard?.restore?.();
        setDashboardVisibility();
      }, 80);
    }

    dispatchScreenEvent('wander:screen-change', previous, normalized);
  }

  function setMenuOpen(open) {
    if (!menu || !app) return;
    app.dataset.menu = open ? 'open' : 'closed';
    menu.hidden = false;
    menu.setAttribute('aria-hidden', String(!open));
    menuButton?.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('drawer-open', open);
    setDashboardVisibility();
  }

  function reloadApp(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const url = new URL(window.location.href);
    url.searchParams.set('reload', String(Date.now()));
    window.location.replace(url.toString());
  }

  if (reloadAppButton) {
    reloadAppButton.setAttribute('role', 'button');
    reloadAppButton.setAttribute('tabindex', '0');
    reloadAppButton.setAttribute('aria-label', 'Recargar Wander');
    reloadAppButton.addEventListener('click', reloadApp);
    reloadAppButton.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') reloadApp(event);
    });
  }

  menuButton?.addEventListener('click', () => setMenuOpen(app?.dataset.menu !== 'open'));
  contextDashboard?.addEventListener('click', () => openScreen('context'));

  menu?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-screen-target]');
    if (!button) return;
    openScreen(button.dataset.screenTarget);
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-screen]')) openScreen('map');
  });

  document.addEventListener('pointerdown', (event) => {
    if (app?.dataset.menu !== 'open') return;
    if (event.target.closest('#main-menu') || event.target.closest('#main-menu-button')) return;
    setMenuOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (window.WanderPersonalPOISheet?.isOpen?.()) {
      window.WanderPersonalPOISheet.hide?.();
      return;
    }
    if (app?.dataset.menu === 'open') {
      setMenuOpen(false);
      return;
    }
    if (app?.dataset.screen !== 'map') openScreen('map');
  });

  window.WanderScreen = {
    open: openScreen,
    current: () => app?.dataset.screen || 'map',
    openMenu: () => setMenuOpen(true),
    closeMenu: () => setMenuOpen(false),
  };

  if (app) {
    app.dataset.screen = 'map';
    app.dataset.menu = 'closed';
  }
  if (menu) {
    menu.hidden = false;
    menu.setAttribute('aria-hidden', 'true');
  }
  menuButton?.setAttribute('aria-expanded', 'false');
  openScreen('map');
})();

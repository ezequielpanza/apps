(() => {
  const $ = (selector) => document.querySelector(selector);
  const app = $('.wander-app');
  const side = $('#side-panel');
  const menu = $('#main-menu');
  const menuButton = $('#main-menu-button');

  function sections() {
    return {
      travel: $('#travel-panel'),
      context: $('#context-panel'),
      developer: $('#developer-panel'),
      settings: $('#settings-panel'),
    };
  }

  function isDesktop() {
    return window.matchMedia('(min-width: 821px)').matches;
  }

  function applyLayout(panelName) {
    if (!app || !side) return;
    const open = panelName !== 'none';

    side.hidden = !open;
    side.style.display = open ? '' : 'none';

    if (isDesktop()) {
      app.style.gridTemplateColumns = open ? 'minmax(0, 1fr) 420px' : 'minmax(0, 1fr)';
    } else {
      app.style.gridTemplateColumns = '';
    }

    setTimeout(() => window.WanderBase?.map?.invalidateSize(), 120);
  }

  function openPanel(name) {
    const available = sections();
    const normalized = available[name] ? name : 'none';

    if (app) app.dataset.panel = normalized;
    Object.entries(available).forEach(([key, section]) => {
      if (section) section.hidden = key !== normalized;
    });

    applyLayout(normalized);

    const labels = {
      travel: ['Travel', 'Panel Travel'],
      context: ['Contexto', 'WanderContext'],
      developer: ['Desarrollador', 'Simulador'],
      settings: ['Configuración', 'Ajustes'],
      none: ['Wander', 'Panel'],
    };
    const label = labels[normalized];
    if ($('#panel-kicker')) $('#panel-kicker').textContent = label[0];
    if ($('#panel-title')) $('#panel-title').textContent = label[1];
  }

  function setMenuOpen(open) {
    if (!menu || !app) return;
    app.dataset.menu = open ? 'open' : 'closed';
    menu.hidden = false;
    menu.setAttribute('aria-hidden', String(!open));
    menuButton?.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('drawer-open', open);
  }

  function toggleMenu() {
    setMenuOpen(app?.dataset.menu !== 'open');
  }

  menuButton?.addEventListener('click', toggleMenu);

  menu?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    setMenuOpen(false);

    if (action === 'open-travel') openPanel('travel');
    if (action === 'open-context') openPanel('context');
    if (action === 'open-developer' || action === 'open-simulator') openPanel('developer');
    if (action === 'open-settings') openPanel('settings');
    if (action === 'boat') {
      window.WanderUI?.showWander('⛵ Barco', 'El modo barco queda reservado para funciones náuticas. Wander Travel sigue enfocado en la experiencia de viaje.');
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (app?.dataset.menu !== 'open') return;
    if (event.target.closest('#main-menu') || event.target.closest('#main-menu-button')) return;
    setMenuOpen(false);
  });

  $('#close-panel')?.addEventListener('click', () => openPanel('none'));

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    setMenuOpen(false);
    openPanel('none');
  });

  window.addEventListener('resize', () => applyLayout(app?.dataset.panel || 'none'));

  window.WanderPanel = {
    open: openPanel,
    applyLayout,
    openMenu: () => setMenuOpen(true),
    closeMenu: () => setMenuOpen(false),
  };

  if (app) app.dataset.menu = 'closed';
  if (menu) {
    menu.hidden = false;
    menu.setAttribute('aria-hidden', 'true');
  }
  menuButton?.setAttribute('aria-expanded', 'false');
  openPanel('none');
})();

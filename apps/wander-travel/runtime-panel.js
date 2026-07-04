(() => {
  const $ = (selector) => document.querySelector(selector);
  const app = $('.wander-app');
  const side = $('#side-panel');

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

  function toggleMenu(open) {
    const menu = $('#main-menu');
    const button = $('#main-menu-button');
    if (!menu) return;
    menu.hidden = open == null ? !menu.hidden : !open;
    if (button) button.classList.toggle('is-active', !menu.hidden);
  }

  $('#settings-button')?.remove();

  $('#main-menu-button')?.addEventListener('click', () => toggleMenu());
  $('#main-menu')?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    toggleMenu(false);
    if (action === 'open-travel') openPanel('travel');
    if (action === 'open-context') openPanel('context');
    if (action === 'open-developer' || action === 'open-simulator') openPanel('developer');
    if (action === 'open-settings') openPanel('settings');
    if (action === 'boat') window.WanderUI?.showWander('⛵ Barco', 'El modo barco queda reservado para funciones náuticas. Wander Travel sigue enfocado en la experiencia de viaje.');
  });

  $('#close-panel')?.addEventListener('click', () => openPanel('none'));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      toggleMenu(false);
      openPanel('none');
    }
  });

  window.addEventListener('resize', () => applyLayout(app?.dataset.panel || 'none'));

  window.WanderPanel = { open: openPanel, applyLayout };
  openPanel('none');
})();

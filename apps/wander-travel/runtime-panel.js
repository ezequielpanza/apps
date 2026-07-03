(() => {
  const $ = (selector) => document.querySelector(selector);
  const app = $('.wander-app');
  const side = $('#side-panel');
  const sections = {
    travel: $('#travel-panel'),
    developer: $('#developer-panel'),
    settings: $('#settings-panel'),
  };

  function openPanel(name) {
    const normalized = sections[name] ? name : 'none';
    if (app) app.dataset.panel = normalized;
    Object.entries(sections).forEach(([key, section]) => {
      if (section) section.hidden = key !== normalized;
    });
    if (side) side.hidden = normalized === 'none';

    const labels = {
      travel: ['Travel', 'Panel Travel'],
      developer: ['Desarrollador', 'Simulador'],
      settings: ['Configuración', 'Ajustes'],
      none: ['Wander', 'Panel'],
    };
    const label = labels[normalized];
    $('#panel-kicker') && ($('#panel-kicker').textContent = label[0]);
    $('#panel-title') && ($('#panel-title').textContent = label[1]);

    if (window.WanderBase?.map) setTimeout(() => window.WanderBase.map.invalidateSize(), 120);
  }

  function toggleMenu(open) {
    const menu = $('#main-menu');
    const button = $('#main-menu-button');
    if (!menu) return;
    menu.hidden = open == null ? !menu.hidden : !open;
    if (button) button.classList.toggle('is-active', !menu.hidden);
  }

  $('#main-menu-button')?.addEventListener('click', () => toggleMenu());
  $('#main-menu')?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    toggleMenu(false);
    if (action === 'open-travel') openPanel('travel');
    if (action === 'open-developer' || action === 'open-simulator') openPanel('developer');
    if (action === 'open-settings') openPanel('settings');
    if (action === 'boat') window.WanderUI?.showWander('⛵ Barco', 'El modo barco queda reservado para funciones náuticas. Wander Travel sigue enfocado en la experiencia de viaje.');
  });

  $('#settings-button')?.addEventListener('click', () => openPanel('settings'));
  $('#close-panel')?.addEventListener('click', () => openPanel('none'));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      toggleMenu(false);
      openPanel('none');
    }
  });

  window.WanderPanel = { open: openPanel };
  openPanel('none');
})();

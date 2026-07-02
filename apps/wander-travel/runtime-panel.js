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
    if (app) app.dataset.panel = name;
    Object.entries(sections).forEach(([key, section]) => {
      if (section) section.hidden = key !== name;
    });
    if (side) side.hidden = name === 'none';
    const labels = {
      travel: ['Travel', 'Panel Travel'],
      developer: ['Desarrollador', 'Simulador'],
      settings: ['Configuración', 'Ajustes'],
      none: ['Wander', 'Panel'],
    };
    const label = labels[name] || labels.none;
    const kicker = $('#panel-kicker');
    const title = $('#panel-title');
    if (kicker) kicker.textContent = label[0];
    if (title) title.textContent = label[1];
    if (window.map) setTimeout(() => window.map.invalidateSize(), 120);
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
    if (action === 'boat') window.WanderUI?.showWander('Wander Boat', 'Boat queda reservado para funciones náuticas. Travel sigue activo.');
  });
  $('#settings-button')?.addEventListener('click', () => openPanel('settings'));
  $('#close-panel')?.addEventListener('click', () => openPanel('none'));
  window.WanderPanel = { open: openPanel };
  openPanel('none');
})();

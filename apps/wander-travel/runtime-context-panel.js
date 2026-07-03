(() => {
  const $ = (selector) => document.querySelector(selector);

  function ensureContextMenuButton() {
    const menu = $('#main-menu');
    if (!menu || menu.querySelector('[data-action="open-context"]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = 'open-context';
    button.innerHTML = '<span>🧠</span> Contexto';
    const boat = menu.querySelector('[data-action="boat"]');
    menu.insertBefore(button, boat || menu.firstChild);
  }

  function ensureContextPanel() {
    const side = $('#side-panel');
    if (!side || $('#context-panel')) return;
    const section = document.createElement('section');
    section.id = 'context-panel';
    section.className = 'panel-section';
    section.hidden = true;
    section.innerHTML = [
      '<h3>🧠 Contexto vigente</h3>',
      '<p class="panel-note">Memoria operativa que Wander usa como referencia. Algunas variables cambian seguido; otras quedan estables hasta que cambie el viaje.</p>',
      '<div class="button-row"><button id="refresh-context-button" type="button">🔄 Actualizar</button></div>',
      '<div id="context-list" class="context-list"></div>'
    ].join('');
    const developer = $('#developer-panel');
    side.insertBefore(section, developer || side.lastChild);
  }

  function hideKnownSections() {
    ['#travel-panel', '#developer-panel', '#settings-panel', '#context-panel'].forEach((selector) => {
      const section = $(selector);
      if (section) section.hidden = true;
    });
  }

  function openContextPanel() {
    ensureContextPanel();
    const app = $('.wander-app');
    const side = $('#side-panel');
    hideKnownSections();
    const section = $('#context-panel');
    if (section) section.hidden = false;
    if (side) side.hidden = false;
    if (app) app.dataset.panel = 'context';
    $('#panel-kicker') && ($('#panel-kicker').textContent = 'Contexto');
    $('#panel-title') && ($('#panel-title').textContent = 'WanderContext');
    window.WanderContext?.render();
  }

  function closeMenu() {
    const menu = $('#main-menu');
    const button = $('#main-menu-button');
    if (menu) menu.hidden = true;
    if (button) button.classList.remove('is-active');
  }

  function syncSummary() {
    const time = window.WanderContext?.value('time.now');
    const period = window.WanderContext?.value('time.dayPeriod');
    const next = window.WanderContext?.value('user.intent');
    if (time) window.WanderUI?.setText('#context-time', time);
    if (period) window.WanderUI?.setText('#context-period', period);
    if (next) window.WanderUI?.setText('#context-next', next);
  }

  function bind() {
    ensureContextMenuButton();
    ensureContextPanel();

    $('#main-menu')?.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action !== 'open-context') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeMenu();
      openContextPanel();
    }, true);

    document.addEventListener('click', (event) => {
      if (event.target.closest('#refresh-context-button')) {
        window.WanderContext?.updateTime();
        window.WanderContext?.render();
        syncSummary();
      }
    });

    window.WanderContext?.subscribe(syncSummary);
    syncSummary();
    window.WanderContext?.render();
    window.WanderContextPanel = { open: openContextPanel, syncSummary };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();

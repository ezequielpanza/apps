(() => {
  function openCompanion(titleText, messageText) {
    const panel = document.querySelector('.companion-panel');
    const title = document.querySelector('#wander-title');
    const message = document.querySelector('#wander-message');
    if (!panel || !title || !message) return;
    title.textContent = titleText;
    message.textContent = messageText;
    panel.classList.remove('is-hidden');
  }

  function closeMenu() {
    document.querySelector('#wander-clean-menu')?.classList.remove('is-open');
    document.querySelector('.clean-menu-backdrop')?.classList.remove('is-open');
  }

  function openTripPanelAsContext() {
    closeMenu();
    document.querySelector('#show-panel')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    window.setTimeout(labelContextPanel, 0);
    window.setTimeout(labelContextPanel, 250);
  }

  function tellTravelMission() {
    closeMenu();
    window.WanderContextEngine?.setTravel?.();
    openCompanion('Wander Travel', 'Travel queda como misión activa para deambular, descubrir y conocer ciudades o pueblos. Contexto queda separado porque aplica a todo Wander.');
  }

  function labelContextPanel() {
    const tripTitle = document.querySelector('.control-panel .control-section:first-child .section-title h2');
    if (tripTitle && /viaje/i.test(tripTitle.textContent)) tripTitle.textContent = 'Contexto actual';

    document.querySelectorAll('.control-panel h2').forEach((heading) => {
      if (/^Contexto$/i.test(heading.textContent.trim())) heading.textContent = 'Señales de contexto';
    });
  }

  function rebuildMenu() {
    const menu = document.querySelector('#wander-clean-menu');
    if (!menu) return;

    menu.querySelectorAll('[data-open-panel="guide"],[data-open-panel="settings"]').forEach((button) => button.remove());

    const trip = menu.querySelector('[data-open-panel="trip"]');
    if (trip) {
      trip.textContent = 'Contexto';
      trip.dataset.openPanel = 'context';
      if (!trip.dataset.contextBound) {
        trip.dataset.contextBound = 'true';
        trip.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          openTripPanelAsContext();
        }, true);
      }
    }

    let travel = menu.querySelector('[data-wander-mode="travel"]');
    if (!travel) {
      travel = document.createElement('button');
      travel.type = 'button';
      travel.dataset.wanderMode = 'travel';
      travel.textContent = 'Travel';
      travel.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        tellTravelMission();
      });
    }

    const first = menu.firstElementChild;
    if (first !== travel) menu.insertBefore(travel, first || null);
  }

  const style = document.createElement('style');
  style.textContent = `
    #wander-clean-menu [data-wander-mode="travel"]{
      background:#eaf4f1!important;
      color:#173f3b!important;
    }
  `;
  document.head.appendChild(style);

  rebuildMenu();
  labelContextPanel();
  window.setInterval(() => {
    rebuildMenu();
    labelContextPanel();
  }, 700);
})();
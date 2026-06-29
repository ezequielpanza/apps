(() => {
  function tellBoatPending() {
    window.WanderContextEngine?.noteBoatPlaceholder?.();
    const panel = document.querySelector('.companion-panel');
    const title = document.querySelector('#wander-title');
    const message = document.querySelector('#wander-message');
    if (!panel || !title || !message) return;
    title.textContent = 'Wander Boat';
    message.textContent = 'Boat queda reservado para la vida a bordo, fondeos, autonomía, energía, agua, combustible y POIs náuticos. Todavía está desactivado hasta que escribamos sus funciones.';
    panel.classList.remove('is-hidden');
  }

  function rebuildMenu() {
    const menu = document.querySelector('#wander-clean-menu');
    if (!menu) return;

    const trip = menu.querySelector('[data-open-panel="trip"]');
    if (trip) trip.textContent = 'Travel';

    menu.querySelectorAll('[data-open-panel="guide"],[data-open-panel="settings"]').forEach((button) => button.remove());

    let boat = menu.querySelector('[data-wander-mode="boat"]');
    if (!boat) {
      boat = document.createElement('button');
      boat.type = 'button';
      boat.dataset.wanderMode = 'boat';
      boat.className = 'wander-mode-disabled';
      boat.innerHTML = '<span>Boat</span><small>Próximamente</small>';
      boat.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        document.querySelector('#wander-clean-menu')?.classList.remove('is-open');
        document.querySelector('.clean-menu-backdrop')?.classList.remove('is-open');
        tellBoatPending();
      });
    }

    const developer = menu.querySelector('[data-open-panel="developer"]');
    if (developer && boat.nextElementSibling !== developer) {
      menu.insertBefore(boat, developer);
    } else if (!developer && !boat.parentElement) {
      menu.appendChild(boat);
    }
  }

  const style = document.createElement('style');
  style.textContent = `
    #wander-clean-menu .wander-mode-disabled{
      opacity:.62!important;
      cursor:not-allowed!important;
      display:flex!important;
      align-items:center!important;
      justify-content:space-between!important;
      gap:12px!important;
    }
    #wander-clean-menu .wander-mode-disabled small{
      font-size:11px!important;
      font-weight:800!important;
      color:#6f7f7b!important;
      text-transform:uppercase!important;
      letter-spacing:.04em!important;
    }
  `;
  document.head.appendChild(style);

  rebuildMenu();
  window.setInterval(rebuildMenu, 500);
})();
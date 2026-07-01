(() => {
  if (window.__wanderSimulatorMainMenu) return;
  window.__wanderSimulatorMainMenu = true;

  function closeMenu() {
    document.querySelector('#wander-clean-menu')?.classList.remove('is-open');
    document.querySelector('.clean-menu-backdrop')?.classList.remove('is-open');
  }

  function closePanels() {
    document.querySelector('.app-shell')?.classList.add('panel-collapsed');
    document.body.classList.remove('dev-panel-open');
    document.querySelector('#developer-panel')?.classList.add('dev-collapsed');
  }

  function showOverlay() {
    closePanels();
    const overlay = document.querySelector('#movement-simulator-overlay');
    if (overlay) overlay.classList.remove('is-hidden');
    const toggle = document.querySelector('#toggle-movement-overlay');
    if (toggle) toggle.checked = true;
    localStorage.setItem('wander-travel-simulator-overlay-visible', 'true');
  }

  function showTravel() {
    closePanels();
    document.querySelector('.app-shell')?.classList.remove('panel-collapsed');
  }

  function showDeveloper() {
    closePanels();
    document.body.classList.add('dev-panel-open');
    document.querySelector('#developer-panel')?.classList.remove('dev-collapsed');
  }

  function showBoat() {
    closePanels();
    window.WanderContextEngine?.noteBoatPlaceholder?.();
    const panel = document.querySelector('.companion-panel');
    const title = document.querySelector('#wander-title');
    const message = document.querySelector('#wander-message');
    if (title) title.textContent = 'Wander Boat';
    if (message) message.textContent = 'Boat queda reservado para funciones náuticas. Por ahora Travel sigue activo.';
    panel?.classList.remove('is-hidden');
  }

  function ensureMenu() {
    const menu = document.querySelector('#wander-clean-menu');
    if (!menu) return;
    const wanted = ['travel', 'boat', 'developer', 'simulator'];
    const current = [...menu.querySelectorAll('button')].map((button) => button.dataset.mainMenu).filter(Boolean);
    if (wanted.every((item, index) => current[index] === item) && current.length === wanted.length) return;
    menu.innerHTML = `
      <button type="button" data-main-menu="travel">Travel</button>
      <button type="button" data-main-menu="boat">Barco</button>
      <button type="button" data-main-menu="developer">Desarrollador</button>
      <button type="button" data-main-menu="simulator">Simulador</button>
    `;
    menu.querySelector('[data-main-menu="travel"]')?.addEventListener('click', () => { closeMenu(); showTravel(); });
    menu.querySelector('[data-main-menu="boat"]')?.addEventListener('click', () => { closeMenu(); showBoat(); });
    menu.querySelector('[data-main-menu="developer"]')?.addEventListener('click', () => { closeMenu(); showDeveloper(); });
    menu.querySelector('[data-main-menu="simulator"]')?.addEventListener('click', () => { closeMenu(); showOverlay(); });
  }

  ensureMenu();
  window.setInterval(ensureMenu, 700);
})();
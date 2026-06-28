(() => {
  function ensureGear() {
    if (document.querySelector('#wander-settings-gear')) return;
    const tools = document.querySelector('.map-tools');
    if (!tools) return;
    const gear = document.createElement('button');
    gear.id = 'wander-settings-gear';
    gear.type = 'button';
    gear.className = 'clean-menu-button settings-gear-button';
    gear.setAttribute('aria-label', 'Configuración');
    gear.title = 'Configuración';
    gear.textContent = '⚙️';
    tools.appendChild(gear);
    gear.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      document.querySelector('#wander-clean-menu')?.classList.remove('is-open');
      document.querySelector('.clean-menu-backdrop')?.classList.remove('is-open');
      document.querySelector('#show-settings-panel')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  }

  function trimMainMenu() {
    document.querySelectorAll('#wander-clean-menu [data-open-panel="settings"]').forEach((button) => button.remove());
  }

  const style = document.createElement('style');
  style.textContent = `
    body.wander-clean-ui #wander-settings-gear{
      font-size:24px!important;
      line-height:1!important;
    }
    body.wander-clean-ui #wander-settings-gear svg{
      display:none!important;
    }
    @media(max-width:820px){
      body.wander-clean-ui #wander-settings-gear{
        width:50px!important;
        height:50px!important;
      }
    }
  `;
  document.head.appendChild(style);

  ensureGear();
  trimMainMenu();
  window.setInterval(() => {
    ensureGear();
    trimMainMenu();
  }, 500);
})();
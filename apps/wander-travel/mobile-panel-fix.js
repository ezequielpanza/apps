(() => {
  const OPEN_MARGIN = '22px';
  const CLOSED_OFFSET = 'calc(100% + 120px)';
  const WANDER_TAB_BOTTOM = 'calc(env(safe-area-inset-bottom,0px) + 96px)';
  const WANDER_PANEL_BOTTOM = 'calc(env(safe-area-inset-bottom,0px) + 158px)';

  const style = document.createElement('style');
  style.textContent = `
    @media(max-width:820px){
      body.wander-clean-ui .map-tools{
        top:24px!important;
        right:26px!important;
        gap:12px!important;
      }
      body.wander-clean-ui .clean-menu{
        right:26px!important;
        top:92px!important;
      }
      body.wander-clean-ui .companion-tab{
        bottom:${WANDER_TAB_BOTTOM}!important;
        left:50%!important;
        transform:translateX(-50%)!important;
        z-index:1550!important;
      }
      body.wander-clean-ui .companion-panel{
        bottom:${WANDER_PANEL_BOTTOM}!important;
        width:calc(100vw - 44px)!important;
        max-height:calc(100dvh - 220px)!important;
        overflow-y:auto!important;
        z-index:1500!important;
      }
      body.wander-clean-ui .control-panel,
      body.wander-clean-ui #guide-panel,
      body.wander-clean-ui #developer-panel,
      body.wander-clean-ui #settings-panel{
        position:fixed!important;
        top:${OPEN_MARGIN}!important;
        right:${OPEN_MARGIN}!important;
        bottom:${OPEN_MARGIN}!important;
        left:auto!important;
        width:min(380px,calc(100vw - 44px))!important;
        height:auto!important;
        max-height:calc(100dvh - 44px)!important;
        overflow-y:auto!important;
        overscroll-behavior:contain!important;
        border-radius:24px!important;
        background:#fff!important;
        z-index:1700!important;
        box-shadow:0 24px 70px rgba(20,35,55,.28)!important;
      }
      body.wander-clean-ui .settings-title,
      body.wander-clean-ui .section-title{
        position:sticky!important;
        top:0!important;
        background:#fff!important;
        z-index:2!important;
        padding-top:4px!important;
      }
    }
  `;
  document.head.appendChild(style);

  function setImportant(element, property, value) {
    element?.style?.setProperty(property, value, 'important');
  }

  function isOpen(key) {
    if (key === 'trip') return !document.querySelector('.app-shell')?.classList.contains('panel-collapsed');
    if (key === 'guide') return document.body.classList.contains('guide-panel-open') && !document.querySelector('#guide-panel')?.classList.contains('guide-collapsed');
    if (key === 'developer') return document.body.classList.contains('dev-panel-open') && !document.querySelector('#developer-panel')?.classList.contains('dev-collapsed');
    if (key === 'settings') return document.body.classList.contains('settings-panel-open') && !document.querySelector('#settings-panel')?.classList.contains('settings-collapsed');
    return false;
  }

  function forcePanelState(key, selector) {
    const panel = document.querySelector(selector);
    if (!panel) return;
    setImportant(panel, 'top', OPEN_MARGIN);
    setImportant(panel, 'right', OPEN_MARGIN);
    setImportant(panel, 'bottom', OPEN_MARGIN);
    setImportant(panel, 'height', 'auto');
    setImportant(panel, 'max-height', 'calc(100dvh - 44px)');
    setImportant(panel, 'width', 'min(380px, calc(100vw - 44px))');
    setImportant(panel, 'z-index', '1700');
    setImportant(panel, 'border-radius', '24px');

    if (isOpen(key)) {
      setImportant(panel, 'transform', 'translateX(0)');
      setImportant(panel, 'opacity', '1');
      setImportant(panel, 'pointer-events', 'auto');
      setImportant(panel, 'display', key === 'trip' ? 'flex' : 'block');
    } else {
      setImportant(panel, 'transform', `translateX(${CLOSED_OFFSET})`);
      setImportant(panel, 'opacity', '0');
      setImportant(panel, 'pointer-events', 'none');
    }
  }

  function fixPanels() {
    if (!matchMedia('(max-width: 820px)').matches) return;

    document.querySelectorAll('.map-tools').forEach((tools) => {
      setImportant(tools, 'right', '26px');
      setImportant(tools, 'top', '24px');
    });

    const cleanMenu = document.querySelector('.clean-menu');
    if (cleanMenu) {
      setImportant(cleanMenu, 'right', '26px');
      setImportant(cleanMenu, 'top', '92px');
    }

    const companionTab = document.querySelector('.companion-tab');
    if (companionTab) {
      setImportant(companionTab, 'bottom', WANDER_TAB_BOTTOM);
      setImportant(companionTab, 'left', '50%');
      setImportant(companionTab, 'transform', 'translateX(-50%)');
      setImportant(companionTab, 'z-index', '1550');
    }

    const companionPanel = document.querySelector('.companion-panel');
    if (companionPanel) {
      setImportant(companionPanel, 'bottom', WANDER_PANEL_BOTTOM);
      setImportant(companionPanel, 'width', 'calc(100vw - 44px)');
      setImportant(companionPanel, 'max-height', 'calc(100dvh - 220px)');
      setImportant(companionPanel, 'overflow-y', 'auto');
      setImportant(companionPanel, 'z-index', '1500');
    }

    forcePanelState('trip', '.control-panel');
    forcePanelState('guide', '#guide-panel');
    forcePanelState('developer', '#developer-panel');
    forcePanelState('settings', '#settings-panel');
  }

  ['click', 'touchend'].forEach((eventName) => {
    document.addEventListener(eventName, () => {
      requestAnimationFrame(() => requestAnimationFrame(fixPanels));
    }, true);
  });

  fixPanels();
  window.addEventListener('resize', fixPanels);
  window.setInterval(fixPanels, 300);
})();

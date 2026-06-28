(() => {
  const OPEN_MARGIN = '22px';
  const CLOSED_OFFSET = 'calc(100% + 96px)';

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
        bottom:calc(env(safe-area-inset-bottom,0px) + 44px)!important;
        left:50%!important;
        transform:translateX(-50%)!important;
      }
      body.wander-clean-ui .companion-panel{
        bottom:calc(env(safe-area-inset-bottom,0px) + 104px)!important;
        width:calc(100vw - 44px)!important;
        max-height:calc(100dvh - 170px)!important;
        overflow-y:auto!important;
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
        z-index:1600!important;
        box-shadow:0 24px 70px rgba(20,35,55,.28)!important;
      }
      body.wander-clean-ui .panel-collapsed .control-panel,
      body.wander-clean-ui #guide-panel.guide-collapsed,
      body.wander-clean-ui #developer-panel.dev-collapsed,
      body.wander-clean-ui #settings-panel.settings-collapsed{
        transform:translateX(${CLOSED_OFFSET})!important;
        pointer-events:none!important;
        opacity:0!important;
      }
      body.wander-clean-ui.guide-panel-open #guide-panel,
      body.wander-clean-ui.settings-panel-open #settings-panel,
      body.wander-clean-ui.dev-panel-open #developer-panel,
      body.wander-clean-ui .app-shell:not(.panel-collapsed) .control-panel{
        transform:translateX(0)!important;
        pointer-events:auto!important;
        opacity:1!important;
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

  function fixPanels() {
    if (!matchMedia('(max-width: 820px)').matches) return;

    document.querySelectorAll('.map-tools').forEach((tools) => {
      tools.style.setProperty('right', '26px', 'important');
      tools.style.setProperty('top', '24px', 'important');
    });

    const companionTab = document.querySelector('.companion-tab');
    if (companionTab) {
      companionTab.style.setProperty('bottom', 'calc(env(safe-area-inset-bottom, 0px) + 44px)', 'important');
    }

    const companionPanel = document.querySelector('.companion-panel');
    if (companionPanel) {
      companionPanel.style.setProperty('bottom', 'calc(env(safe-area-inset-bottom, 0px) + 104px)', 'important');
      companionPanel.style.setProperty('width', 'calc(100vw - 44px)', 'important');
      companionPanel.style.setProperty('max-height', 'calc(100dvh - 170px)', 'important');
      companionPanel.style.setProperty('overflow-y', 'auto', 'important');
    }

    ['.control-panel', '#guide-panel', '#developer-panel', '#settings-panel'].forEach((selector) => {
      const panel = document.querySelector(selector);
      if (!panel) return;
      panel.style.setProperty('top', OPEN_MARGIN, 'important');
      panel.style.setProperty('right', OPEN_MARGIN, 'important');
      panel.style.setProperty('bottom', OPEN_MARGIN, 'important');
      panel.style.setProperty('height', 'auto', 'important');
      panel.style.setProperty('max-height', 'calc(100dvh - 44px)', 'important');
      panel.style.setProperty('width', 'min(380px, calc(100vw - 44px))', 'important');
      panel.style.setProperty('z-index', '1600', 'important');
      panel.style.setProperty('border-radius', '24px', 'important');
    });

    const collapsedSelectors = [
      '.panel-collapsed .control-panel',
      '#guide-panel.guide-collapsed',
      '#developer-panel.dev-collapsed',
      '#settings-panel.settings-collapsed',
    ];
    collapsedSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((panel) => {
        panel.style.setProperty('transform', `translateX(${CLOSED_OFFSET})`, 'important');
        panel.style.setProperty('opacity', '0', 'important');
        panel.style.setProperty('pointer-events', 'none', 'important');
      });
    });
  }

  fixPanels();
  window.addEventListener('resize', fixPanels);
  window.setInterval(fixPanels, 500);
})();

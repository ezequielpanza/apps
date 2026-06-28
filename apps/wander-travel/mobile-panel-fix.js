(() => {
  const style = document.createElement('style');
  style.textContent = `
    @media(max-width:820px){
      body.wander-clean-ui .control-panel,
      body.wander-clean-ui #guide-panel,
      body.wander-clean-ui #developer-panel,
      body.wander-clean-ui #settings-panel{
        position:fixed!important;
        top:12px!important;
        right:12px!important;
        bottom:12px!important;
        left:auto!important;
        width:min(380px,calc(100vw - 24px))!important;
        height:auto!important;
        max-height:calc(100dvh - 24px)!important;
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
        transform:translateX(calc(100% + 24px))!important;
      }
      body.wander-clean-ui.guide-panel-open #guide-panel,
      body.wander-clean-ui.settings-panel-open #settings-panel,
      body.wander-clean-ui.dev-panel-open #developer-panel,
      body.wander-clean-ui .app-shell:not(.panel-collapsed) .control-panel{
        transform:translateX(0)!important;
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
    ['.control-panel', '#guide-panel', '#developer-panel', '#settings-panel'].forEach((selector) => {
      const panel = document.querySelector(selector);
      if (!panel) return;
      panel.style.setProperty('top', '12px', 'important');
      panel.style.setProperty('right', '12px', 'important');
      panel.style.setProperty('bottom', '12px', 'important');
      panel.style.setProperty('height', 'auto', 'important');
      panel.style.setProperty('max-height', 'calc(100dvh - 24px)', 'important');
      panel.style.setProperty('width', 'min(380px, calc(100vw - 24px))', 'important');
      panel.style.setProperty('z-index', '1600', 'important');
      panel.style.setProperty('border-radius', '24px', 'important');
    });
  }

  fixPanels();
  window.addEventListener('resize', fixPanels);
  window.setInterval(fixPanels, 700);
})();

(() => {
  function paintButtons() {
    const locate = document.querySelector('#locate-button');
    if (locate) {
      locate.setAttribute('aria-label', 'Brújula y ubicación');
      locate.title = 'Brújula';
      if (!locate.querySelector('svg')) {
        locate.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/><circle cx="12" cy="12" r="2.5"/></svg>';
      }
    }

    const track = document.querySelector('#track-route-button');
    if (track) {
      track.setAttribute('aria-label', 'Grabar recorrido');
      track.title = 'Grabar recorrido';
      track.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="record-dot" cx="12" cy="12" r="6"/><circle class="record-ring" cx="12" cy="12" r="10"/></svg>';
    }
  }

  function centerStatusRail() {
    const rail = document.querySelector('.status-rail');
    if (!rail) return;
    rail.setAttribute('data-centered', 'true');
  }

  const style = document.createElement('style');
  style.textContent = `
    body.wander-clean-ui #locate-button,
    body.wander-clean-ui #track-route-button,
    body.wander-clean-ui #wander-settings-gear,
    body.wander-clean-ui #wander-clean-menu-button{
      font-size:0!important;
      line-height:0!important;
      text-indent:0!important;
      overflow:hidden!important;
    }

    body.wander-clean-ui #locate-button svg,
    body.wander-clean-ui #track-route-button svg{
      display:block!important;
      width:27px!important;
      height:27px!important;
      margin:auto!important;
      stroke:currentColor!important;
      stroke-width:2.2!important;
      fill:none!important;
      stroke-linecap:round!important;
      stroke-linejoin:round!important;
    }

    body.wander-clean-ui #track-route-button .record-dot{
      fill:currentColor!important;
      stroke:none!important;
    }

    body.wander-clean-ui #track-route-button .record-ring{
      fill:none!important;
      opacity:.55!important;
    }

    body.wander-clean-ui #track-route-button.active,
    body.wander-clean-ui #track-route-button[aria-pressed="true"]{
      background:#ef3340!important;
      color:#fff!important;
    }

    body.wander-clean-ui #track-route-button:not(.active):not([aria-pressed="true"]){
      background:rgba(255,255,255,.94)!important;
      color:#173f3b!important;
    }

    @media(max-width:820px){
      body.wander-clean-ui .status-rail{
        left:50%!important;
        right:auto!important;
        bottom:calc(env(safe-area-inset-bottom,0px) + 62px)!important;
        transform:translateX(-50%)!important;
        width:min(82vw,390px)!important;
        max-width:390px!important;
        display:grid!important;
        grid-template-columns:repeat(3,minmax(0,1fr))!important;
        justify-content:center!important;
        justify-items:stretch!important;
        align-items:end!important;
        gap:10px!important;
        overflow:visible!important;
        z-index:1450!important;
      }

      body.wander-clean-ui .status-rail .metric{
        min-width:0!important;
        width:100%!important;
        max-width:none!important;
        box-sizing:border-box!important;
        text-align:left!important;
      }

      body.wander-clean-ui .companion-tab{
        left:50%!important;
        right:auto!important;
        bottom:calc(env(safe-area-inset-bottom,0px) + 126px)!important;
        transform:translateX(-50%)!important;
        z-index:1500!important;
      }

      body.wander-clean-ui .location-readout{
        bottom:calc(env(safe-area-inset-bottom,0px) + 154px)!important;
      }
    }
  `;
  document.head.appendChild(style);

  paintButtons();
  centerStatusRail();
  window.setInterval(() => {
    paintButtons();
    centerStatusRail();
  }, 700);
})();
(() => {
  function paintButtons() {
    const locate = document.querySelector('#locate-button');
    if (locate) {
      locate.setAttribute('aria-label', 'Brújula y ubicación');
      locate.title = locate.dataset.orientation === 'route' ? 'Seguir movimiento' : locate.dataset.orientation === 'compass' ? 'Seguir brújula' : locate.dataset.orientation === 'north' ? 'Norte arriba' : 'Centrar ubicación';
      locate.style.pointerEvents = 'auto';
      locate.style.touchAction = 'manipulation';
      if (!locate.querySelector('svg')) {
        locate.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/><circle cx="12" cy="12" r="2.5"/></svg>';
      }
    }

    const track = document.querySelector('#track-route-button');
    if (track) {
      track.setAttribute('aria-label', 'Grabar recorrido');
      track.title = 'Grabar recorrido';
      track.style.pointerEvents = 'auto';
      track.style.touchAction = 'manipulation';
      if (!track.querySelector('.record-ring')) {
        track.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="record-dot" cx="12" cy="12" r="6"/><circle class="record-ring" cx="12" cy="12" r="10"/></svg>';
      }
    }

    const gear = document.querySelector('#wander-settings-gear');
    if (gear) {
      gear.textContent = '⚙️';
      gear.style.pointerEvents = 'auto';
      gear.style.touchAction = 'manipulation';
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
    body.wander-clean-ui #wander-clean-menu-button{
      font-size:0!important;
      line-height:0!important;
      text-indent:0!important;
      overflow:hidden!important;
      pointer-events:auto!important;
      touch-action:manipulation!important;
    }

    body.wander-clean-ui #wander-settings-gear{
      font-size:24px!important;
      line-height:1!important;
      text-indent:0!important;
      overflow:hidden!important;
      pointer-events:auto!important;
      touch-action:manipulation!important;
      display:grid!important;
      place-items:center!important;
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
      pointer-events:none!important;
    }

    body.wander-clean-ui #locate-button .mode-badge{
      display:block!important;
      position:absolute!important;
      right:5px!important;
      bottom:4px!important;
      min-width:15px!important;
      height:15px!important;
      border-radius:999px!important;
      background:rgba(23,63,59,.92)!important;
      color:#fff!important;
      font:800 8px/15px system-ui!important;
      text-align:center!important;
      text-indent:0!important;
      z-index:2!important;
      pointer-events:none!important;
    }

    body.wander-clean-ui #locate-button[data-orientation="compass"] .mode-badge{
      background:#fff!important;
      color:#173f3b!important;
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
        width:min(84vw,390px)!important;
        max-width:390px!important;
        display:grid!important;
        grid-template-columns:repeat(3,minmax(0,1fr))!important;
        justify-content:center!important;
        justify-items:stretch!important;
        align-items:stretch!important;
        gap:10px!important;
        overflow:visible!important;
        z-index:1450!important;
      }

      body.wander-clean-ui .status-rail .metric{
        min-width:0!important;
        width:100%!important;
        height:58px!important;
        min-height:58px!important;
        max-height:58px!important;
        box-sizing:border-box!important;
        text-align:left!important;
        display:flex!important;
        flex-direction:column!important;
        justify-content:center!important;
        overflow:hidden!important;
      }

      body.wander-clean-ui .status-rail .metric span,
      body.wander-clean-ui .status-rail .metric strong{
        display:block!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
        white-space:nowrap!important;
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
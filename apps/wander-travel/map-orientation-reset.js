(() => {
  if (window.__wanderMapOrientationReset) return;
  window.__wanderMapOrientationReset = true;

  const style = document.createElement('style');
  style.textContent = `
    body.wander-clean-ui #locate-button{display:none!important;visibility:hidden!important;pointer-events:none!important}
    body.wander-map-heading #wander-map{transform:none!important}
    .wander-user-arrow{width:30px;height:30px;display:grid;place-items:center;transform:rotate(var(--wander-user-bearing,0deg))}
    .wander-user-arrow::before{content:"";width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:22px solid #173f3b;filter:drop-shadow(0 2px 4px rgba(0,0,0,.25))}
    .wander-user-dot{width:18px;height:18px;border-radius:50%;background:#173f3b;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)}
  `;
  document.head.appendChild(style);

  function reset() {
    document.body.classList.remove('wander-map-heading');
    document.documentElement.style.setProperty('--wander-map-rotation', '0deg');
    try { if (typeof map !== 'undefined' && map.dragging) map.dragging.enable(); } catch {}
    const locate = document.querySelector('#locate-button');
    if (locate) {
      locate.hidden = true;
      locate.setAttribute('aria-hidden', 'true');
      locate.style.setProperty('display', 'none', 'important');
    }
  }

  reset();
  window.setInterval(reset, 500);
})();
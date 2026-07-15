(() => {
  function attach() {
    const button = document.querySelector('.wander-personal-map-actions .wander-personal-map-action');
    if (!button || button.dataset.waypointCenterMode === 'true' || !window.WanderMapSelectedPoint?.openAtCenter) return false;
    button.dataset.waypointCenterMode = 'true';
    button.title = 'Seleccionar punto en el centro del mapa';
    button.setAttribute('aria-label', button.title);

    const stopLegacyHold = (event) => {
      event.stopImmediatePropagation();
    };
    button.addEventListener('pointerdown', stopLegacyHold, true);
    button.addEventListener('pointerup', stopLegacyHold, true);
    button.addEventListener('pointercancel', stopLegacyHold, true);
    button.addEventListener('pointerleave', stopLegacyHold, true);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.WanderMapSelectedPoint.openAtCenter();
    }, true);
    return true;
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (attach() || attempts > 120) clearInterval(timer);
  }, 100);

  window.WanderWaypointButtonMode = Object.freeze({ attach });
})();
(() => {
  function attach() {
    const legacyButton = document.querySelector('.wander-personal-map-actions .wander-personal-map-action');
    if (!legacyButton || !window.WanderMapSelectedPoint?.openAtCenter) return false;
    if (legacyButton.dataset.waypointCenterMode === 'true') return true;

    const button = legacyButton.cloneNode(true);
    button.dataset.waypointCenterMode = 'true';
    button.classList.remove('is-armed');
    button.title = 'Seleccionar punto en el centro del mapa';
    button.setAttribute('aria-label', button.title);
    button.removeAttribute('aria-pressed');
    legacyButton.replaceWith(button);

    L.DomEvent.disableClickPropagation(button);
    L.DomEvent.disableScrollPropagation(button);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.WanderMapSelectedPoint.openAtCenter();
    });
    return true;
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (attach() || attempts > 120) clearInterval(timer);
  }, 100);

  window.WanderWaypointButtonMode = Object.freeze({ attach });
})();
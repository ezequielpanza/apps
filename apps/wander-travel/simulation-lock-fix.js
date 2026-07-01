(() => {
  if (window.__wanderSimulationLockFix) return;
  window.__wanderSimulationLockFix = true;

  function pointFromSim() {
    const sim = window.WanderSimulatedMotion;
    const loc = sim?.location;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return null;
    try {
      if (typeof L !== 'undefined') return L.latLng(loc.lat, loc.lng);
    } catch {}
    return null;
  }

  function fixPinButton() {
    const button = document.querySelector('#manual-location-button');
    if (!button) return;
    button.textContent = '📍';
    button.setAttribute('aria-label', 'Fijar posición simulada');
    button.title = 'Fijar posición simulada';
  }

  function enforceSimulation() {
    if (!window.WanderSimulationActive) return;
    const point = pointFromSim();
    if (!point) return;
    try {
      if (typeof marker !== 'undefined') marker.setLatLng(point);
    } catch {}
  }

  document.addEventListener('wander:motion-context', (event) => {
    if (!window.WanderSimulationActive) return;
    if (event.detail?.simulated) {
      window.WanderSimulatedMotion = event.detail;
      enforceSimulation();
      return;
    }
    event.stopImmediatePropagation();
    enforceSimulation();
    window.setTimeout(enforceSimulation, 0);
  }, true);

  document.addEventListener('click', (event) => {
    if (event.target?.closest?.('#manual-location-button, .move-button, [data-move], [data-stop-move]')) {
      window.WanderSimulationActive = true;
      window.setTimeout(enforceSimulation, 0);
    }
  }, true);

  window.setInterval(() => {
    fixPinButton();
    enforceSimulation();
  }, 400);

  fixPinButton();
})();
(() => {
  const base = window.WanderBase;
  if (!base) return;

  const map = base.map;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  let timer = null;
  let directionKey = null;
  let speedIndex = 0;

  const speeds = [5, 16, 30, 50, 80];
  const modes = ['walking', 'cycling', 'driving', 'driving', 'driving'];
  const contextStatuses = ['Caminando', 'Andando en bicicleta', 'Conduciendo', 'Conduciendo', 'Conduciendo'];
  const activities = ['walking', 'cycling', 'driving', 'driving', 'driving'];
  const dirs = {
    northwest: [0.707, -0.707, 315, 'noroeste'],
    north: [1, 0, 0, 'norte'],
    northeast: [0.707, 0.707, 45, 'noreste'],
    west: [0, -1, 270, 'oeste'],
    east: [0, 1, 90, 'este'],
    southwest: [-0.707, -0.707, 225, 'sudoeste'],
    south: [-1, 0, 180, 'sur'],
    southeast: [-0.707, 0.707, 135, 'sudeste'],
  };

  function setStatus(value) {
    const item = $('#sim-status');
    if (item) item.textContent = value;
  }

  function clearActiveButtons() {
    $$('.move-pad button').forEach((item) => item.classList.remove('is-active'));
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    directionKey = null;
    speedIndex = 0;
    clearActiveButtons();
    $('[data-stop-move]')?.classList.add('is-active');

    if (base.hasPosition()) {
      window.WanderUI?.setMotion(false, 0, null, {
        source: 'simulator',
        motionStatus: 'stationary',
        motionMode: 'unknown',
        contextStatus: 'En pausa',
        contextActivity: 'paused',
        confidence: 1,
      });
      setStatus('Movimiento detenido · posición simulada activa');
    } else {
      window.WanderUI?.setLocationPending();
      setStatus('Sin posición simulada');
    }
  }

  function createSimulationPosition() {
    const center = map.getCenter();
    const position = base.setPosition(center, { source: 'simulator', confidence: 0.9 });
    if (!position) return false;
    map.setView(position, Math.max(map.getZoom(), 15));
    window.WanderSimulationActive = true;
    stop();
    setStatus('Posición simulada creada · lista para mover');
    return true;
  }

  function tick() {
    const dir = dirs[directionKey];
    const current = base.getPosition();
    if (!dir || !current) return;

    const kmh = speeds[speedIndex];
    const meters = (kmh * 1000 / 3600) * 0.25;
    const next = L.latLng(
      current.lat + meters * dir[0] / 111320,
      current.lng + meters * dir[1] / (111320 * Math.max(0.15, Math.cos(current.lat * Math.PI / 180)))
    );

    base.setPosition(next, { source: 'simulator', confidence: 0.9 });
    window.WanderUI?.setMotion(true, kmh / 3.6, dir[2], {
      source: 'simulator',
      motionStatus: 'moving',
      motionMode: modes[speedIndex],
      contextStatus: contextStatuses[speedIndex],
      contextActivity: activities[speedIndex],
      confidence: 1,
    });
    window.WanderTracks?.addPoint(next);
    setStatus('Moviendo ' + dir[3] + ' · ' + contextStatuses[speedIndex] + ' · ' + kmh + ' km/h');
  }

  function move(key, button) {
    if (!dirs[key]) return;
    if (!base.hasPosition() && !createSimulationPosition()) {
      window.WanderUI?.showWander('Sin posición', 'No se pudo crear una posición simulada.');
      return;
    }

    window.WanderSimulationActive = true;
    if (directionKey === key && timer) speedIndex = Math.min(speedIndex + 1, speeds.length - 1);
    else { directionKey = key; speedIndex = 0; }

    clearActiveButtons();
    if (button) button.classList.add('is-active');
    if (timer) clearInterval(timer);
    tick();
    timer = setInterval(tick, 250);
  }

  $('#set-sim-position')?.addEventListener('click', createSimulationPosition);
  $('#developer-panel')?.addEventListener('click', (event) => {
    const stopButton = event.target.closest('[data-stop-move]');
    const moveButton = event.target.closest('[data-move]');
    if (stopButton) stop();
    if (moveButton) move(moveButton.dataset.move, moveButton);
  });

  window.WanderSimulator = { stop, move, createPosition: createSimulationPosition };
  stop();
})();

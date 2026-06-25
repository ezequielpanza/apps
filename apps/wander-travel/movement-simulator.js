(() => {
  const buttons = [...document.querySelectorAll('[data-move]')];
  const stopButton = document.querySelector('[data-stop-move]');
  const status = document.querySelector('#simulator-status');
  const modeMetric = document.querySelector('.status-rail .metric:nth-child(1) strong');
  const speedMetric = document.querySelector('.status-rail .metric:nth-child(2) strong');

  if (!buttons.length || !stopButton || typeof marker === 'undefined' || typeof map === 'undefined') return;

  const modes = [
    { id: 'walk', label: 'Caminando', speedLabel: '5 km/h', kmh: 5 },
    { id: 'bike', label: 'Bicicleta', speedLabel: '16 km/h', kmh: 16 },
    { id: 'car', label: 'Auto', speedLabel: '42 km/h', kmh: 42 },
  ];

  const directions = {
    north: [1, 0],
    south: [-1, 0],
    east: [0, 1],
    west: [0, -1],
    northeast: [Math.SQRT1_2, Math.SQRT1_2],
    northwest: [Math.SQRT1_2, -Math.SQRT1_2],
    southeast: [-Math.SQRT1_2, Math.SQRT1_2],
    southwest: [-Math.SQRT1_2, -Math.SQRT1_2],
  };

  const directionLabels = {
    north: 'norte',
    south: 'sur',
    east: 'este',
    west: 'oeste',
    northeast: 'noreste',
    northwest: 'noroeste',
    southeast: 'sureste',
    southwest: 'suroeste',
  };

  const TICK_MS = 250;
  let timer = null;
  let activeDirection = null;
  let modeIndex = 0;
  let activeButton = null;

  function setButtonState(button, mode) {
    buttons.forEach((item) => {
      item.classList.remove('is-active');
      item.removeAttribute('data-speed');
      item.setAttribute('aria-pressed', 'false');
    });
    if (!button || !mode) return;
    button.classList.add('is-active');
    button.dataset.speed = mode.speedLabel;
    button.setAttribute('aria-pressed', 'true');
  }

  function updateUi() {
    const mode = modes[modeIndex];
    if (status) status.textContent = `Moviendo hacia ${directionLabels[activeDirection]} · ${mode.label} · ${mode.speedLabel}`;
    if (modeMetric) modeMetric.textContent = mode.label;
    if (speedMetric) speedMetric.textContent = mode.speedLabel;
    setButtonState(activeButton, mode);
  }

  function moveOneTick() {
    if (!activeDirection) return;
    const mode = modes[modeIndex];
    const [northFactor, eastFactor] = directions[activeDirection];
    const meters = (mode.kmh * 1000 / 3600) * (TICK_MS / 1000);
    const point = marker.getLatLng();
    const latitudeDelta = (meters * northFactor) / 111320;
    const longitudeScale = Math.max(0.15, Math.cos(point.lat * Math.PI / 180));
    const longitudeDelta = (meters * eastFactor) / (111320 * longitudeScale);
    const next = L.latLng(point.lat + latitudeDelta, point.lng + longitudeDelta);

    if (typeof setPosition === 'function') setPosition(next, `Movimiento simulado · ${mode.label} · ${mode.speedLabel}`);
    else {
      marker.setLatLng(next);
      map.panTo(next, { animate: false });
    }
  }

  function restartTimer() {
    if (timer) window.clearInterval(timer);
    timer = window.setInterval(moveOneTick, TICK_MS);
  }

  function startOrCycle(button) {
    const direction = button.dataset.move;
    if (!directions[direction]) return;

    if (activeDirection === direction && timer) {
      modeIndex = (modeIndex + 1) % modes.length;
    } else {
      activeDirection = direction;
      activeButton = button;
      modeIndex = 0;
    }

    updateUi();
    moveOneTick();
    restartTimer();
  }

  function stopMovement() {
    if (timer) window.clearInterval(timer);
    timer = null;
    activeDirection = null;
    activeButton = null;
    modeIndex = 0;
    setButtonState(null, null);
    if (status) status.textContent = 'Movimiento detenido · 0 km/h';
    if (modeMetric) modeMetric.textContent = 'Detenido';
    if (speedMetric) speedMetric.textContent = '0 km/h';
  }

  buttons.forEach((button) => {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      startOrCycle(button);
    }, true);
  });

  stopButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    stopMovement();
  }, true);
})();

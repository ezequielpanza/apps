(() => {
  const APP_VERSION = 'v0.13.3';
  const versionBadge = document.querySelector('.app-version');
  if (versionBadge) versionBadge.textContent = APP_VERSION;
  document.title = `Wander Travel ${APP_VERSION}`;

  const buttons = [...document.querySelectorAll('[data-move]')];
  const stopButton = document.querySelector('[data-stop-move]');
  const status = document.querySelector('#simulator-status');
  const modeMetric = document.querySelector('.status-rail .metric:nth-child(1) strong');
  const speedMetric = document.querySelector('.status-rail .metric:nth-child(2) strong');
  const locateButton = document.querySelector('#locate-button');

  if (!buttons.length || !stopButton || typeof marker === 'undefined' || typeof map === 'undefined') return;

  const modes = [
    { id: 'walk', label: 'Caminando', speedLabel: '5 km/h', kmh: 5 },
    { id: 'bike', label: 'Bicicleta / monopatín', speedLabel: '16 km/h', kmh: 16 },
    { id: 'car-slow', label: 'Auto lento', speedLabel: '30 km/h', kmh: 30 },
    { id: 'car-medium', label: 'Auto medio', speedLabel: '50 km/h', kmh: 50 },
    { id: 'car-fast', label: 'Auto rápido', speedLabel: '80 km/h', kmh: 80 },
  ];

  const directions = {
    north: [1, 0], south: [-1, 0], east: [0, 1], west: [0, -1],
    northeast: [Math.SQRT1_2, Math.SQRT1_2], northwest: [Math.SQRT1_2, -Math.SQRT1_2],
    southeast: [-Math.SQRT1_2, Math.SQRT1_2], southwest: [-Math.SQRT1_2, -Math.SQRT1_2],
  };

  const oppositeDirections = {
    north: 'south', south: 'north', east: 'west', west: 'east',
    northeast: 'southwest', southwest: 'northeast', northwest: 'southeast', southeast: 'northwest',
  };

  const directionLabels = {
    north: 'norte', south: 'sur', east: 'este', west: 'oeste',
    northeast: 'noreste', northwest: 'noroeste', southeast: 'sureste', southwest: 'suroeste',
  };

  const TICK_MS = 250;
  let timer = null;
  let activeDirection = null;
  let modeIndex = 0;
  let activeButton = null;
  let followCursor = true;
  let stoppedForReverse = false;

  function clearButtonStates() {
    buttons.forEach((item) => {
      item.classList.remove('is-active');
      item.removeAttribute('data-speed');
      item.setAttribute('aria-pressed', 'false');
    });
    stopButton.classList.remove('is-active');
    stopButton.removeAttribute('data-speed');
    stopButton.setAttribute('aria-pressed', 'false');
  }

  function setButtonState(button, mode, speedLabel = null) {
    clearButtonStates();
    if (!button) return;
    button.classList.add('is-active');
    button.dataset.speed = speedLabel || mode?.speedLabel || '';
    button.setAttribute('aria-pressed', 'true');
  }

  function setStoppedButtonState() {
    clearButtonStates();
    stopButton.classList.add('is-active');
    stopButton.dataset.speed = '0 km/h';
    stopButton.setAttribute('aria-pressed', 'true');
  }

  function updateUi() {
    if (stoppedForReverse) {
      if (status) status.textContent = 'Movimiento detenido · 0 km/h';
      if (modeMetric) modeMetric.textContent = 'Detenido';
      if (speedMetric) speedMetric.textContent = '0 km/h';
      setStoppedButtonState();
      return;
    }

    const mode = modes[modeIndex];
    if (status) {
      const viewState = followCursor ? '' : ' · Vista libre';
      status.textContent = `Moviendo hacia ${directionLabels[activeDirection]} · ${mode.label} · ${mode.speedLabel}${viewState}`;
    }
    if (modeMetric) modeMetric.textContent = mode.label;
    if (speedMetric) speedMetric.textContent = mode.speedLabel;
    setButtonState(activeButton, mode);
  }

  function updatePositionWithoutForcedCenter(next, mode) {
    marker.setLatLng(next);
    const readout = document.querySelector('#location-readout');
    if (readout) {
      const strong = readout.querySelector('strong');
      const small = readout.querySelector('small');
      if (strong) strong.textContent = `${next.lat.toFixed(5)}, ${next.lng.toFixed(5)}`;
      if (small) small.textContent = `Movimiento simulado · ${mode.label} · ${mode.speedLabel}`;
    }
    try {
      if (typeof tracking !== 'undefined' && tracking) {
        points.push([next.lat, next.lng]);
        route.setLatLngs(points);
        if (typeof updateTrack === 'function') updateTrack();
      }
    } catch (_) {}
    if (followCursor) map.panTo(next, { animate: false });
  }

  function moveOneTick() {
    if (!activeDirection || stoppedForReverse) return;
    const mode = modes[modeIndex];
    const [northFactor, eastFactor] = directions[activeDirection];
    const meters = (mode.kmh * 1000 / 3600) * (TICK_MS / 1000);
    const point = marker.getLatLng();
    const latitudeDelta = (meters * northFactor) / 111320;
    const longitudeScale = Math.max(0.15, Math.cos(point.lat * Math.PI / 180));
    const longitudeDelta = (meters * eastFactor) / (111320 * longitudeScale);
    updatePositionWithoutForcedCenter(L.latLng(point.lat + latitudeDelta, point.lng + longitudeDelta), mode);
  }

  function restartTimer() {
    if (timer) window.clearInterval(timer);
    timer = window.setInterval(moveOneTick, TICK_MS);
  }

  function prepareOppositeDirection(direction) {
    if (timer) window.clearInterval(timer);
    timer = null;
    activeDirection = direction;
    activeButton = null;
    modeIndex = 0;
    stoppedForReverse = true;
    updateUi();
  }

  function startOrAdjust(button) {
    const direction = button.dataset.move;
    if (!directions[direction]) return;

    if (stoppedForReverse) {
      activeDirection = direction;
      activeButton = button;
      modeIndex = 0;
      stoppedForReverse = false;
      updateUi();
      moveOneTick();
      restartTimer();
      return;
    }

    if (timer && activeDirection === direction) {
      modeIndex = Math.min(modeIndex + 1, modes.length - 1);
    } else if (timer && oppositeDirections[activeDirection] === direction) {
      if (modeIndex > 0) {
        modeIndex -= 1;
        updateUi();
        return;
      }
      prepareOppositeDirection(direction);
      return;
    } else {
      activeDirection = direction;
      activeButton = button;
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
    stoppedForReverse = false;
    setStoppedButtonState();
    if (status) status.textContent = 'Movimiento detenido · 0 km/h';
    if (modeMetric) modeMetric.textContent = 'Detenido';
    if (speedMetric) speedMetric.textContent = '0 km/h';
  }

  map.on('dragstart', () => {
    followCursor = false;
    if (activeDirection) updateUi();
  });

  locateButton?.addEventListener('click', () => {
    followCursor = true;
    if (activeDirection) updateUi();
  }, true);

  buttons.forEach((button) => {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      startOrAdjust(button);
    }, true);
  });

  stopButton.setAttribute('aria-pressed', 'false');
  stopButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    stopMovement();
  }, true);
})();

(() => {
  if (!document.querySelector('script[data-map-recenter]')) {
    const script = document.createElement('script');
    script.src = 'map-recenter.js?v=20260625-1';
    script.dataset.mapRecenter = 'true';
    document.body.appendChild(script);
  }
  if (!document.querySelector('script[data-movement-overlay]')) {
    const script = document.createElement('script');
    script.src = 'movement-overlay.js?v=20260625-3';
    script.dataset.movementOverlay = 'true';
    document.body.appendChild(script);
  }
})();

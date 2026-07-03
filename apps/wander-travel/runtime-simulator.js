(() => {
  const base = window.WanderBase;
  if (!base) return;

  const marker = base.marker;
  const map = base.map;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  let timer = null;
  let directionKey = null;
  let speedIndex = 0;

  const speeds = [5, 16, 30, 50, 80];
  const labels = ['Caminando', 'Bicicleta', 'Auto lento', 'Auto medio', 'Auto rápido'];
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
    window.WanderUI?.setMotion(false, 0, null);
    window.WanderContext?.setMotion({ status: 'Detenido', speedKmh: 0, heading: null, source: 'simulator' });
    setStatus('Movimiento detenido · Mapa libre');
  }

  function tick() {
    const dir = dirs[directionKey];
    if (!dir) return;
    const kmh = speeds[speedIndex];
    const current = marker.getLatLng();
    const meters = (kmh * 1000 / 3600) * 0.25;
    const next = L.latLng(
      current.lat + meters * dir[0] / 111320,
      current.lng + meters * dir[1] / (111320 * Math.max(0.15, Math.cos(current.lat * Math.PI / 180)))
    );
    base.revealMarker?.();
    marker.setLatLng(next);
    window.WanderUI?.setMotion(true, kmh / 3.6, dir[2]);
    window.WanderContext?.setLocation({ lat: next.lat, lng: next.lng, source: 'simulator', confidence: 0.9 });
    window.WanderContext?.setMotion({ status: labels[speedIndex], speedKmh: kmh, heading: dir[2], source: 'simulator' });
    window.WanderTracks?.addPoint(next);
    setStatus('Moviendo ' + dir[3] + ' · ' + labels[speedIndex] + ' · ' + kmh + ' km/h');
  }

  function move(key, button) {
    if (!dirs[key]) return;
    window.WanderSimulationActive = true;
    if (directionKey === key && timer) speedIndex = Math.min(speedIndex + 1, speeds.length - 1);
    else { directionKey = key; speedIndex = 0; }
    clearActiveButtons();
    if (button) button.classList.add('is-active');
    if (timer) clearInterval(timer);
    tick();
    timer = setInterval(tick, 250);
  }

  $('#set-sim-position')?.addEventListener('click', () => {
    base.revealMarker?.();
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15));
    window.WanderContext?.setLocation({ lat: marker.getLatLng().lat, lng: marker.getLatLng().lng, source: 'simulator', confidence: 0.9 });
    stop();
    setStatus('Posición visible · lista para simular');
  });

  $('#developer-panel')?.addEventListener('click', (event) => {
    const stopButton = event.target.closest('[data-stop-move]');
    const moveButton = event.target.closest('[data-move]');
    if (stopButton) stop();
    if (moveButton) move(moveButton.dataset.move, moveButton);
  });

  window.WanderSimulator = { stop, move };
  stop();
})();

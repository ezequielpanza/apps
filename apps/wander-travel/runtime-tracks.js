(() => {
  const base = window.WanderBase;
  if (!base) return;

  const map = base.map;
  const line = base.route;
  const $ = (selector) => document.querySelector(selector);

  let tracks = [];
  let current = null;

  try {
    tracks = JSON.parse(localStorage.getItem('wander.tracks') || '[]');
    if (!Array.isArray(tracks)) tracks = [];
  } catch {
    tracks = [];
  }

  function save() {
    localStorage.setItem('wander.tracks', JSON.stringify(tracks));
  }

  function setRecordButtonState() {
    const button = $('#record-button');
    if (!button) return;
    button.classList.toggle('is-recording', Boolean(current));
    button.textContent = current ? '⏹️ Detener' : '⏺️ Grabar';
  }

  function render() {
    const count = tracks.length;
    const summary = current
      ? 'Grabando · ' + current.points.length + ' puntos'
      : count + ' ' + (count === 1 ? 'track guardado' : 'tracks guardados');

    window.WanderUI?.setText('#track-summary', summary);
    setRecordButtonState();

    const list = $('#track-list');
    if (!list) return;

    const rows = tracks.slice(-5).concat(current ? [current] : []);
    if (!rows.length) {
      list.innerHTML = '<div class="track-row"><div><strong>Sin recorridos</strong><span>Creá una posición válida antes de grabar.</span></div></div>';
      return;
    }

    list.innerHTML = rows.map((track) => (
      '<button class="track-row" type="button" data-track-id="' + track.id + '">' +
        '<div><strong>' + track.name + '</strong><span>' + track.points.length + ' puntos</span></div>' +
        '<span>👁️</span>' +
      '</button>'
    )).join('');
  }

  function addPoint(point) {
    if (!current || !point) return;

    const next = L.latLng(point);
    const last = current.points[current.points.length - 1];
    if (last && map.distance([last.lat, last.lng], next) < 2) return;

    current.points.push({ lat: next.lat, lng: next.lng });
    line.setLatLngs(current.points.map((p) => [p.lat, p.lng]));
    render();
  }

  function start() {
    const position = base.getPosition();
    if (!position) {
      window.WanderUI?.showWander(
        '📍 Falta ubicación',
        'Wander necesita una posición válida antes de empezar a grabar un recorrido.'
      );
      return false;
    }

    current = {
      id: 'track-' + Date.now(),
      name: 'Track · ' + new Date().toLocaleString('es-AR'),
      points: [],
    };

    line.setLatLngs([]);
    window.WanderContext?.set('user.intent', 'Registrar recorrido', {
      source: 'track',
      ttlMs: 600000,
      confidence: 0.8,
    });

    addPoint(position);
    window.WanderUI?.showWander('⏺️ Grabando', 'Wander empezó a registrar este recorrido.');
    render();
    return true;
  }

  function stop() {
    if (!current) return;

    if (current.points.length > 1) tracks.push(current);
    current = null;
    save();

    window.WanderContext?.set('user.intent', 'Descubrir', {
      source: 'track',
      ttlMs: 600000,
      confidence: 0.7,
    });

    window.WanderUI?.showWander('✅ Track finalizado', 'El recorrido quedó guardado si tuvo movimiento suficiente.');
    render();
  }

  function showTrack(id) {
    const track = tracks.find((item) => item.id === id) || (current?.id === id ? current : null);
    if (!track || !track.points.length) return;

    const points = track.points.map((p) => [p.lat, p.lng]);
    line.setLatLngs(points);
    map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });

    window.WanderContext?.set('user.intent', 'Revisar recorrido', {
      source: 'track',
      ttlMs: 600000,
      confidence: 0.7,
    });
    window.WanderUI?.showWander('🗺️ Recorrido', track.name + ' · ' + track.points.length + ' puntos.');
  }

  function exportLast() {
    const track = current || tracks[tracks.length - 1];
    if (!track) {
      window.WanderUI?.showWander('📤 Exportar', 'Todavía no hay recorridos para exportar.');
      return;
    }

    const blob = new Blob([JSON.stringify(track, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = track.id + '.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  $('#record-button')?.addEventListener('click', () => current ? stop() : start());
  $('#clear-panel-button')?.addEventListener('click', () => {
    line.setLatLngs([]);
    window.WanderUI?.showWander('🧹 Vista limpia', 'Se limpió la línea visible del mapa. Los tracks guardados siguen disponibles.');
  });
  $('#export-track-button')?.addEventListener('click', exportLast);
  $('#track-list')?.addEventListener('click', (event) => {
    const row = event.target.closest('[data-track-id]');
    if (row) showTrack(row.dataset.trackId);
  });

  window.WanderTracks = {
    addPoint,
    render,
    start,
    stop,
    isRecording: () => Boolean(current),
  };

  render();
})();

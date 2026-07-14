(() => {
  const base = window.WanderBase;
  if (!base) return;

  const map = base.map;
  const line = base.route;
  const $ = (selector) => document.querySelector(selector);
  const icon = (name, className = 'button-icon') => '<svg class="' + className + '" aria-hidden="true"><use href="wander-icons.svg#' + name + '"></use></svg>';

  let tracks = [];
  let current = null;

  try {
    tracks = JSON.parse(localStorage.getItem('wander.tracks') || '[]');
    if (!Array.isArray(tracks)) tracks = [];
  } catch { tracks = []; }

  tracks = tracks.map((track) => ({
    ...track,
    startedAt: track.startedAt || Number(String(track.id || '').replace('track-', '')) || Date.now(),
    endedAt: track.endedAt || null,
    distanceM: Number(track.distanceM || 0),
  }));

  function save() {
    localStorage.setItem('wander.tracks', JSON.stringify(tracks));
    window.WanderContext?.set('tracks.history', tracks, { source: 'tracks', kind: 'observed', confidence: 1 });
  }

  function distanceFor(points = []) {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
      total += map.distance([points[index - 1].lat, points[index - 1].lng], [points[index].lat, points[index].lng]);
    }
    return Math.round(total);
  }

  function durationFor(track) {
    return Math.max(0, Number(track.endedAt || Date.now()) - Number(track.startedAt || Date.now()));
  }

  function durationLabel(ms) {
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return minutes + ' min';
    const hours = Math.floor(minutes / 60);
    return hours + ' h ' + (minutes % 60) + ' min';
  }

  function distanceLabel(meters) {
    return meters >= 1000 ? (meters / 1000).toFixed(meters >= 10000 ? 0 : 1) + ' km' : meters + ' m';
  }

  function setRecordButtonState() {
    const button = $('#record-button');
    if (!button) return;
    button.classList.toggle('is-recording', Boolean(current));
    button.innerHTML = current ? icon('stop') + '<span>Detener</span>' : icon('record') + '<span>Grabar</span>';
  }

  function render() {
    const count = tracks.length;
    const summary = current
      ? 'Grabando · ' + current.points.length + ' puntos · ' + distanceLabel(distanceFor(current.points))
      : count + ' ' + (count === 1 ? 'tramo guardado' : 'tramos guardados');

    window.WanderUI?.setText('#track-summary', summary);
    setRecordButtonState();
    const list = $('#track-list');
    if (!list) return;

    const rows = tracks.slice(-8).concat(current ? [current] : []);
    if (!rows.length) {
      list.innerHTML = '<div class="track-row"><div><strong>Sin recorridos</strong><span>La grabación comenzará cuando exista una ubicación válida.</span></div></div>';
      return;
    }

    list.innerHTML = rows.map((track) => {
      const distance = distanceFor(track.points);
      return '<button class="track-row" type="button" data-track-id="' + track.id + '">' +
        '<div><strong>' + track.name + '</strong><span>' + durationLabel(durationFor(track)) + ' · ' + distanceLabel(distance) + ' · ' + track.points.length + ' puntos</span></div>' +
        icon('eye', 'ui-icon track-eye') + '</button>';
    }).join('');
  }

  function addPoint(point) {
    if (!current || !point) return;
    const next = L.latLng(point);
    const last = current.points[current.points.length - 1];
    if (last && map.distance([last.lat, last.lng], next) < 2) return;
    current.points.push({ lat: next.lat, lng: next.lng, at: Date.now() });
    current.distanceM = distanceFor(current.points);
    line.setLatLngs(current.points.map((p) => [p.lat, p.lng]));
    window.WanderContext?.set('tracks.current', current, { source: 'tracks', kind: 'observed', confidence: 1 });
    render();
  }

  function start(options = {}) {
    const position = base.getPosition();
    if (!position) {
      if (!options.silent) window.WanderUI?.showWander('Falta ubicación', 'Wander necesita una posición válida antes de empezar a grabar un recorrido.');
      return false;
    }
    const startedAt = Date.now();
    current = {
      id: 'track-' + startedAt,
      name: options.name || 'Tramo · ' + new Date(startedAt).toLocaleString('es-AR'),
      startedAt,
      endedAt: null,
      distanceM: 0,
      method: window.WanderContext?.value?.('mobility.methodId') || null,
      points: [],
    };
    line.setLatLngs([]);
    window.WanderContext?.set('user.intent', 'Registrar recorrido', { source: 'track', ttlMs: 600000, confidence: 0.8 });
    addPoint(position);
    if (!options.silent) window.WanderUI?.showWander('Grabando', 'Wander empezó a registrar un nuevo tramo.');
    render();
    return true;
  }

  function stop(options = {}) {
    if (!current) return null;
    current.endedAt = Date.now();
    current.distanceM = distanceFor(current.points);
    const completed = current;
    if (completed.points.length > 1) tracks.push(completed);
    current = null;
    save();
    window.WanderContext?.remove?.('tracks.current');
    window.WanderContext?.set('user.intent', 'Descubrir', { source: 'track', ttlMs: 600000, confidence: 0.7 });
    if (!options.silent) window.WanderUI?.showWander('Tramo finalizado', 'El recorrido quedó guardado si tuvo movimiento suficiente.');
    render();
    return completed;
  }

  function showTrack(id) {
    const track = tracks.find((item) => item.id === id) || (current?.id === id ? current : null);
    if (!track || !track.points.length) return;
    const points = track.points.map((p) => [p.lat, p.lng]);
    line.setLatLngs(points);
    map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
    window.WanderUI?.showWander('Recorrido', track.name + ' · ' + distanceLabel(distanceFor(track.points)) + '.');
  }

  function exportTrack(track) {
    if (!track) return;
    const blob = new Blob([JSON.stringify(track, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = track.id + '.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportLast() {
    const track = current || tracks[tracks.length - 1];
    if (!track) return window.WanderUI?.showWander('Exportar', 'Todavía no hay recorridos para exportar.');
    exportTrack(track);
  }

  function manage() {
    if (!tracks.length) return window.WanderUI?.showWander('Mis recorridos', 'Todavía no hay tramos guardados.');
    const summary = tracks.map((track, index) => (index + 1) + '. ' + track.name + ' · ' + distanceLabel(distanceFor(track.points))).join('\n');
    const selection = window.prompt('Mis recorridos:\n\n' + summary + '\n\nEscribí el número del tramo que querés administrar.');
    const track = tracks[Number(selection) - 1];
    if (!track) return;
    const action = window.prompt('Escribí ver, renombrar, exportar, eliminar o cancelar.', 'ver');
    if (!action) return;
    const normalized = action.trim().toLowerCase();
    if (normalized === 'ver') showTrack(track.id);
    if (normalized === 'exportar') exportTrack(track);
    if (normalized === 'renombrar') {
      const name = window.prompt('Nombre del tramo', track.name);
      if (name?.trim()) { track.name = name.trim(); save(); render(); }
    }
    if (normalized === 'eliminar' && window.confirm('¿Eliminar ' + track.name + '?')) {
      tracks = tracks.filter((item) => item.id !== track.id);
      save(); render();
    }
  }

  $('#record-button')?.addEventListener('click', () => current ? stop() : start());
  $('#clear-panel-button')?.addEventListener('click', () => {
    line.setLatLngs([]);
    window.WanderUI?.showWander('Vista limpia', 'Se limpió la línea visible del mapa. Los tracks guardados siguen disponibles.');
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
    manage,
    showTrack,
    exportTrack,
    list: () => tracks.map((track) => ({ ...track, points: track.points.map((point) => ({ ...point })) })),
    isRecording: () => Boolean(current),
  };

  save();
  render();
})();
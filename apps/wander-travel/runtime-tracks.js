(() => {
  const base = window.WanderBase;
  if (!base) return;

  const map = base.map;
  const marker = base.marker;
  const line = base.route;
  const $ = (selector) => document.querySelector(selector);
  let tracks = [];
  let current = null;

  try { tracks = JSON.parse(localStorage.getItem('wander.tracks') || '[]'); } catch { tracks = []; }

  function save() {
    localStorage.setItem('wander.tracks', JSON.stringify(tracks));
  }

  function render() {
    const count = tracks.length;
    const summary = current
      ? 'Grabando · ' + current.points.length + ' puntos'
      : count + ' ' + (count === 1 ? 'track guardado' : 'tracks guardados');
    window.WanderUI?.setText('#track-summary', summary);

    const list = $('#track-list');
    if (!list) return;
    const rows = tracks.slice(-5).concat(current ? [current] : []);
    if (!rows.length) {
      list.innerHTML = '<div class="track-row"><div><strong>Sin recorridos</strong><span>Grabá un track para verlo acá.</span></div></div>';
      return;
    }
    list.innerHTML = rows.map((track) => '<button class="track-row" type="button" data-track-id="' + track.id + '"><div><strong>' + track.name + '</strong><span>' + track.points.length + ' puntos</span></div><span>👁️</span></button>').join('');
  }

  function addPoint(point) {
    if (!current || !point) return;
    const last = current.points[current.points.length - 1];
    if (last && map.distance([last.lat, last.lng], [point.lat, point.lng]) < 2) return;
    current.points.push({ lat: point.lat, lng: point.lng });
    window.WanderContext?.setLocation({ lat: point.lat, lng: point.lng, source: 'track', confidence: 0.7 });
    if (line) line.setLatLngs(current.points.map((p) => [p.lat, p.lng]));
    render();
  }

  function start() {
    current = { id: 'track-' + Date.now(), name: 'Track · ' + new Date().toLocaleString('es-AR'), points: [] };
    $('#record-button')?.classList.add('is-recording');
    if (line) line.setLatLngs([]);
    base.revealMarker?.();
    window.WanderContext?.set('user.intent', 'Registrar recorrido', { source: 'track', ttlMs: 600000, confidence: 0.8 });
    addPoint(marker.getLatLng());
    window.WanderUI?.showWander('⏺️ Grabando', 'Wander empezó a registrar este recorrido. Tocá el botón rojo para detener.');
    render();
  }

  function stop() {
    if (!current) return;
    if (current.points.length > 1) tracks.push(current);
    current = null;
    $('#record-button')?.classList.remove('is-recording');
    save();
    window.WanderContext?.set('user.intent', 'Descubrir', { source: 'track', ttlMs: 600000, confidence: 0.7 });
    window.WanderUI?.showWander('✅ Track guardado', 'El recorrido quedó guardado en este dispositivo.');
    render();
  }

  function showTrack(id) {
    const track = tracks.find((item) => item.id === id) || (current?.id === id ? current : null);
    if (!track || !track.points.length || !line) return;
    const points = track.points.map((p) => [p.lat, p.lng]);
    line.setLatLngs(points);
    map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
    window.WanderContext?.set('user.intent', 'Revisar recorrido', { source: 'track', ttlMs: 600000, confidence: 0.7 });
    window.WanderUI?.showWander('🗺️ Recorrido', track.name + ' · ' + track.points.length + ' puntos.');
  }

  function exportLast() {
    const track = current || tracks[tracks.length - 1];
    if (!track) {
      window.WanderUI?.showWander('📤 Exportar', 'Todavía no hay recorridos para exportar.');
      return;
    }
    const payload = JSON.stringify(track, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = track.id + '.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  $('#record-button')?.addEventListener('click', () => current ? stop() : start());
  $('#clear-panel-button')?.addEventListener('click', () => {
    if (line) line.setLatLngs([]);
    window.WanderUI?.showWander('🧹 Vista limpia', 'Se limpió la línea visible del mapa. Los tracks guardados siguen disponibles.');
  });
  $('#export-track-button')?.addEventListener('click', exportLast);
  $('#track-list')?.addEventListener('click', (event) => {
    const row = event.target.closest('[data-track-id]');
    if (row) showTrack(row.dataset.trackId);
  });

  window.WanderTracks = { addPoint, render, start, stop };
  render();
})();

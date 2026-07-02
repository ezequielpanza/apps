(() => {
  const base = window.WanderBase;
  if (!base) return;
  const map = base.map;
  const marker = base.marker;
  const line = base.route || base.activeTrackLine;
  const $ = (selector) => document.querySelector(selector);
  let tracks = [];
  let current = null;
  try { tracks = JSON.parse(localStorage.getItem('wander.tracks') || '[]'); } catch {}
  function save() { localStorage.setItem('wander.tracks', JSON.stringify(tracks)); }
  function render() {
    const count = tracks.length;
    const summary = current ? 'Grabando: ' + current.name + ' · ' + current.points.length + ' puntos' : count + ' ' + (count === 1 ? 'track guardado' : 'tracks guardados');
    window.WanderUI?.setText('#track-summary', summary);
    const list = $('#track-list');
    if (!list) return;
    const rows = tracks.slice(-5).concat(current ? [current] : []);
    list.innerHTML = rows.map((track) => '<div class="track-row"><div><strong>' + track.name + '</strong><span>' + track.points.length + ' puntos</span></div></div>').join('');
  }
  function addPoint(point) {
    if (!current || !point) return;
    const last = current.points[current.points.length - 1];
    if (last && map.distance([last.lat, last.lng], [point.lat, point.lng]) < 2) return;
    current.points.push({ lat: point.lat, lng: point.lng });
    if (line) line.setLatLngs(current.points.map((p) => [p.lat, p.lng]));
    render();
  }
  function start() {
    current = { id: 'track-' + Date.now(), name: 'Track · ' + new Date().toLocaleString('es-AR'), points: [] };
    $('#record-button')?.classList.add('is-recording');
    if (line) line.setLatLngs([]);
    addPoint(marker.getLatLng());
    render();
  }
  function stop() {
    if (!current) return;
    tracks.push(current);
    current = null;
    $('#record-button')?.classList.remove('is-recording');
    save();
    render();
  }
  $('#record-button')?.addEventListener('click', () => current ? stop() : start());
  $('#clear-panel-button')?.addEventListener('click', () => { if (line) line.setLatLngs([]); });
  window.WanderTracks = { addPoint };
  render();
})();

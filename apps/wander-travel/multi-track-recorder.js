(() => {
  if (window.__wanderMultiTrackRecorder) return;
  window.__wanderMultiTrackRecorder = true;
  if (typeof map === 'undefined' || typeof marker === 'undefined' || typeof L === 'undefined') return;

  const tracks = [];
  let current = null;
  let activeLine = null;

  function nowStamp() {
    const date = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function contextPrefix() {
    const status = window.WanderContextStatus?.status || document.querySelector('.status-rail .metric:first-child strong')?.textContent || 'Track';
    if (window.WanderSimulationActive) return 'Simulación';
    if (status.includes('Naveg')) return 'Navegación';
    if (status.includes('bicicleta')) return 'Bicicleta';
    if (status.includes('monopatín')) return 'Monopatín';
    if (status.includes('Condu')) return 'Auto';
    if (status.includes('Camin')) return 'Caminata';
    return 'Track';
  }

  function distance(points) {
    if (points.length < 2) return 0;
    return points.slice(1).reduce((total, point, index) => total + map.distance(L.latLng(points[index].lat, points[index].lng), L.latLng(point.lat, point.lng)), 0);
  }

  function duration(track) {
    const end = track.ended_at ? new Date(track.ended_at) : new Date();
    const start = new Date(track.started_at);
    return Math.max(0, Math.round((end - start) / 1000));
  }

  function pointFromMotion(detail) {
    const loc = detail?.location;
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) return { lat: loc.lat, lng: loc.lng, at: new Date().toISOString() };
    try {
      const p = marker.getLatLng();
      return { lat: p.lat, lng: p.lng, at: new Date().toISOString() };
    } catch { return null; }
  }

  function addPoint(point) {
    if (!current || !point) return;
    const last = current.points[current.points.length - 1];
    if (last && map.distance(L.latLng(last.lat, last.lng), L.latLng(point.lat, point.lng)) < 2) return;
    current.points.push(point);
    activeLine?.setLatLngs(current.points.map((p) => [p.lat, p.lng]));
    render();
  }

  function start() {
    const id = `track-${Date.now()}`;
    current = {
      id,
      name: `${contextPrefix()} · ${nowStamp()}`,
      started_at: new Date().toISOString(),
      ended_at: null,
      context_start: window.WanderContextStatus?.status || null,
      simulated: Boolean(window.WanderSimulationActive),
      points: [],
    };
    tracks.push(current);
    activeLine = L.polyline([], { weight: 5, opacity: 0.85 }).addTo(map);
    current.line = activeLine;
    addPoint(pointFromMotion(window.wanderMotionContext));
    setButton(true);
    render();
  }

  function stop() {
    if (!current) return;
    addPoint(pointFromMotion(window.wanderMotionContext));
    current.ended_at = new Date().toISOString();
    current.distance_m = distance(current.points);
    current.duration_s = duration(current);
    current = null;
    activeLine = null;
    setButton(false);
    render();
  }

  function toggle() {
    if (current) stop();
    else start();
  }

  function setButton(active) {
    const button = document.querySelector('#track-route-button');
    if (!button) return;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.title = active ? 'Detener grabación' : 'Grabar recorrido';
    const badge = document.querySelector('#track-status-badge');
    if (badge) badge.textContent = active ? 'REC' : 'OFF';
  }

  function summary(track) {
    const meters = track.distance_m ?? distance(track.points);
    const km = meters / 1000;
    const seconds = duration(track);
    const min = Math.floor(seconds / 60);
    return `${track.points.length} puntos · ${km.toFixed(2)} km · ${min} min`;
  }

  function exportTrack(track) {
    if (!track) return;
    const data = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: track.points.map((p) => [p.lng, p.lat]) },
      properties: {
        name: track.name,
        started_at: track.started_at,
        ended_at: track.ended_at,
        simulated: track.simulated,
        context_start: track.context_start,
      },
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/geo+json' }));
    a.download = `${track.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}.geojson`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function render() {
    const summaryEl = document.querySelector('#track-summary');
    if (summaryEl) {
      if (current) summaryEl.textContent = `Grabando: ${current.name} · ${summary(current)}`;
      else if (tracks.length) summaryEl.textContent = `${tracks.length} tracks guardados · Último: ${tracks[tracks.length - 1].name}`;
      else summaryEl.textContent = 'Sin recorridos grabados.';
    }
    ensureList();
    const list = document.querySelector('#wander-track-list');
    if (!list) return;
    list.innerHTML = tracks.map((track) => `
      <div class="wander-track-row" data-track-id="${track.id}">
        <div><strong>${track.name}</strong><small>${summary(track)}${track.ended_at ? '' : ' · grabando'}</small></div>
        <button type="button" data-export-track="${track.id}">Exportar</button>
      </div>
    `).join('');
    list.querySelectorAll('[data-export-track]').forEach((button) => {
      button.addEventListener('click', () => exportTrack(tracks.find((track) => track.id === button.dataset.exportTrack)));
    });
  }

  function ensureList() {
    if (document.querySelector('#wander-track-list')) return;
    const section = document.querySelector('.route-tracker-section');
    if (!section) return;
    const style = document.createElement('style');
    style.textContent = `.wander-track-list{display:grid;gap:8px;margin-top:10px}.wander-track-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px;border:1px solid rgba(24,32,27,.1);border-radius:12px;background:#fff}.wander-track-row strong{display:block;font-size:.78rem}.wander-track-row small{display:block;margin-top:2px;color:#667085;font-size:.68rem}.wander-track-row button{border:0;border-radius:9px;padding:7px 9px;background:#173f3b;color:#fff;font-size:.68rem;font-weight:800}`;
    document.head.appendChild(style);
    const list = document.createElement('div');
    list.id = 'wander-track-list';
    list.className = 'wander-track-list';
    section.appendChild(list);
  }

  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#track-route-button');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    toggle();
  }, true);

  document.addEventListener('wander:motion-context', (event) => {
    if (current) addPoint(pointFromMotion(event.detail));
  });

  document.querySelector('#save-route-button')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    exportTrack(current || tracks[tracks.length - 1]);
  }, true);

  window.WanderTracks = {
    tracks: () => tracks.map((track) => ({ ...track, line: undefined })),
    current: () => current,
    start,
    stop,
  };

  setButton(false);
  render();
})();
(() => {
  const base = window.WanderBase;
  const ctx = window.WanderContext;
  if (!base?.map || !ctx) return;

  const map = base.map;
  let marker = null;
  let point = null;

  const sheet = document.createElement('section');
  sheet.className = 'map-point-sheet';
  sheet.setAttribute('aria-label', 'Punto seleccionado');
  sheet.hidden = true;
  sheet.innerHTML = '<div class="map-point-head"><input id="map-point-name" aria-label="Nombre del punto" placeholder="Nombre del punto"></div><div class="map-point-data"><div class="wide"><span>Coordenadas</span><strong id="map-point-coordinates">—</strong></div><div><span>Distancia</span><strong id="map-point-distance">—</strong></div><div><span>Rumbo</span><strong id="map-point-bearing">—</strong></div></div><div class="map-point-actions"><button id="map-point-center" type="button" aria-label="Centrar POI" title="Centrar POI"><svg class="button-icon"><use href="wander-icons.svg#center"></use></svg></button><button id="map-point-properties" type="button" aria-label="Propiedades" title="Propiedades"><svg class="button-icon"><use href="wander-icons.svg#settings"></use></svg></button><button id="map-point-delete" class="danger" type="button" aria-label="Eliminar POI" title="Eliminar POI"><svg class="button-icon"><use href="wander-icons.svg#clear"></use></svg></button><button id="map-point-save" class="primary" type="button" aria-label="Guardar punto" title="Guardar punto"><svg class="button-icon"><use href="wander-icons.svg#pin"></use></svg></button></div>';
  document.body.appendChild(sheet);

  const name = sheet.querySelector('#map-point-name');
  const distance = sheet.querySelector('#map-point-distance');
  const bearing = sheet.querySelector('#map-point-bearing');
  const coordinates = sheet.querySelector('#map-point-coordinates');
  const centerButton = sheet.querySelector('#map-point-center');
  const propertiesButton = sheet.querySelector('#map-point-properties');
  const deleteButton = sheet.querySelector('#map-point-delete');
  const saveButton = sheet.querySelector('#map-point-save');
  const current = () => base.getPosition?.() || window.WanderMapPosition?.getPosition?.() || null;
  const distanceLabel = (m) => !Number.isFinite(m) ? '—' : m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;

  function nextMarkerName() {
    const items = window.WanderPersonalPOIs?.list?.() || [];
    const highest = items.reduce((max, poi) => {
      const match = String(poi?.name || '').match(/^Marcador\s+(\d+)$/i);
      return match ? Math.max(max, Number(match[1]) || 0) : max;
    }, 0);
    return 'Marcador ' + String(highest + 1).padStart(2, '0');
  }

  function bearingTo(a, b) {
    const p1 = a.lat * Math.PI / 180;
    const p2 = b.lat * Math.PI / 180;
    const d = (b.lng - a.lng) * Math.PI / 180;
    const y = Math.sin(d) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(d);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function updateMetrics() {
    if (!point) return;
    const target = point.mode === 'new' ? map.getCenter() : { lat: point.lat, lng: point.lng };
    if (point.mode === 'new') {
      point.lat = target.lat;
      point.lng = target.lng;
      point.name = name.value.trim() || nextMarkerName();
      marker?.setLatLng(target);
    }
    const here = current();
    point.distanceM = here ? map.distance(here, target) : null;
    point.bearingDeg = here ? bearingTo(here, target) : null;
    distance.textContent = distanceLabel(point.distanceM);
    bearing.textContent = Number.isFinite(point.bearingDeg) ? `${Math.round(point.bearingDeg)}°` : '—';
    coordinates.textContent = `${Number(point.lat).toFixed(6)}, ${Number(point.lng).toFixed(6)}`;
    ctx.set('map.selectedPoint', { ...point }, { source: 'waypoint-selector', kind: 'selected', confidence: 1 });
  }

  function icon() {
    return L.divIcon({ className: '', html: '<div class="map-point-marker" aria-hidden="true"><span></span></div>', iconSize: [42, 42], iconAnchor: [21, 21] });
  }

  function configureMode(mode) {
    const existing = mode === 'existing';
    sheet.dataset.mode = mode;
    name.readOnly = existing;
    centerButton.hidden = !existing;
    propertiesButton.hidden = !existing;
    deleteButton.hidden = !existing;
    saveButton.hidden = existing;
  }

  function showSheet() {
    sheet.hidden = false;
    sheet.classList.add('is-open');
  }

  function openAtCenter() {
    if (point?.mode === 'new' && !sheet.hidden) {
      clear();
      return;
    }
    clearMarker();
    const center = map.getCenter();
    const defaultName = nextMarkerName();
    point = { mode: 'new', lat: center.lat, lng: center.lng, name: defaultName, selectedAt: Date.now(), saved: false };
    name.value = defaultName;
    configureMode('new');
    showSheet();
    marker = L.marker(center, { icon: icon(), interactive: false, zIndexOffset: 1200 }).addTo(map);
    updateMetrics();
  }

  function openPOI(poi) {
    if (!poi) return;
    clearMarker();
    point = { ...poi, mode: 'existing', saved: true };
    name.value = poi.name || 'Marcador';
    configureMode('existing');
    showSheet();
    updateMetrics();
  }

  function clearMarker() {
    if (marker) map.removeLayer(marker);
    marker = null;
  }

  function clear() {
    clearMarker();
    point = null;
    sheet.classList.remove('is-open');
    sheet.hidden = true;
    ctx.remove?.('map.selectedPoint');
  }

  name.addEventListener('input', () => { if (point?.mode === 'new') updateMetrics(); });
  map.on('move zoom', () => { if (point?.mode === 'new') updateMetrics(); });
  window.addEventListener('wander:open-waypoint-center', openAtCenter);
  window.addEventListener('wander:personal-poi-selected', (event) => openPOI(event.detail?.poi));

  centerButton.addEventListener('click', () => {
    if (!point || point.mode !== 'existing') return;
    map.setView([point.lat, point.lng], Math.max(map.getZoom(), 16), { animate: true });
  });

  propertiesButton.addEventListener('click', () => {
    if (!point?.id) return;
    window.dispatchEvent(new CustomEvent('wander:personal-poi-properties', { detail: { id: point.id } }));
  });

  deleteButton.addEventListener('click', () => {
    if (!point?.id) return;
    const pois = window.WanderPersonalPOIs;
    const currentPOI = pois?.get?.(point.id);
    if (!currentPOI || !window.confirm(`¿Eliminar ${currentPOI.name}?`)) return;
    if (pois.remove?.(point.id)) clear();
  });

  saveButton.addEventListener('click', () => {
    if (!point || point.mode !== 'new') return;
    const pois = window.WanderPersonalPOIs;
    if (!pois?.createAt || !pois?.list) {
      window.WanderUI?.showWander('Todavía no disponible', 'El sistema de puntos personales aún se está iniciando.');
      return;
    }
    const before = new Set(pois.list().map((poi) => poi.id));
    if (!pois.createAt({ lat: point.lat, lng: point.lng })) return;
    const added = pois.list().find((poi) => !before.has(poi.id));
    const custom = name.value.trim();
    if (added && custom) pois.update?.(added.id, { name: custom });
    clear();
  });

  ctx.subscribe((key) => {
    if (point && (key === 'location.effective' || key.startsWith('location.effective.'))) updateMetrics();
  });

  window.WanderMapSelectedPoint = Object.freeze({ getCurrent: () => point ? { ...point } : null, openAtCenter, openPOI, clear });
  window.dispatchEvent(new CustomEvent('wander:waypoint-selector-ready'));
})();
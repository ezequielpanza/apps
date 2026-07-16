(() => {
  const base = window.WanderBase;
  const ctx = window.WanderContext;
  const pois = window.WanderPersonalPOIs;
  if (!base?.map || !ctx || !pois) return;

  const map = base.map;
  let marker = null;
  let point = null;

  const sheet = document.createElement('section');
  sheet.className = 'map-point-sheet';
  sheet.setAttribute('aria-label', 'Punto seleccionado');
  sheet.hidden = true;
  sheet.innerHTML = '<div class="map-point-head"><input id="map-point-name" value="Punto seleccionado" aria-label="Nombre del punto" placeholder="Nombre del punto"><button id="map-point-close" type="button" aria-label="Cerrar"><svg class="ui-icon"><use href="wander-icons.svg#close"></use></svg></button></div><div class="map-point-data"><div class="wide"><span>Coordenadas</span><strong id="map-point-coordinates">—</strong></div><div><span>Distancia</span><strong id="map-point-distance">—</strong></div><div><span>Rumbo</span><strong id="map-point-bearing">—</strong></div></div><button id="map-point-save" class="map-point-save" type="button"><svg class="button-icon"><use href="wander-icons.svg#pin"></use></svg>Guardar punto</button>';
  (document.body || document.documentElement).appendChild(sheet);

  const name = sheet.querySelector('#map-point-name');
  const distance = sheet.querySelector('#map-point-distance');
  const bearing = sheet.querySelector('#map-point-bearing');
  const coordinates = sheet.querySelector('#map-point-coordinates');
  const current = () => base.getPosition?.() || window.WanderMapPosition?.getPosition?.() || null;
  const distanceLabel = (m) => !Number.isFinite(m) ? '—' : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;

  function bearingTo(a, b) {
    const p1 = a.lat * Math.PI / 180;
    const p2 = b.lat * Math.PI / 180;
    const d = (b.lng - a.lng) * Math.PI / 180;
    const y = Math.sin(d) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(d);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function updateFromCenter() {
    if (!point) return;
    const center = map.getCenter();
    point.lat = center.lat;
    point.lng = center.lng;
    point.name = name.value.trim() || 'Punto seleccionado';
    const here = current();
    point.distanceM = here ? map.distance(here, center) : null;
    point.bearingDeg = here ? bearingTo(here, center) : null;
    marker?.setLatLng(center);
    distance.textContent = distanceLabel(point.distanceM);
    bearing.textContent = Number.isFinite(point.bearingDeg) ? `${Math.round(point.bearingDeg)}°` : '—';
    coordinates.textContent = `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
    ctx.set('map.selectedPoint', { ...point }, { source: 'waypoint-center', kind: 'selected', confidence: 1 });
  }

  function icon() {
    return L.divIcon({ className: '', html: '<div class="map-point-marker"><span></span></div>', iconSize: [34, 42], iconAnchor: [17, 21] });
  }

  function showSheet() {
    sheet.hidden = false;
    sheet.classList.add('is-open');
    sheet.style.setProperty('display', 'block', 'important');
    sheet.style.setProperty('visibility', 'visible', 'important');
    sheet.style.setProperty('opacity', '1', 'important');
    sheet.style.setProperty('pointer-events', 'auto', 'important');
  }

  function openAtCenter() {
    const center = map.getCenter();
    point = { lat: center.lat, lng: center.lng, name: 'Punto seleccionado', selectedAt: Date.now(), saved: false };
    name.value = point.name;
    showSheet();
    updateFromCenter();

    try {
      if (!marker) marker = L.marker(center, { icon: icon(), interactive: false, zIndexOffset: 1200 }).addTo(map);
      else marker.setLatLng(center).addTo(map);
    } catch (error) {
      console.error('[Wander] No se pudo crear el marcador de Waypoint.', error);
    }
  }

  function clear() {
    if (marker) map.removeLayer(marker);
    marker = null;
    point = null;
    sheet.classList.remove('is-open');
    sheet.hidden = true;
    sheet.style.removeProperty('display');
    sheet.style.removeProperty('visibility');
    sheet.style.removeProperty('opacity');
    sheet.style.removeProperty('pointer-events');
    ctx.remove?.('map.selectedPoint');
  }

  name.addEventListener('input', updateFromCenter);
  sheet.querySelector('#map-point-close').addEventListener('click', clear);
  map.on('move zoom', updateFromCenter);
  window.addEventListener('wander:open-waypoint-center', openAtCenter);

  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('.wander-personal-map-actions .wander-map-action');
    if (!button || button !== button.parentElement?.firstElementChild) return;
    event.preventDefault();
    openAtCenter();
  });

  sheet.querySelector('#map-point-save').addEventListener('click', () => {
    if (!point) return;
    const before = new Set(pois.list().map((poi) => poi.id));
    if (!pois.createAt({ lat: point.lat, lng: point.lng })) return;
    const added = pois.list().find((poi) => !before.has(poi.id));
    const custom = name.value.trim();
    if (added && custom && custom !== 'Punto seleccionado') pois.update?.(added.id, { name: custom });
    clear();
  });

  ctx.subscribe((key) => {
    if (point && (key === 'location.effective' || key.startsWith('location.effective.'))) updateFromCenter();
  });

  window.WanderMapSelectedPoint = Object.freeze({
    getCurrent: () => point ? { ...point } : null,
    openAtCenter,
    clear,
  });
})();
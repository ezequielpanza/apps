const DEFAULT_VIEW = [20, 0];

const map = L.map('wander-map', {
  zoomControl: false,
  attributionControl: false,
}).setView(DEFAULT_VIEW, 2);

L.control.attribution({
  position: 'bottomright',
  prefix: false,
}).addTo(map);

const baseLayers = {
  streets: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri',
  }),
};

let activeBaseLayer = 'streets';
baseLayers[activeBaseLayer].addTo(map);

const userIcon = L.divIcon({
  className: '',
  html: '<div class="wander-user-dot"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const route = L.polyline([], {
  weight: 5,
  opacity: 0.8,
  lineCap: 'round',
  lineJoin: 'round',
}).addTo(map);

let marker = null;
let position = null;

function createMarker(latlng) {
  const nextMarker = L.marker(latlng, {
    draggable: true,
    icon: userIcon,
  }).addTo(map);

  nextMarker.on('dragend', () => {
    const next = nextMarker.getLatLng();
    setPosition(next, { source: 'manual', confidence: 0.8 });
    window.WanderUI?.setMotion(false, 0, null);
    window.WanderTracks?.addPoint(next);
  });

  return nextMarker;
}

function setPosition(latlng, options = {}) {
  if (!latlng) return null;
  const next = L.latLng(latlng);
  if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return null;

  position = next;

  if (!marker) marker = createMarker(next);
  else marker.setLatLng(next);

  if (options.updateContext !== false) {
    window.WanderContext?.setLocation({
      lat: next.lat,
      lng: next.lng,
      source: options.source || 'app',
      confidence: options.confidence ?? 0.8,
    });
  }

  return next;
}

function clearPosition() {
  position = null;
  if (marker) {
    map.removeLayer(marker);
    marker = null;
  }
}

function centerOnPosition(zoom = 15) {
  if (!position) return false;
  map.setView(position, Math.max(map.getZoom(), zoom));
  return true;
}

function setBaseLayer(name) {
  if (!baseLayers[name] || name === activeBaseLayer) return activeBaseLayer;
  map.removeLayer(baseLayers[activeBaseLayer]);
  baseLayers[name].addTo(map);
  activeBaseLayer = name;
  return activeBaseLayer;
}

function toggleBaseLayer() {
  return setBaseLayer(activeBaseLayer === 'streets' ? 'satellite' : 'streets');
}

window.map = map;
window.WanderBase = {
  map,
  route,
  hasPosition: () => Boolean(position),
  getPosition: () => position ? L.latLng(position) : null,
  getMarker: () => marker,
  setPosition,
  clearPosition,
  centerOnPosition,
  setBaseLayer,
  toggleBaseLayer,
  getBaseLayer: () => activeBaseLayer,
};

setTimeout(() => map.invalidateSize(), 100);

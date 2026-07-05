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

function effectivePosition() {
  const location = window.WanderContext?.getEffectiveLocation?.();
  if (!location) return null;
  return L.latLng(location.lat, location.lng);
}

function syncEffectiveMarker() {
  const next = effectivePosition();
  if (!next) {
    if (marker) {
      map.removeLayer(marker);
      marker = null;
    }
    return null;
  }

  if (!marker) {
    marker = L.marker(next, { icon: userIcon, interactive: false }).addTo(map);
  } else {
    marker.setLatLng(next);
  }
  return next;
}

function centerOnPosition(zoom = 15) {
  const position = effectivePosition();
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

function mapButton(iconName, label) {
  const button = L.DomUtil.create('button', 'wander-map-action');
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="wander-icons.svg#' + iconName + '"></use></svg>';
  L.DomEvent.disableClickPropagation(button);
  L.DomEvent.disableScrollPropagation(button);
  return button;
}

const MapActions = L.Control.extend({
  options: { position: 'bottomright' },
  onAdd() {
    const wrap = L.DomUtil.create('div', 'wander-map-actions');
    const layerButton = mapButton('layers', 'Cambiar a mapa satélite');
    const centerButton = mapButton('center', 'Centrar en mi posición');

    layerButton.addEventListener('click', () => {
      const active = toggleBaseLayer();
      const nextLabel = active === 'streets' ? 'Cambiar a mapa satélite' : 'Cambiar a mapa de calles';
      layerButton.setAttribute('aria-label', nextLabel);
      layerButton.title = nextLabel;
    });

    centerButton.addEventListener('click', () => {
      if (!centerOnPosition()) {
        window.WanderUI?.showWander('Sin ubicación', 'Todavía no hay una ubicación efectiva válida para centrar el mapa.');
      }
    });

    wrap.append(layerButton, centerButton);
    return wrap;
  },
});

map.addControl(new MapActions());

window.WanderContext?.subscribe((key) => {
  if (key === 'location.effective' || key.startsWith('location.effective.')) syncEffectiveMarker();
});

window.map = map;
window.WanderBase = {
  map,
  route,
  hasPosition: () => Boolean(effectivePosition()),
  getPosition: () => effectivePosition(),
  getMarker: () => marker,
  syncEffectiveMarker,
  centerOnPosition,
  setBaseLayer,
  toggleBaseLayer,
  getBaseLayer: () => activeBaseLayer,
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

syncEffectiveMarker();
setTimeout(() => map.invalidateSize(), 100);

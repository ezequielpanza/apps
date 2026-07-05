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
let marker = null;
let markerDragActive = false;
let initialRealLocationCentered = false;
let followMode = false;
let centerButton = null;

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

function finiteCoordinate(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function simulationEnabled() {
  return window.WanderContext?.value('simulation.status') === 'active';
}

function realPosition() {
  const lat = finiteCoordinate(window.WanderContext?.value('location.real.lat'));
  const lng = finiteCoordinate(window.WanderContext?.value('location.real.lng'));
  if (lat === null || lng === null) return null;
  return L.latLng(lat, lng);
}

function effectivePosition() {
  const location = window.WanderContext?.getEffectiveLocation?.();
  if (!location) return null;
  return L.latLng(location.lat, location.lng);
}

function centerIconMarkup(active = false) {
  const dotFill = active ? '#01E0CB' : 'none';
  const dotStroke = active ? '#01E0CB' : 'currentColor';
  return '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="12" cy="12" r="5" fill="' + dotFill + '" stroke="' + dotStroke + '"></circle>' +
    '<path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path>' +
    '</svg>';
}

function syncFollowButton() {
  if (!centerButton) return;
  centerButton.setAttribute('aria-pressed', String(followMode));
  centerButton.setAttribute('aria-label', followMode ? 'Desactivar seguimiento centrado' : 'Centrar y seguir mi posición');
  centerButton.title = followMode ? 'Desactivar seguimiento centrado' : 'Centrar y seguir mi posición';
  centerButton.innerHTML = centerIconMarkup(followMode);
  centerButton.style.color = followMode ? 'var(--accent)' : 'var(--green)';
  centerButton.style.boxShadow = followMode ? '0 0 0 3px var(--accent-ring), var(--shadow)' : 'var(--shadow)';
}

function setFollowMode(next, { centerNow = true } = {}) {
  followMode = Boolean(next);
  syncFollowButton();

  if (followMode && centerNow) {
    const position = effectivePosition();
    if (!position) {
      followMode = false;
      syncFollowButton();
      return false;
    }
    map.setView(position, Math.max(map.getZoom(), 15));
  }

  return followMode;
}

function followEffectivePosition() {
  if (!followMode || markerDragActive) return false;
  const position = effectivePosition();
  if (!position) return false;
  map.panTo(position, { animate: false });
  return true;
}

function syncMarkerDraggable() {
  if (!marker) return;
  if (simulationEnabled()) marker.dragging?.enable();
  else {
    markerDragActive = false;
    marker.dragging?.disable();
  }
}

function bindMarkerDrag(nextMarker) {
  nextMarker.on('dragstart', () => {
    if (!simulationEnabled()) return;
    markerDragActive = true;
  });

  nextMarker.on('dragend', () => {
    const wasSimulation = simulationEnabled();
    const next = nextMarker.getLatLng();
    markerDragActive = false;

    if (!wasSimulation) {
      syncEffectiveMarker();
      return;
    }

    window.WanderContext?.setLocationOverride({
      lat: next.lat,
      lng: next.lng,
      speedMps: 0,
    });
  });
}

function syncEffectiveMarker() {
  const next = effectivePosition();
  if (!next) {
    if (marker) {
      map.removeLayer(marker);
      marker = null;
      markerDragActive = false;
    }
    return null;
  }

  if (!marker) {
    marker = L.marker(next, {
      icon: userIcon,
      interactive: true,
      draggable: simulationEnabled(),
    }).addTo(map);
    bindMarkerDrag(marker);
  } else if (!markerDragActive) {
    marker.setLatLng(next);
  }

  syncMarkerDraggable();
  followEffectivePosition();
  return next;
}

function centerOnFirstRealLocation() {
  if (initialRealLocationCentered) return false;
  const position = realPosition();
  if (!position) return false;
  initialRealLocationCentered = true;
  map.setView(position, Math.max(map.getZoom(), 15));
  return true;
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
    centerButton = mapButton('center', 'Centrar y seguir mi posición');
    centerButton.setAttribute('aria-pressed', 'false');

    layerButton.addEventListener('click', () => {
      const active = toggleBaseLayer();
      const nextLabel = active === 'streets' ? 'Cambiar a mapa satélite' : 'Cambiar a mapa de calles';
      layerButton.setAttribute('aria-label', nextLabel);
      layerButton.title = nextLabel;
    });

    centerButton.addEventListener('click', () => {
      if (followMode) {
        setFollowMode(false, { centerNow: false });
        return;
      }

      if (!setFollowMode(true)) {
        window.WanderUI?.showWander('Sin ubicación', 'Todavía no hay una ubicación efectiva válida para activar el seguimiento.');
      }
    });

    wrap.append(layerButton, centerButton);
    syncFollowButton();
    return wrap;
  },
});

map.addControl(new MapActions());

map.on('dragstart', () => {
  if (followMode) setFollowMode(false, { centerNow: false });
});

window.WanderContext?.subscribe((key) => {
  if (key === 'location.effective' || key.startsWith('location.effective.')) syncEffectiveMarker();
  if (key === 'location.real' || key.startsWith('location.real.')) centerOnFirstRealLocation();
  if (key === 'simulation.status') {
    syncMarkerDraggable();
    syncEffectiveMarker();
  }
});

window.map = map;
window.WanderBase = {
  map,
  route,
  hasPosition: () => Boolean(effectivePosition()),
  getPosition: () => effectivePosition(),
  getRealPosition: () => realPosition(),
  getMarker: () => marker,
  syncEffectiveMarker,
  syncMarkerDraggable,
  centerOnPosition,
  centerOnFirstRealLocation,
  setFollowMode,
  isFollowingPosition: () => followMode,
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
centerOnFirstRealLocation();
setTimeout(() => map.invalidateSize(), 100);

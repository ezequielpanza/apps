(() => {
  const core = window.WanderMapCore;
  const context = window.WanderContext;
  if (!core || !context) return;

  const map = core.map;
  const mapContainer = map.getContainer();
  const LONG_PRESS_MS = 550;
  const LONG_PRESS_MOVE_TOLERANCE_PX = 12;
  const PLACEMENT_DEDUP_MS = 800;
  const LAST_POSITION_KEY = 'wander.location.last.v1';
  const userIcon = L.divIcon({
    className: '',
    html: '<div class="wander-user-dot"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

  let marker = null;
  let rememberedMarker = null;
  let remembered = loadRememberedPosition();
  let markerDragActive = false;
  let initialRealLocationCentered = false;
  let followMode = false;
  let longPress = null;
  let lastPlacementAt = 0;

  function finiteCoordinate(value) {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function validCoordinate(lat, lng) {
    return lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  function loadRememberedPosition() {
    try {
      const stored = JSON.parse(localStorage.getItem(LAST_POSITION_KEY) || 'null');
      const lat = finiteCoordinate(stored?.lat);
      const lng = finiteCoordinate(stored?.lng);
      if (!validCoordinate(lat, lng)) return null;
      return {
        lat,
        lng,
        accuracy: finiteCoordinate(stored.accuracy),
        updatedAt: Number(stored.updatedAt) || Date.parse(stored.updatedAt || '') || 0,
        zoom: Number.isFinite(Number(stored.zoom)) ? Number(stored.zoom) : 15,
      };
    } catch { return null; }
  }

  function saveRememberedPosition(position = realPosition()) {
    if (!position) return false;
    const accuracy = finiteCoordinate(context.value('location.real.accuracy'));
    if (accuracy !== null && accuracy > 250) return false;
    const updatedAt = Date.parse(context.value('location.real.updatedAt') || '') || Date.now();
    remembered = { lat: position.lat, lng: position.lng, accuracy, updatedAt, zoom: map.getZoom() };
    try { localStorage.setItem(LAST_POSITION_KEY, JSON.stringify(remembered)); } catch {}
    context.set('location.remembered', { ...remembered }, { source: 'location-memory', kind: 'observed', ttlMs: Infinity, confidence: 1 });
    return true;
  }

  function showRememberedPosition() {
    if (!remembered || realPosition()) return false;
    const point = L.latLng(remembered.lat, remembered.lng);
    const zoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), remembered.zoom || 15));
    map.setView(point, zoom, { animate: false });
    rememberedMarker = L.circleMarker(point, {
      radius: 8,
      weight: 2,
      color: '#667085',
      fillColor: '#ffffff',
      fillOpacity: .92,
      opacity: .9,
      dashArray: '3 3',
      interactive: true,
    }).addTo(map);
    const date = remembered.updatedAt ? new Date(remembered.updatedAt).toLocaleString('es-AR') : 'momento desconocido';
    rememberedMarker.bindTooltip(`Última posición guardada · ${date}`, { direction: 'top' });
    context.set('location.remembered', { ...remembered }, { source: 'location-memory', kind: 'observed', ttlMs: Infinity, confidence: 1 });
    return true;
  }

  function hideRememberedPosition() {
    if (!rememberedMarker) return;
    map.removeLayer(rememberedMarker);
    rememberedMarker = null;
  }

  function simulationEnabled() {
    return context.value('simulation.status') === 'active';
  }

  function realPosition() {
    const lat = finiteCoordinate(context.value('location.real.lat'));
    const lng = finiteCoordinate(context.value('location.real.lng'));
    return validCoordinate(lat, lng) ? L.latLng(lat, lng) : null;
  }

  function effectivePosition() {
    const location = context.getEffectiveLocation?.();
    return location ? L.latLng(location.lat, location.lng) : null;
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
      if (simulationEnabled()) markerDragActive = true;
    });

    nextMarker.on('dragend', () => {
      const next = nextMarker.getLatLng();
      markerDragActive = false;
      if (!simulationEnabled()) return syncEffectiveMarker();
      window.WanderProviders?.simulator?.setPosition?.(next.lat, next.lng, { source: 'marker-drag' });
    });
  }

  function followPosition(next) {
    if (!followMode || !next) return false;
    if (window.WanderMapControls?.followPosition?.(next)) return true;
    if (map.distance(map.getCenter(), next) >= .25) map.panTo(next, { animate: false, noMoveStart: true });
    return true;
  }

  function syncEffectiveMarker() {
    const next = effectivePosition();
    if (!next) {
      if (marker) map.removeLayer(marker);
      marker = null;
      markerDragActive = false;
      return null;
    }

    hideRememberedPosition();
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
    followPosition(next);
    return next;
  }

  function centerOnFirstRealLocation() {
    if (initialRealLocationCentered) return false;
    const position = realPosition();
    if (!position) return false;
    initialRealLocationCentered = true;
    hideRememberedPosition();
    const zoom = remembered ? map.getZoom() : Math.max(map.getZoom(), 15);
    map.setView(position, zoom, { animate: false });
    saveRememberedPosition(position);
    return true;
  }

  function centerOnPosition() {
    const position = effectivePosition();
    if (!position) return false;
    if (followMode && window.WanderMapControls?.followPosition?.(position)) return true;
    if (map.distance(map.getCenter(), position) >= .25) map.panTo(position, { animate: false, noMoveStart: true });
    return true;
  }

  function setFollowMode(next, { centerNow = true } = {}) {
    followMode = Boolean(next);
    if (followMode && centerNow && !centerOnPosition()) followMode = false;
    return followMode;
  }

  function interactiveTarget(target) {
    return Boolean(target?.closest?.('.leaflet-marker-icon, .leaflet-control, .wander-top-controls, .simulation-map-controls'));
  }

  function cancelLongPress(pointerId = null) {
    if (!longPress) return;
    if (pointerId !== null && longPress.pointerId !== pointerId) return;
    if (longPress.timer) clearTimeout(longPress.timer);
    longPress = null;
  }

  function placeSimulatorLatLng(latLng, source = 'map-long-press') {
    const simulator = window.WanderProviders?.simulator;
    if (!simulationEnabled() || !simulator?.isEnabled?.() || !latLng) return false;
    const now = Date.now();
    if (now - lastPlacementAt < PLACEMENT_DEDUP_MS) return false;
    const placed = simulator.setPosition?.(latLng.lat, latLng.lng, { source }) === true;
    if (placed) lastPlacementAt = now;
    return placed;
  }

  function placeSimulatorPin(clientX, clientY) {
    const rect = mapContainer.getBoundingClientRect();
    const point = L.point(clientX - rect.left, clientY - rect.top);
    return placeSimulatorLatLng(map.containerPointToLatLng(point));
  }

  function beginLongPress(event) {
    if (!simulationEnabled() || event.isPrimary === false || event.button > 0 || interactiveTarget(event.target)) return;
    cancelLongPress();
    const state = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, timer: null };
    state.timer = setTimeout(() => {
      if (longPress !== state || !simulationEnabled()) return;
      placeSimulatorPin(state.startX, state.startY);
      longPress = null;
    }, LONG_PRESS_MS);
    longPress = state;
  }

  function moveLongPress(event) {
    if (!longPress || event.pointerId !== longPress.pointerId) return;
    const moved = Math.hypot(event.clientX - longPress.startX, event.clientY - longPress.startY);
    if (moved > LONG_PRESS_MOVE_TOLERANCE_PX) cancelLongPress(event.pointerId);
  }

  mapContainer.addEventListener('pointerdown', beginLongPress);
  mapContainer.addEventListener('pointermove', moveLongPress);
  window.addEventListener('pointerup', (event) => cancelLongPress(event.pointerId));
  window.addEventListener('pointercancel', (event) => cancelLongPress(event.pointerId));

  map.on('contextmenu', (event) => {
    if (!simulationEnabled()) return;
    event.originalEvent?.preventDefault?.();
    cancelLongPress();
    placeSimulatorLatLng(event.latlng, 'map-long-press');
  });

  mapContainer.addEventListener('contextmenu', (event) => {
    if (simulationEnabled()) event.preventDefault();
  });

  map.on('zoomend', () => {
    if (realPosition()) saveRememberedPosition();
    else if (remembered) {
      remembered.zoom = map.getZoom();
      try { localStorage.setItem(LAST_POSITION_KEY, JSON.stringify(remembered)); } catch {}
    }
  });

  context.subscribe((key) => {
    if (key === 'location.effective' || key.startsWith('location.effective.')) syncEffectiveMarker();
    if (key === 'location.real' || key.startsWith('location.real.')) {
      centerOnFirstRealLocation();
      saveRememberedPosition();
    }
    if (key === 'simulation.status') {
      if (!simulationEnabled()) cancelLongPress();
      syncMarkerDraggable();
      syncEffectiveMarker();
    }
  });

  window.WanderMapPosition = {
    getPosition: effectivePosition,
    getRealPosition: realPosition,
    getRememberedPosition: () => remembered ? L.latLng(remembered.lat, remembered.lng) : null,
    getMarker: () => marker,
    syncEffectiveMarker,
    syncMarkerDraggable,
    centerOnPosition,
    centerOnFirstRealLocation,
    setFollowMode,
    isFollowingPosition: () => followMode,
  };

  showRememberedPosition();
  syncEffectiveMarker();
  centerOnFirstRealLocation();
})();
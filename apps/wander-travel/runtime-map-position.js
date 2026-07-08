(() => {
  const core = window.WanderMapCore;
  const context = window.WanderContext;
  if (!core || !context) return;

  const map = core.map;
  const mapContainer = map.getContainer();
  const LONG_PRESS_MS = 550;
  const LONG_PRESS_MOVE_TOLERANCE_PX = 12;
  const PLACEMENT_DEDUP_MS = 800;
  const userIcon = L.divIcon({
    className: '',
    html: '<div class="wander-user-dot"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

  let marker = null;
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

  function simulationEnabled() {
    return context.value('simulation.status') === 'active';
  }

  function realPosition() {
    const lat = finiteCoordinate(context.value('location.real.lat'));
    const lng = finiteCoordinate(context.value('location.real.lng'));
    return lat === null || lng === null ? null : L.latLng(lat, lng);
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

  function syncEffectiveMarker() {
    const next = effectivePosition();
    if (!next) {
      if (marker) map.removeLayer(marker);
      marker = null;
      markerDragActive = false;
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
    if (followMode) map.panTo(next, { animate: false });
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

  function centerOnPosition() {
    const position = effectivePosition();
    if (!position) return false;
    map.panTo(position, { animate: false });
    return true;
  }

  function setFollowMode(next, { centerNow = true } = {}) {
    followMode = Boolean(next);
    if (followMode && centerNow && !centerOnPosition()) followMode = false;
    return followMode;
  }

  function interactiveTarget(target) {
    return Boolean(target?.closest?.(
      '.leaflet-marker-icon, .leaflet-control, .wander-top-controls, .simulation-map-controls'
    ));
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

    const state = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer: null,
    };

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

  context.subscribe((key) => {
    if (key === 'location.effective' || key.startsWith('location.effective.')) syncEffectiveMarker();
    if (key === 'location.real' || key.startsWith('location.real.')) centerOnFirstRealLocation();
    if (key === 'simulation.status') {
      if (!simulationEnabled()) cancelLongPress();
      syncMarkerDraggable();
      syncEffectiveMarker();
    }
  });

  window.WanderMapPosition = {
    getPosition: effectivePosition,
    getRealPosition: realPosition,
    getMarker: () => marker,
    syncEffectiveMarker,
    syncMarkerDraggable,
    centerOnPosition,
    centerOnFirstRealLocation,
    setFollowMode,
    isFollowingPosition: () => followMode,
  };

  syncEffectiveMarker();
  centerOnFirstRealLocation();
})();

(() => {
  const core = window.WanderMapCore;
  const context = window.WanderContext;
  if (!core || !context) return;

  const map = core.map;
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
      context.setLocationOverride({ lat: next.lat, lng: next.lng, speedMps: 0 });
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

  context.subscribe((key) => {
    if (key === 'location.effective' || key.startsWith('location.effective.')) syncEffectiveMarker();
    if (key === 'location.real' || key.startsWith('location.real.')) centerOnFirstRealLocation();
    if (key === 'simulation.status') {
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

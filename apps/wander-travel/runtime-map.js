(() => {
  const core = window.WanderMapCore;
  const position = window.WanderMapPosition;
  const controls = window.WanderMapControls;
  if (!core || !position || !controls) return;

  window.map = core.map;
  window.WanderBase = {
    map: core.map,
    route: core.route,
    hasPosition: () => Boolean(position.getPosition()),
    getPosition: position.getPosition,
    getRealPosition: position.getRealPosition,
    getMarker: position.getMarker,
    syncEffectiveMarker: position.syncEffectiveMarker,
    syncMarkerDraggable: position.syncMarkerDraggable,
    centerOnPosition: position.centerOnPosition,
    centerOnFirstRealLocation: position.centerOnFirstRealLocation,
    setFollowMode: controls.setFollowMode,
    isFollowingPosition: position.isFollowingPosition,
    setBaseLayer: core.setBaseLayer,
    toggleBaseLayer: core.toggleBaseLayer,
    getBaseLayer: core.getBaseLayer,
  };

  setTimeout(() => core.map.invalidateSize(), 100);
})();

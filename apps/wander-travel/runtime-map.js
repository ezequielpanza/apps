(() => {
  const core = window.WanderMapCore;
  const position = window.WanderMapPosition;
  const controls = window.WanderMapControls;
  if (!core || !position || !controls) return;

  window.map = core.map;
  window.WanderBase = {
    map: core.map,
    route: core.route,
    currentTrack: core.currentTrack,
    hasPosition: () => Boolean(position.getPosition() || position.getRememberedPosition?.()),
    getPosition: position.getPosition,
    getRealPosition: position.getRealPosition,
    getRememberedPosition: position.getRememberedPosition,
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

  const ACTIVE_SESSION_KEY = 'wander.session.active.v1';
  const PERSONAL_POI_KEY = 'wander.personalPOIs.v1';
  let bootCursor = null;
  let bootWaypoints = null;

  function json(key, fallback = null) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value ?? fallback;
    } catch { return fallback; }
  }

  function latLngFromPoint(point) {
    if (Array.isArray(point)) {
      const lat = Number(point[0]);
      const lng = Number(point[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const compact = Math.abs(lat) > 90 || Math.abs(lng) > 180;
      return [compact ? lat / 1e7 : lat, compact ? lng / 1e7 : lng];
    }
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  }

  function renderCurrentTrackImmediately() {
    const active = json(ACTIVE_SESSION_KEY, null);
    if (!active || !Array.isArray(active.segments)) return 0;
    const segments = active.segments
      .filter((segment) => segment?.type === 'movement')
      .map((segment) => (segment.points || []).map(latLngFromPoint).filter(Boolean))
      .filter((points) => points.length > 0);
    core.currentTrack?.setLatLngs?.(segments);
    return segments.reduce((total, points) => total + points.length, 0);
  }

  function bootWaypointIcon() {
    return L.divIcon({
      className: '',
      html: '<div class="wander-personal-poi-marker"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"></path><circle cx="12" cy="10" r="2"></circle></svg></div>',
      iconSize: [30, 36],
      iconAnchor: [15, 36],
    });
  }

  function renderWaypointsImmediately() {
    const items = json(PERSONAL_POI_KEY, []);
    if (!Array.isArray(items) || !items.length) return 0;
    bootWaypoints = L.layerGroup().addTo(core.map);
    let count = 0;
    items.forEach((poi) => {
      const lat = Number(poi?.lat);
      const lng = Number(poi?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      L.marker([lat, lng], {
        icon: bootWaypointIcon(),
        title: String(poi?.name || 'Waypoint'),
        interactive: false,
        keyboard: false,
      }).addTo(bootWaypoints);
      count += 1;
    });
    return count;
  }

  function removeRememberedGhost() {
    const remembered = position.getRememberedPosition?.();
    if (!remembered) return;
    core.map.eachLayer((layer) => {
      if (!(layer instanceof L.CircleMarker)) return;
      const point = layer.getLatLng?.();
      if (!point || core.map.distance(point, remembered) > 0.5) return;
      const tooltip = String(layer.getTooltip?.()?.getContent?.() || '');
      if (tooltip.startsWith('Última posición guardada')) core.map.removeLayer(layer);
    });
  }

  function renderRawCursorImmediately() {
    if (position.getMarker?.()) return true;
    const remembered = position.getRememberedPosition?.();
    if (!remembered) return false;
    removeRememberedGhost();
    const icon = L.divIcon({
      className: '',
      html: '<div class="wander-user-dot"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    bootCursor = L.marker(remembered, { icon, interactive: false, keyboard: false, zIndexOffset: 900 }).addTo(core.map);
    core.map.setView(remembered, core.map.getZoom(), { animate: false });
    return true;
  }

  function clearBootCursorWhenLive() {
    if (!bootCursor) return;
    const live = position.getRealPosition?.();
    if (!live) return;
    core.map.removeLayer(bootCursor);
    bootCursor = null;
    position.syncEffectiveMarker?.();
  }

  function handOffBootWaypoints() {
    if (!bootWaypoints) return;
    core.map.removeLayer(bootWaypoints);
    bootWaypoints = null;
  }

  function loadCoreCrosshair() {
    if (window.WanderMapCrosshair) return Promise.resolve(true);
    if (!document.querySelector('link[data-wander-map-crosshair]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = './wander-map-crosshair.css?v=20260816-02';
      link.dataset.wanderMapCrosshair = 'true';
      document.head.appendChild(link);
    }
    const existing = document.querySelector('script[data-wander-map-crosshair]');
    if (existing) {
      if (existing.dataset.loaded === 'true') return Promise.resolve(Boolean(window.WanderMapCrosshair));
      return new Promise((resolve) => {
        existing.addEventListener('load', () => resolve(Boolean(window.WanderMapCrosshair)), { once: true });
        existing.addEventListener('error', () => resolve(false), { once: true });
      });
    }
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = './runtime-map-crosshair.js?v=20260816-02';
      script.async = false;
      script.dataset.wanderMapCrosshair = 'true';
      script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve(Boolean(window.WanderMapCrosshair));
      }, { once: true });
      script.addEventListener('error', () => resolve(false), { once: true });
      document.head.appendChild(script);
    });
  }

  function bootstrapContextHud() {
    if (window.WanderContextHUD || document.querySelector('script[data-wander-context-hud-bootstrap]')) return;
    const script = document.createElement('script');
    script.src = './runtime-context-hud.js?v=20260816-01';
    script.async = true;
    script.dataset.wanderContextHudBootstrap = 'true';
    document.head.appendChild(script);
  }

  const trackPoints = renderCurrentTrackImmediately();
  const waypointCount = renderWaypointsImmediately();
  const hasRawCursor = renderRawCursorImmediately();
  const crosshairReady = loadCoreCrosshair();
  bootstrapContextHud();

  window.WanderContext?.subscribe?.((key) => {
    if (typeof key !== 'string') return;
    if (key === 'location.real' || key.startsWith('location.real.')) clearBootCursorWhenLive();
  });
  window.addEventListener('wander:personal-poi-ready', handOffBootWaypoints, { once: true });
  window.addEventListener('wander:sessions-changed', () => window.WanderTracks?.syncCurrentTrack?.(), { once: true });

  function announceCoreReady() {
    if (window.WanderCoreReady) return;
    window.WanderCoreReady = true;
    document.documentElement.dataset.wanderCoreReady = 'true';
    window.dispatchEvent(new CustomEvent('wander:core-ready', {
      detail: {
        at: Date.now(),
        hasRawCursor,
        trackPoints,
        waypointCount,
        crosshairReady: Boolean(window.WanderMapCrosshair),
      },
    }));
  }

  const paintCore = () => {
    try { core.map.invalidateSize({ pan: false, animate: false }); } catch {}
    Promise.resolve(crosshairReady).finally(announceCoreReady);
  };

  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(paintCore);
  else paintCore();
  // Never let an auxiliary overlay prevent the offline core from becoming usable.
  setTimeout(announceCoreReady, 250);
  setTimeout(() => core.map.invalidateSize(), 100);
})();

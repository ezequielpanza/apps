(() => {
  const TRANSPARENT_TILE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="transparent"/></svg>')}`;
  const BASE_LAYER_KEY = 'wander.map.baseLayer.v1';
  const nativeTiles = window.Capacitor?.isNativePlatform?.() === true
    ? window.Capacitor?.Plugins?.WanderOfflineTiles || null
    : null;

  const map = L.map('wander-map', {
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    touchZoom: true,
  }).setView([20, 0], 2);

  map.createPane('wander-route-pane');
  map.getPane('wander-route-pane').style.zIndex = '450';
  map.getPane('wander-route-pane').style.pointerEvents = 'none';
  map.createPane('wander-current-track-pane');
  map.getPane('wander-current-track-pane').style.zIndex = '460';
  map.getPane('wander-current-track-pane').style.pointerEvents = 'none';

  L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);
  map.attributionControl.addAttribution('Place data &copy; OpenStreetMap contributors');

  function drawTile(canvas, result, done) {
    const context = canvas.getContext('2d', { alpha: true });
    if (!context || !result?.dataUrl) {
      done(null, canvas);
      return;
    }
    const image = new Image();
    image.addEventListener('load', () => {
      context.clearRect(0, 0, 256, 256);
      if (result.fallback === true) {
        const scale = Math.max(2, Number(result.scale) || 2);
        const sourceSize = 256 / scale;
        const sourceX = Math.max(0, Number(result.cropX) || 0) * sourceSize;
        const sourceY = Math.max(0, Number(result.cropY) || 0) * sourceSize;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 256, 256);
      } else {
        context.drawImage(image, 0, 0, 256, 256);
      }
      done(null, canvas);
    }, { once: true });
    image.addEventListener('error', () => done(null, canvas), { once: true });
    image.src = result.dataUrl;
  }

  const NativeStoredTileLayer = L.GridLayer.extend({
    initialize(options = {}) {
      L.GridLayer.prototype.initialize.call(this, options);
      this.wanderSource = options.wanderSource || 'osm';
    },

    createTile(coords, done) {
      const tile = document.createElement('canvas');
      tile.width = 256;
      tile.height = 256;
      tile.setAttribute('role', 'presentation');
      let completed = false;
      const finish = (error = null, element = tile) => {
        if (completed) return;
        completed = true;
        done(error, element);
      };

      Promise.resolve(nativeTiles?.getTile?.({ source: this.wanderSource, z: coords.z, x: coords.x, y: coords.y }))
        .then((result) => {
          if (result?.ok && result.dataUrl) {
            tile.dataset.tileSource = result.cached ? 'native-cache' : 'network';
            tile.dataset.mapSource = this.wanderSource;
            tile.dataset.stale = result.stale === true ? 'true' : 'false';
            tile.dataset.zoomFallback = result.fallback === true ? 'true' : 'false';
            this.fire(result.fallback === true ? 'tilefallback' : result.cached ? 'tilecachehit' : 'tilecached', {
              coords,
              source: this.wanderSource,
              stale: result.stale === true,
              fallback: result.fallback === true,
              fallbackDepth: Number(result.fallbackDepth) || 0,
              bytes: result.bytes || 0,
            });
            drawTile(tile, result, finish);
            return;
          }
          tile.dataset.tileSource = 'missing';
          tile.dataset.mapSource = this.wanderSource;
          this.fire('tilemissing', { coords, source: this.wanderSource, offline: result?.offline === true });
          finish();
        })
        .catch((error) => {
          tile.dataset.tileSource = 'missing';
          tile.dataset.mapSource = this.wanderSource;
          this.fire('tilemissing', { coords, source: this.wanderSource, offline: true, error });
          finish();
        });
      return tile;
    },
  });

  function nativeLayer(source, options = {}) {
    return new NativeStoredTileLayer({
      wanderSource: source,
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256,
      updateWhenIdle: false,
      keepBuffer: source === 'osm' ? 3 : 2,
      ...options,
    });
  }

  function createStreetLayer() {
    if (typeof nativeTiles?.getTile === 'function') {
      return nativeLayer('osm', { attribution: '&copy; OpenStreetMap' });
    }
    return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      keepBuffer: 3,
      errorTileUrl: TRANSPARENT_TILE,
      attribution: '&copy; OpenStreetMap',
    });
  }

  function createSatelliteLayer() {
    if (typeof nativeTiles?.getTile === 'function') {
      return nativeLayer('esri', {
        maxNativeZoom: 18,
        attribution: 'Tiles &copy; Esri',
      });
    }
    return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxNativeZoom: 18,
      maxZoom: 19,
      keepBuffer: 2,
      errorTileUrl: TRANSPARENT_TILE,
      attribution: 'Tiles &copy; Esri',
    });
  }

  function storedBaseLayer() {
    try {
      return localStorage.getItem(BASE_LAYER_KEY) === 'satellite' ? 'satellite' : 'streets';
    } catch {
      return 'streets';
    }
  }

  function persistBaseLayer(name) {
    try { localStorage.setItem(BASE_LAYER_KEY, name); } catch {}
  }

  const baseLayers = {
    streets: createStreetLayer(),
    satellite: createSatelliteLayer(),
  };

  let activeBaseLayer = storedBaseLayer();
  baseLayers[activeBaseLayer].addTo(map);

  const route = L.polyline([], {
    pane: 'wander-route-pane',
    weight: 5,
    opacity: 0.88,
    lineCap: 'round',
    lineJoin: 'round',
    interactive: false,
  }).addTo(map);

  const currentTrack = L.polyline([], {
    pane: 'wander-current-track-pane',
    color: '#01E0CB',
    weight: 5,
    opacity: 0.98,
    lineCap: 'round',
    lineJoin: 'round',
    interactive: false,
  }).addTo(map);

  function setBaseLayer(name) {
    if (!baseLayers[name] || name === activeBaseLayer) return activeBaseLayer;
    map.removeLayer(baseLayers[activeBaseLayer]);
    baseLayers[name].addTo(map);
    activeBaseLayer = name;
    persistBaseLayer(activeBaseLayer);
    window.dispatchEvent(new CustomEvent('wander:base-layer-change', { detail: { name: activeBaseLayer } }));
    return activeBaseLayer;
  }

  function toggleBaseLayer() {
    return setBaseLayer(activeBaseLayer === 'streets' ? 'satellite' : 'streets');
  }

  // Android WebView can resume with Leaflet still using the pre-background
  // viewport state. A finger drag causes Leaflet to recompute it, which is why
  // the map suddenly reappears. Reproduce that recomputation automatically and
  // ask the active tile layer to repaint, including from the native offline cache.
  function refreshAfterResume() {
    if (!map) return;
    const repaint = () => {
      try { map.invalidateSize({ pan: false, animate: false }); } catch {}
      const layer = baseLayers[activeBaseLayer];
      try { layer?.redraw?.(); } catch {}
      try { map.fire('moveend'); } catch {}
    };
    repaint();
    setTimeout(repaint, 120);
    setTimeout(repaint, 450);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshAfterResume();
  });
  window.addEventListener('pageshow', refreshAfterResume);
  window.addEventListener('focus', refreshAfterResume);

  window.WanderMapCore = {
    map,
    route,
    currentTrack,
    baseLayers,
    nativeTileCache: Boolean(nativeTiles?.getTile),
    nativeTileSources: typeof nativeTiles?.getTile === 'function' ? ['osm', 'esri'] : [],
    setBaseLayer,
    toggleBaseLayer,
    refreshAfterResume,
    getBaseLayer: () => activeBaseLayer,
  };
})();
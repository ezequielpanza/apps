(() => {
  const TRANSPARENT_TILE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="transparent"/></svg>')}`;
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

  const NativeStoredTileLayer = L.GridLayer.extend({
    initialize(options = {}) {
      L.GridLayer.prototype.initialize.call(this, options);
      this.wanderSource = options.wanderSource || 'osm';
    },

    createTile(coords, done) {
      const tile = document.createElement('img');
      tile.alt = '';
      tile.setAttribute('role', 'presentation');
      tile.width = 256;
      tile.height = 256;
      let completed = false;
      const finish = (error = null) => {
        if (completed) return;
        completed = true;
        done(error, tile);
      };
      tile.addEventListener('load', () => finish(), { once: true });
      tile.addEventListener('error', () => {
        tile.src = TRANSPARENT_TILE;
        finish();
      }, { once: true });

      Promise.resolve(nativeTiles?.getTile?.({ source: this.wanderSource, z: coords.z, x: coords.x, y: coords.y }))
        .then((result) => {
          if (result?.ok && result.dataUrl) {
            tile.dataset.tileSource = result.cached ? 'native-cache' : 'network';
            tile.dataset.mapSource = this.wanderSource;
            tile.dataset.stale = result.stale === true ? 'true' : 'false';
            this.fire(result.cached ? 'tilecachehit' : 'tilecached', {
              coords,
              source: this.wanderSource,
              stale: result.stale === true,
              bytes: result.bytes || 0,
            });
            tile.src = result.dataUrl;
            return;
          }
          tile.dataset.tileSource = 'missing';
          tile.dataset.mapSource = this.wanderSource;
          this.fire('tilemissing', { coords, source: this.wanderSource, offline: result?.offline === true });
          tile.src = TRANSPARENT_TILE;
        })
        .catch((error) => {
          tile.dataset.tileSource = 'missing';
          tile.dataset.mapSource = this.wanderSource;
          this.fire('tilemissing', { coords, source: this.wanderSource, offline: true, error });
          tile.src = TRANSPARENT_TILE;
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

  const baseLayers = {
    streets: createStreetLayer(),
    satellite: createSatelliteLayer(),
  };

  let activeBaseLayer = 'streets';
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
    window.dispatchEvent(new CustomEvent('wander:base-layer-change', { detail: { name: activeBaseLayer } }));
    return activeBaseLayer;
  }

  function toggleBaseLayer() {
    return setBaseLayer(activeBaseLayer === 'streets' ? 'satellite' : 'streets');
  }

  window.WanderMapCore = {
    map,
    route,
    currentTrack,
    baseLayers,
    nativeTileCache: Boolean(nativeTiles?.getTile),
    nativeTileSources: typeof nativeTiles?.getTile === 'function' ? ['osm', 'esri'] : [],
    setBaseLayer,
    toggleBaseLayer,
    getBaseLayer: () => activeBaseLayer,
  };
})();

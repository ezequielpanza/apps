(() => {
  const map = L.map('wander-map', {
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    touchZoom: true,
  }).setView([20, 0], 2);

  L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);
  map.attributionControl.addAttribution('Place data &copy; OpenStreetMap contributors');

  const baseLayers = {
    streets: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxNativeZoom: 18,
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri',
    }),
  };

  let activeBaseLayer = 'streets';
  baseLayers[activeBaseLayer].addTo(map);

  const route = L.polyline([], {
    weight: 5,
    opacity: 0.8,
    lineCap: 'round',
    lineJoin: 'round',
  }).addTo(map);

  const currentTrack = L.polyline([], {
    color: '#01E0CB',
    weight: 5,
    opacity: 0.95,
    lineCap: 'round',
    lineJoin: 'round',
    interactive: false,
  }).addTo(map);

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

  window.WanderMapCore = {
    map,
    route,
    currentTrack,
    setBaseLayer,
    toggleBaseLayer,
    getBaseLayer: () => activeBaseLayer,
  };
})();

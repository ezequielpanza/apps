(() => {
  if (typeof map === 'undefined') return;

  function removeLegacyInternetMarkers() {
    Object.values(map._layers || {}).forEach((layer) => {
      const content = layer?.getPopup?.()?.getContent?.();
      if (typeof content === 'string' && content.includes('Descubierto en internet')) {
        map.removeLayer(layer);
      }
    });
  }

  function normalizeInternetPoi(poi) {
    return {
      ...poi,
      category: poi.category || 'descubierto en internet',
      sourceId: 'internet',
      sources: [{ id: 'internet', label: poi.source || 'Internet' }],
    };
  }

  function syncInternetPois(pois = []) {
    const normalized = pois.map(normalizeInternetPoi);
    window.WanderPoiStore?.setSourcePois?.('internet', normalized);
    window.setTimeout(removeLegacyInternetMarkers, 50);
    window.setTimeout(removeLegacyInternetMarkers, 400);
  }

  document.addEventListener('wander:internet-pois-updated', (event) => {
    syncInternetPois(event.detail || window.wanderInternetPois || []);
  });

  document.addEventListener('wander:poi-updated', () => {
    window.setTimeout(removeLegacyInternetMarkers, 50);
  });

  window.setInterval(removeLegacyInternetMarkers, 2500);
  window.setTimeout(() => syncInternetPois(window.wanderInternetPois || []), 800);
})();

(() => {
  const settings = document.querySelector('#settings-panel');
  if (!settings || document.querySelector('#overture-debug-card')) return;

  const card = document.createElement('div');
  card.id = 'overture-debug-card';
  card.className = 'screen-card settings-group';
  card.innerHTML = `
    <h3>Debug temporal · Overture</h3>
    <p class="panel-note">Consulta el recorte de Nagua generado durante el deploy y ordena los POIs por distancia a 19.372667, -69.852783.</p>
    <div class="button-row compact-actions"><button id="overture-debug-run" type="button">Probar Overture en Nagua</button></div>
    <div id="overture-debug-output" class="technical-list" aria-live="polite"></div>`;
  settings.appendChild(card);

  const button = card.querySelector('#overture-debug-run');
  const output = card.querySelector('#overture-debug-output');
  const origin = { lat: 19.372667, lng: -69.852783 };

  function distanceMeters(lat, lng) {
    const radius = 6371008.8;
    const radians = (value) => value * Math.PI / 180;
    const dLat = radians(lat - origin.lat);
    const dLng = radians(lng - origin.lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(origin.lat)) * Math.cos(radians(lat)) * Math.sin(dLng / 2) ** 2;
    return radius * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function nameOf(properties) {
    return properties?.names?.primary || properties?.names?.common?.es || properties?.names?.common?.en || 'Sin nombre';
  }

  function categoryOf(properties) {
    return properties?.categories?.primary || 'sin categoría';
  }

  button.addEventListener('click', async () => {
    button.disabled = true;
    output.innerHTML = '<div class="technical-row"><code>Estado</code><span>Consultando…</span></div>';
    try {
      const response = await fetch('./data/overture/nagua-places.geojson?ts=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status + '. El recorte todavía no fue generado.');
      const data = await response.json();
      const rows = (data.features || []).map((feature) => {
        const coordinates = feature?.geometry?.coordinates;
        if (feature?.geometry?.type !== 'Point' || !Array.isArray(coordinates)) return null;
        const [lng, lat] = coordinates;
        return {
          name: nameOf(feature.properties),
          category: categoryOf(feature.properties),
          distance: distanceMeters(lat, lng),
        };
      }).filter(Boolean).sort((a, b) => a.distance - b.distance);

      const nearest = rows.slice(0, 20);
      output.innerHTML = '<div class="technical-row"><code>Total</code><span>' + rows.length + ' POIs</span></div>' + nearest.map((row, index) =>
        '<div class="technical-row"><code>' + (index + 1) + '. ' + row.name.replace(/[&<>"']/g, '') + '</code><span>' + Math.round(row.distance) + ' m · ' + row.category.replace(/[&<>"']/g, '') + '</span></div>'
      ).join('');
    } catch (error) {
      output.innerHTML = '<div class="technical-row"><code>Error</code><span>' + String(error.message || error).replace(/[&<>"']/g, '') + '</span></div>';
    } finally {
      button.disabled = false;
    }
  });
})();
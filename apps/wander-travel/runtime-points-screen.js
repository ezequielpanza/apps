(() => {
  const api = window.WanderPersonalPOIs;
  const list = document.querySelector('#points-list');
  const summary = document.querySelector('#points-summary');
  if (!api || !list || !summary) return;

  function render() {
    const items = api.list?.() || [];
    summary.textContent = `${items.length} ${items.length === 1 ? 'punto guardado' : 'puntos guardados'}`;
    list.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'panel-note';
      empty.textContent = 'Todavía no guardaste puntos personales.';
      list.appendChild(empty);
      return;
    }
    items.forEach((poi) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'point-row';
      row.innerHTML = `<span class="point-row-icon"><svg class="ui-icon"><use href="wander-icons.svg#pin"></use></svg></span><span class="point-row-copy"><strong></strong><small></small></span><svg class="ui-icon point-row-open"><use href="wander-icons.svg#settings"></use></svg>`;
      row.querySelector('strong').textContent = poi.name || 'Marcador';
      row.querySelector('small').textContent = `${Number(poi.lat).toFixed(6)}, ${Number(poi.lng).toFixed(6)}`;
      row.addEventListener('click', () => window.WanderPersonalPOISheet?.showById?.(poi.id));
      list.appendChild(row);
    });
  }

  window.addEventListener('wander:personal-poi-selected', render);
  window.addEventListener('wander:personal-poi-removed', render);
  window.addEventListener('wander:personal-poi-updated', render);
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-screen-target="points"]')) setTimeout(render, 0);
  });
  render();
  window.WanderPointsScreen = Object.freeze({ render });
})();
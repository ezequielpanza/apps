(() => {
  const api = window.WanderPersonalPOIs;
  const list = document.querySelector('#points-list');
  const summary = document.querySelector('#points-summary');
  if (!api || !list || !summary) return;

  const card = list.closest('.screen-card');
  let toolbar = card?.querySelector('.points-toolbar');
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.className = 'points-toolbar';
    toolbar.innerHTML = `
      <button id="points-new" type="button"><svg class="button-icon"><use href="wander-icons.svg#pin"></use></svg><span>Nuevo</span></button>
      <button id="points-select" type="button" aria-pressed="false"><svg class="button-icon"><use href="wander-icons.svg#target"></use></svg><span>Seleccionar</span></button>
      <button id="points-delete" class="danger" type="button" disabled><svg class="button-icon"><use href="wander-icons.svg#clear"></use></svg><span>Borrar</span></button>`;
    card?.insertBefore(toolbar, summary.nextSibling);
  }

  const newButton = toolbar.querySelector('#points-new');
  const selectButton = toolbar.querySelector('#points-select');
  const deleteButton = toolbar.querySelector('#points-delete');
  if (!newButton || !selectButton || !deleteButton) return;

  const selectedIds = new Set();
  let selecting = false;

  function updateToolbar() {
    selectButton.setAttribute('aria-pressed', String(selecting));
    selectButton.classList.toggle('is-active', selecting);
    selectButton.querySelector('span').textContent = selecting ? 'Cancelar' : 'Seleccionar';
    deleteButton.disabled = !selecting || selectedIds.size === 0;
    deleteButton.querySelector('span').textContent = selectedIds.size ? `Borrar (${selectedIds.size})` : 'Borrar';
  }

  function setSelecting(value) {
    selecting = Boolean(value);
    if (!selecting) selectedIds.clear();
    updateToolbar();
    render();
  }

  function render() {
    const items = api.list?.() || [];
    const validIds = new Set(items.map((poi) => poi.id));
    selectedIds.forEach((id) => { if (!validIds.has(id)) selectedIds.delete(id); });
    summary.textContent = `${items.length} ${items.length === 1 ? 'punto guardado' : 'puntos guardados'}`;
    list.innerHTML = '';

    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'panel-note';
      empty.textContent = 'Todavía no guardaste puntos personales.';
      list.appendChild(empty);
      selecting = false;
      selectedIds.clear();
      updateToolbar();
      return;
    }

    items.forEach((poi) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'point-row';
      row.dataset.poiId = poi.id;
      row.classList.toggle('is-selecting', selecting);
      row.classList.toggle('is-selected', selectedIds.has(poi.id));
      row.setAttribute('aria-pressed', selecting ? String(selectedIds.has(poi.id)) : 'false');
      row.innerHTML = `<span class="point-row-select" aria-hidden="true"><span></span></span><span class="point-row-icon"><svg class="ui-icon"><use href="wander-icons.svg#pin"></use></svg></span><span class="point-row-copy"><strong></strong><small></small></span><svg class="ui-icon point-row-open"><use href="wander-icons.svg#settings"></use></svg>`;
      row.querySelector('strong').textContent = poi.name || 'Marcador';
      row.querySelector('small').textContent = `${Number(poi.lat).toFixed(6)}, ${Number(poi.lng).toFixed(6)}`;
      row.addEventListener('click', () => {
        if (selecting) {
          if (selectedIds.has(poi.id)) selectedIds.delete(poi.id);
          else selectedIds.add(poi.id);
          row.classList.toggle('is-selected', selectedIds.has(poi.id));
          row.setAttribute('aria-pressed', String(selectedIds.has(poi.id)));
          updateToolbar();
          return;
        }
        window.WanderPersonalPOISheet?.showById?.(poi.id);
      });
      list.appendChild(row);
    });
    updateToolbar();
  }

  newButton.addEventListener('click', () => {
    setSelecting(false);
    window.WanderScreen?.open?.('map');
    setTimeout(() => window.WanderMapSelectedPoint?.openAtCenter?.(), 120);
  });

  selectButton.addEventListener('click', () => setSelecting(!selecting));

  deleteButton.addEventListener('click', () => {
    if (!selectedIds.size) return;
    const count = selectedIds.size;
    if (!window.confirm(`¿Eliminar ${count} ${count === 1 ? 'punto seleccionado' : 'puntos seleccionados'}?`)) return;
    [...selectedIds].forEach((id) => api.remove?.(id));
    setSelecting(false);
  });

  window.addEventListener('wander:personal-poi-created', render);
  window.addEventListener('wander:personal-poi-selected', render);
  window.addEventListener('wander:personal-poi-removed', render);
  window.addEventListener('wander:personal-poi-updated', render);
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-screen-target="points"]')) setTimeout(render, 0);
  });

  render();
  window.WanderPointsScreen = Object.freeze({ render, setSelecting });
})();
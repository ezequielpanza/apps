(() => {
  const api = window.WanderPersonalPOIs;
  if (!api) return;

  const sheet = document.createElement('section');
  sheet.id = 'personal-poi-sheet';
  sheet.className = 'personal-poi-sheet';
  sheet.hidden = true;
  sheet.setAttribute('aria-live', 'polite');
  sheet.innerHTML = `
    <div class="personal-poi-sheet-handle" aria-hidden="true"></div>
    <div class="personal-poi-sheet-header">
      <div>
        <span class="personal-poi-sheet-kicker">MARCADOR PERSONAL</span>
        <h2 id="personal-poi-sheet-title">Marcador</h2>
      </div>
      <button id="personal-poi-sheet-close" type="button" aria-label="Cerrar">
        <svg class="ui-icon"><use href="wander-icons.svg#close"></use></svg>
      </button>
    </div>
    <div class="personal-poi-sheet-meta">
      <div><span>Tipo</span><strong id="personal-poi-sheet-type">Personal</strong></div>
      <div><span>Radio</span><strong id="personal-poi-sheet-radius">35 m</strong></div>
      <div class="personal-poi-sheet-coordinates"><span>Coordenadas</span><strong id="personal-poi-sheet-coordinates">—</strong></div>
    </div>
    <p id="personal-poi-sheet-notes" class="personal-poi-sheet-notes" hidden></p>
    <div class="personal-poi-sheet-actions">
      <button id="personal-poi-sheet-edit" type="button">
        <svg class="button-icon"><use href="wander-icons.svg#settings"></use></svg>
        Editar
      </button>
      <button id="personal-poi-sheet-delete" class="danger" type="button">
        <svg class="button-icon"><use href="wander-icons.svg#clear"></use></svg>
        Eliminar
      </button>
    </div>
  `;
  document.querySelector('.map-stage')?.appendChild(sheet);

  let selectedId = null;

  const title = sheet.querySelector('#personal-poi-sheet-title');
  const type = sheet.querySelector('#personal-poi-sheet-type');
  const radius = sheet.querySelector('#personal-poi-sheet-radius');
  const coordinates = sheet.querySelector('#personal-poi-sheet-coordinates');
  const notes = sheet.querySelector('#personal-poi-sheet-notes');

  function hide() {
    sheet.hidden = true;
    selectedId = null;
  }

  function show(poi) {
    if (!poi) return;
    selectedId = poi.id;
    title.textContent = poi.name || 'Marcador';
    type.textContent = poi.type || 'Personal';
    radius.textContent = `${Math.round(Number(poi.radiusM) || 35)} m`;
    coordinates.textContent = `${Number(poi.lat).toFixed(6)}, ${Number(poi.lng).toFixed(6)}`;
    notes.textContent = poi.notes || '';
    notes.hidden = !poi.notes;
    sheet.hidden = false;
  }

  sheet.querySelector('#personal-poi-sheet-close')?.addEventListener('click', hide);

  sheet.querySelector('#personal-poi-sheet-edit')?.addEventListener('click', () => {
    if (!selectedId) return;
    const current = api.get?.(selectedId);
    if (!current) return;
    const name = window.prompt('Nombre', current.name || '');
    if (!name?.trim()) return;
    const typeValue = window.prompt('Tipo', current.type || 'personal');
    if (typeValue === null) return;
    const radiusValue = window.prompt('Radio de detección en metros', String(current.radiusM || 35));
    if (radiusValue === null) return;
    const notesValue = window.prompt('Notas', current.notes || '');
    if (notesValue === null) return;
    const updated = api.update?.(selectedId, {
      name,
      type: typeValue,
      radiusM: radiusValue,
      notes: notesValue,
    });
    if (updated) show(updated);
  });

  sheet.querySelector('#personal-poi-sheet-delete')?.addEventListener('click', () => {
    if (!selectedId) return;
    const current = api.get?.(selectedId);
    if (!current) return;
    if (!window.confirm(`¿Eliminar ${current.name}?`)) return;
    if (api.remove?.(selectedId)) hide();
  });

  window.addEventListener('wander:personal-poi-selected', (event) => show(event.detail?.poi));
  window.addEventListener('wander:personal-poi-removed', (event) => {
    if (event.detail?.id === selectedId) hide();
  });

  window.WanderPersonalPOISheet = Object.freeze({ show, hide });
})();
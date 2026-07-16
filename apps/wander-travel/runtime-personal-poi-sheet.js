(() => {
  const api = window.WanderPersonalPOIs;
  if (!api) return;

  const screen = document.createElement('section');
  screen.id = 'personal-poi-sheet';
  screen.className = 'personal-poi-sheet app-screen';
  screen.hidden = true;
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-modal', 'true');
  screen.setAttribute('aria-label', 'Detalle del POI');
  screen.innerHTML = `
    <header class="personal-poi-sheet-header app-screen-header">
      <button id="personal-poi-sheet-close" class="screen-close" type="button" aria-label="Volver" title="Volver">
        <svg class="ui-icon"><use href="wander-icons.svg#close"></use></svg>
      </button>
      <div>
        <span>DETALLE DEL POI</span>
        <h2 id="personal-poi-sheet-title">Marcador</h2>
      </div>
      <button id="personal-poi-sheet-save" class="save" type="button" aria-label="Guardar cambios" title="Guardar cambios">
        <svg class="ui-icon"><use href="wander-icons.svg#pin"></use></svg>
      </button>
    </header>
    <div class="personal-poi-sheet-scroll app-screen-scroll">
      <div class="screen-content">
        <label><span>Nombre</span><input id="personal-poi-name" type="text"></label>
        <label><span>Tipo</span><input id="personal-poi-type" type="text" placeholder="personal"></label>
        <label><span>Radio de detección</span><div class="input-suffix"><input id="personal-poi-radius" type="number" min="5" max="500" step="1"><b>m</b></div></label>
        <label><span>Notas</span><textarea id="personal-poi-notes" rows="5"></textarea></label>
        <div class="personal-poi-coordinates"><span>Coordenadas</span><strong id="personal-poi-coordinates">—</strong></div>
        <button id="personal-poi-delete" class="personal-poi-delete" type="button"><svg class="button-icon"><use href="wander-icons.svg#clear"></use></svg><span>Eliminar POI</span></button>
      </div>
    </div>`;
  document.body.appendChild(screen);

  let selectedId = null;
  const title = screen.querySelector('#personal-poi-sheet-title');
  const name = screen.querySelector('#personal-poi-name');
  const type = screen.querySelector('#personal-poi-type');
  const radius = screen.querySelector('#personal-poi-radius');
  const notes = screen.querySelector('#personal-poi-notes');
  const coordinates = screen.querySelector('#personal-poi-coordinates');

  function hide() {
    screen.hidden = true;
    selectedId = null;
  }

  function showById(id) {
    const poi = api.get?.(id);
    if (!poi) return false;
    selectedId = poi.id;
    title.textContent = poi.name || 'Marcador';
    name.value = poi.name || '';
    type.value = poi.type || 'personal';
    radius.value = Math.round(Number(poi.radiusM) || 35);
    notes.value = poi.notes || '';
    coordinates.textContent = `${Number(poi.lat).toFixed(6)}, ${Number(poi.lng).toFixed(6)}`;
    screen.hidden = false;
    requestAnimationFrame(() => name.focus({ preventScroll: true }));
    return true;
  }

  screen.querySelector('#personal-poi-sheet-close').addEventListener('click', hide);
  screen.querySelector('#personal-poi-sheet-save').addEventListener('click', () => {
    if (!selectedId || !name.value.trim()) return;
    const updated = api.update?.(selectedId, { name: name.value, type: type.value, radiusM: radius.value, notes: notes.value });
    if (!updated) return;
    title.textContent = updated.name;
    window.WanderUI?.showWander('POI actualizado', updated.name + ' quedó guardado.');
  });
  screen.querySelector('#personal-poi-delete').addEventListener('click', () => {
    if (!selectedId) return;
    const current = api.get?.(selectedId);
    if (!current || !window.confirm(`¿Eliminar ${current.name}?`)) return;
    if (api.remove?.(selectedId)) hide();
  });

  window.addEventListener('wander:personal-poi-properties', (event) => showById(event.detail?.id));
  window.addEventListener('wander:personal-poi-removed', (event) => { if (event.detail?.id === selectedId) hide(); });
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !screen.hidden) hide(); });

  window.WanderPersonalPOISheet = Object.freeze({ show: (poi) => showById(poi?.id), showById, hide, isOpen: () => !screen.hidden });
  window.dispatchEvent(new CustomEvent('wander:personal-poi-sheet-ready'));
})();
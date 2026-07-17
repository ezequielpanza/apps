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
        <span id="personal-poi-sheet-kicker">DETALLE DEL POI</span>
        <h2 id="personal-poi-sheet-title">Marcador</h2>
      </div>
      <button id="personal-poi-sheet-save" class="save" type="button" aria-label="Guardar cambios" title="Guardar cambios">
        <svg class="ui-icon"><use href="wander-icons.svg#pin"></use></svg>
      </button>
    </header>
    <div class="personal-poi-sheet-scroll app-screen-scroll">
      <div class="screen-content">
        <label><span>Nombre</span><input id="personal-poi-name" type="text" autocomplete="off"></label>
        <label><span>Tipo</span><input id="personal-poi-type" type="text" placeholder="personal" autocomplete="off"></label>
        <label><span>Radio de detección</span><div class="input-suffix"><input id="personal-poi-radius" type="number" min="5" max="500" step="1" inputmode="numeric"><b>m</b></div></label>
        <div class="personal-poi-attributes">
          <label class="personal-poi-check"><input id="personal-poi-overnight" type="checkbox"><span><strong>Lugar para pasar la noche</strong><small>Puede marcar el inicio o cierre nocturno de una sesión.</small></span></label>
          <label class="personal-poi-check"><input id="personal-poi-vehicle" type="checkbox"><span><strong>Vehículo o punto móvil</strong><small>Se mueve con vos mientras Wander detecta que estás usándolo.</small></span></label>
          <div id="personal-poi-vehicle-state" class="personal-poi-vehicle-state" hidden><span>Estado del vehículo</span><strong>Estacionado</strong></div>
        </div>
        <label><span>Notas</span><textarea id="personal-poi-notes" rows="5"></textarea></label>
        <div class="personal-poi-coordinates"><span>Coordenadas</span><strong id="personal-poi-coordinates">—</strong></div>
        <button id="personal-poi-delete" class="personal-poi-delete" type="button"><svg class="button-icon"><use href="wander-icons.svg#clear"></use></svg><span>Eliminar POI</span></button>
      </div>
    </div>`;
  document.body.appendChild(screen);

  let selectedId = null;
  let draft = null;
  let mode = 'existing';
  const kicker = screen.querySelector('#personal-poi-sheet-kicker');
  const title = screen.querySelector('#personal-poi-sheet-title');
  const name = screen.querySelector('#personal-poi-name');
  const type = screen.querySelector('#personal-poi-type');
  const radius = screen.querySelector('#personal-poi-radius');
  const notes = screen.querySelector('#personal-poi-notes');
  const overnight = screen.querySelector('#personal-poi-overnight');
  const vehicle = screen.querySelector('#personal-poi-vehicle');
  const vehicleState = screen.querySelector('#personal-poi-vehicle-state');
  const coordinates = screen.querySelector('#personal-poi-coordinates');
  const deleteButton = screen.querySelector('#personal-poi-delete');
  const saveButton = screen.querySelector('#personal-poi-sheet-save');

  function vehicleStateLabel(value) {
    if (value === 'with-user') return 'Con vos';
    if (value === 'parked-candidate') return 'Confirmando dónde quedó';
    if (value === 'uncertain') return 'Ubicación incierta';
    return 'Estacionado';
  }

  function syncVehicleState(poi) {
    vehicleState.hidden = !poi?.vehicle;
    vehicleState.querySelector('strong').textContent = vehicleStateLabel(poi?.vehicleState);
  }

  function setCoordinates(lat, lng) {
    coordinates.textContent = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
      ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`
      : '—';
  }

  function setOpen(open) {
    screen.hidden = !open;
    document.body.classList.toggle('poi-editor-open', open);
    if (open) {
      window.WanderUI?.hideWander?.();
      window.WanderMapSelectedPoint?.clear?.();
      window.dispatchEvent(new CustomEvent('wander:personal-poi-editor-open'));
    } else {
      const activeElement = document.activeElement;
      if (activeElement && screen.contains(activeElement)) activeElement.blur?.();
      setTimeout(() => window.WanderBase?.map?.invalidateSize?.(), 80);
    }
  }

  function hide() {
    setOpen(false);
    selectedId = null;
    draft = null;
    mode = 'existing';
  }

  function fill(values = {}) {
    title.textContent = values.name || 'Marcador';
    name.value = values.name || '';
    type.value = values.type || 'personal';
    radius.value = Math.round(Number(values.radiusM) || 35);
    notes.value = values.notes || '';
    overnight.checked = values.overnight === true;
    vehicle.checked = values.vehicle === true;
    setCoordinates(values.lat, values.lng);
    syncVehicleState(values);
  }

  function showById(id) {
    const poi = api.get?.(id);
    if (!poi) return false;
    selectedId = poi.id;
    draft = null;
    mode = 'existing';
    kicker.textContent = 'DETALLE DEL POI';
    deleteButton.hidden = false;
    fill(poi);
    setOpen(true);
    return true;
  }

  function showDraft(values = {}) {
    const lat = Number(values.lat);
    const lng = Number(values.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    selectedId = null;
    mode = 'draft';
    draft = {
      name: values.name || api.nextDefaultName?.() || 'Marcador',
      type: values.type || 'personal',
      radiusM: Number(values.radiusM) || 35,
      notes: values.notes || '',
      overnight: values.overnight === true,
      vehicle: values.vehicle === true,
      lat,
      lng,
    };
    kicker.textContent = 'NUEVO POI';
    deleteButton.hidden = true;
    fill(draft);
    setOpen(true);
    return true;
  }

  function valuesFromForm() {
    return {
      name: name.value.trim(),
      type: type.value.trim() || 'personal',
      radiusM: Number(radius.value) || 35,
      notes: notes.value,
      overnight: overnight.checked,
      vehicle: vehicle.checked,
    };
  }

  vehicle.addEventListener('change', () => {
    vehicleState.hidden = !vehicle.checked;
    if (vehicle.checked) vehicleState.querySelector('strong').textContent = 'Estacionado';
  });

  screen.querySelector('#personal-poi-sheet-close').addEventListener('click', hide);
  saveButton.addEventListener('click', () => {
    const values = valuesFromForm();
    if (!values.name) {
      name.focus({ preventScroll: true });
      return;
    }

    const saveMode = mode;
    saveButton.disabled = true;
    let saved = null;
    if (saveMode === 'draft' && draft) {
      saved = api.createAt?.({ lat: draft.lat, lng: draft.lng }, values);
    } else if (selectedId) {
      saved = api.update?.(selectedId, values);
    }
    saveButton.disabled = false;
    if (!saved) return;

    hide();
    if (saveMode === 'existing') window.WanderUI?.showToast?.('POI actualizado', saved.name);
  });

  deleteButton.addEventListener('click', () => {
    if (!selectedId) return;
    const current = api.get?.(selectedId);
    if (!current || !window.confirm(`¿Eliminar ${current.name}?`)) return;
    if (api.remove?.(selectedId)) hide();
  });

  window.addEventListener('wander:personal-poi-properties', (event) => showById(event.detail?.id));
  window.addEventListener('wander:personal-poi-draft', (event) => showDraft(event.detail?.draft));
  window.addEventListener('wander:personal-poi-updated', (event) => {
    if (event.detail?.poi?.id === selectedId) syncVehicleState(event.detail.poi);
  });
  window.addEventListener('wander:personal-poi-moved', (event) => {
    if (event.detail?.poi?.id !== selectedId) return;
    const poi = event.detail.poi;
    setCoordinates(poi.lat, poi.lng);
    syncVehicleState(poi);
  });
  window.addEventListener('wander:personal-poi-removed', (event) => { if (event.detail?.id === selectedId) hide(); });
  window.addEventListener('wander:screen-will-change', () => { if (!screen.hidden) hide(); });
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !screen.hidden) hide(); });

  window.WanderPersonalPOISheet = Object.freeze({
    show: (poi) => showById(poi?.id),
    showById,
    showDraft,
    hide,
    isOpen: () => !screen.hidden,
    mode: () => mode,
  });
  window.dispatchEvent(new CustomEvent('wander:personal-poi-sheet-ready'));
})();
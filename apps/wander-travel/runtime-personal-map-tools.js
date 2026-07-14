(() => {
  const context = window.WanderContext;
  const base = window.WanderBase;
  const mapControls = window.WanderMapControls;
  const tracks = window.WanderTracks;
  if (!context || !base?.map || !tracks) return;

  const map = base.map;
  const POI_STORAGE_KEY = 'wander.personalPOIs.v1';
  const AUTO_TRACK_KEY = 'wander.tracks.autoEnabled.v1';
  const HOLD_MS = 650;
  const personalPOIs = loadPOIs();
  const poiLayers = new Map();
  let poiPlacementArmed = false;
  let suppressTrackClick = false;
  let suppressPOIClick = false;
  let trackButton = null;
  let poiButton = null;
  let currentPersonalPOIId = null;

  function loadPOIs() {
    try {
      const stored = JSON.parse(localStorage.getItem(POI_STORAGE_KEY) || '[]');
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  }

  function savePOIs() {
    try { localStorage.setItem(POI_STORAGE_KEY, JSON.stringify(personalPOIs)); } catch {}
    context.set('personalPOI.items', personalPOIs, { source: 'personal-poi', kind: 'confirmed', confidence: 1 });
  }

  function autoTrackEnabled() {
    try {
      const stored = localStorage.getItem(AUTO_TRACK_KEY);
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  }

  function setAutoTrackEnabled(enabled) {
    try { localStorage.setItem(AUTO_TRACK_KEY, String(Boolean(enabled))); } catch {}
    context.set('tracks.autoRecording', Boolean(enabled), { source: 'track-control', kind: 'confirmed', confidence: 1 });
  }

  function effectivePosition() {
    return base.getPosition?.() || window.WanderMapPosition?.getPosition?.() || null;
  }

  function escapeHTML(value) {
    return String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function makeButton(iconName, label) {
    const button = L.DomUtil.create('button', 'wander-map-action wander-personal-map-action');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="wander-icons.svg#' + iconName + '"></use></svg>';
    L.DomEvent.disableClickPropagation(button);
    L.DomEvent.disableScrollPropagation(button);
    return button;
  }

  function bindHold(button, onClick, onHold, suppressSetter) {
    let timer = null;
    let held = false;

    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    button.addEventListener('pointerdown', () => {
      held = false;
      cancel();
      timer = setTimeout(() => {
        held = true;
        suppressSetter(true);
        onHold();
      }, HOLD_MS);
    });
    button.addEventListener('pointerup', cancel);
    button.addEventListener('pointercancel', cancel);
    button.addEventListener('pointerleave', cancel);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (held) return;
      onClick();
    });
  }

  function syncTrackButton() {
    if (!trackButton) return;
    const recording = tracks.isRecording?.();
    trackButton.classList.toggle('is-recording', Boolean(recording));
    trackButton.setAttribute('aria-pressed', String(Boolean(recording)));
    trackButton.title = recording ? 'Pausar grabación automática' : 'Reanudar grabación automática';
    trackButton.setAttribute('aria-label', trackButton.title);
    trackButton.style.color = recording ? '#d84848' : 'var(--green)';
    trackButton.style.boxShadow = recording ? '0 0 0 3px rgba(216,72,72,.22), var(--shadow)' : 'var(--shadow)';
  }

  function toggleTrackRecording() {
    if (suppressTrackClick) {
      suppressTrackClick = false;
      return;
    }
    if (tracks.isRecording?.()) {
      tracks.stop?.();
      setAutoTrackEnabled(false);
      window.WanderUI?.showWander('Grabación pausada', 'Wander dejó de registrar el recorrido. Al reanudar, comenzará un nuevo tramo.');
    } else {
      const started = tracks.start?.();
      if (started) setAutoTrackEnabled(true);
    }
    syncTrackButton();
  }

  function openTracksManager() {
    suppressTrackClick = true;
    document.querySelector('[data-screen-target="travel"]')?.click();
    window.WanderUI?.showWander('Mis recorridos', 'Desde Travel podés revisar, exportar y continuar tus tramos guardados.');
  }

  function ensureAutoRecording() {
    context.set('tracks.autoRecording', autoTrackEnabled(), { source: 'track-control', kind: 'confirmed', confidence: 1 });
    if (!autoTrackEnabled() || tracks.isRecording?.()) return;
    if (effectivePosition()) tracks.start?.();
    syncTrackButton();
  }

  function addTrackPoint() {
    if (!autoTrackEnabled()) return;
    if (!tracks.isRecording?.()) ensureAutoRecording();
    const position = effectivePosition();
    if (position) tracks.addPoint?.(position);
    syncTrackButton();
  }

  function poiMarkerIcon() {
    return L.divIcon({
      className: '',
      html: '<div class="wander-personal-poi-marker"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"></path><circle cx="12" cy="10" r="2"></circle></svg></div>',
      iconSize: [30, 36],
      iconAnchor: [15, 36],
    });
  }

  function renderPOIs() {
    const ids = new Set(personalPOIs.map((poi) => poi.id));
    poiLayers.forEach((layer, id) => {
      if (!ids.has(id)) {
        map.removeLayer(layer);
        poiLayers.delete(id);
      }
    });
    personalPOIs.forEach((poi) => {
      let marker = poiLayers.get(poi.id);
      if (!marker) {
        marker = L.marker([poi.lat, poi.lng], { icon: poiMarkerIcon(), title: poi.name }).addTo(map);
        marker.on('click', () => editPOI(poi.id));
        poiLayers.set(poi.id, marker);
      } else {
        marker.setLatLng([poi.lat, poi.lng]);
      }
      marker.bindTooltip(poi.name, { direction: 'top', offset: [0, -30] });
    });
  }

  function askPOIData(existing = {}) {
    const name = window.prompt('Nombre del POI', existing.name || '');
    if (!name?.trim()) return null;
    const type = window.prompt('Tipo de lugar (hotel, habitación, casa, muelle, etc.)', existing.type || 'personal');
    if (type === null) return null;
    const radiusInput = window.prompt('Radio de detección en metros', String(existing.radiusM || 35));
    if (radiusInput === null) return null;
    const radiusM = Math.max(5, Math.min(500, Number(radiusInput) || 35));
    const notes = window.prompt('Notas opcionales', existing.notes || '');
    if (notes === null) return null;
    return { name: name.trim(), type: String(type || 'personal').trim(), radiusM, notes: String(notes || '').trim() };
  }

  function createPOIAt(latLng) {
    const data = askPOIData();
    if (!data || !latLng) return false;
    const poi = {
      id: 'personal-poi-' + Date.now(),
      ...data,
      lat: Number(latLng.lat),
      lng: Number(latLng.lng),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: 'user',
    };
    personalPOIs.push(poi);
    savePOIs();
    renderPOIs();
    evaluateCurrentPersonalPOI();
    window.WanderUI?.showWander('POI guardado', poi.name + ' quedó guardado en tus lugares personales.');
    return true;
  }

  function editPOI(id) {
    const poi = personalPOIs.find((item) => item.id === id);
    if (!poi) return;
    const action = window.prompt('Administrar "' + poi.name + '": escribí editar, eliminar o cancelar', 'editar');
    if (!action) return;
    const normalized = action.trim().toLowerCase();
    if (normalized === 'eliminar') {
      if (!window.confirm('¿Eliminar ' + poi.name + '?')) return;
      const index = personalPOIs.findIndex((item) => item.id === id);
      if (index >= 0) personalPOIs.splice(index, 1);
      savePOIs();
      renderPOIs();
      evaluateCurrentPersonalPOI();
      return;
    }
    if (normalized !== 'editar') return;
    const data = askPOIData(poi);
    if (!data) return;
    Object.assign(poi, data, { updatedAt: Date.now() });
    savePOIs();
    renderPOIs();
    evaluateCurrentPersonalPOI();
  }

  function openPOIManager() {
    suppressPOIClick = true;
    if (!personalPOIs.length) {
      window.WanderUI?.showWander('Mis POIs', 'Todavía no guardaste lugares personales. Tocá el botón de POIs para crear el primero.');
      return;
    }
    const summary = personalPOIs.map((poi, index) => (index + 1) + '. ' + poi.name + ' · ' + poi.type).join('\n');
    const selection = window.prompt('Mis POIs:\n\n' + summary + '\n\nEscribí el número del POI que querés administrar.');
    const index = Number(selection) - 1;
    if (Number.isInteger(index) && personalPOIs[index]) editPOI(personalPOIs[index].id);
  }

  function handlePOIClick() {
    if (suppressPOIClick) {
      suppressPOIClick = false;
      return;
    }
    if (window.WanderMapPosition?.isFollowingPosition?.()) {
      const position = effectivePosition();
      if (!position) {
        window.WanderUI?.showWander('Sin ubicación', 'Wander necesita una posición válida para guardar el POI sobre vos.');
        return;
      }
      createPOIAt(position);
      return;
    }
    poiPlacementArmed = true;
    poiButton?.classList.add('is-armed');
    window.WanderUI?.showWander('Elegí la ubicación', 'Tocá el mapa donde querés guardar el nuevo POI.');
  }

  function evaluateCurrentPersonalPOI() {
    const position = effectivePosition();
    if (!position || !personalPOIs.length) {
      currentPersonalPOIId = null;
      return;
    }
    const nearest = personalPOIs
      .map((poi) => ({ poi, distance: map.distance(position, [poi.lat, poi.lng]) }))
      .filter((item) => item.distance <= item.poi.radiusM)
      .sort((left, right) => left.distance - right.distance)[0];

    if (!nearest) {
      if (currentPersonalPOIId) {
        currentPersonalPOIId = null;
        context.remove?.('personalPOI.current');
      }
      return;
    }

    currentPersonalPOIId = nearest.poi.id;
    const current = {
      ...nearest.poi,
      name: nearest.poi.name,
      label: nearest.poi.name,
      primaryType: nearest.poi.type,
      distanceM: Math.round(nearest.distance),
      source: 'personal-poi',
      confidence: 1,
    };
    context.set('personalPOI.current', current, { source: 'personal-poi', kind: 'confirmed', confidence: 1 });
    if (context.value('motion.status') === 'stationary') {
      context.set('currentPOI.current', current, { source: 'personal-poi', kind: 'confirmed', confidence: 1 });
      context.set('currentPOI.value', current, { source: 'personal-poi', kind: 'confirmed', confidence: 1 });
    }
  }

  const PersonalActions = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd() {
      const wrap = L.DomUtil.create('div', 'wander-map-actions wander-personal-map-actions');
      poiButton = makeButton('pin', 'Guardar POI personal');
      trackButton = makeButton('record', 'Pausar grabación automática');
      bindHold(poiButton, handlePOIClick, openPOIManager, (value) => { suppressPOIClick = value; });
      bindHold(trackButton, toggleTrackRecording, openTracksManager, (value) => { suppressTrackClick = value; });
      wrap.append(poiButton, trackButton);
      syncTrackButton();
      return wrap;
    },
  });

  map.addControl(new PersonalActions());

  map.on('click', (event) => {
    if (!poiPlacementArmed) return;
    poiPlacementArmed = false;
    poiButton?.classList.remove('is-armed');
    createPOIAt(event.latlng);
  });

  context.subscribe((key) => {
    if (key === 'location.effective' || key.startsWith('location.effective.')) {
      addTrackPoint();
      evaluateCurrentPersonalPOI();
    }
    if (key === 'motion.status') evaluateCurrentPersonalPOI();
  });

  window.setInterval(() => {
    ensureAutoRecording();
    addTrackPoint();
    evaluateCurrentPersonalPOI();
  }, 15000);

  savePOIs();
  renderPOIs();
  ensureAutoRecording();
  evaluateCurrentPersonalPOI();

  window.WanderPersonalPOIs = Object.freeze({
    list: () => personalPOIs.map((poi) => ({ ...poi })),
    createAt: createPOIAt,
    edit: editPOI,
    remove(id) {
      const index = personalPOIs.findIndex((poi) => poi.id === id);
      if (index < 0) return false;
      personalPOIs.splice(index, 1);
      savePOIs();
      renderPOIs();
      evaluateCurrentPersonalPOI();
      return true;
    },
    manage: openPOIManager,
  });
})();
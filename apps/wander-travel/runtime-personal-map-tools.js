(() => {
  const context = window.WanderContext;
  const base = window.WanderBase;
  const tracks = window.WanderTracks;
  if (!context || !base?.map || !tracks) return;

  const map = base.map;
  const POI_STORAGE_KEY = 'wander.personalPOIs.v1';
  const AUTO_TRACK_KEY = 'wander.tracks.autoEnabled.v1';
  const HOLD_MS = 650;
  const poiLayers = new Map();
  let suppressTrackClick = false;
  let trackButton = null;
  let currentPersonalPOIId = null;

  function newPOIId() {
    if (globalThis.crypto?.randomUUID) return `personal-poi-${crypto.randomUUID()}`;
    const random = Math.random().toString(36).slice(2, 12);
    return `personal-poi-${Date.now().toString(36)}-${random}`;
  }

  function normalizePOI(raw = {}, usedIds = new Set()) {
    let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : newPOIId();
    while (usedIds.has(id)) id = newPOIId();
    usedIds.add(id);
    const now = Date.now();
    return {
      id,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Marcador',
      type: typeof raw.type === 'string' && raw.type.trim() ? raw.type.trim() : 'personal',
      radiusM: Math.max(5, Math.min(500, Number(raw.radiusM) || 35)),
      notes: typeof raw.notes === 'string' ? raw.notes.trim() : '',
      lat: Number(raw.lat),
      lng: Number(raw.lng),
      createdAt: Number(raw.createdAt) || now,
      updatedAt: Number(raw.updatedAt) || now,
      source: raw.source || 'user',
    };
  }

  function loadPOIs() {
    try {
      const stored = JSON.parse(localStorage.getItem(POI_STORAGE_KEY) || '[]');
      if (!Array.isArray(stored)) return [];
      const usedIds = new Set();
      return stored
        .filter((poi) => Number.isFinite(Number(poi?.lat)) && Number.isFinite(Number(poi?.lng)))
        .map((poi) => normalizePOI(poi, usedIds));
    } catch { return []; }
  }

  const personalPOIs = loadPOIs();

  function savePOIs() {
    try { localStorage.setItem(POI_STORAGE_KEY, JSON.stringify(personalPOIs)); } catch {}
    context.set('personalPOI.enabled', true, { source: 'personal-poi', kind: 'confirmed', confidence: 1 });
    context.set('personalPOI.ready', true, { source: 'personal-poi', kind: 'confirmed', confidence: 1 });
    context.set('personalPOI.items', personalPOIs.map((poi) => ({ ...poi })), { source: 'personal-poi', kind: 'confirmed', confidence: 1 });
  }

  function effectivePosition() {
    return base.getPosition?.() || window.WanderMapPosition?.getPosition?.() || null;
  }

  function autoTrackEnabled() {
    try {
      const stored = localStorage.getItem(AUTO_TRACK_KEY);
      return stored === null ? true : stored === 'true';
    } catch { return true; }
  }

  function setAutoTrackEnabled(enabled) {
    try { localStorage.setItem(AUTO_TRACK_KEY, String(Boolean(enabled))); } catch {}
    context.set('tracks.autoRecording', Boolean(enabled), { source: 'track-control', kind: 'confirmed', confidence: 1 });
  }

  function makeButton(iconName, label) {
    const button = L.DomUtil.create('button', 'wander-map-action wander-personal-map-action');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="wander-icons.svg#${iconName}"></use></svg>`;
    L.DomEvent.disableClickPropagation(button);
    L.DomEvent.disableScrollPropagation(button);
    return button;
  }

  function bindHold(button, onClick, onHold, suppressSetter) {
    let timer = null;
    let held = false;
    const cancel = () => { if (timer) clearTimeout(timer); timer = null; };
    button.addEventListener('pointerdown', () => {
      held = false;
      cancel();
      timer = setTimeout(() => {
        held = true;
        suppressSetter(true);
        navigator.vibrate?.(35);
        onHold();
      }, HOLD_MS);
    });
    button.addEventListener('pointerup', cancel);
    button.addEventListener('pointercancel', cancel);
    button.addEventListener('pointerleave', cancel);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (!held) onClick();
    });
  }

  function syncTrackButton() {
    if (!trackButton) return;
    const recording = Boolean(tracks.isRecording?.());
    trackButton.classList.toggle('is-recording', recording);
    trackButton.setAttribute('aria-pressed', String(recording));
    trackButton.title = recording ? 'Pausar grabación automática' : 'Reanudar grabación automática';
    trackButton.setAttribute('aria-label', trackButton.title);
    trackButton.style.color = recording ? '#d84848' : 'var(--green)';
    trackButton.style.boxShadow = recording ? '0 0 0 3px rgba(216,72,72,.22), var(--shadow)' : 'var(--shadow)';
  }

  function toggleTrackRecording() {
    if (suppressTrackClick) { suppressTrackClick = false; return; }
    if (tracks.isRecording?.()) {
      tracks.stop?.();
      setAutoTrackEnabled(false);
      window.WanderUI?.showWander('Grabación pausada', 'El tramo actual quedó guardado. Al reanudar comenzará uno nuevo.');
    } else {
      const started = tracks.start?.();
      if (started) setAutoTrackEnabled(true);
    }
    syncTrackButton();
  }

  function openTracksManager() {
    suppressTrackClick = true;
    document.querySelector('[data-screen-target="travel"]')?.click();
    window.WanderUI?.showWander('Mis recorridos', 'Desde Travel podés revisar y exportar tus tramos guardados.');
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

  function selectPOI(poi) {
    if (!poi) return;
    window.dispatchEvent(new CustomEvent('wander:personal-poi-selected', { detail: { poi: { ...poi } } }));
  }

  function renderPOIs() {
    const ids = new Set(personalPOIs.map((poi) => poi.id));
    poiLayers.forEach((layer, id) => {
      if (!ids.has(id)) { map.removeLayer(layer); poiLayers.delete(id); }
    });
    personalPOIs.forEach((poi) => {
      let marker = poiLayers.get(poi.id);
      if (!marker) {
        marker = L.marker([poi.lat, poi.lng], { icon: poiMarkerIcon(), title: poi.name }).addTo(map);
        marker.on('click', (event) => {
          event?.originalEvent?.stopPropagation?.();
          const current = personalPOIs.find((item) => item.id === poi.id);
          if (current) selectPOI(current);
        });
        poiLayers.set(poi.id, marker);
      } else {
        marker.setLatLng([poi.lat, poi.lng]);
        marker.options.title = poi.name;
      }
      marker.bindTooltip(poi.name, { direction: 'top', offset: [0, -30] });
    });
  }

  function nextMarkerName() {
    const highest = personalPOIs.reduce((max, poi) => {
      const match = String(poi?.name || '').match(/^Marcador\s+(\d+)$/i);
      return match ? Math.max(max, Number(match[1]) || 0) : max;
    }, 0);
    return `Marcador ${String(highest + 1).padStart(2, '0')}`;
  }

  function createPOIAt(latLng) {
    if (!latLng || !Number.isFinite(Number(latLng.lat)) || !Number.isFinite(Number(latLng.lng))) return false;
    const now = Date.now();
    const poi = {
      id: newPOIId(),
      name: nextMarkerName(),
      type: 'personal',
      radiusM: 35,
      notes: '',
      lat: Number(latLng.lat),
      lng: Number(latLng.lng),
      createdAt: now,
      updatedAt: now,
      source: 'user',
    };
    personalPOIs.push(poi);
    savePOIs();
    renderPOIs();
    evaluateCurrentPersonalPOI();
    window.dispatchEvent(new CustomEvent('wander:personal-poi-created', { detail: { poi: { ...poi } } }));
    window.WanderUI?.showWander('POI guardado', `${poi.name} quedó guardado.`);
    return true;
  }

  function updatePOI(id, changes = {}) {
    const poi = personalPOIs.find((item) => item.id === id);
    if (!poi) return null;
    if (typeof changes.name === 'string' && changes.name.trim()) poi.name = changes.name.trim();
    if (typeof changes.type === 'string') poi.type = changes.type.trim() || 'personal';
    if (typeof changes.notes === 'string') poi.notes = changes.notes.trim();
    if (Number.isFinite(Number(changes.radiusM))) poi.radiusM = Math.max(5, Math.min(500, Number(changes.radiusM)));
    if (Number.isFinite(Number(changes.lat))) poi.lat = Number(changes.lat);
    if (Number.isFinite(Number(changes.lng))) poi.lng = Number(changes.lng);
    poi.updatedAt = Date.now();
    savePOIs();
    renderPOIs();
    evaluateCurrentPersonalPOI();
    window.dispatchEvent(new CustomEvent('wander:personal-poi-updated', { detail: { poi: { ...poi } } }));
    return { ...poi };
  }

  function removePOI(id) {
    const index = personalPOIs.findIndex((poi) => poi.id === id);
    if (index < 0) return false;
    personalPOIs.splice(index, 1);
    savePOIs();
    renderPOIs();
    evaluateCurrentPersonalPOI();
    window.dispatchEvent(new CustomEvent('wander:personal-poi-removed', { detail: { id } }));
    return true;
  }

  function evaluateCurrentPersonalPOI() {
    const position = effectivePosition();
    if (!position || !personalPOIs.length) {
      currentPersonalPOIId = null;
      context.remove?.('personalPOI.current');
      return;
    }
    const nearest = personalPOIs
      .map((poi) => ({ poi, distance: map.distance(position, [poi.lat, poi.lng]) }))
      .filter((item) => item.distance <= item.poi.radiusM)
      .sort((a, b) => a.distance - b.distance)[0];
    if (!nearest) {
      currentPersonalPOIId = null;
      context.remove?.('personalPOI.current');
      return;
    }
    currentPersonalPOIId = nearest.poi.id;
    const current = {
      ...nearest.poi,
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
    options: { position: 'bottomright' },
    onAdd() {
      const wrap = L.DomUtil.create('div', 'wander-map-actions wander-personal-map-actions');
      const waypointButton = makeButton('pin', 'Seleccionar punto en el centro del mapa');
      trackButton = makeButton('record', 'Pausar grabación automática');
      waypointButton.addEventListener('click', (event) => {
        event.preventDefault();
        if (window.WanderMapSelectedPoint?.openAtCenter) window.WanderMapSelectedPoint.openAtCenter();
        else window.dispatchEvent(new CustomEvent('wander:open-waypoint-center'));
      });
      bindHold(trackButton, toggleTrackRecording, openTracksManager, (value) => { suppressTrackClick = value; });
      wrap.append(waypointButton, trackButton);
      syncTrackButton();
      return wrap;
    },
  });

  map.addControl(new PersonalActions());
  const corner = map.getContainer().querySelector('.leaflet-bottom.leaflet-right');
  const personalWrap = corner?.querySelector('.wander-personal-map-actions')?.parentElement;
  if (personalWrap && corner.firstElementChild !== personalWrap) corner.insertBefore(personalWrap, corner.firstElementChild);

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

  window.WanderPersonalPOIs = Object.freeze({
    list: () => personalPOIs.map((poi) => ({ ...poi })),
    get: (id) => {
      const poi = personalPOIs.find((item) => item.id === id);
      return poi ? { ...poi } : null;
    },
    createAt: createPOIAt,
    update: updatePOI,
    remove: removePOI,
    select(id) {
      const poi = personalPOIs.find((item) => item.id === id);
      if (!poi) return false;
      selectPOI(poi);
      return true;
    },
    manage() {
      if (!personalPOIs.length) {
        window.WanderUI?.showWander('Mis POIs', 'Todavía no guardaste lugares personales.');
        return;
      }
      selectPOI(personalPOIs[personalPOIs.length - 1]);
    },
  });

  savePOIs();
  renderPOIs();
  ensureAutoRecording();
  evaluateCurrentPersonalPOI();
  window.dispatchEvent(new CustomEvent('wander:personal-poi-ready', { detail: { count: personalPOIs.length } }));
})();
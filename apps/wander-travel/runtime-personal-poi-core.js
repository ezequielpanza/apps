(() => {
  if (window.WanderPersonalPOIs) return;

  const context = window.WanderContext;
  const base = window.WanderBase;
  if (!context || !base?.map) return;

  const map = base.map;
  const STORAGE_KEY = 'wander.personalPOIs.v1';
  const layers = new Map();
  let currentId = null;

  function createId() {
    if (globalThis.crypto?.randomUUID) return `personal-poi-${globalThis.crypto.randomUUID()}`;
    return `personal-poi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function normalize(raw = {}, usedIds = new Set()) {
    let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : createId();
    while (usedIds.has(id)) id = createId();
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

  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(stored)) return [];
      const usedIds = new Set();
      return stored
        .filter((poi) => Number.isFinite(Number(poi?.lat)) && Number.isFinite(Number(poi?.lng)))
        .map((poi) => normalize(poi, usedIds));
    } catch {
      return [];
    }
  }

  const items = load();

  function nextUniqueId() {
    const usedIds = new Set(items.map((poi) => poi.id));
    let id = createId();
    while (usedIds.has(id)) id = createId();
    return id;
  }

  function publish() {
    const snapshot = items.map((poi) => ({ ...poi }));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch {}
    context.set('personalPOI.enabled', true, { source: 'personal-poi', kind: 'confirmed', confidence: 1 });
    context.set('personalPOI.ready', true, { source: 'personal-poi', kind: 'confirmed', confidence: 1 });
    context.set('personalPOI.items', snapshot, { source: 'personal-poi', kind: 'confirmed', confidence: 1 });
  }

  function markerIcon() {
    return L.divIcon({
      className: '',
      html: '<div class="wander-personal-poi-marker"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"></path><circle cx="12" cy="10" r="2"></circle></svg></div>',
      iconSize: [30, 36],
      iconAnchor: [15, 36],
    });
  }

  function selectPOI(poi) {
    if (!poi) return false;
    window.dispatchEvent(new CustomEvent('wander:personal-poi-selected', { detail: { poi: { ...poi } } }));
    return true;
  }

  function render() {
    const validIds = new Set(items.map((poi) => poi.id));
    layers.forEach((layer, id) => {
      if (!validIds.has(id)) {
        map.removeLayer(layer);
        layers.delete(id);
      }
    });

    items.forEach((poi) => {
      let marker = layers.get(poi.id);
      if (!marker) {
        marker = L.marker([poi.lat, poi.lng], { icon: markerIcon(), title: poi.name }).addTo(map);
        marker.on('click', (event) => {
          event?.originalEvent?.stopPropagation?.();
          const current = items.find((candidate) => candidate.id === poi.id);
          if (current) selectPOI(current);
        });
        layers.set(poi.id, marker);
      } else {
        marker.setLatLng([poi.lat, poi.lng]);
        marker.options.title = poi.name;
      }
      marker.unbindTooltip();
      marker.bindTooltip(poi.name, { direction: 'top', offset: [0, -30] });
    });
  }

  function nextDefaultName() {
    const highest = items.reduce((max, poi) => {
      const match = String(poi?.name || '').match(/^Marcador\s+(\d+)$/i);
      return match ? Math.max(max, Number(match[1]) || 0) : max;
    }, 0);
    return `Marcador ${String(highest + 1).padStart(2, '0')}`;
  }

  function createAt(latLng, values = {}) {
    const lat = Number(latLng?.lat);
    const lng = Number(latLng?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const now = Date.now();
    const poi = normalize({
      id: nextUniqueId(),
      name: typeof values.name === 'string' && values.name.trim() ? values.name.trim() : nextDefaultName(),
      type: values.type || 'personal',
      radiusM: values.radiusM || 35,
      notes: values.notes || '',
      lat,
      lng,
      createdAt: now,
      updatedAt: now,
      source: 'user',
    }, new Set(items.map((item) => item.id)));

    items.push(poi);
    publish();
    render();
    evaluateCurrent();
    window.dispatchEvent(new CustomEvent('wander:personal-poi-created', { detail: { poi: { ...poi } } }));
    window.WanderUI?.showWander('POI guardado', `${poi.name} quedó guardado.`);
    return { ...poi };
  }

  function update(id, changes = {}) {
    const poi = items.find((candidate) => candidate.id === id);
    if (!poi) return null;

    if (typeof changes.name === 'string' && changes.name.trim()) poi.name = changes.name.trim();
    if (typeof changes.type === 'string') poi.type = changes.type.trim() || 'personal';
    if (typeof changes.notes === 'string') poi.notes = changes.notes.trim();
    if (Number.isFinite(Number(changes.radiusM))) poi.radiusM = Math.max(5, Math.min(500, Number(changes.radiusM)));
    if (Number.isFinite(Number(changes.lat))) poi.lat = Number(changes.lat);
    if (Number.isFinite(Number(changes.lng))) poi.lng = Number(changes.lng);
    poi.updatedAt = Date.now();

    publish();
    render();
    evaluateCurrent();
    window.dispatchEvent(new CustomEvent('wander:personal-poi-updated', { detail: { poi: { ...poi } } }));
    return { ...poi };
  }

  function remove(id) {
    const index = items.findIndex((poi) => poi.id === id);
    if (index < 0) return false;
    items.splice(index, 1);
    publish();
    render();
    evaluateCurrent();
    window.dispatchEvent(new CustomEvent('wander:personal-poi-removed', { detail: { id } }));
    return true;
  }

  function effectivePosition() {
    return base.getPosition?.() || window.WanderMapPosition?.getPosition?.() || null;
  }

  function evaluateCurrent() {
    const position = effectivePosition();
    if (!position || !items.length) {
      currentId = null;
      context.remove?.('personalPOI.current');
      return;
    }

    const nearest = items
      .map((poi) => ({ poi, distance: map.distance(position, [poi.lat, poi.lng]) }))
      .filter((candidate) => candidate.distance <= candidate.poi.radiusM)
      .sort((left, right) => left.distance - right.distance)[0];

    if (!nearest) {
      currentId = null;
      context.remove?.('personalPOI.current');
      return;
    }

    currentId = nearest.poi.id;
    const current = {
      ...nearest.poi,
      label: nearest.poi.name,
      primaryType: nearest.poi.type,
      distanceM: Math.round(nearest.distance),
      source: 'personal-poi',
      confidence: 1,
    };
    context.set('personalPOI.current', current, { source: 'personal-poi', kind: 'confirmed', confidence: 1 });
    if (context.value?.('motion.status') === 'stationary') {
      context.set('currentPOI.current', current, { source: 'personal-poi', kind: 'confirmed', confidence: 1 });
      context.set('currentPOI.value', current, { source: 'personal-poi', kind: 'confirmed', confidence: 1 });
    }
  }

  window.WanderPersonalPOIs = Object.freeze({
    ready: true,
    list: () => items.map((poi) => ({ ...poi })),
    get: (id) => {
      const poi = items.find((candidate) => candidate.id === id);
      return poi ? { ...poi } : null;
    },
    createAt,
    update,
    remove,
    select(id) {
      const poi = items.find((candidate) => candidate.id === id);
      return selectPOI(poi);
    },
    render,
    evaluate: evaluateCurrent,
    nextDefaultName,
  });

  context.subscribe?.((key) => {
    if (typeof key !== 'string') return;
    if (key === 'location.effective' || key.startsWith('location.effective.') || key === 'motion.status') evaluateCurrent();
  });

  publish();
  render();
  evaluateCurrent();
  window.dispatchEvent(new CustomEvent('wander:personal-poi-ready', { detail: { count: items.length } }));
})();
(() => {
  const context = window.WanderContext;
  if (!context) return;

  const STORAGE_KEY = 'wander.field.guide.v1';
  const GLOBAL_COOLDOWN_MS = 8 * 60 * 1000;
  const POI_COOLDOWN_MS = 24 * 60 * 60 * 1000;
  const MAX_MEMORY = 500;

  let config = {
    enabled: window.WanderFieldGuideConfig?.enabled !== false,
    minScore: Number(window.WanderFieldGuideConfig?.minScore) || 0.58,
  };
  let memory = loadMemory();

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function loadMemory() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (stored?.version === 1) return stored;
    } catch {}
    return { version: 1, lastShownAt: 0, shown: {} };
  }

  function persistMemory() {
    const entries = Object.entries(memory.shown || {});
    if (entries.length > MAX_MEMORY) {
      entries.sort((a, b) => Number(b[1]) - Number(a[1]));
      memory.shown = Object.fromEntries(entries.slice(0, MAX_MEMORY));
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(memory)); } catch {}
  }

  function categoryText(item) {
    return (item?.categories || [])
      .map((category) => `${category.id || ''} ${category.label || ''}`.toLowerCase())
      .join(' ');
  }

  function isGuideworthy(item) {
    const text = categoryText(item);
    if (/pharmacy|atm|bank|hospital|clinic|fuel|toilets|drinking_water/.test(text)) return false;
    return /historic|museum|attraction|monument|castle|fort|archae|heritage|beach|natural|viewpoint|park|gallery|marina/.test(text);
  }

  function maxDistanceFor(current) {
    const mode = String(current?.mobility?.mode || 'unknown');
    const speed = Math.max(0, Number(current?.mobility?.speedKmh) || 0);
    if (mode === 'walking' || mode === 'running') return 450;
    if (mode === 'cycling') return 850;
    if (speed >= 60 || ['car', 'bus', 'train', 'motorcycle'].includes(mode)) return 1800;
    if (speed >= 8 || ['boat', 'sailing'].includes(mode)) return 1200;
    return 700;
  }

  function selectCandidate(current, at = Date.now()) {
    if (!config.enabled || !current?.items?.length) return null;
    if (at - Number(memory.lastShownAt || 0) < GLOBAL_COOLDOWN_MS) return null;
    const maxDistanceM = maxDistanceFor(current);

    return current.items.find((item) => {
      if (!item?.id || !isGuideworthy(item)) return false;
      if (!Number.isFinite(Number(item.distanceM)) || Number(item.distanceM) > maxDistanceM) return false;
      if ((Number(item.relevanceScore) || 0) < config.minScore) return false;
      const lastShown = Number(memory.shown?.[item.id] || 0);
      return at - lastShown >= POI_COOLDOWN_MS;
    }) || null;
  }

  function placeKind(item) {
    const text = categoryText(item);
    if (/museum/.test(text)) return 'un museo';
    if (/historic|monument|castle|fort|archae|heritage/.test(text)) return 'un lugar histórico';
    if (/beach/.test(text)) return 'una playa';
    if (/viewpoint/.test(text)) return 'un mirador';
    if (/natural|park/.test(text)) return 'un lugar natural';
    if (/gallery/.test(text)) return 'una galería';
    if (/marina/.test(text)) return 'una marina';
    return 'un lugar interesante';
  }

  function distanceLabel(distanceM) {
    const distance = Math.max(0, Number(distanceM) || 0);
    if (distance < 100) return `a unos ${Math.max(10, Math.round(distance / 10) * 10)} metros`;
    if (distance < 1000) return `a unos ${Math.round(distance / 50) * 50} metros`;
    return `a unos ${(distance / 1000).toFixed(distance < 3000 ? 1 : 0)} km`;
  }

  function formatSuggestion(item) {
    const sourceCount = item.sources?.length || 0;
    const corroboration = sourceCount > 1 ? ' Varias fuentes coinciden en este lugar.' : '';
    return {
      title: item.name,
      message: `Estás ${distanceLabel(item.distanceM)} de ${placeKind(item)}.${corroboration}`,
    };
  }

  function remember(item, at = Date.now()) {
    memory.lastShownAt = at;
    memory.shown[item.id] = at;
    persistMemory();
  }

  function consider(current = context.value('nearby.current')) {
    const item = selectCandidate(current);
    if (!item) return null;
    const message = formatSuggestion(item);
    const ui = window.WanderUI;
    if (!ui?.showWander) return null;

    ui.showWander(message.title, message.message);
    remember(item);
    context.set('fieldGuide.lastSuggestion', {
      poiId: item.id,
      name: item.name,
      distanceM: item.distanceM,
      relevanceScore: item.relevanceScore,
      shownAt: new Date().toISOString(),
    }, {
      source: 'field-guide',
      kind: 'derived',
      ttlMs: 24 * 60 * 60 * 1000,
      confidence: item.confidence ?? 0.8,
    });
    return clone({ item, message });
  }

  function configure(next = {}) {
    config = {
      ...config,
      ...next,
      enabled: next.enabled == null ? config.enabled : Boolean(next.enabled),
      minScore: Math.max(0, Math.min(1, Number(next.minScore ?? config.minScore))),
    };
    return { ...config };
  }

  function clearMemory() {
    memory = { version: 1, lastShownAt: 0, shown: {} };
    persistMemory();
  }

  context.subscribe((key) => {
    if (key === 'nearby.current') setTimeout(() => consider(), 50);
  });

  window.WanderFieldGuide = Object.freeze({
    consider,
    selectCandidate,
    formatSuggestion,
    configure,
    getConfig: () => ({ ...config }),
    clearMemory,
  });

  setTimeout(() => consider(), 250);
})();

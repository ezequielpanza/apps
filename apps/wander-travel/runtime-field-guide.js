(() => {
  const context = window.WanderContext;
  if (!context) return;

  const STORAGE_KEY = 'wander.field.guide.v1';
  const GLOBAL_COOLDOWN_MS = 8 * 60 * 1000;
  const POI_COOLDOWN_MS = 24 * 60 * 60 * 1000;
  const CANDIDATE_TTL_MS = 2 * 60 * 1000;
  const MAX_MEMORY = 500;

  let config = {
    enabled: window.WanderFieldGuideConfig?.enabled !== false,
    minScore: Number(window.WanderFieldGuideConfig?.minScore) || 0.58,
  };
  let memory = loadMemory();
  let candidateTimer = null;

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

  function contentIdFor(item) {
    return item?.id ? `field-guide:poi:${item.id}:proximity-v1` : null;
  }

  function hasToldContent(item) {
    const contentId = contentIdFor(item);
    return Boolean(contentId && window.WanderEngine?.hasToldContent?.(contentId));
  }

  function selectCandidate(current, at = Date.now()) {
    if (!config.enabled || !current?.items?.length) return null;
    if (at - Number(memory.lastShownAt || 0) < GLOBAL_COOLDOWN_MS) return null;
    const maxDistanceM = maxDistanceFor(current);

    return current.items.find((item) => {
      if (!item?.id || !isGuideworthy(item)) return false;
      if (!Number.isFinite(Number(item.distanceM)) || Number(item.distanceM) > maxDistanceM) return false;
      if ((Number(item.relevanceScore) || 0) < config.minScore) return false;
      if (hasToldContent(item)) return false;
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

  function relativeDirectionLabel(item) {
    const heading = Number(context.value('motion.heading'));
    const bearing = Number(item?.bearingDeg);
    if (!Number.isFinite(heading) || !Number.isFinite(bearing)) return null;
    const delta = ((bearing - heading + 540) % 360) - 180;
    const absolute = Math.abs(delta);
    if (absolute <= 30) return 'adelante tuyo';
    if (absolute >= 150) return 'detrás tuyo';
    return delta > 0 ? 'a tu derecha' : 'a tu izquierda';
  }

  function noteExcerpt(item) {
    const note = (item?.notes || [])
      .filter((entry) => entry?.text && Number(entry.confidence ?? 1) >= 0.75)
      .sort((left, right) => Number(right.confidence ?? 1) - Number(left.confidence ?? 1))[0];
    if (!note) return null;
    const text = String(note.text).replace(/\s+/g, ' ').trim();
    if (!text) return null;
    return text.length <= 180 ? text : `${text.slice(0, 177).trimEnd()}...`;
  }

  function formatSuggestion(item, current = context.value('nearby.current')) {
    const direction = relativeDirectionLabel(item);
    const directionText = direction ? `, ${direction},` : '';
    const note = noteExcerpt(item);
    const sourceCount = item.sources?.length || 0;
    const corroboration = sourceCount > 1 ? ' Varias fuentes coinciden en este lugar.' : '';
    const detail = note ? ` ${note}` : '';
    return {
      title: item.name,
      message: `Tenés ${distanceLabel(item.distanceM)}${directionText} ${placeKind(item)}.${detail}${corroboration}`,
    };
  }

  function interruptionScore(item) {
    const relevance = Math.max(0, Math.min(1, Number(item?.relevanceScore) || 0));
    const sourceBoost = Math.min(2, item?.sources?.length || 0) * 0.025;
    const noteBoost = noteExcerpt(item) ? 0.02 : 0;
    return Math.round(Math.min(0.89, 0.54 + relevance * 0.35 + sourceBoost + noteBoost) * 1000) / 1000;
  }

  function buildCandidate(item, current = context.value('nearby.current'), at = Date.now()) {
    if (!item?.id) return null;
    const contentId = contentIdFor(item);
    return {
      type: 'poi_nearby',
      poiId: item.id,
      contentId,
      score: interruptionScore(item),
      createdAt: new Date(at).toISOString(),
      expiresAt: at + CANDIDATE_TTL_MS,
      item: clone(item),
      presentation: formatSuggestion(item, current),
      context: {
        nearbyUpdatedAt: current?.updatedAt || null,
        mobility: clone(current?.mobility || null),
      },
    };
  }

  function clearCandidate(expectedContentId = null) {
    const existing = context.value('fieldGuide.candidate');
    if (!existing) return false;
    if (expectedContentId && existing.contentId !== expectedContentId) return false;
    if (candidateTimer) clearTimeout(candidateTimer);
    candidateTimer = null;
    return context.remove('fieldGuide.candidate');
  }

  function scheduleCandidateExpiry(candidate) {
    if (candidateTimer) clearTimeout(candidateTimer);
    const delay = Math.max(50, Number(candidate.expiresAt) - Date.now());
    candidateTimer = setTimeout(() => {
      candidateTimer = null;
      clearCandidate(candidate.contentId);
    }, delay);
  }

  function consider(current = context.value('nearby.current'), at = Date.now()) {
    const item = selectCandidate(current, at);
    if (!item) {
      const existing = context.value('fieldGuide.candidate');
      if (existing && Number(existing.expiresAt) <= at) clearCandidate(existing.contentId);
      return null;
    }

    const candidate = buildCandidate(item, current, at);
    const existing = context.value('fieldGuide.candidate');
    if (existing?.contentId === candidate.contentId && Number(existing.expiresAt) > at) return clone(existing);

    context.set('fieldGuide.candidate', candidate, {
      source: 'field-guide',
      kind: 'inferred',
      ttlMs: CANDIDATE_TTL_MS,
      confidence: item.confidence ?? 0.8,
    });
    scheduleCandidateExpiry(candidate);
    return clone(candidate);
  }

  function remember(item, at = Date.now()) {
    memory.lastShownAt = at;
    memory.shown[item.id] = at;
    persistMemory();
  }

  function currentPlaceId() {
    const current = context.value('history.currentPlace');
    return current?.city?.placeId || current?.zone?.placeId || current?.country?.placeId || null;
  }

  function markPresented(candidateInput = context.value('fieldGuide.candidate'), at = Date.now()) {
    const candidate = candidateInput && typeof candidateInput === 'object'
      ? candidateInput
      : context.value('fieldGuide.candidate');
    if (!candidate?.poiId || !candidate?.item) return null;

    remember(candidate.item, at);
    if (candidate.contentId) {
      window.WanderEngine?.rememberContent?.({
        contentId: candidate.contentId,
        placeId: currentPlaceId(),
        topic: 'poi_proximity',
      });
    }

    const record = {
      poiId: candidate.poiId,
      contentId: candidate.contentId || null,
      name: candidate.item.name,
      distanceM: candidate.item.distanceM,
      relevanceScore: candidate.item.relevanceScore,
      shownAt: new Date(at).toISOString(),
    };
    context.set('fieldGuide.lastSuggestion', record, {
      source: 'field-guide',
      kind: 'derived',
      ttlMs: 24 * 60 * 60 * 1000,
      confidence: candidate.item.confidence ?? 0.8,
    });
    clearCandidate(candidate.contentId);
    return clone(record);
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
    clearCandidate();
  }

  context.subscribe((key) => {
    if (key === 'nearby.current') setTimeout(() => consider(), 50);
  });

  window.WanderFieldGuide = Object.freeze({
    consider,
    selectCandidate,
    buildCandidate,
    formatSuggestion,
    contentIdFor,
    markPresented,
    clearCandidate,
    configure,
    getConfig: () => ({ ...config }),
    clearMemory,
  });

  setTimeout(() => consider(), 250);
})();

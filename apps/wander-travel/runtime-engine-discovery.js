(() => {
  const TOURISM_PATTERN = /historic|museum|attraction|monument|castle|fort|archae|heritage|gallery|viewpoint|artwork|memorial|ruins|landmark|beach|natural|park/;
  const UTILITY_PATTERN = /pharmacy|hospital|atm|bank|fuel|parking|toilet|supermarket/;
  const GENERIC_DESCRIPTION_PATTERN = /^(tourist attraction|point of interest|tourist attraction,? point of interest|attraction|poi|place|sitio|lugar|punto de inter[eé]s|atracci[oó]n tur[ií]stica)([.,;:\s-].*)?$/i;
  const DESCRIPTION_MIN_LENGTH = 24;

  function finite(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function categoryText(poi) {
    return (Array.isArray(poi?.categories) ? poi.categories : [])
      .map((category) => `${category?.id || ''} ${category?.label || ''}`.toLowerCase())
      .join(' ');
  }

  function normalizeDescription(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function meaningfulDescription(value) {
    const text = normalizeDescription(value);
    if (text.length < DESCRIPTION_MIN_LENGTH) return null;
    if (GENERIC_DESCRIPTION_PATTERN.test(text)) return null;
    const meaningfulWords = text
      .toLowerCase()
      .replace(/[^a-záéíóúüñ0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 3);
    if (new Set(meaningfulWords).size < 4) return null;
    return text.slice(0, 320);
  }

  function noteText(poi) {
    const notes = Array.isArray(poi?.notes) ? poi.notes : [];
    for (const item of notes) {
      if (!item?.text || finite(item.confidence) === 0) continue;
      const description = meaningfulDescription(item.text);
      if (description) return description;
    }
    return meaningfulDescription(poi?.description)
      || meaningfulDescription(poi?.summary)
      || meaningfulDescription(poi?.editorialSummary);
  }

  function preferenceFor(poi, categoryPreferences = {}) {
    const values = (Array.isArray(poi?.categories) ? poi.categories : []).flatMap((category) => {
      const keys = [category?.id, category?.label]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean);
      return keys.map((key) => finite(categoryPreferences?.[key])).filter((value) => value !== null);
    });
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function relativeDirection(heading, bearing) {
    const currentHeading = finite(heading);
    const targetBearing = finite(bearing);
    if (currentHeading === null || targetBearing === null) return null;
    const delta = ((targetBearing - currentHeading + 540) % 360) - 180;
    if (Math.abs(delta) <= 35) return 'ahead';
    if (delta > 35 && delta <= 120) return 'right';
    if (delta < -35 && delta >= -120) return 'left';
    return 'behind';
  }

  function distanceLimit(situation) {
    const mode = String(situation?.mobility?.mode || 'unknown');
    const moving = situation?.motion?.status === 'moving';
    if (!moving) return 260;
    if (mode === 'walking' || mode === 'running') return 190;
    return 150;
  }

  function candidateFor(poi, situation, hasToldContent, categoryPreferences) {
    if (!poi?.id || !poi?.name) return null;
    const distanceM = finite(poi.distanceM);
    if (distanceM === null || distanceM < 15 || distanceM > distanceLimit(situation)) return null;

    const categories = categoryText(poi);
    const note = noteText(poi);
    if (!note) return null;
    if (UTILITY_PATTERN.test(categories) || !TOURISM_PATTERN.test(categories)) return null;
    const preference = preferenceFor(poi, categoryPreferences);
    if (preference <= -2.5) return null;

    const contentId = `poi-discovery:${poi.id}`;
    if (hasToldContent?.(contentId)) return null;

    const direction = relativeDirection(situation?.heading, poi.bearingDeg);
    if (situation?.motion?.status === 'moving' && direction === 'behind') return null;

    const relevance = Math.max(0, Math.min(1, finite(poi.relevanceScore) ?? 0));
    if (relevance < 0.52) return null;
    const distanceScore = 1 - Math.min(1, distanceM / distanceLimit(situation));
    const preferenceAdjustment = Math.max(-0.1, Math.min(0.1, preference * 0.03));
    const priority = Math.min(0.84, 0.52 + relevance * 0.22 + distanceScore * 0.1 + preferenceAdjustment);

    return {
      id: poi.id,
      name: poi.name,
      location: poi.location || null,
      distanceM: Math.round(distanceM),
      bearingDeg: finite(poi.bearingDeg),
      direction,
      note,
      categories: Array.isArray(poi.categories) ? poi.categories : [],
      sources: Array.isArray(poi.sources) ? poi.sources : [],
      relevanceScore: relevance,
      preference,
      priority: Math.round(priority * 1000) / 1000,
      contentId,
    };
  }

  function evaluate({ situation, items = [], hasToldContent = null, categoryPreferences = {} } = {}) {
    const speedKmh = finite(situation?.speedKmh);
    if (!situation?.locationAvailable) return { candidate: null, reason: 'location_unavailable' };
    if (situation?.motion?.status === 'moving' && speedKmh !== null && speedKmh > 8) {
      return { candidate: null, reason: 'traveler_moving_fast' };
    }

    const candidates = (Array.isArray(items) ? items : [])
      .map((poi) => candidateFor(poi, situation, hasToldContent, categoryPreferences))
      .filter(Boolean)
      .sort((left, right) => right.priority - left.priority || left.distanceM - right.distanceM);

    return {
      candidate: candidates[0] || null,
      reason: candidates.length ? 'relevant_poi_nearby' : 'no_meaningful_poi_description',
      consideredCount: Array.isArray(items) ? items.length : 0,
      eligibleCount: candidates.length,
    };
  }

  window.WanderEngineDiscovery = { evaluate, relativeDirection, meaningfulDescription };
})();

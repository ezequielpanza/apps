(() => {
  const TOURISM_PATTERN = /historic|museum|attraction|monument|castle|fort|archae|heritage|gallery|viewpoint|artwork|memorial|ruins|landmark|beach|natural|park/;
  const UTILITY_PATTERN = /pharmacy|hospital|atm|bank|fuel|parking|toilet|supermarket/;

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

  function noteText(poi) {
    const notes = Array.isArray(poi?.notes) ? poi.notes : [];
    const note = notes.find((item) => item?.text && finite(item.confidence) !== 0);
    return note ? String(note.text).replace(/\s+/g, ' ').trim().slice(0, 240) : null;
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

  function candidateFor(poi, situation, hasToldContent) {
    if (!poi?.id || !poi?.name) return null;
    const distanceM = finite(poi.distanceM);
    if (distanceM === null || distanceM < 15 || distanceM > distanceLimit(situation)) return null;

    const categories = categoryText(poi);
    const note = noteText(poi);
    const touristInterest = TOURISM_PATTERN.test(categories);
    if (UTILITY_PATTERN.test(categories) || (!touristInterest && !note)) return null;

    const contentId = `poi-discovery:${poi.id}`;
    if (hasToldContent?.(contentId)) return null;

    const direction = relativeDirection(situation?.heading, poi.bearingDeg);
    if (situation?.motion?.status === 'moving' && direction === 'behind') return null;

    const relevance = Math.max(0, Math.min(1, finite(poi.relevanceScore) ?? 0));
    if (relevance < 0.52) return null;
    const distanceScore = 1 - Math.min(1, distanceM / distanceLimit(situation));
    const priority = Math.min(0.84, 0.48 + relevance * 0.22 + distanceScore * 0.1 + (note ? 0.04 : 0));

    return {
      id: poi.id,
      name: poi.name,
      distanceM: Math.round(distanceM),
      bearingDeg: finite(poi.bearingDeg),
      direction,
      note,
      categories: Array.isArray(poi.categories) ? poi.categories : [],
      sources: Array.isArray(poi.sources) ? poi.sources : [],
      relevanceScore: relevance,
      priority: Math.round(priority * 1000) / 1000,
      contentId,
    };
  }

  function evaluate({ situation, items = [], hasToldContent = null } = {}) {
    const speedKmh = finite(situation?.speedKmh);
    if (!situation?.locationAvailable) return { candidate: null, reason: 'location_unavailable' };
    if (situation?.motion?.status === 'moving' && speedKmh !== null && speedKmh > 8) {
      return { candidate: null, reason: 'traveler_moving_fast' };
    }

    const candidates = (Array.isArray(items) ? items : [])
      .map((poi) => candidateFor(poi, situation, hasToldContent))
      .filter(Boolean)
      .sort((left, right) => right.priority - left.priority || left.distanceM - right.distanceM);

    return {
      candidate: candidates[0] || null,
      reason: candidates.length ? 'relevant_poi_nearby' : 'no_relevant_poi',
      consideredCount: Array.isArray(items) ? items.length : 0,
      eligibleCount: candidates.length,
    };
  }

  window.WanderEngineDiscovery = { evaluate, relativeDirection };
})();

(() => {
  const GLOBAL_COOLDOWN_MS = 120000;
  const FAST_MOVEMENT_KMH = 6;
  const DISCOVERY_WINDOW_MS = 30 * 60 * 1000;
  const MAX_DISCOVERIES_PER_WINDOW = 3;

  function finite(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function greeting(at) {
    const hour = new Date(at).getHours();
    if (hour >= 5 && hour < 12) return 'Buen día.';
    if (hour >= 12 && hour < 20) return 'Buenas tardes.';
    return 'Buenas noches.';
  }

  function placeIntro(evaluation, at) {
    const place = evaluation?.semanticPlace;
    if (!place?.id || !place?.name || !['city', 'country'].includes(place.level)) return null;
    const contentId = `place-intro:${place.id}`;
    return {
      id: `arrival:${place.id}`,
      kind: 'place_intro',
      title: `Te doy la bienvenida a ${place.name}`,
      message: `${greeting(at)} Parece que es tu primera visita a ${place.name}. ` +
        'Voy a acompañarte con contexto y sugerencias solamente cuando puedan mejorar el recorrido. ' +
        `Si ya conocías ${place.name}, podés decírmelo.`,
      contentId,
      topic: 'place_intro',
      placeId: place.id,
      placeLevel: place.level,
      placeName: place.name,
      allowsFamiliarityCorrection: true,
    };
  }

  function humanDistance(distanceM) {
    const distance = Math.max(0, Math.round(Number(distanceM) || 0));
    if (distance < 100) return `A unos ${Math.max(20, Math.round(distance / 10) * 10)} metros`;
    const minutes = Math.max(2, Math.ceil(distance / 75));
    return `A unos ${minutes} minutos a pie`;
  }

  function directionText(direction) {
    if (direction === 'ahead') return ', un poco más adelante,';
    if (direction === 'right') return ', hacia tu derecha,';
    if (direction === 'left') return ', hacia tu izquierda,';
    return ' de tu posición';
  }

  function discoveryIntervention(evaluation) {
    const poi = evaluation?.poi;
    if (!poi?.id || !poi?.name) return null;
    const lead = `${humanDistance(poi.distanceM)}${directionText(poi.direction)} está ${poi.name}.`;
    const fact = poi.note ? ` ${String(poi.note).replace(/\s+/g, ' ').trim().slice(0, 240)}` : '';
    const lat = finite(poi.location?.lat);
    const lng = finite(poi.location?.lng);
    return {
      id: `discovery:${poi.id}`,
      kind: 'poi_discovery',
      title: 'Algo interesante cerca',
      message: lead + fact,
      contentId: poi.contentId || `poi-discovery:${poi.id}`,
      topic: 'poi_discovery',
      placeId: poi.id,
      poi,
      action: lat !== null && lng !== null ? {
        id: 'take-me',
        label: 'Llévame',
        destination: { id: poi.id, name: poi.name, lat, lng },
      } : null,
      allowsFamiliarityCorrection: false,
    };
  }

  function contextualIntervention(evaluation) {
    const suggestion = evaluation?.suggestion;
    if (!suggestion?.id || !suggestion?.title || !suggestion?.message) return null;
    return {
      id: suggestion.id,
      kind: suggestion.kind || 'contextual_suggestion',
      title: suggestion.title,
      message: suggestion.message,
      contentId: suggestion.contentId || suggestion.id,
      topic: suggestion.topic || 'contextual_suggestion',
      placeId: suggestion.placeId || evaluation?.semanticPlace?.id || null,
      placeLevel: evaluation?.semanticPlace?.level || 'place',
      placeName: suggestion.placeName || evaluation?.semanticPlace?.name || null,
      poi: suggestion.poi || null,
      action: suggestion.action || null,
      allowsFamiliarityCorrection: false,
    };
  }

  function decide({
    evaluation,
    at = Date.now(),
    lastInterventionAt = null,
    contentAlreadyTold = false,
    documentVisible = true,
    backgroundNotificationsAvailable = false,
    mapAvailable = true,
    recentInterventions = [],
    navigationActive = false,
  } = {}) {
    if (!['introduce_place', 'discover_poi', 'contextual_suggestion'].includes(evaluation?.type)) {
      return { disposition: 'ignore', reason: 'unsupported_action' };
    }

    const intervention = evaluation.type === 'introduce_place'
      ? placeIntro(evaluation, at)
      : evaluation.type === 'discover_poi'
        ? discoveryIntervention(evaluation)
        : contextualIntervention(evaluation);
    if (!intervention) return { disposition: 'ignore', reason: 'unsupported_place' };
    if (contentAlreadyTold) return { disposition: 'ignore', reason: 'content_already_told', intervention };
    if (!documentVisible && !backgroundNotificationsAvailable) {
      return { disposition: 'defer', reason: 'document_hidden', intervention };
    }
    if (documentVisible && !mapAvailable) return { disposition: 'defer', reason: 'map_unavailable', intervention };
    if (['discover_poi', 'contextual_suggestion'].includes(evaluation.type) && navigationActive) {
      return { disposition: 'defer', reason: 'navigation_active', intervention };
    }

    const speedKmh = finite(evaluation?.situation?.speedKmh);
    const moving = evaluation?.situation?.motion?.status === 'moving';
    if (moving && speedKmh !== null && speedKmh > FAST_MOVEMENT_KMH) {
      return { disposition: 'defer', reason: 'traveler_moving_fast', intervention };
    }

    const previousAt = finite(lastInterventionAt);
    if (previousAt !== null && at - previousAt < GLOBAL_COOLDOWN_MS) {
      return {
        disposition: 'defer',
        reason: 'intervention_cooldown',
        retryAt: previousAt + GLOBAL_COOLDOWN_MS,
        intervention,
      };
    }

    if (evaluation.type === 'discover_poi') {
      const recentDiscoveries = (Array.isArray(recentInterventions) ? recentInterventions : [])
        .map((entry) => ({ ...entry, at: Date.parse(entry?.at) || finite(entry?.at) }))
        .filter((entry) => entry.kind === 'poi_discovery' && Number.isFinite(entry.at) && at - entry.at < DISCOVERY_WINDOW_MS)
        .sort((left, right) => left.at - right.at);
      if (recentDiscoveries.length >= MAX_DISCOVERIES_PER_WINDOW) {
        return {
          disposition: 'defer',
          reason: 'discovery_budget_exhausted',
          retryAt: recentDiscoveries[0].at + DISCOVERY_WINDOW_MS,
          intervention,
        };
      }
    }

    return {
      disposition: documentVisible ? 'present' : 'notify',
      reason: evaluation.reason || 'contextual_opportunity',
      intervention,
    };
  }

  window.WanderCompanionPolicy = {
    decide,
    greeting,
    constants: { GLOBAL_COOLDOWN_MS, FAST_MOVEMENT_KMH, DISCOVERY_WINDOW_MS, MAX_DISCOVERIES_PER_WINDOW },
  };
})();

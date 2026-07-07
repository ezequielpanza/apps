(() => {
  const TRANSITION_SCORES = {
    'arrival.confirmed': 0.96,
    'arrival.possible': 0.82,
    'location.lost': 0.7,
    'movement.stopped': 0.45,
    'movement.started': 0.25,
    'location.available': 0.15,
  };

  const AREA_EVENT_SCORES = {
    'area.first_seen': 0.18,
    'area.route_returned': 0.22,
    'area.place_returned': 0.7,
    'area.encountered': 0.08,
    'area.passed_through': 0.12,
    'area.stopped': 0.38,
    'area.explored': 0.76,
    'area.visited': 0.82,
    'area.stayed': 0.88,
    'area.route_familiar': 0.2,
    'area.route_frequent': 0.15,
    'area.place_familiar': 0.55,
    'area.place_frequent': 0.45,
  };

  const PLACE_EVENT_SCORES = {
    'country.entered': 0.25,
    'country.exited': 0.12,
    'country.returned': 0.86,
    'country.encountered': 0.08,
    'country.passed_through': 0.12,
    'country.stopped': 0.4,
    'country.explored': 0.82,
    'country.visited': 0.9,
    'country.stayed': 0.94,
    'country.familiar': 0.58,
    'country.frequent': 0.48,
    'country.route_familiar': 0.2,
    'country.route_frequent': 0.15,

    'city.entered': 0.18,
    'city.exited': 0.1,
    'city.returned': 0.78,
    'city.encountered': 0.06,
    'city.passed_through': 0.1,
    'city.stopped': 0.42,
    'city.explored': 0.82,
    'city.visited': 0.88,
    'city.stayed': 0.92,
    'city.familiar': 0.55,
    'city.frequent': 0.45,
    'city.route_familiar': 0.18,
    'city.route_frequent': 0.12,

    'zone.entered': 0.12,
    'zone.exited': 0.08,
    'zone.returned': 0.68,
    'zone.encountered': 0.05,
    'zone.passed_through': 0.08,
    'zone.stopped': 0.36,
    'zone.explored': 0.75,
    'zone.visited': 0.82,
    'zone.stayed': 0.86,
    'zone.familiar': 0.5,
    'zone.frequent': 0.4,
    'zone.route_familiar': 0.15,
    'zone.route_frequent': 0.1,
  };

  const CONFIRMED_ARRIVAL = {
    unexplored: 0.99,
    first_visit: 0.94,
    returning: 0.88,
    familiar: 0.68,
    frequent: 0.45,
  };

  const POSSIBLE_ARRIVAL = {
    unexplored: 0.88,
    first_visit: 0.84,
    returning: 0.76,
    familiar: 0.52,
    frequent: 0.32,
  };

  function latestOfType(items, types) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (types.includes(items[index]?.type)) return items[index];
    }
    return null;
  }

  function arrivalSignal(placeFamiliarity, confirmed) {
    const suffix = confirmed ? 'confirmed' : 'possible';
    if (placeFamiliarity === 'unexplored') return 'arrival.new_area.' + suffix;
    if (placeFamiliarity === 'first_visit' || placeFamiliarity === 'returning') return 'arrival.returning_area.' + suffix;
    if (placeFamiliarity === 'familiar' || placeFamiliarity === 'frequent') return 'arrival.known_area.' + suffix;
    return 'arrival.unknown_area.' + suffix;
  }

  function arrivalCandidate(transitions, currentArea) {
    const confirmed = latestOfType(transitions, ['arrival.confirmed']);
    const possible = confirmed ? null : latestOfType(transitions, ['arrival.possible']);
    const transition = confirmed || possible;
    if (!transition) return null;

    const placeFamiliarity = currentArea?.placeFamiliarity || 'unknown';
    const table = confirmed ? CONFIRMED_ARRIVAL : POSSIBLE_ARRIVAL;
    const score = table[placeFamiliarity] ?? TRANSITION_SCORES[transition.type] ?? 0;
    const type = arrivalSignal(placeFamiliarity, Boolean(confirmed));

    return {
      score,
      reason: type.replaceAll('.', '_'),
      signal: {
        type,
        score,
        placeFamiliarity,
        routeFamiliarity: currentArea?.routeFamiliarity || null,
      },
      transition,
      areaEvent: null,
      placeEvent: null,
      currentArea: currentArea || null,
      currentPlace: null,
    };
  }

  function transitionCandidate(transitions) {
    let best = null;
    transitions.forEach((entry) => {
      let score = TRANSITION_SCORES[entry?.type] || 0;
      if (entry?.type === 'movement.stopped' && entry.significant) score = 0.65;
      if (!best || score > best.score) {
        best = {
          score,
          reason: entry?.type === 'movement.stopped' && entry.significant
            ? 'significant_movement_stopped'
            : String(entry?.type || 'unknown').replaceAll('.', '_'),
          signal: { type: entry?.type || 'unknown', score },
          transition: entry,
          areaEvent: null,
          placeEvent: null,
          currentArea: null,
          currentPlace: null,
        };
      }
    });
    return best;
  }

  function areaCandidate(areaEvents, currentArea, situation) {
    let best = null;
    areaEvents.forEach((entry) => {
      let score = AREA_EVENT_SCORES[entry?.type] || 0;
      if (situation?.motion?.status === 'moving') {
        if (entry?.type === 'area.first_seen') score = 0.05;
        if (entry?.type === 'area.route_returned') score = 0.12;
        if (entry?.type === 'area.place_returned') score = 0.45;
      }
      if (!best || score > best.score) {
        best = {
          score,
          reason: String(entry?.type || 'unknown').replaceAll('.', '_'),
          signal: {
            type: entry?.type || 'unknown',
            score,
            placeFamiliarity: currentArea?.placeFamiliarity || entry?.placeFamiliarity || null,
            routeFamiliarity: currentArea?.routeFamiliarity || entry?.routeFamiliarity || null,
          },
          transition: null,
          areaEvent: entry,
          placeEvent: null,
          currentArea: currentArea || null,
          currentPlace: null,
        };
      }
    });
    return best;
  }

  function placeCandidate(placeEvents, currentPlace, situation) {
    let best = null;
    placeEvents.forEach((entry) => {
      let score = PLACE_EVENT_SCORES[entry?.type] || 0;
      if (entry?.firstMeaningfulVisit && /\.(visited|explored|stayed)$/.test(entry.type || '')) {
        if (entry.level === 'country') score = Math.max(score, 0.98);
        else if (entry.level === 'city') score = Math.max(score, 0.96);
        else if (entry.level === 'zone') score = Math.max(score, 0.9);
      }

      if (situation?.motion?.status === 'moving') {
        if (/\.entered$/.test(entry?.type || '')) score = Math.min(score, 0.1);
        if (/\.passed_through$/.test(entry?.type || '')) score = Math.min(score, 0.08);
      }

      if (!best || score > best.score) {
        best = {
          score,
          reason: String(entry?.type || 'unknown').replaceAll('.', '_'),
          signal: {
            type: entry?.type || 'unknown',
            score,
            placeLevel: entry?.level || null,
            placeId: entry?.placeId || null,
            placeName: entry?.name || null,
            placeFamiliarity: entry?.familiarity || null,
            routeFamiliarity: entry?.routeFamiliarity || null,
            firstMeaningfulVisit: Boolean(entry?.firstMeaningfulVisit),
          },
          transition: null,
          areaEvent: null,
          placeEvent: entry,
          currentArea: null,
          currentPlace: currentPlace || null,
        };
      }
    });
    return best;
  }

  function evaluate({ situation, transitions = [], memory = {}, place = {} } = {}) {
    const currentArea = memory?.currentArea || null;
    const areaEvents = Array.isArray(memory?.areaEvents) ? memory.areaEvents : [];
    const currentPlace = place?.current || null;
    const placeEvents = Array.isArray(place?.events) ? place.events : [];
    const candidates = [
      arrivalCandidate(transitions, currentArea),
      transitionCandidate(transitions),
      areaCandidate(areaEvents, currentArea, situation),
      placeCandidate(placeEvents, currentPlace, situation),
    ].filter(Boolean);

    const best = candidates.reduce((selected, candidate) => {
      if (!selected || candidate.score > selected.score) return candidate;
      return selected;
    }, null);

    if (best) return best;

    if (!situation?.locationAvailable) {
      return {
        score: 0,
        reason: 'location_unavailable',
        signal: { type: 'wait', score: 0 },
        transition: null,
        areaEvent: null,
        placeEvent: null,
        currentArea,
        currentPlace,
      };
    }

    return {
      score: 0,
      reason: 'no_relevant_signal',
      signal: { type: 'wait', score: 0 },
      transition: null,
      areaEvent: null,
      placeEvent: null,
      currentArea,
      currentPlace,
    };
  }

  window.WanderEngineRelevance = { evaluate };
})();

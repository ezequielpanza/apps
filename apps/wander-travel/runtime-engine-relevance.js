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
      currentArea: currentArea || null,
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
          currentArea: null,
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
          currentArea: currentArea || null,
        };
      }
    });
    return best;
  }

  function evaluate({ situation, transitions = [], memory = {} } = {}) {
    const currentArea = memory?.currentArea || null;
    const areaEvents = Array.isArray(memory?.areaEvents) ? memory.areaEvents : [];
    const candidates = [
      arrivalCandidate(transitions, currentArea),
      transitionCandidate(transitions),
      areaCandidate(areaEvents, currentArea, situation),
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
        currentArea,
      };
    }

    return {
      score: 0,
      reason: 'no_relevant_signal',
      signal: { type: 'wait', score: 0 },
      transition: null,
      areaEvent: null,
      currentArea,
    };
  }

  window.WanderEngineRelevance = { evaluate };
})();

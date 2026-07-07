(() => {
  const TRANSITION_SCORES = {
    'arrival.confirmed': 0.9,
    'arrival.possible': 0.68,
    'location.lost': 0.7,
    'movement.stopped': 0.4,
    'movement.started': 0.2,
    'location.available': 0.12,
  };

  const PLACE_EVENT_SCORES = {
    'country.entered': 0.18,
    'country.assumed_new': 0.98,
    'country.new_confirmed': 0.99,
    'country.recent_presence': 0.58,
    'country.known': 0.5,
    'country.exited': 0.08,

    'city.entered': 0.14,
    'city.assumed_new': 0.94,
    'city.new_confirmed': 0.98,
    'city.recent_presence': 0.55,
    'city.known': 0.48,
    'city.exited': 0.06,

    'zone.entered': 0.1,
    'zone.assumed_new': 0.72,
    'zone.new_confirmed': 0.8,
    'zone.recent_presence': 0.42,
    'zone.known': 0.38,
    'zone.exited': 0.05,
  };

  function latestOfType(items, types) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (types.includes(items[index]?.type)) return items[index];
    }
    return null;
  }

  function transitionCandidate(transitions) {
    let best = null;
    transitions.forEach((entry) => {
      let score = TRANSITION_SCORES[entry?.type] || 0;
      if (entry?.type === 'movement.stopped' && entry.significant) score = 0.62;
      if (!best || score > best.score) {
        best = {
          score,
          reason: entry?.type === 'movement.stopped' && entry.significant
            ? 'significant_movement_stopped'
            : String(entry?.type || 'unknown').replaceAll('.', '_'),
          signal: { type: entry?.type || 'unknown', score },
          transition: entry,
          placeEvent: null,
          currentPlace: null,
        };
      }
    });
    return best;
  }

  function arrivalCandidate(transitions, currentPlace) {
    const confirmed = latestOfType(transitions, ['arrival.confirmed']);
    const possible = confirmed ? null : latestOfType(transitions, ['arrival.possible']);
    const transition = confirmed || possible;
    if (!transition) return null;

    const city = currentPlace?.city || null;
    const country = currentPlace?.country || null;
    const target = city || country;
    const status = target?.presenceStatus || null;
    const score = confirmed ? 0.9 : 0.68;

    return {
      score,
      reason: confirmed ? 'arrival_confirmed' : 'arrival_possible',
      signal: {
        type: confirmed ? 'arrival.confirmed' : 'arrival.possible',
        score,
        placeLevel: target?.level || null,
        placeId: target?.placeId || null,
        placeName: target?.name || null,
        presenceStatus: status,
      },
      transition,
      placeEvent: null,
      currentPlace: currentPlace || null,
    };
  }

  function placeCandidate(placeEvents, currentPlace, situation) {
    let best = null;
    placeEvents.forEach((entry) => {
      let score = PLACE_EVENT_SCORES[entry?.type] || 0;

      if (situation?.motion?.status === 'moving') {
        if (/\.entered$/.test(entry?.type || '')) score = Math.min(score, 0.08);
        if (/\.assumed_new$/.test(entry?.type || '') && entry.level === 'zone') score = Math.min(score, 0.45);
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
            presenceStatus: entry?.presenceStatus || null,
            knownByUser: entry?.knownByUser ?? null,
            seenYesterday: Boolean(entry?.seenYesterday),
          },
          transition: null,
          placeEvent: entry,
          currentPlace: currentPlace || null,
        };
      }
    });
    return best;
  }

  function evaluate({ situation, transitions = [], place = {} } = {}) {
    const currentPlace = place?.current || null;
    const placeEvents = Array.isArray(place?.events) ? place.events : [];
    const candidates = [
      placeCandidate(placeEvents, currentPlace, situation),
      arrivalCandidate(transitions, currentPlace),
      transitionCandidate(transitions),
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
        placeEvent: null,
        currentPlace,
      };
    }

    return {
      score: 0,
      reason: 'no_relevant_signal',
      signal: { type: 'wait', score: 0 },
      transition: null,
      placeEvent: null,
      currentPlace,
    };
  }

  window.WanderEngineRelevance = { evaluate };
})();

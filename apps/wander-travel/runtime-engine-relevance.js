(() => {
  const BASE_TRANSITION_SCORES = {
    'arrival.confirmed': 0.96,
    'arrival.possible': 0.82,
    'location.lost': 0.7,
    'movement.stopped': 0.45,
    'movement.started': 0.25,
    'movement.mode_changed': 0.2,
    'location.available': 0.15,
  };

  const AREA_EVENT_SCORES = {
    'area.first_visit': 0.6,
    'area.returned': 0.7,
    'area.familiar': 0.48,
    'area.frequent': 0.4,
  };

  const ARRIVAL_CONFIRMED_BY_FAMILIARITY = {
    first_visit: 0.99,
    returning: 0.9,
    familiar: 0.72,
    frequent: 0.5,
  };

  const ARRIVAL_POSSIBLE_BY_FAMILIARITY = {
    first_visit: 0.88,
    returning: 0.78,
    familiar: 0.56,
    frequent: 0.36,
  };

  function latestOfType(items, types) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (types.includes(items[index]?.type)) return items[index];
    }
    return null;
  }

  function areaSignalType(familiarity, confirmed) {
    const suffix = confirmed ? 'confirmed' : 'possible';
    if (familiarity === 'first_visit') return 'arrival.new_area.' + suffix;
    if (familiarity === 'returning') return 'arrival.returning_area.' + suffix;
    if (familiarity === 'familiar' || familiarity === 'frequent') return 'arrival.known_area.' + suffix;
    return 'arrival.unknown_area.' + suffix;
  }

  function arrivalCandidate(transitions, currentArea) {
    const confirmed = latestOfType(transitions, ['arrival.confirmed']);
    const possible = confirmed ? null : latestOfType(transitions, ['arrival.possible']);
    const transition = confirmed || possible;
    if (!transition) return null;

    const familiarity = currentArea?.familiarity || 'unknown';
    const scoreTable = confirmed ? ARRIVAL_CONFIRMED_BY_FAMILIARITY : ARRIVAL_POSSIBLE_BY_FAMILIARITY;
    const score = scoreTable[familiarity] ?? BASE_TRANSITION_SCORES[transition.type] ?? 0;

    return {
      score,
      reason: areaSignalType(familiarity, Boolean(confirmed)).replaceAll('.', '_'),
      signal: {
        type: areaSignalType(familiarity, Boolean(confirmed)),
        score,
        familiarity,
      },
      transition,
      areaEvent: null,
      currentArea: currentArea || null,
    };
  }

  function transitionCandidate(transitions) {
    let best = null;
    transitions.forEach((entry) => {
      let score = BASE_TRANSITION_SCORES[entry?.type] || 0;
      if (entry?.type === 'movement.stopped' && entry.significant) score = 0.65;
      if (!best || score > best.score) {
        best = {
          score,
          reason: entry.type === 'movement.stopped' && entry.significant
            ? 'significant_movement_stopped'
            : String(entry?.type || 'unknown').replaceAll('.', '_'),
          signal: {
            type: entry?.type || 'unknown',
            score,
          },
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
      if (entry?.type === 'area.first_visit' && situation?.motion?.status === 'moving') score = 0.2;
      if (entry?.type === 'area.returned' && situation?.motion?.status === 'moving') score = 0.4;
      if (!best || score > best.score) {
        best = {
          score,
          reason: String(entry?.type || 'unknown').replaceAll('.', '_'),
          signal: {
            type: entry?.type || 'unknown',
            score,
            familiarity: currentArea?.familiarity || entry?.familiarity || null,
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

  window.WanderEngineRelevance = {
    evaluate,
  };
})();

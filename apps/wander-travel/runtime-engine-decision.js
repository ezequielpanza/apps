(() => {
  const TRANSITION_RELEVANCE = {
    'arrival.confirmed': 0.96,
    'arrival.possible': 0.82,
    'location.lost': 0.7,
    'movement.stopped': 0.45,
    'movement.started': 0.25,
    'movement.mode_changed': 0.2,
    'location.available': 0.15,
  };

  function selectMostRelevantTransition(transitions = []) {
    return transitions.reduce((best, transition) => {
      const score = TRANSITION_RELEVANCE[transition?.type] || 0;
      if (!best || score > best.score) return { transition, score };
      return best;
    }, null);
  }

  function evaluateRelevance({ situation, transitions = [] } = {}) {
    const selected = selectMostRelevantTransition(transitions);

    if (selected?.transition?.type === 'movement.stopped' && selected.transition.significant) {
      return {
        score: 0.65,
        reason: 'significant_movement_stopped',
        transition: selected.transition,
      };
    }

    if (selected) {
      return {
        score: selected.score,
        reason: selected.transition.type.replaceAll('.', '_'),
        transition: selected.transition,
      };
    }

    if (!situation?.locationAvailable) {
      return {
        score: 0,
        reason: 'location_unavailable',
        transition: null,
      };
    }

    return {
      score: 0,
      reason: 'no_relevant_transition',
      transition: null,
    };
  }

  function decideAction({ situation, relevance } = {}) {
    const transition = relevance?.transition;

    if (transition?.type === 'arrival.possible') {
      return {
        type: 'observe',
        reason: 'possible_arrival',
        followUpAfterMs: 90000,
      };
    }

    if (transition?.type === 'arrival.confirmed') {
      return {
        type: 'arrival_detected',
        reason: 'stable_stop_after_significant_movement',
      };
    }

    if (!situation?.locationAvailable) {
      return {
        type: 'wait',
        reason: 'location_unavailable',
      };
    }

    return {
      type: 'wait',
      reason: relevance?.reason || 'no_relevant_transition',
    };
  }

  window.WanderEngineDecision = {
    evaluateRelevance,
    decideAction,
    selectMostRelevantTransition,
  };
})();

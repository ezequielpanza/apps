(() => {
  function decideAction({ situation, relevance } = {}) {
    const signalType = relevance?.signal?.type || 'wait';
    const placeFamiliarity = relevance?.currentArea?.placeFamiliarity || relevance?.signal?.placeFamiliarity || null;
    const routeFamiliarity = relevance?.currentArea?.routeFamiliarity || relevance?.signal?.routeFamiliarity || null;

    if (signalType.startsWith('arrival.') && signalType.endsWith('.possible')) {
      return {
        type: 'observe',
        reason: signalType,
        followUpAfterMs: 90000,
        memoryAware: true,
        placeFamiliarity,
        routeFamiliarity,
      };
    }

    if (signalType === 'arrival.new_area.confirmed') {
      return {
        type: 'arrival_detected',
        reason: 'new_area_arrival',
        memoryAware: true,
        placeFamiliarity: 'unexplored',
        routeFamiliarity,
        discoveryMode: 'explore',
      };
    }

    if (signalType === 'arrival.returning_area.confirmed') {
      return {
        type: 'arrival_detected',
        reason: 'returning_area_arrival',
        memoryAware: true,
        placeFamiliarity,
        routeFamiliarity,
        discoveryMode: 'continue',
      };
    }

    if (signalType === 'arrival.known_area.confirmed') {
      return {
        type: 'arrival_detected',
        reason: 'known_area_arrival',
        memoryAware: true,
        placeFamiliarity,
        routeFamiliarity,
        discoveryMode: 'avoid_repetition',
      };
    }

    if (signalType === 'arrival.unknown_area.confirmed') {
      return {
        type: 'arrival_detected',
        reason: 'stable_stop_after_significant_movement',
        memoryAware: false,
        placeFamiliarity: null,
        routeFamiliarity,
        discoveryMode: 'neutral',
      };
    }

    if (signalType === 'area.place_returned') {
      return {
        type: 'observe',
        reason: 'place_returned',
        memoryAware: true,
        placeFamiliarity,
        routeFamiliarity,
      };
    }

    if (signalType === 'area.explored' || signalType === 'area.visited' || signalType === 'area.stayed') {
      return {
        type: 'observe',
        reason: signalType,
        memoryAware: true,
        placeFamiliarity,
        routeFamiliarity,
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
      reason: relevance?.reason || 'no_relevant_signal',
      memoryAware: Boolean(relevance?.currentArea),
      placeFamiliarity,
      routeFamiliarity,
    };
  }

  window.WanderEngineDecision = { decideAction };
})();

(() => {
  function decideAction({ situation, relevance } = {}) {
    const signalType = relevance?.signal?.type || 'wait';
    const familiarity = relevance?.currentArea?.familiarity || relevance?.signal?.familiarity || null;

    if (signalType.endsWith('.possible') && signalType.startsWith('arrival.')) {
      return {
        type: 'observe',
        reason: signalType,
        followUpAfterMs: 90000,
        memoryAware: true,
        areaFamiliarity: familiarity,
      };
    }

    if (signalType === 'arrival.new_area.confirmed') {
      return {
        type: 'arrival_detected',
        reason: 'new_area_arrival',
        memoryAware: true,
        areaFamiliarity: 'first_visit',
        discoveryMode: 'explore',
      };
    }

    if (signalType === 'arrival.returning_area.confirmed') {
      return {
        type: 'arrival_detected',
        reason: 'returning_area_arrival',
        memoryAware: true,
        areaFamiliarity: 'returning',
        discoveryMode: 'continue',
      };
    }

    if (signalType === 'arrival.known_area.confirmed') {
      return {
        type: 'arrival_detected',
        reason: 'known_area_arrival',
        memoryAware: true,
        areaFamiliarity: familiarity,
        discoveryMode: 'avoid_repetition',
      };
    }

    if (signalType === 'arrival.unknown_area.confirmed') {
      return {
        type: 'arrival_detected',
        reason: 'stable_stop_after_significant_movement',
        memoryAware: false,
        areaFamiliarity: null,
        discoveryMode: 'neutral',
      };
    }

    if (signalType === 'area.returned') {
      return {
        type: 'observe',
        reason: 'area_returned',
        memoryAware: true,
        areaFamiliarity: familiarity,
      };
    }

    if (signalType === 'area.first_visit' && relevance?.score >= 0.5) {
      return {
        type: 'observe',
        reason: 'area_first_visit',
        memoryAware: true,
        areaFamiliarity: 'first_visit',
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
      areaFamiliarity: familiarity,
    };
  }

  window.WanderEngineDecision = {
    decideAction,
  };
})();

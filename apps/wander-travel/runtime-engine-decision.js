(() => {
  function evaluateRelevance(situation) {
    if (!situation?.locationAvailable) {
      return {
        score: 0,
        reason: 'location_unavailable',
      };
    }

    return {
      score: 0,
      reason: 'no_relevance_rules',
    };
  }

  function decideAction({ situation, relevance } = {}) {
    if (!situation?.locationAvailable) {
      return {
        type: 'wait',
        reason: 'location_unavailable',
      };
    }

    if (!relevance || relevance.score <= 0) {
      return {
        type: 'wait',
        reason: relevance?.reason || 'no_relevance_rules',
      };
    }

    return {
      type: 'wait',
      reason: 'no_action_rules',
    };
  }

  window.WanderEngineDecision = {
    evaluateRelevance,
    decideAction,
  };
})();

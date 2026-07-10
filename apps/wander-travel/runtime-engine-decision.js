(() => {
  function decideAction({ situation, relevance } = {}) {
    const signal = relevance?.signal || { type: 'wait', score: 0 };
    const signalType = signal.type || 'wait';
    const semanticPlace = {
      level: signal.placeLevel || null,
      id: signal.placeId || null,
      name: signal.placeName || null,
    };

    if (/^(country|city|zone)\.(assumed_new|new_confirmed)$/.test(signalType)) {
      return {
        type: 'introduce_place',
        reason: signalType,
        semanticPlace,
        presenceStatus: signal.presenceStatus,
        assumption: signalType.endsWith('.assumed_new') ? 'new' : 'confirmed_new',
        canBeCorrectedByUser: true,
        contentMode: 'intro_plus_relevant',
      };
    }

    if (/^(country|city|zone)\.recent_presence$/.test(signalType)) {
      return {
        type: 'continue_place',
        reason: 'recent_presence',
        semanticPlace,
        presenceStatus: signal.presenceStatus,
        contentMode: 'new_relevant_only',
        avoidRepeatedIntro: true,
      };
    }

    if (/^(country|city|zone)\.known$/.test(signalType)) {
      return {
        type: 'continue_place',
        reason: 'known_by_user',
        semanticPlace,
        presenceStatus: signal.presenceStatus,
        contentMode: 'new_relevant_only',
        avoidRepeatedIntro: true,
      };
    }

    if (signalType === 'arrival.possible') {
      return {
        type: 'observe',
        reason: 'arrival_possible',
        followUpAfterMs: 90000,
        semanticPlace,
      };
    }

    if (signalType === 'arrival.confirmed') {
      return {
        type: 'arrival_detected',
        reason: 'arrival_confirmed',
        semanticPlace,
        presenceStatus: signal.presenceStatus || null,
        contentMode: 'relevant',
      };
    }

    if (signalType === 'field_guide.poi_nearby' && relevance?.fieldGuideCandidate) {
      const candidate = relevance.fieldGuideCandidate;
      return {
        type: 'field_guide_suggestion',
        reason: 'poi_nearby_relevant',
        poiId: candidate.poiId,
        contentId: candidate.contentId,
        presentation: candidate.presentation,
        fieldGuideCandidate: candidate,
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
      memoryAware: Boolean(relevance?.currentPlace),
    };
  }

  window.WanderEngineDecision = { decideAction };
})();

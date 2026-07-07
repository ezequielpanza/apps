(() => {
  const context = window.WanderContext;
  const state = window.WanderEngineState;
  const inference = window.WanderEngineInference;
  const transition = window.WanderEngineTransition;
  const journey = window.WanderEngineJourney;
  const memory = window.WanderEngineMemory;
  const placeEngine = window.WanderEnginePlace;
  const relevanceEngine = window.WanderEngineRelevance;
  const decision = window.WanderEngineDecision;
  if (!context || !state || !inference || !transition || !journey || !memory || !placeEngine || !relevanceEngine || !decision) return;

  const evaluationListeners = new Set();
  let lastEvaluation = null;
  let reevaluationTimer = null;
  let lastMemoryContext = null;
  let lastMemoryContextWriteAt = 0;
  let lastPlaceContext = null;
  let lastPlaceContextWriteAt = 0;

  function publishEvaluation(evaluation, reason) {
    lastEvaluation = evaluation;
    evaluationListeners.forEach((listener) => {
      try { listener(evaluation, reason); } catch {}
    });
  }

  function subscribeEvaluation(listener) {
    evaluationListeners.add(listener);
    return () => evaluationListeners.delete(listener);
  }

  function writeSituation(situation) {
    const motion = situation.motion;
    const mobility = situation.mobility;
    const motionConfidence = situation.source === 'simulator' ? 1 : motion.confidence;

    context.set('motion.status', motion.status, {
      source: 'engine',
      kind: 'inferred',
      confidence: motionConfidence,
    });
    context.remove('motion.mode');

    context.set('mobility.mode', mobility.mode, {
      source: mobility.source || 'engine',
      kind: 'inferred',
      confidence: mobility.confidence,
    });
    context.set('mobility.evidence', mobility.evidence || [], {
      source: mobility.source || 'engine',
      kind: 'inferred',
      confidence: mobility.confidence,
    });

    if (situation.speedKmh === null) {
      context.remove('motion.speedKmh');
      context.remove('motion.heading');
    } else {
      context.set('motion.speedKmh', situation.speedKmh, {
        source: 'engine',
        kind: 'derived',
        confidence: motionConfidence,
      });
      if (situation.heading === null) context.remove('motion.heading');
      else context.set('motion.heading', situation.heading, {
        source: 'engine',
        kind: 'derived',
        confidence: motionConfidence,
      });
    }

    context.setContext({
      status: motion.label,
      activity: motion.activity,
      source: 'engine',
      confidence: motionConfidence,
    });
  }

  function writeTransition(events, relevance) {
    if (!events.length) return;
    const selected = relevance?.transition || events[events.length - 1];
    context.set('situation.transition', selected, {
      source: 'engine',
      kind: 'inferred',
      ttlMs: 120000,
      confidence: selected.confidence ?? 0.8,
    });
  }

  function writeJourney(journeyResult) {
    const active = journeyResult.active;
    if (!active) {
      context.remove('journey.current');
    } else {
      context.set('journey.current', {
        id: active.id,
        state: active.state,
        startedAt: active.startedAt,
        distanceM: Math.round(active.distanceM || 0),
        movingDurationMs: Math.round(active.movingDurationMs || 0),
        stationaryDurationMs: Math.round(active.stationaryDurationMs || 0),
        mobilityModes: [...new Set((active.mobilitySegments || []).map((entry) => entry.mode))],
      }, {
        source: 'engine-journey',
        kind: 'inferred',
        ttlMs: 300000,
        confidence: 0.9,
      });
    }

    if (journeyResult.events.length) {
      const selected = journeyResult.events[journeyResult.events.length - 1];
      context.set('journey.event', selected, {
        source: 'engine-journey',
        kind: 'inferred',
        ttlMs: 120000,
        confidence: selected.confidence ?? 0.85,
      });
    }
  }

  function writeMemoryEvent(areaEvents, relevance) {
    if (!areaEvents.length) return;
    const selected = relevance?.areaEvent || areaEvents[areaEvents.length - 1];
    context.set('history.areaEvent', selected, {
      source: 'engine-memory',
      kind: 'inferred',
      ttlMs: 120000,
      confidence: selected.confidence ?? 0.85,
    });
  }

  function sameMemoryMeaning(a, b) {
    if (!a || !b) return a === b;
    return a.cellId === b.cellId &&
      a.routeFamiliarity === b.routeFamiliarity &&
      a.placeFamiliarity === b.placeFamiliarity &&
      a.interactionState === b.interactionState &&
      a.passThroughCount === b.passThroughCount &&
      a.visitCount === b.visitCount &&
      a.stayCount === b.stayCount;
  }

  function writeMemoryContext(currentArea, at) {
    if (!currentArea) {
      if (lastMemoryContext !== null) context.remove('history.currentArea');
      lastMemoryContext = null;
      lastMemoryContextWriteAt = at;
      return;
    }

    const semanticChange = !sameMemoryMeaning(lastMemoryContext, currentArea);
    const periodicRefresh = at - lastMemoryContextWriteAt >= 30000;
    if (!semanticChange && !periodicRefresh) return;

    context.set('history.currentArea', currentArea, {
      source: 'engine-memory',
      kind: 'derived',
      ttlMs: 300000,
      confidence: 0.9,
    });
    lastMemoryContext = currentArea;
    lastMemoryContextWriteAt = at;
  }

  function samePlaceMeaning(a, b) {
    if (!a || !b) return a === b;
    const levels = ['country', 'city', 'zone'];
    return levels.every((level) => {
      const left = a[level];
      const right = b[level];
      if (!left || !right) return left === right;
      return left.placeId === right.placeId &&
        left.familiarity === right.familiarity &&
        left.routeFamiliarity === right.routeFamiliarity &&
        left.visitCount === right.visitCount &&
        left.passThroughCount === right.passThroughCount &&
        left.session?.interaction === right.session?.interaction;
    });
  }

  function writePlaceContext(placeResult, relevance, at) {
    const current = placeResult.current;
    if (!current) {
      if (lastPlaceContext !== null) context.remove('history.currentPlace');
      lastPlaceContext = null;
      lastPlaceContextWriteAt = at;
    } else {
      const semanticChange = !samePlaceMeaning(lastPlaceContext, current);
      const periodicRefresh = at - lastPlaceContextWriteAt >= 30000;
      if (semanticChange || periodicRefresh) {
        context.set('history.currentPlace', current, {
          source: 'engine-place',
          kind: 'derived',
          ttlMs: 300000,
          confidence: 0.92,
        });
        lastPlaceContext = current;
        lastPlaceContextWriteAt = at;
      }
    }

    if (placeResult.events.length) {
      const selected = relevance?.placeEvent || placeResult.events[placeResult.events.length - 1];
      context.set('situation.placeEvent', selected, {
        source: 'engine-place',
        kind: 'inferred',
        ttlMs: 120000,
        confidence: selected.confidence ?? 0.88,
      });
    }
  }

  function scheduleReevaluation(...times) {
    if (reevaluationTimer) clearTimeout(reevaluationTimer);
    reevaluationTimer = null;
    const valid = times.filter(Number.isFinite);
    if (!valid.length) return;
    const nextAt = Math.min(...valid);
    reevaluationTimer = setTimeout(() => {
      reevaluationTimer = null;
      run('engine:timer');
    }, Math.max(50, nextAt - Date.now()));
  }

  function buildEvaluation(situation, transitionResult, journeyResult, memoryResult, placeResult) {
    const relevance = relevanceEngine.evaluate({
      situation,
      transitions: transitionResult.events,
      memory: memoryResult,
      journey: journeyResult,
      place: placeResult,
    });
    const action = decision.decideAction({
      situation,
      relevance,
      memory: memoryResult,
      journey: journeyResult,
      place: placeResult,
    });

    return {
      ...action,
      contextAvailable: situation.locationAvailable,
      situation,
      transitions: transitionResult.events,
      transitionState: {
        stableAvailability: transitionResult.stableAvailability,
        stableMotion: transitionResult.stableMotion,
        pending: transitionResult.pending,
        nextCheckAt: transitionResult.nextCheckAt,
      },
      journey: journeyResult,
      memory: {
        currentArea: memoryResult.currentArea,
        areaEvents: memoryResult.areaEvents,
        closedInteractions: memoryResult.closedInteractions,
      },
      place: {
        current: placeResult.current,
        events: placeResult.events,
        closedSessions: placeResult.closedSessions,
        nextCheckAt: placeResult.nextCheckAt,
      },
      relevance,
    };
  }

  function evaluate() {
    const situation = inference.inferSituation(context);
    const currentArea = memory.getCurrentAreaSummary(situation);
    const memorySnapshot = { currentArea, areaEvents: [], closedInteractions: [] };
    const journeySnapshot = journey.snapshot();
    const placeSnapshot = {
      current: placeEngine.getCurrentSummary(),
      events: [],
      closedSessions: [],
      nextCheckAt: null,
    };
    const relevance = relevanceEngine.evaluate({
      situation,
      transitions: [],
      memory: memorySnapshot,
      journey: journeySnapshot,
      place: placeSnapshot,
    });
    const action = decision.decideAction({
      situation,
      relevance,
      memory: memorySnapshot,
      journey: journeySnapshot,
      place: placeSnapshot,
    });
    return {
      ...action,
      contextAvailable: situation.locationAvailable,
      situation,
      transitions: [],
      transitionState: transition.snapshot(),
      journey: journeySnapshot,
      memory: memorySnapshot,
      place: placeSnapshot,
      relevance,
    };
  }

  function run(reason = 'manual') {
    const at = Date.now();
    const situation = inference.inferSituation(context);
    const transitionResult = transition.update(situation, at);
    const journeyResult = journey.update({ situation, transitionState: transitionResult }, at);
    const memoryResult = memory.observe({
      situation,
      transitionState: transitionResult,
      journeyState: journeyResult,
    }, at);
    const placeResult = placeEngine.update({
      place: context.value('place.current'),
      placeStatus: context.value('place.status'),
      situation,
      transitionState: transitionResult,
      journeyState: journeyResult,
      memoryResult,
    }, at);
    const evaluation = buildEvaluation(situation, transitionResult, journeyResult, memoryResult, placeResult);

    writeSituation(situation);
    writeTransition(transitionResult.events, evaluation.relevance);
    writeJourney(journeyResult);
    writeMemoryEvent(memoryResult.areaEvents, evaluation.relevance);
    writeMemoryContext(memoryResult.currentArea, at);
    writePlaceContext(placeResult, evaluation.relevance, at);
    scheduleReevaluation(transitionResult.nextCheckAt, journeyResult.nextCheckAt, placeResult.nextCheckAt);
    publishEvaluation(evaluation, reason);
    return evaluation;
  }

  context.subscribe((key) => {
    if (
      key === 'location.effective' ||
      key.startsWith('location.effective.') ||
      key.startsWith('mobility.override.') ||
      key.startsWith('mobility.provider.') ||
      key === 'place.current' ||
      key === 'place.status'
    ) {
      run('context:' + key);
    }
  });

  window.WanderEngine = {
    getState: state.getState,
    subscribe: state.subscribe,
    update: state.update,
    observe: state.observe,
    answer: state.answer,
    inferMotionState: inference.inferMotionState,
    inferSituation: () => inference.inferSituation(context),
    evaluate,
    run,
    getLastEvaluation: () => lastEvaluation,
    getTransitionState: transition.snapshot,
    getJourney: journey.getState,
    getMemory: memory.snapshot,
    getPlaceMemory: placeEngine.snapshot,
    getPlaceRecord: placeEngine.getRecord,
    hasSeen: memory.hasSeen,
    hasVisited: memory.hasVisited,
    subscribeEvaluation,
  };

  run('init');
})();

(() => {
  const context = window.WanderContext;
  const state = window.WanderEngineState;
  const inference = window.WanderEngineInference;
  const transition = window.WanderEngineTransition;
  const memory = window.WanderEngineMemory;
  const relevanceEngine = window.WanderEngineRelevance;
  const decision = window.WanderEngineDecision;
  if (!context || !state || !inference || !transition || !memory || !relevanceEngine || !decision) return;

  const evaluationListeners = new Set();
  let lastEvaluation = null;
  let transitionTimer = null;
  let lastMemoryContext = null;
  let lastMemoryContextWriteAt = 0;

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
    const confidence = situation.source === 'simulator' ? 1 : motion.confidence;

    context.set('motion.status', motion.status, {
      source: 'engine',
      kind: 'inferred',
      confidence,
    });

    context.set('motion.mode', motion.mode, {
      source: 'engine',
      kind: 'inferred',
      confidence,
    });

    if (situation.speedKmh === null) {
      context.remove('motion.speedKmh');
      context.remove('motion.heading');
    } else {
      context.set('motion.speedKmh', situation.speedKmh, {
        source: 'engine',
        kind: 'derived',
        confidence,
      });

      if (situation.heading === null) context.remove('motion.heading');
      else context.set('motion.heading', situation.heading, {
        source: 'engine',
        kind: 'derived',
        confidence,
      });
    }

    context.setContext({
      status: motion.label,
      activity: motion.activity,
      source: 'engine',
      confidence,
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
      a.familiarity === b.familiarity &&
      a.visitCount === b.visitCount &&
      a.previousVisitAt === b.previousVisitAt &&
      a.coverage === b.coverage;
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

  function scheduleTransitionCheck(nextCheckAt) {
    if (transitionTimer) clearTimeout(transitionTimer);
    transitionTimer = null;
    if (!Number.isFinite(nextCheckAt)) return;

    const delay = Math.max(50, nextCheckAt - Date.now());
    transitionTimer = setTimeout(() => {
      transitionTimer = null;
      run('transition:timer');
    }, delay);
  }

  function buildEvaluation(situation, transitionResult, memoryResult) {
    const relevance = relevanceEngine.evaluate({
      situation,
      transitions: transitionResult.events,
      memory: memoryResult,
    });
    const action = decision.decideAction({ situation, relevance, memory: memoryResult });

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
      memory: {
        currentArea: memoryResult.currentArea,
        areaEvents: memoryResult.areaEvents,
        closedEpisodes: memoryResult.closedEpisodes,
      },
      relevance,
    };
  }

  function evaluate() {
    const situation = inference.inferSituation(context);
    const currentArea = memory.getCurrentAreaSummary(situation);
    const memorySnapshot = { currentArea, areaEvents: [], closedEpisodes: [] };
    const relevance = relevanceEngine.evaluate({
      situation,
      transitions: [],
      memory: memorySnapshot,
    });
    const action = decision.decideAction({ situation, relevance, memory: memorySnapshot });
    return {
      ...action,
      contextAvailable: situation.locationAvailable,
      situation,
      transitions: [],
      transitionState: transition.snapshot(),
      memory: memorySnapshot,
      relevance,
    };
  }

  function run(reason = 'manual') {
    const at = Date.now();
    const situation = inference.inferSituation(context);
    const transitionResult = transition.update(situation, at);
    const memoryResult = memory.observe({
      situation,
      transitions: transitionResult.events,
      transitionState: transitionResult,
    }, at);
    const evaluation = buildEvaluation(situation, transitionResult, memoryResult);

    writeSituation(situation);
    writeTransition(transitionResult.events, evaluation.relevance);
    writeMemoryEvent(memoryResult.areaEvents, evaluation.relevance);
    writeMemoryContext(memoryResult.currentArea, at);
    scheduleTransitionCheck(transitionResult.nextCheckAt);
    publishEvaluation(evaluation, reason);
    return evaluation;
  }

  context.subscribe((key) => {
    if (key === 'location.effective' || key.startsWith('location.effective.')) {
      run('context:' + key);
    }
  });

  window.WanderEngine = {
    getState: state.getState,
    subscribe: state.subscribe,
    update: state.update,
    observe: state.observe,
    answer: state.answer,
    inferMotionProfile: inference.inferMotionProfile,
    inferSituation: () => inference.inferSituation(context),
    evaluate,
    run,
    getLastEvaluation: () => lastEvaluation,
    getTransitionState: transition.snapshot,
    getMemory: memory.snapshot,
    hasVisited: memory.hasVisited,
    subscribeEvaluation,
  };

  run('init');
})();

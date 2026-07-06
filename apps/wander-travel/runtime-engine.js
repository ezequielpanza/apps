(() => {
  const context = window.WanderContext;
  const state = window.WanderEngineState;
  const inference = window.WanderEngineInference;
  const transition = window.WanderEngineTransition;
  const decision = window.WanderEngineDecision;
  if (!context || !state || !inference || !transition || !decision) return;

  const evaluationListeners = new Set();
  let lastEvaluation = null;
  let transitionTimer = null;

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
      context.remove?.('motion.speedKmh');
      context.remove?.('motion.heading');
    } else {
      context.set('motion.speedKmh', situation.speedKmh, {
        source: 'engine',
        kind: 'derived',
        confidence,
      });

      if (situation.heading === null) context.remove?.('motion.heading');
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

  function buildEvaluation(situation, transitionResult) {
    const relevance = decision.evaluateRelevance({
      situation,
      transitions: transitionResult.events,
    });
    const action = decision.decideAction({ situation, relevance });

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
      relevance,
    };
  }

  function evaluate() {
    const situation = inference.inferSituation(context);
    const relevance = decision.evaluateRelevance({ situation, transitions: [] });
    const action = decision.decideAction({ situation, relevance });
    return {
      ...action,
      contextAvailable: situation.locationAvailable,
      situation,
      transitions: [],
      transitionState: transition.snapshot(),
      relevance,
    };
  }

  function run(reason = 'manual') {
    const situation = inference.inferSituation(context);
    const transitionResult = transition.update(situation, Date.now());
    const evaluation = buildEvaluation(situation, transitionResult);

    writeSituation(situation);
    writeTransition(transitionResult.events, evaluation.relevance);
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
    subscribeEvaluation,
  };

  run('init');
})();

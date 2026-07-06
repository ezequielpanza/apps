(() => {
  const context = window.WanderContext;
  const state = window.WanderEngineState;
  const inference = window.WanderEngineInference;
  const decision = window.WanderEngineDecision;
  if (!context || !state || !inference || !decision) return;

  const evaluationListeners = new Set();
  let lastEvaluation = null;

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

    context.set('motion.status', motion.status, { source: 'engine', kind: 'inferred', confidence });
    context.set('motion.mode', motion.mode, { source: 'engine', kind: 'inferred', confidence });

    if (situation.speedKmh === null) {
      context.setMotion({ speedKmh: 0, heading: null, source: 'engine' });
    } else {
      context.set('motion.speedKmh', situation.speedKmh, { source: 'engine', kind: 'derived', confidence });
      if (situation.heading === null) context.setMotion({ heading: null, source: 'engine' });
      else context.set('motion.heading', situation.heading, { source: 'engine', kind: 'derived', confidence });
    }

    context.setContext({
      status: motion.label,
      activity: motion.activity,
      source: 'engine',
      confidence,
    });
  }

  function evaluate() {
    const situation = inference.inferSituation(context);
    const relevance = decision.evaluateRelevance(situation);
    const action = decision.decideAction({ situation, relevance });
    return {
      ...action,
      contextAvailable: situation.locationAvailable,
      situation,
      relevance,
    };
  }

  function run(reason = 'manual') {
    const evaluation = evaluate();
    writeSituation(evaluation.situation);
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
    subscribeEvaluation,
  };

  run('init');
})();

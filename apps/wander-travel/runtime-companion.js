(() => {
  const context = window.WanderContext;
  const engine = window.WanderEngine;
  const policy = window.WanderCompanionPolicy;
  const ui = window.WanderUI;
  if (!context || !engine?.subscribeEvaluation || !policy || !ui) return;

  let pendingEvaluation = null;
  let lastInterventionAt = latestInterventionAt();
  let retryTimer = null;
  let activeIntervention = null;

  function interventionHistory() {
    return (engine.getState?.()?.memory?.interactions || [])
      .filter((entry) => entry?.type === 'companion_intervention');
  }

  function latestInterventionAt() {
    return interventionHistory().reduce((latest, entry) => {
      const at = Date.parse(entry?.at || '');
      return Number.isFinite(at) ? Math.max(latest || 0, at) : latest;
    }, null);
  }

  function mapAvailable() {
    const app = document.querySelector('.wander-app');
    return app?.dataset?.screen === 'map' && !document.body.classList.contains('poi-editor-open');
  }

  function clearRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function scheduleRetry(retryAt) {
    clearRetry();
    if (!Number.isFinite(retryAt)) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      attempt('policy:retry');
    }, Math.max(50, retryAt - Date.now()));
  }

  function replyOptions(intervention) {
    if (!intervention.allowsFamiliarityCorrection) return null;
    return {
      placeholder: `Por ejemplo: ya conozco ${intervention.placeName}`,
      ariaLabel: `Corregir lo que Wander sabe de ${intervention.placeName}`,
      onSubmit: receive,
    };
  }

  function actionOptions(intervention) {
    if (!intervention.action) return null;
    return {
      label: intervention.action.label,
      onInvoke: () => {
        const navigation = window.WanderNavigation;
        if (!navigation?.start) {
          ui.showWander('La navegación aún no está disponible', 'Probá de nuevo en unos segundos.', { timeoutMs: 6000 });
          return null;
        }
        return Promise.resolve(navigation.start(intervention.action.destination)).then((route) => {
          if (!route) return null;
          engine.observe?.({
            type: 'companion_feedback',
            interventionId: intervention.id,
            feedbackType: 'accepted',
            contentId: intervention.contentId,
          });
          engine.updateContentFeedback?.(intervention.contentId, { interest: 'accepted' });
          return route;
        });
      },
    };
  }

  function recordDismissal(intervention) {
    engine.observe?.({
      type: 'companion_feedback',
      interventionId: intervention.id,
      feedbackType: 'dismissed',
      contentId: intervention.contentId,
    });
    engine.updateContentFeedback?.(intervention.contentId, { interest: 'dismissed' });
  }

  function present(intervention, reason) {
    const shown = ui.showWander(intervention.title, intervention.message, {
      timeoutMs: 14000,
      reply: replyOptions(intervention),
      action: actionOptions(intervention),
      onDismiss: () => recordDismissal(intervention),
    });
    if (shown === false) return false;

    activeIntervention = intervention;
    lastInterventionAt = Date.now();
    pendingEvaluation = null;
    clearRetry();

    if (intervention.allowsFamiliarityCorrection) {
      engine.requestPlaceClarification?.({
        level: intervention.placeLevel,
        placeId: intervention.placeId,
        name: intervention.placeName,
      });
    }
    engine.rememberContent?.({
      contentId: intervention.contentId,
      placeId: intervention.placeId,
      topic: intervention.topic,
    });
    engine.observe?.({
      type: 'companion_intervention',
      interventionId: intervention.id,
      kind: intervention.kind,
      contentId: intervention.contentId,
      reason,
    });
    context.set('companion.lastIntervention', {
      id: intervention.id,
      kind: intervention.kind,
      placeId: intervention.placeId,
      presentedAt: new Date(lastInterventionAt).toISOString(),
    }, {
      source: 'companion',
      kind: 'derived',
      ttlMs: 30 * 60 * 1000,
      confidence: 1,
    });
    return true;
  }

  function attempt(reason = 'manual') {
    if (!pendingEvaluation) return { disposition: 'ignore', reason: 'nothing_pending' };
    const placeId = pendingEvaluation.semanticPlace?.id;
    const contentId = pendingEvaluation.type === 'discover_poi'
      ? pendingEvaluation.poi?.contentId || (pendingEvaluation.poi?.id ? `poi-discovery:${pendingEvaluation.poi.id}` : null)
      : (placeId ? `place-intro:${placeId}` : null);
    const result = policy.decide({
      evaluation: pendingEvaluation,
      at: Date.now(),
      lastInterventionAt,
      contentAlreadyTold: Boolean(contentId && engine.hasToldContent?.(contentId)),
      documentVisible: document.visibilityState !== 'hidden',
      mapAvailable: mapAvailable(),
      recentInterventions: interventionHistory(),
      navigationActive: context.value?.('navigation.current')?.status === 'active',
    });

    if (result.disposition === 'present') present(result.intervention, reason);
    if (result.disposition === 'ignore') pendingEvaluation = null;
    if (result.disposition === 'defer') scheduleRetry(result.retryAt);
    return result;
  }

  function handleEvaluation(evaluation, reason = 'engine') {
    if (evaluation?.type === 'introduce_place' || evaluation?.type === 'discover_poi') pendingEvaluation = evaluation;
    return attempt(reason);
  }

  function receive(text) {
    const message = String(text || '').trim();
    if (!message) return { handled: false };
    const result = engine.handleUserMessage?.(message) || { handled: false };

    if (result.handled) {
      engine.observe?.({
        type: 'companion_feedback',
        interventionId: activeIntervention?.id || null,
        feedbackType: result.type,
        known: result.known,
      });
      context.set('companion.lastFeedback', {
        type: result.type,
        known: result.known,
        placeId: result.placeId,
        at: new Date().toISOString(),
      }, {
        source: 'user',
        kind: 'confirmed',
        ttlMs: 30 * 60 * 1000,
        confidence: 1,
      });
      ui.showWander('Entendido', result.message, { timeoutMs: 6500 });
      activeIntervention = null;
      return result;
    }

    if (activeIntervention?.allowsFamiliarityCorrection) {
      ui.showWander(
        'Quiero entenderte bien',
        `Podés decirme “ya conozco ${activeIntervention.placeName}” o “es mi primera vez”.`,
        { timeoutMs: 14000, reply: replyOptions(activeIntervention) },
      );
    }
    return result;
  }

  engine.subscribeEvaluation(handleEvaluation);
  document.addEventListener('visibilitychange', () => attempt('document:visibility'));
  window.addEventListener('wander:screen-change', () => attempt('screen:change'));

  const initial = engine.getLastEvaluation?.();
  if (initial) handleEvaluation(initial, 'companion:init');

  window.WanderCompanion = {
    attempt,
    handleEvaluation,
    receive,
    getPending: () => pendingEvaluation,
    getActive: () => activeIntervention,
  };
})();

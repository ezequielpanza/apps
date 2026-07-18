(() => {
  const context = window.WanderContext;
  const engine = window.WanderEngine;
  const policy = window.WanderCompanionPolicy;
  const ui = window.WanderUI;
  const interactionCore = window.WanderInteractionCore;
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

  function categoryKeys(intervention) {
    return (Array.isArray(intervention?.poi?.categories) ? intervention.poi.categories : [])
      .flatMap((category) => [category?.id, category?.label])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean);
  }

  function learnCategories(intervention, delta, reason) {
    const keys = [...new Set(categoryKeys(intervention))];
    keys.forEach((category) => {
      if (window.WanderEngineState?.learnPreference) {
        window.WanderEngineState.learnPreference({
          category,
          delta,
          reason,
          interactionId: interactionCore?.getCurrent?.()?.id || null,
          placeId: intervention.placeId || intervention.poi?.id || null,
          source: 'companion-response',
        });
        return;
      }
      engine.update?.((draft) => {
        draft.profile ||= {};
        draft.profile.interests ||= {};
        const current = Number(draft.profile.interests[category]) || 0;
        draft.profile.interests[category] = Math.max(-3, Math.min(5, Math.round((current + delta) * 10) / 10));
        return draft;
      }, `companion-preference:${reason}`);
    });
  }

  function rememberFeedback(intervention, feedbackType, extra = {}) {
    interactionCore?.respond?.({
      id: feedbackType,
      type: feedbackType,
      label: extra.label || feedbackType,
      value: extra.value ?? null,
    });
    engine.observe?.({
      type: 'companion_feedback',
      interventionId: intervention?.id || null,
      feedbackType,
      contentId: intervention?.contentId || null,
      ...extra,
    });
  }

  function familiarityChoices(intervention) {
    if (!intervention.allowsFamiliarityCorrection) return [];
    return [
      {
        label: 'Sí, la conozco',
        onInvoke: () => receive(`Ya conozco ${intervention.placeName}`),
      },
      {
        label: 'No, es nueva para mí',
        emphasis: 'primary',
        onInvoke: () => receive('Es mi primera vez'),
      },
    ];
  }

  async function startNavigation(intervention) {
    const navigation = window.WanderNavigation;
    if (!navigation?.start || !intervention?.action?.destination) {
      ui.showWander('La navegación aún no está disponible', 'Probá de nuevo en unos segundos.', { timeoutMs: 6000 });
      return null;
    }
    const route = await navigation.start(intervention.action.destination);
    if (!route) return null;
    rememberFeedback(intervention, 'accepted', { label: 'Llévame' });
    engine.updateContentFeedback?.(intervention.contentId, { interest: 'accepted' });
    learnCategories(intervention, 1, 'accepted');
    interactionCore?.complete?.('accepted');
    activeIntervention = null;
    return route;
  }

  function detailMessage(intervention) {
    const poi = intervention?.poi;
    if (!poi) return 'Todavía no tengo más información confiable sobre este lugar.';
    const description = String(poi.description || poi.note || '').replace(/\s+/g, ' ').trim();
    if (description) return description.slice(0, 520);
    const categories = [...new Set(categoryKeys(intervention))]
      .filter((value) => !/^[a-z0-9_-]+$/.test(value) || value.includes(' '))
      .slice(0, 4);
    const distance = Number.isFinite(Number(poi.distanceM)) ? ` Está a unos ${Math.max(0, Math.round(Number(poi.distanceM)))} metros.` : '';
    return `${poi.name} aparece como ${categories.length ? categories.join(', ') : 'un lugar relevante cercano'}.${distance}`;
  }

  function decline(intervention) {
    rememberFeedback(intervention, 'rejected', { label: 'Ahora no' });
    engine.updateContentFeedback?.(intervention.contentId, { interest: 'dismissed' });
    learnCategories(intervention, -0.5, 'rejected');
    interactionCore?.complete?.('rejected');
    activeIntervention = null;
    ui.hideWander();
  }

  function requestAlternative(intervention) {
    rememberFeedback(intervention, 'alternative_requested', { label: 'Otra opción' });
    interactionCore?.complete?.('alternative_requested');
    activeIntervention = null;
    ui.hideWander();
    setTimeout(() => window.WanderProactiveCompanion?.requestAlternative?.(intervention?.poi?.id), 0);
  }

  function showMore(intervention) {
    rememberFeedback(intervention, 'more_info', { label: 'Contame más' });
    learnCategories(intervention, 0.2, 'more_info');
    const choices = [];
    if (intervention.action) {
      choices.push({ label: 'Llévame', emphasis: 'primary', onInvoke: () => startNavigation(intervention) });
    }
    choices.push({ label: 'Otra opción', onInvoke: () => requestAlternative(intervention) });
    choices.push({
      label: 'Cerrar',
      onInvoke: () => {
        rememberFeedback(intervention, 'acknowledged', { label: 'Cerrar' });
        interactionCore?.complete?.('acknowledged');
        activeIntervention = null;
        ui.hideWander();
      },
    });
    ui.showWander(`Sobre ${intervention.poi?.name || intervention.placeName || 'este lugar'}`, detailMessage(intervention), {
      persistent: true,
      choices,
    });
  }

  function interactionChoices(intervention) {
    const familiarity = familiarityChoices(intervention);
    if (familiarity.length) return familiarity;
    const isSuggestion = intervention.interactionType === 'suggest' || Boolean(intervention.poi || intervention.action);
    if (!isSuggestion) return [];
    const choices = [];
    if (intervention.action) choices.push({ label: 'Llévame', emphasis: 'primary', onInvoke: () => startNavigation(intervention) });
    if (intervention.poi) choices.push({ label: 'Contame más', onInvoke: () => showMore(intervention) });
    if (intervention.poi) choices.push({ label: 'Otra opción', onInvoke: () => requestAlternative(intervention) });
    choices.push({ label: 'Ahora no', onInvoke: () => decline(intervention) });
    return choices;
  }

  function recordDismissal(intervention) {
    if (!intervention || activeIntervention?.id !== intervention.id) return;
    rememberFeedback(intervention, 'dismissed', { label: 'Cerrar' });
    engine.updateContentFeedback?.(intervention.contentId, { interest: 'dismissed' });
    learnCategories(intervention, -0.25, 'dismissed');
    interactionCore?.complete?.('dismissed');
    activeIntervention = null;
  }

  function present(intervention, reason) {
    const choices = interactionChoices(intervention);
    const shown = ui.showWander(intervention.title, intervention.message, {
      timeoutMs: choices.length ? 0 : 14000,
      persistent: choices.length > 0,
      choices,
      onDismiss: () => recordDismissal(intervention),
    });
    if (shown === false) return false;

    activeIntervention = intervention;
    interactionCore?.present?.(intervention, { reason, channel: 'in_app' });
    return rememberPresentation(intervention, reason, 'in_app');
  }

  function notify(intervention, reason) {
    if (!window.WanderPlatform?.notifyCompanion?.(intervention)) return false;
    activeIntervention = null;
    interactionCore?.present?.(intervention, { reason, channel: 'notification' });
    interactionCore?.complete?.('notified');
    return rememberPresentation(intervention, reason, 'notification');
  }

  function rememberPresentation(intervention, reason, channel) {
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
      interactionType: intervention.interactionType,
      priority: intervention.priority,
      contentId: intervention.contentId,
      reason,
    });
    context.set('companion.lastIntervention', {
      id: intervention.id,
      kind: intervention.kind,
      interactionType: intervention.interactionType,
      priority: intervention.priority,
      placeId: intervention.placeId,
      presentedAt: new Date(lastInterventionAt).toISOString(),
      channel,
    }, {
      source: 'companion', kind: 'derived', ttlMs: 30 * 60 * 1000, confidence: 1,
    });
    return true;
  }

  function contentIdFor(evaluation) {
    if (evaluation?.type === 'discover_poi') {
      return evaluation.poi?.contentId || (evaluation.poi?.id ? `poi-discovery:${evaluation.poi.id}` : null);
    }
    if (evaluation?.type === 'contextual_suggestion') {
      return evaluation.suggestion?.contentId || evaluation.suggestion?.id || null;
    }
    const placeId = evaluation?.semanticPlace?.id;
    return placeId ? `place-intro:${placeId}` : null;
  }

  function attempt(reason = 'manual') {
    if (!pendingEvaluation) return { disposition: 'ignore', reason: 'nothing_pending' };
    const contentId = contentIdFor(pendingEvaluation);
    const result = policy.decide({
      evaluation: pendingEvaluation,
      at: Date.now(),
      lastInterventionAt,
      contentAlreadyTold: Boolean(contentId && engine.hasToldContent?.(contentId)),
      documentVisible: document.visibilityState !== 'hidden',
      backgroundNotificationsAvailable: window.WanderPlatform?.canNotifyInBackground?.() === true,
      mapAvailable: mapAvailable(),
      recentInterventions: interventionHistory(),
      navigationActive: context.value?.('navigation.current')?.status === 'active',
    });

    interactionCore?.recordDecision?.({
      disposition: result.disposition,
      reason: result.reason,
      evaluationType: pendingEvaluation?.type,
      placeId: result.intervention?.placeId || pendingEvaluation?.semanticPlace?.id || null,
      contentId,
    });

    if (result.disposition === 'present') present(result.intervention, reason);
    if (result.disposition === 'notify') notify(result.intervention, reason);
    if (result.disposition === 'ignore') pendingEvaluation = null;
    if (result.disposition === 'defer') scheduleRetry(result.retryAt);
    return result;
  }

  function handleEvaluation(evaluation, reason = 'engine') {
    if (['introduce_place', 'discover_poi', 'contextual_suggestion'].includes(evaluation?.type)) pendingEvaluation = evaluation;
    return attempt(reason);
  }

  function receive(text) {
    const message = String(text || '').trim();
    if (!message) return { handled: false };
    const result = engine.handleUserMessage?.(message) || { handled: false };

    if (result.handled) {
      rememberFeedback(activeIntervention, result.type || 'answer', {
        known: result.known,
        value: message,
        label: message,
      });
      context.set('companion.lastFeedback', {
        type: result.type,
        known: result.known,
        placeId: result.placeId,
        at: new Date().toISOString(),
      }, {
        source: 'user', kind: 'confirmed', ttlMs: 30 * 60 * 1000, confidence: 1,
      });
      interactionCore?.complete?.('answered');
      ui.showWander('Entendido', result.message, { timeoutMs: 6500 });
      activeIntervention = null;
      return result;
    }

    if (activeIntervention?.allowsFamiliarityCorrection) {
      ui.showWander('Quiero entenderte bien', `¿Ya conocías ${activeIntervention.placeName}?`, {
        persistent: true,
        choices: familiarityChoices(activeIntervention),
      });
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
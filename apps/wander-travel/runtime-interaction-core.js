(() => {
  if (window.WanderInteractionCore) return;

  const context = window.WanderContext;
  const repository = window.WanderMemoryRepository;
  const listeners = new Set();
  const TYPES = Object.freeze(['observe', 'inform', 'suggest', 'ask', 'warn']);
  const PRIORITIES = Object.freeze(['low', 'normal', 'high', 'critical']);
  let current = null;
  let lastDecision = null;

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function id(prefix = 'interaction') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function inferType(intervention = {}) {
    if (TYPES.includes(intervention.interactionType)) return intervention.interactionType;
    const kind = String(intervention.kind || '').toLowerCase();
    if (/warn|safety|alert/.test(kind)) return 'warn';
    if (/question|clarification|ask/.test(kind)) return 'ask';
    if (/suggest|discovery|option|recommend/.test(kind)) return 'suggest';
    if (/intro|context|inform/.test(kind)) return 'inform';
    return 'observe';
  }

  function inferPriority(intervention = {}, type = inferType(intervention)) {
    if (PRIORITIES.includes(intervention.priority)) return intervention.priority;
    if (type === 'warn') return 'high';
    if (type === 'ask') return 'normal';
    if (type === 'observe') return 'low';
    return 'normal';
  }

  function normalize(intervention = {}, meta = {}) {
    const type = inferType(intervention);
    const priority = inferPriority(intervention, type);
    return {
      id: intervention.interactionId || id(type),
      interventionId: intervention.id || null,
      type,
      priority,
      title: intervention.title || 'Wander',
      message: intervention.message || '',
      reason: meta.reason || intervention.reason || 'contextual_opportunity',
      channel: meta.channel || 'in_app',
      placeId: intervention.placeId || null,
      placeName: intervention.placeName || null,
      topic: intervention.topic || null,
      contentId: intervention.contentId || null,
      poiId: intervention.poi?.id || null,
      createdAt: new Date().toISOString(),
      status: 'presented',
    };
  }

  function notify(event) {
    const payload = clone(event);
    listeners.forEach((listener) => {
      try { listener(payload); } catch {}
    });
    window.dispatchEvent(new CustomEvent('wander:interaction-change', { detail: payload }));
  }

  function publishCurrent() {
    if (!context) return;
    if (!current) {
      context.remove('companion.currentInteraction');
      return;
    }
    context.set('companion.currentInteraction', clone(current), {
      source: 'interaction-core', kind: 'derived', ttlMs: 30 * 60 * 1000, confidence: 1,
    });
  }

  function recordDecision(input = {}) {
    lastDecision = {
      disposition: input.disposition || 'ignore',
      reason: input.reason || 'unknown',
      evaluationType: input.evaluationType || null,
      placeId: input.placeId || null,
      contentId: input.contentId || null,
      at: new Date().toISOString(),
    };
    context?.set?.('companion.lastDecision', clone(lastDecision), {
      source: 'interaction-policy', kind: 'derived', ttlMs: 30 * 60 * 1000, confidence: 1,
    });
    repository?.recordInteraction?.({ kind: 'interaction_decision', ...lastDecision });
    notify({ type: 'decision', decision: lastDecision });
    return clone(lastDecision);
  }

  function present(intervention, meta = {}) {
    current = normalize(intervention, meta);
    publishCurrent();
    repository?.recordInteraction?.({ kind: 'interaction_presented', ...current });
    notify({ type: 'presented', interaction: current });
    return clone(current);
  }

  function respond(response = {}) {
    if (!current) return null;
    const entry = {
      kind: 'interaction_response',
      interactionId: current.id,
      interventionId: current.interventionId,
      responseId: response.id || response.type || 'response',
      responseType: response.type || 'feedback',
      label: response.label || null,
      value: response.value ?? null,
      placeId: current.placeId,
      poiId: current.poiId,
      topic: current.topic,
      at: new Date().toISOString(),
    };
    repository?.recordInteraction?.(entry);
    context?.set?.('companion.lastResponse', clone(entry), {
      source: 'user', kind: 'confirmed', ttlMs: 30 * 60 * 1000, confidence: 1,
    });
    notify({ type: 'response', interaction: current, response: entry });
    return clone(entry);
  }

  function complete(status = 'completed') {
    if (!current) return null;
    const finished = { ...current, status, completedAt: new Date().toISOString() };
    repository?.recordInteraction?.({ kind: 'interaction_completed', ...finished });
    current = null;
    publishCurrent();
    notify({ type: 'completed', interaction: finished });
    return clone(finished);
  }

  window.WanderInteractionCore = Object.freeze({
    types: TYPES,
    priorities: PRIORITIES,
    normalize,
    inferType,
    inferPriority,
    recordDecision,
    present,
    respond,
    complete,
    getCurrent: () => clone(current),
    getLastDecision: () => clone(lastDecision),
    getHistory: (limit = 40) => repository?.listInteractions?.(limit) || Promise.resolve([]),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
})();
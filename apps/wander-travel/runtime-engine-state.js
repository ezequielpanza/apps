(() => {
  const repository = window.WanderMemoryRepository;
  const LEGACY_STORAGE_KEY = 'wander.engine.state.v1';
  const listeners = new Set();
  let dirtyBeforeReady = false;

  const DEFAULT_STATE = {
    schemaVersion: 2,
    meta: { updatedAt: null },
    identity: { userId: '', deviceId: '', kind: 'anonymous-local' },
    traveler: { name: '', preferredName: '' },
    profile: { interests: {}, patterns: [], tendencies: [] },
    travel: { currentTrip: null, plans: [], destinations: [], routes: [] },
    memory: {
      interactions: [],
      visitedPlaces: [],
      acceptedSuggestions: [],
      rejectedSuggestions: [],
    },
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function legacyState() {
    try { return JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || 'null'); }
    catch { return null; }
  }

  function normalize(input, identity = repository?.getIdentity?.()) {
    const stored = input && typeof input === 'object' ? input : {};
    const normalizedIdentity = {
      ...DEFAULT_STATE.identity,
      ...(stored.identity || {}),
      ...(identity || {}),
    };
    return {
      ...clone(DEFAULT_STATE),
      ...stored,
      schemaVersion: DEFAULT_STATE.schemaVersion,
      meta: { ...DEFAULT_STATE.meta, ...(stored.meta || {}) },
      identity: normalizedIdentity,
      traveler: { ...DEFAULT_STATE.traveler, ...(stored.traveler || {}) },
      profile: {
        ...clone(DEFAULT_STATE.profile),
        ...(stored.profile || {}),
        interests: { ...DEFAULT_STATE.profile.interests, ...(stored.profile?.interests || {}) },
        patterns: Array.isArray(stored.profile?.patterns) ? stored.profile.patterns : [],
        tendencies: Array.isArray(stored.profile?.tendencies) ? stored.profile.tendencies : [],
      },
      travel: { ...clone(DEFAULT_STATE.travel), ...(stored.travel || {}) },
      memory: {
        ...clone(DEFAULT_STATE.memory),
        ...(stored.memory || {}),
        interactions: Array.isArray(stored.memory?.interactions) ? stored.memory.interactions : [],
        visitedPlaces: Array.isArray(stored.memory?.visitedPlaces) ? stored.memory.visitedPlaces : [],
        acceptedSuggestions: Array.isArray(stored.memory?.acceptedSuggestions) ? stored.memory.acceptedSuggestions : [],
        rejectedSuggestions: Array.isArray(stored.memory?.rejectedSuggestions) ? stored.memory.rejectedSuggestions : [],
      },
    };
  }

  const bootstrap = repository?.getBootstrapState?.() || legacyState();
  let state = normalize(bootstrap);

  function snapshot() {
    return clone(state);
  }

  function notify(reason = 'update') {
    const current = snapshot();
    listeners.forEach((listener) => {
      try { listener(current, reason); } catch {}
    });
  }

  function publishRepositoryStatus() {
    const context = window.WanderContext;
    if (!context) return;
    const identity = state.identity;
    const status = repository?.getStatus?.() || { ready: true, storageMode: 'localStorage' };
    context.set('memory.status', status.ready ? 'ready' : 'preparing', {
      source: 'memory-repository', kind: 'derived', ttlMs: Infinity, confidence: 1,
    });
    context.set('memory.storage', status.storageMode || 'localStorage', {
      source: 'memory-repository', kind: 'config', ttlMs: Infinity, confidence: 1,
    });
    context.set('memory.userId', identity.userId || '', {
      source: 'local-identity', kind: 'confirmed', ttlMs: Infinity, confidence: 1,
    });
    context.set('memory.deviceId', identity.deviceId || '', {
      source: 'local-identity', kind: 'confirmed', ttlMs: Infinity, confidence: 1,
    });
  }

  function persist() {
    state.meta ||= {};
    state.meta.updatedAt = new Date().toISOString();
    if (repository?.saveState) repository.saveState(state);
    else {
      try { localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(state)); } catch {}
    }
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function update(mutator, reason = 'update') {
    dirtyBeforeReady = true;
    const draft = snapshot();
    const next = mutator(draft) || draft;
    state = normalize(next, state.identity);
    persist();
    notify(reason);
    publishRepositoryStatus();
    return snapshot();
  }

  function observe(event = {}) {
    if (!event || typeof event !== 'object' || !event.type) return false;
    const entry = {
      ...clone(event),
      at: event.at || new Date().toISOString(),
    };
    update((draft) => {
      draft.memory.interactions.push(entry);
      while (draft.memory.interactions.length > 600) draft.memory.interactions.shift();
      return draft;
    }, 'observe:' + event.type);
    repository?.recordInteraction?.({ kind: event.type, ...entry });
    return true;
  }

  function learnPreference(input = {}) {
    const category = String(input.category || '').trim().toLowerCase();
    const delta = Number(input.delta);
    if (!category || !Number.isFinite(delta)) return snapshot();
    const next = update((draft) => {
      const current = Number(draft.profile.interests[category]) || 0;
      draft.profile.interests[category] = Math.max(-3, Math.min(5, Math.round((current + delta) * 10) / 10));
      return draft;
    }, `preference:${input.reason || 'interaction'}`);
    repository?.recordSignal?.({
      kind: 'preference',
      category,
      delta,
      value: next.profile.interests[category],
      reason: input.reason || 'interaction',
      source: input.source || 'user-behavior',
      confidence: input.confidence ?? 1,
      interactionId: input.interactionId || null,
      placeId: input.placeId || null,
    });
    return next;
  }

  function answer(questionId, answer) {
    if (!questionId) return false;
    return observe({ type: 'answer', questionId, answer });
  }

  repository?.ready?.then((result) => {
    if (!dirtyBeforeReady && result?.state) state = normalize(result.state, result.identity);
    else state = normalize(state, result?.identity);
    persist();
    publishRepositoryStatus();
    notify('memory:ready');
  }).catch(() => publishRepositoryStatus());

  window.WanderEngineState = {
    getState: snapshot,
    subscribe,
    update,
    observe,
    learnPreference,
    answer,
    getIdentity: () => clone(state.identity),
    repository,
  };

  publishRepositoryStatus();
})();
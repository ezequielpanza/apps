(() => {
  const STORAGE_KEY = 'wander.engine.state.v1';
  const listeners = new Set();

  const DEFAULT_STATE = {
    schemaVersion: 1,
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

  function loadState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!stored || stored.schemaVersion !== DEFAULT_STATE.schemaVersion) return clone(DEFAULT_STATE);
      return {
        ...clone(DEFAULT_STATE),
        ...stored,
        traveler: { ...DEFAULT_STATE.traveler, ...(stored.traveler || {}) },
        profile: { ...clone(DEFAULT_STATE.profile), ...(stored.profile || {}) },
        travel: { ...clone(DEFAULT_STATE.travel), ...(stored.travel || {}) },
        memory: { ...clone(DEFAULT_STATE.memory), ...(stored.memory || {}) },
      };
    } catch {
      return clone(DEFAULT_STATE);
    }
  }

  let state = loadState();

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  function snapshot() {
    return clone(state);
  }

  function notify(reason = 'update') {
    const current = snapshot();
    listeners.forEach((listener) => {
      try { listener(current, reason); } catch {}
    });
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function update(mutator, reason = 'update') {
    const draft = snapshot();
    const next = mutator(draft) || draft;
    state = next;
    persist();
    notify(reason);
    return snapshot();
  }

  function observe(event = {}) {
    if (!event || typeof event !== 'object' || !event.type) return false;
    update((draft) => {
      draft.memory.interactions.push({
        ...clone(event),
        at: event.at || new Date().toISOString(),
      });
      return draft;
    }, 'observe:' + event.type);
    return true;
  }

  function answer(questionId, answer) {
    if (!questionId) return false;
    return observe({ type: 'answer', questionId, answer });
  }

  window.WanderEngineState = {
    getState: snapshot,
    subscribe,
    update,
    observe,
    answer,
  };
})();

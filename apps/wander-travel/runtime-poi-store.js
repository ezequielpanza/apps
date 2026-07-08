(() => {
  const STORAGE_KEY = 'wander.poi.store.v1';
  const SCHEMA_VERSION = 1;
  const VALID_STATUSES = new Set(['unresolved', 'partially_resolved', 'resolved', 'rejected']);

  const EMPTY = {
    schemaVersion: SCHEMA_VERSION,
    candidates: {},
    evidence: {},
    canonical: {},
  };

  let data = load();
  let persistTimer = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (stored?.schemaVersion === SCHEMA_VERSION) {
        return {
          schemaVersion: SCHEMA_VERSION,
          candidates: stored.candidates || {},
          evidence: stored.evidence || {},
          canonical: stored.canonical || {},
        };
      }
    } catch {}
    return clone(EMPTY);
  }

  function schedulePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(flush, 900);
  }

  function flush() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  }

  function upsertCandidate(candidate) {
    if (!window.WanderPOICandidate?.isCandidate(candidate)) {
      throw new Error('Invalid POI candidate');
    }

    const existing = data.candidates[candidate.id];
    const merged = existing ? {
      ...existing,
      ...clone(candidate),
      discoveredAt: existing.discoveredAt || candidate.discoveredAt,
      lastObservedAt: candidate.lastObservedAt || candidate.discoveredAt || existing.lastObservedAt,
      metadata: {
        ...(existing.metadata || {}),
        ...(candidate.metadata || {}),
      },
    } : clone(candidate);

    data.candidates[candidate.id] = merged;
    schedulePersist();
    return clone(merged);
  }

  function addEvidence(evidence) {
    if (!window.WanderPOIEvidence?.isEvidence(evidence)) {
      throw new Error('Invalid POI evidence');
    }
    if (!data.candidates[evidence.candidateId]) {
      throw new Error(`Unknown POI candidate: ${evidence.candidateId}`);
    }

    const existing = data.evidence[evidence.id];
    data.evidence[evidence.id] = existing ? {
      ...existing,
      ...clone(evidence),
      observedAt: evidence.observedAt || existing.observedAt,
      metadata: {
        ...(existing.metadata || {}),
        ...(evidence.metadata || {}),
      },
    } : clone(evidence);

    schedulePersist();
    return clone(data.evidence[evidence.id]);
  }

  function ingestDiscovery(result) {
    const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
    const evidence = Array.isArray(result?.evidence) ? result.evidence : [];

    const storedCandidates = candidates.map(upsertCandidate);
    const storedEvidence = evidence.map(addEvidence);

    return {
      candidates: storedCandidates,
      evidence: storedEvidence,
    };
  }

  function getCandidate(candidateId) {
    const value = data.candidates[candidateId];
    return value ? clone(value) : null;
  }

  function listCandidates(filters = {}) {
    return Object.values(data.candidates)
      .filter((candidate) => !filters.connector || candidate.source?.connector === filters.connector)
      .filter((candidate) => !filters.status || candidate.status === filters.status)
      .filter((candidate) => !filters.destinationId || candidate.destination?.id === filters.destinationId)
      .sort((a, b) => String(a.discoveredAt).localeCompare(String(b.discoveredAt)))
      .map(clone);
  }

  function listEvidence(candidateId = null) {
    return Object.values(data.evidence)
      .filter((item) => !candidateId || item.candidateId === candidateId)
      .sort((a, b) => String(a.observedAt).localeCompare(String(b.observedAt)))
      .map(clone);
  }

  function setCandidateStatus(candidateId, status) {
    if (!VALID_STATUSES.has(status)) throw new Error(`Invalid POI candidate status: ${status}`);
    const candidate = data.candidates[candidateId];
    if (!candidate) throw new Error(`Unknown POI candidate: ${candidateId}`);
    candidate.status = status;
    schedulePersist();
    return clone(candidate);
  }

  function snapshot() {
    return clone(data);
  }

  function clear() {
    data = clone(EMPTY);
    flush();
  }

  window.WanderPOIStore = Object.freeze({
    storageKey: STORAGE_KEY,
    schemaVersion: SCHEMA_VERSION,
    upsertCandidate,
    addEvidence,
    ingestDiscovery,
    getCandidate,
    listCandidates,
    listEvidence,
    setCandidateStatus,
    snapshot,
    flush,
    clear,
  });
})();

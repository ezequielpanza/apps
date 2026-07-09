(() => {
  const registry = new Map();

  function policy() {
    if (!window.WanderSourcePolicy) throw new Error('WanderSourcePolicy is unavailable');
    return window.WanderSourcePolicy;
  }

  function normalizedPOI() {
    if (!window.WanderNormalizedPOI) throw new Error('WanderNormalizedPOI is unavailable');
    return window.WanderNormalizedPOI;
  }

  function validateConnector(connector) {
    if (!connector || typeof connector !== 'object') throw new Error('POI connector is required');
    if (!connector.id || typeof connector.id !== 'string') throw new Error('POI connector id is required');
    if (!connector.version || typeof connector.version !== 'string') throw new Error('POI connector version is required');
    if (typeof connector.search !== 'function') throw new Error('POI connector search() is required');
  }

  function register(connector) {
    validateConnector(connector);
    policy().assertCapability(connector.id, 'automatedAcquisition');
    registry.set(connector.id, connector);
    return connector;
  }

  function unregister(sourceId) {
    return registry.delete(String(sourceId || ''));
  }

  function getConnector(sourceId) {
    return registry.get(String(sourceId || '')) || null;
  }

  function listConnectors() {
    return Array.from(registry.values(), (connector) => ({
      id: connector.id,
      version: connector.version,
      capabilities: Array.isArray(connector.capabilities) ? [...connector.capabilities] : [],
      policy: policy().getOrDefault(connector.id).mode,
    }));
  }

  function validateBatch(sourceId, connector, result) {
    if (!result || typeof result !== 'object') {
      throw new Error(`POI connector ${sourceId} returned an invalid result`);
    }

    const pois = Array.isArray(result.pois) ? result.pois : [];
    for (const poi of pois) {
      if (!normalizedPOI().isNormalizedPOI(poi)) {
        throw new Error(`POI connector ${sourceId} returned a non-normalized POI`);
      }
      if (poi.source.id !== connector.id) {
        throw new Error(`POI connector ${sourceId} returned POI from source ${poi.source.id}`);
      }
      if (poi.source.version !== connector.version) {
        throw new Error(`POI connector ${sourceId} returned POI with mismatched source version`);
      }
    }

    return {
      sourceId: connector.id,
      sourceVersion: connector.version,
      pois,
      diagnostics: result.diagnostics || {},
    };
  }

  async function search(sourceId, request = {}) {
    const id = String(sourceId || '').trim();
    policy().assertCapability(id, 'automatedAcquisition');
    const connector = getConnector(id);
    if (!connector) throw new Error(`Unknown POI connector: ${id}`);
    const result = await connector.search(request);
    return validateBatch(id, connector, result);
  }

  async function searchMany(sourceIds, request = {}) {
    const ids = Array.from(new Set((Array.isArray(sourceIds) ? sourceIds : []).map(String).filter(Boolean)));
    const settled = await Promise.allSettled(ids.map((sourceId) => search(sourceId, request)));
    const batches = [];
    const errors = [];

    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') batches.push(result.value);
      else errors.push({
        sourceId: ids[index],
        message: result.reason?.message || String(result.reason),
        code: result.reason?.code || null,
      });
    });

    return {
      batches,
      pois: batches.flatMap((batch) => batch.pois),
      errors,
    };
  }

  async function searchAndStore(sourceId, request = {}, store = window.WanderPOIStore) {
    const id = String(sourceId || '').trim();
    policy().assertCapability(id, 'storePOIs');
    if (!store?.ingestNormalized) throw new Error('POI store is unavailable');
    const batch = await search(id, request);
    const stored = store.ingestNormalized(batch.pois);
    return { ...batch, stored };
  }

  async function searchManyAndStore(sourceIds, request = {}, store = window.WanderPOIStore) {
    if (!store?.ingestNormalized) throw new Error('POI store is unavailable');
    const result = await searchMany(sourceIds, request);
    const stored = [];

    for (const batch of result.batches) {
      if (!policy().canStorePOIs(batch.sourceId)) continue;
      stored.push(...store.ingestNormalized(batch.pois));
    }

    return { ...result, stored };
  }

  window.WanderPOIEngine = Object.freeze({
    register,
    unregister,
    getConnector,
    listConnectors,
    search,
    searchMany,
    searchAndStore,
    searchManyAndStore,
  });
})();

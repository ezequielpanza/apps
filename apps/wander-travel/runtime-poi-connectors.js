(() => {
  const registry = new Map();

  function sourcePolicy() {
    if (!window.WanderSourcePolicy) throw new Error('WanderSourcePolicy is unavailable');
    return window.WanderSourcePolicy;
  }

  function validateConnector(connector) {
    if (!connector || typeof connector !== 'object') throw new Error('POI connector is required');
    if (!connector.id || typeof connector.id !== 'string') throw new Error('POI connector id is required');
    if (!connector.version || typeof connector.version !== 'string') throw new Error('POI connector version is required');
    if (typeof connector.discover !== 'function') throw new Error('POI connector discover() is required');
  }

  function assertRegistrationPolicy(connectorId) {
    sourcePolicy().assertCapability(connectorId, 'automatedAcquisition');
    sourcePolicy().assertCapability(connectorId, 'storeCandidates');
    sourcePolicy().assertCapability(connectorId, 'storeEvidence');
  }

  function register(connector) {
    validateConnector(connector);
    assertRegistrationPolicy(connector.id);
    registry.set(connector.id, connector);
    return connector;
  }

  function unregister(connectorId) {
    return registry.delete(connectorId);
  }

  function get(connectorId) {
    return registry.get(connectorId) || null;
  }

  function list() {
    return Array.from(registry.values(), (connector) => ({
      id: connector.id,
      version: connector.version,
      experimental: Boolean(connector.experimental),
      capabilities: Array.isArray(connector.capabilities) ? [...connector.capabilities] : [],
      sourcePolicy: sourcePolicy().getOrDefault(connector.id).mode,
    }));
  }

  async function discover(connectorId, input) {
    sourcePolicy().assertCapability(connectorId, 'automatedAcquisition');
    const connector = get(connectorId);
    if (!connector) throw new Error(`Unknown POI connector: ${connectorId}`);

    const result = await connector.discover(input);
    if (!result || typeof result !== 'object') {
      throw new Error(`POI connector ${connectorId} returned an invalid result`);
    }

    return {
      connector: connector.id,
      connectorVersion: connector.version,
      candidates: Array.isArray(result.candidates) ? result.candidates : [],
      evidence: Array.isArray(result.evidence) ? result.evidence : [],
      diagnostics: result.diagnostics || {},
    };
  }

  async function discoverAndStore(connectorId, input, store = window.WanderPOIStore) {
    sourcePolicy().assertCapability(connectorId, 'storeCandidates');
    sourcePolicy().assertCapability(connectorId, 'storeEvidence');
    if (!store?.ingestDiscovery) throw new Error('POI store is unavailable');

    const result = await discover(connectorId, input);
    const stored = store.ingestDiscovery(result);
    return {
      ...result,
      stored,
    };
  }

  window.WanderPOIConnectors = Object.freeze({
    register,
    unregister,
    get,
    list,
    discover,
    discoverAndStore,
  });
})();

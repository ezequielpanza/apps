(() => {
  const ID = 'tripadvisor';
  const VERSION = '0.3.0';

  function assertExternalPolicy() {
    return window.WanderSourcePolicy?.assertCapability(ID, 'externalDiscovery');
  }

  function normalizeDestination(value) {
    return String(value || '').trim();
  }

  function buildSearchUrl(destinationName) {
    assertExternalPolicy();
    const destination = normalizeDestination(destinationName);
    if (!destination) throw new Error('Tripadvisor destination name is required');
    return `https://www.tripadvisor.com/Search?q=${encodeURIComponent(destination)}`;
  }

  function normalizeTripadvisorUrl(url) {
    assertExternalPolicy();
    const parsed = new URL(String(url));
    const host = parsed.hostname.toLowerCase();
    if (!(host === 'tripadvisor.com' || host.endsWith('.tripadvisor.com'))) {
      throw new Error('Tripadvisor external URL must use a Tripadvisor host');
    }
    return parsed.toString();
  }

  function buildExternalIntent(destinationName) {
    return {
      sourceId: ID,
      mode: 'external_only',
      query: normalizeDestination(destinationName),
      url: buildSearchUrl(destinationName),
      storeAllowed: false,
    };
  }

  window.WanderExternalSourceTripadvisor = Object.freeze({
    id: ID,
    version: VERSION,
    mode: 'external_only',
    buildSearchUrl,
    normalizeTripadvisorUrl,
    buildExternalIntent,
  });
})();

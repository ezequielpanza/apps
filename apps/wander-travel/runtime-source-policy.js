(() => {
  const POLICY_MODES = Object.freeze({
    EXTERNAL_ONLY: 'external_only',
    STORE_ALLOWED: 'store_allowed',
    DENY_BY_DEFAULT: 'deny_by_default',
  });

  const policies = new Map();

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizePolicy(input) {
    if (!input || typeof input !== 'object') throw new Error('Source policy is required');
    const id = String(input.id || '').trim();
    if (!id) throw new Error('Source policy id is required');

    const mode = input.mode || POLICY_MODES.DENY_BY_DEFAULT;
    if (!Object.values(POLICY_MODES).includes(mode)) {
      throw new Error(`Invalid source policy mode: ${mode}`);
    }

    return Object.freeze({
      id,
      mode,
      automatedAcquisition: Boolean(input.automatedAcquisition),
      storePOIs: Boolean(input.storePOIs),
      externalDiscovery: Boolean(input.externalDiscovery),
      reviewedAt: input.reviewedAt || null,
      termsUrl: input.termsUrl || null,
      reason: input.reason || null,
      notes: Object.freeze(Array.isArray(input.notes) ? [...input.notes] : []),
    });
  }

  function register(input) {
    const sourcePolicy = normalizePolicy(input);
    policies.set(sourcePolicy.id, sourcePolicy);
    return sourcePolicy;
  }

  function get(sourceId) {
    const id = String(sourceId || '').trim();
    if (!id) return null;
    return policies.get(id) || null;
  }

  function getOrDefault(sourceId) {
    return get(sourceId) || Object.freeze({
      id: String(sourceId || 'unknown'),
      mode: POLICY_MODES.DENY_BY_DEFAULT,
      automatedAcquisition: false,
      storePOIs: false,
      externalDiscovery: false,
      reviewedAt: null,
      termsUrl: null,
      reason: 'No explicit source policy registered',
      notes: Object.freeze([]),
    });
  }

  function list() {
    return Array.from(policies.values(), clone);
  }

  function canAutomate(sourceId) {
    return getOrDefault(sourceId).automatedAcquisition === true;
  }

  function canStorePOIs(sourceId) {
    return getOrDefault(sourceId).storePOIs === true;
  }

  function canUseExternally(sourceId) {
    return getOrDefault(sourceId).externalDiscovery === true;
  }

  function assertCapability(sourceId, capability) {
    const sourcePolicy = getOrDefault(sourceId);
    const allowed = {
      automatedAcquisition: sourcePolicy.automatedAcquisition,
      storePOIs: sourcePolicy.storePOIs,
      externalDiscovery: sourcePolicy.externalDiscovery,
    }[capability];

    if (allowed !== true) {
      const error = new Error(`Source policy blocks ${capability} for ${sourcePolicy.id}`);
      error.code = 'SOURCE_POLICY_BLOCKED';
      error.sourceId = sourcePolicy.id;
      error.capability = capability;
      throw error;
    }
    return sourcePolicy;
  }

  register({
    id: 'google-maps',
    mode: POLICY_MODES.EXTERNAL_ONLY,
    automatedAcquisition: false,
    storePOIs: false,
    externalDiscovery: true,
    reviewedAt: '2026-07-09',
    termsUrl: 'https://maps.google.com/help/terms_maps/',
    reason: 'Google Maps remains external-only until Wander has a permitted acquisition path that can return normalized POIs.',
    notes: [
      'The POI Engine does not ingest Google Maps results through automated scraping.',
      'A future permitted connector must still return the common NormalizedPOI contract.',
    ],
  });

  register({
    id: 'tripadvisor',
    mode: POLICY_MODES.EXTERNAL_ONLY,
    automatedAcquisition: false,
    storePOIs: false,
    externalDiscovery: true,
    reviewedAt: '2026-07-09',
    termsUrl: 'https://tripadvisor.mediaroom.com/us-terms-of-use',
    reason: 'Tripadvisor remains external-only until Wander has a permitted acquisition path that can return normalized POIs.',
    notes: [
      'The POI Engine does not automate or ingest Tripadvisor content.',
      'A future permitted connector must still return the common NormalizedPOI contract.',
    ],
  });

  register({
    id: 'openstreetmap',
    mode: POLICY_MODES.STORE_ALLOWED,
    automatedAcquisition: true,
    storePOIs: true,
    externalDiscovery: true,
    reviewedAt: '2026-07-09',
    termsUrl: 'https://www.openstreetmap.org/copyright',
    reason: 'OpenStreetMap geographic data can feed the normalized POI pipeline with source provenance and attribution.',
    notes: [
      'The connector owns Overpass query profiles, node/way/relation handling, tag interpretation, and geometry normalization.',
      'Preserve OSM object type, object id, original tags, source URL, and location method.',
      'OpenStreetMap attribution and ODbL obligations must be preserved in products that use the data.',
      'The POI Engine receives only NormalizedPOI objects.',
    ],
  });

  register({
    id: 'wikidata',
    mode: POLICY_MODES.STORE_ALLOWED,
    automatedAcquisition: true,
    storePOIs: true,
    externalDiscovery: true,
    reviewedAt: '2026-07-09',
    termsUrl: 'https://www.wikidata.org/wiki/Wikidata:Licensing',
    reason: 'Wikidata structured data can feed the normalized POI pipeline with source provenance.',
    notes: [
      'The connector owns SPARQL search strategy and QID/P625/P31 normalization.',
      'The POI Engine receives only NormalizedPOI objects.',
      'Wikidata presence is not equivalent to tourist relevance.',
    ],
  });

  window.WanderSourcePolicy = Object.freeze({
    modes: POLICY_MODES,
    register,
    get,
    getOrDefault,
    list,
    canAutomate,
    canStorePOIs,
    canUseExternally,
    assertCapability,
  });
})();

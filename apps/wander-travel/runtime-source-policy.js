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
      storeCandidates: Boolean(input.storeCandidates),
      storeEvidence: Boolean(input.storeEvidence),
      externalDiscovery: Boolean(input.externalDiscovery),
      reviewedAt: input.reviewedAt || null,
      termsUrl: input.termsUrl || null,
      reason: input.reason || null,
      notes: Object.freeze(Array.isArray(input.notes) ? [...input.notes] : []),
    });
  }

  function register(input) {
    const policy = normalizePolicy(input);
    policies.set(policy.id, policy);
    return policy;
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
      storeCandidates: false,
      storeEvidence: false,
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

  function canStoreCandidates(sourceId) {
    return getOrDefault(sourceId).storeCandidates === true;
  }

  function canStoreEvidence(sourceId) {
    return getOrDefault(sourceId).storeEvidence === true;
  }

  function canUseExternally(sourceId) {
    return getOrDefault(sourceId).externalDiscovery === true;
  }

  function assertCapability(sourceId, capability) {
    const policy = getOrDefault(sourceId);
    const allowed = {
      automatedAcquisition: policy.automatedAcquisition,
      storeCandidates: policy.storeCandidates,
      storeEvidence: policy.storeEvidence,
      externalDiscovery: policy.externalDiscovery,
    }[capability];

    if (allowed !== true) {
      const error = new Error(`Source policy blocks ${capability} for ${policy.id}`);
      error.code = 'SOURCE_POLICY_BLOCKED';
      error.sourceId = policy.id;
      error.capability = capability;
      throw error;
    }
    return policy;
  }

  register({
    id: 'google-maps',
    mode: POLICY_MODES.EXTERNAL_ONLY,
    automatedAcquisition: false,
    storeCandidates: false,
    storeEvidence: false,
    externalDiscovery: true,
    reviewedAt: '2026-07-09',
    termsUrl: 'https://maps.google.com/help/terms_maps/',
    reason: 'Google Maps content is external-only for Wander; do not build or augment the POI store from Maps content.',
    notes: [
      'Use only to open an external Google Maps search or navigation experience.',
      'Do not ingest result cards, business names, addresses, reviews, coordinates, or identifiers into the POI Store.',
    ],
  });

  register({
    id: 'tripadvisor',
    mode: POLICY_MODES.EXTERNAL_ONLY,
    automatedAcquisition: false,
    storeCandidates: false,
    storeEvidence: false,
    externalDiscovery: true,
    reviewedAt: '2026-07-09',
    termsUrl: 'https://tripadvisor.mediaroom.com/us-terms-of-use',
    reason: 'Tripadvisor content is external-only for Wander unless explicit permission is obtained.',
    notes: [
      'Do not automate access, scrape, aggregate, or index Tripadvisor content into the POI Store.',
    ],
  });

  register({
    id: 'wikidata',
    mode: POLICY_MODES.STORE_ALLOWED,
    automatedAcquisition: true,
    storeCandidates: true,
    storeEvidence: true,
    externalDiscovery: true,
    reviewedAt: '2026-07-09',
    termsUrl: 'https://www.wikidata.org/wiki/Wikidata:Licensing',
    reason: 'Wikidata structured data is available under CC0 and can feed the POI knowledge pipeline with provenance.',
    notes: [
      'Use the official Wikidata Query Service for structured entity discovery.',
      'Preserve QIDs, query provenance, coordinates, and declared types as source evidence.',
      'Do not treat Wikidata presence as proof that an entity is tourist-relevant.',
    ],
  });

  register({
    id: 'generic-web',
    mode: POLICY_MODES.DENY_BY_DEFAULT,
    automatedAcquisition: false,
    storeCandidates: false,
    storeEvidence: false,
    externalDiscovery: false,
    reason: 'Automated acquisition requires an explicit per-source policy review.',
  });

  window.WanderSourcePolicy = Object.freeze({
    modes: POLICY_MODES,
    register,
    get,
    getOrDefault,
    list,
    canAutomate,
    canStoreCandidates,
    canStoreEvidence,
    canUseExternally,
    assertCapability,
  });
})();

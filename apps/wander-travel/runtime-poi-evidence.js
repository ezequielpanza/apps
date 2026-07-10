(() => {
  const SCHEMA_VERSION = 1;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function fnv1a(value) {
    let hash = 0x811c9dc5;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  function stableStringify(value) {
    if (value == null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }

  function normalizeTimestamp(value, fallback = Date.now()) {
    const date = new Date(value ?? fallback);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid POI evidence timestamp');
    return date.toISOString();
  }

  function normalizeConfidence(value) {
    const confidence = value == null ? 1 : Number(value);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error('POI evidence confidence must be between 0 and 1');
    }
    return confidence;
  }

  function normalizeSource(source = {}) {
    const connector = String(source.connector || '').trim();
    if (!connector) throw new Error('POI evidence source.connector is required');

    return {
      connector,
      connectorVersion: source.connectorVersion ? String(source.connectorVersion) : null,
      sourceUrl: source.sourceUrl ? String(source.sourceUrl) : null,
      sourceRef: source.sourceRef ? String(source.sourceRef) : null,
      strategy: source.strategy ? String(source.strategy) : null,
    };
  }

  function normalizeLocation(location) {
    if (location == null) return null;
    if (!location || typeof location !== 'object') throw new Error('Invalid POI evidence location');

    const lat = Number(location.lat);
    const lng = Number(location.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('Invalid POI evidence latitude');
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error('Invalid POI evidence longitude');

    return {
      lat,
      lng,
      method: location.method ? String(location.method) : null,
      accuracyRadiusM: Number.isFinite(Number(location.accuracyRadiusM))
        ? Math.max(0, Number(location.accuracyRadiusM))
        : null,
    };
  }

  function makeId(input = {}) {
    const candidateId = String(input.candidateId || '').trim();
    const type = String(input.type || '').trim();
    const source = normalizeSource(input.source || {});
    const location = input.location ? normalizeLocation(input.location) : null;
    const material = stableStringify({
      candidateId,
      type,
      value: input.value ?? null,
      location,
      source: {
        connector: source.connector,
        sourceRef: source.sourceRef,
        strategy: source.strategy,
      },
    });
    return `poi-evidence:${source.connector}:${fnv1a(material)}`;
  }

  function create(input = {}, now = Date.now()) {
    const candidateId = String(input.candidateId || '').trim();
    if (!candidateId) throw new Error('POI evidence candidateId is required');

    const type = String(input.type || '').trim();
    if (!type) throw new Error('POI evidence type is required');

    const source = normalizeSource(input.source || {});
    const location = input.location ? normalizeLocation(input.location) : null;
    const confidence = normalizeConfidence(input.confidence);
    const observedAt = normalizeTimestamp(input.observedAt, now);

    return {
      schemaVersion: SCHEMA_VERSION,
      id: input.id ? String(input.id) : makeId({ ...input, candidateId, type, source, location }),
      candidateId,
      type,
      value: input.value === undefined ? null : clone(input.value),
      location,
      source,
      confidence,
      observedAt,
      metadata: input.metadata && typeof input.metadata === 'object' ? clone(input.metadata) : {},
    };
  }

  function isEvidence(value) {
    if (!value || typeof value !== 'object') return false;
    if (value.schemaVersion !== SCHEMA_VERSION) return false;
    if (!String(value.id || '').trim()) return false;
    if (!String(value.candidateId || '').trim()) return false;
    if (!String(value.type || '').trim()) return false;
    if (!String(value.source?.connector || '').trim()) return false;
    if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) return false;
    return true;
  }

  window.WanderPOIEvidence = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    create,
    isEvidence,
    makeId,
  });
})();

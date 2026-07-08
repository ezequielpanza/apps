(() => {
  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function hash(value) {
    let current = 2166136261;
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
      current ^= text.charCodeAt(index);
      current = Math.imul(current, 16777619);
    }
    return (current >>> 0).toString(36);
  }

  function iso(value) {
    const date = new Date(value == null ? Date.now() : value);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid evidence timestamp');
    return date.toISOString();
  }

  function normalizeLocation(location) {
    if (!location) return null;
    const lat = Number(location.lat);
    const lng = Number(location.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('Invalid evidence latitude');
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error('Invalid evidence longitude');
    return {
      lat,
      lng,
      accuracyRadiusM: Number.isFinite(Number(location.accuracyRadiusM))
        ? Math.max(0, Number(location.accuracyRadiusM))
        : null,
      method: location.method || null,
    };
  }

  function stableValue(value) {
    if (value == null) return '';
    if (typeof value !== 'object') return String(value);
    if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
    return `{${Object.keys(value).sort().map((key) => `${key}:${stableValue(value[key])}`).join(',')}}`;
  }

  function makeId(input) {
    const location = input.location
      ? `${input.location.lat},${input.location.lng},${input.location.method || ''}`
      : '';
    return `evidence:${hash([
      input.candidateId,
      input.type,
      input.source?.connector || '',
      input.source?.sourceRef || input.source?.sourceUrl || '',
      stableValue(input.value),
      location,
    ].join('|'))}`;
  }

  function create(input, at = Date.now()) {
    if (!input || typeof input !== 'object') throw new Error('POI evidence input is required');
    if (!input.candidateId) throw new Error('POI evidence candidateId is required');
    if (!input.type) throw new Error('POI evidence type is required');
    if (!input.source?.connector) throw new Error('POI evidence source.connector is required');
    if (!input.source?.connectorVersion) throw new Error('POI evidence source.connectorVersion is required');

    const confidence = Number(input.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error('POI evidence confidence must be between 0 and 1');
    }

    const source = {
      connector: String(input.source.connector),
      connectorVersion: String(input.source.connectorVersion),
      sourceUrl: input.source.sourceUrl || null,
      sourceRef: input.source.sourceRef || null,
      strategy: input.source.strategy || null,
    };

    const normalized = {
      schemaVersion: 1,
      candidateId: String(input.candidateId),
      type: String(input.type),
      value: clone(input.value == null ? null : input.value),
      location: normalizeLocation(input.location),
      source,
      confidence,
      observedAt: iso(input.observedAt || at),
      metadata: clone(input.metadata || {}),
    };

    return {
      id: input.id || makeId(normalized),
      ...normalized,
    };
  }

  function isEvidence(value) {
    return Boolean(
      value &&
      value.schemaVersion === 1 &&
      typeof value.id === 'string' &&
      typeof value.candidateId === 'string' &&
      typeof value.type === 'string' &&
      value.source?.connector &&
      value.source?.connectorVersion &&
      Number.isFinite(value.confidence) &&
      value.confidence >= 0 &&
      value.confidence <= 1,
    );
  }

  window.WanderPOIEvidence = Object.freeze({
    create,
    isEvidence,
    makeId,
  });
})();

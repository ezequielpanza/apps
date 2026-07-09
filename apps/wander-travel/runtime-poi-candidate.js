(() => {
  const SCHEMA_VERSION = 2;
  const STATUSES = new Set(['unresolved', 'partially_resolved', 'resolved', 'rejected']);

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
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
    if (Number.isNaN(date.getTime())) throw new Error('Invalid candidate timestamp');
    return date.toISOString();
  }

  function normalizeSource(source = {}) {
    if (!source.id) throw new Error('POI candidate source.id is required');
    if (!source.version) throw new Error('POI candidate source.version is required');
    return {
      id: String(source.id),
      version: String(source.version),
      url: source.url || null,
      ref: source.ref || null,
      strategy: source.strategy || null,
    };
  }

  function makeId({ name, source, destination }) {
    const sourceId = source?.id || 'unknown';
    const sourceRef = source?.ref || source?.url || '';
    const destinationRef = destination?.id || destination?.name || '';
    return `candidate:${sourceId}:${hash([normalizeText(name), sourceRef, destinationRef].join('|'))}`;
  }

  function create(input, at = Date.now()) {
    if (!input || typeof input !== 'object') throw new Error('POI candidate input is required');
    const name = String(input.name || '').trim();
    if (!name) throw new Error('POI candidate name is required');

    const source = normalizeSource(input.source);
    const status = input.status || 'unresolved';
    if (!STATUSES.has(status)) throw new Error(`Invalid POI candidate status: ${status}`);

    const discoveredAt = iso(input.discoveredAt || at);
    const destination = input.destination ? {
      id: input.destination.id || null,
      name: input.destination.name || null,
      countryCode: input.destination.countryCode || null,
    } : null;

    return {
      schemaVersion: SCHEMA_VERSION,
      id: input.id || makeId({ name, source, destination }),
      name,
      normalizedName: normalizeText(name),
      typeHint: input.typeHint || null,
      destination,
      source,
      discoveredAt,
      lastObservedAt: iso(input.lastObservedAt || discoveredAt),
      status,
      metadata: clone(input.metadata || {}),
    };
  }

  function isCandidate(value) {
    return Boolean(
      value &&
      value.schemaVersion === SCHEMA_VERSION &&
      typeof value.id === 'string' &&
      typeof value.name === 'string' &&
      value.source?.id &&
      value.source?.version &&
      STATUSES.has(value.status),
    );
  }

  window.WanderPOICandidate = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    create,
    isCandidate,
    normalizeText,
    makeId,
    statuses: Object.freeze(Array.from(STATUSES)),
  });
})();

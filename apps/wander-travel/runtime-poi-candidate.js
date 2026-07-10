(() => {
  const SCHEMA_VERSION = 1;
  const VALID_STATUSES = new Set(['unresolved', 'partially_resolved', 'resolved', 'rejected']);

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
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

  function normalizeTimestamp(value, fallback = Date.now()) {
    const date = new Date(value ?? fallback);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid POI candidate timestamp');
    return date.toISOString();
  }

  function normalizeSource(source = {}) {
    const connector = String(source.connector || '').trim();
    if (!connector) throw new Error('POI candidate source.connector is required');

    return {
      connector,
      connectorVersion: source.connectorVersion ? String(source.connectorVersion) : null,
      sourceUrl: source.sourceUrl ? String(source.sourceUrl) : null,
      sourceRef: source.sourceRef ? String(source.sourceRef) : null,
      strategy: source.strategy ? String(source.strategy) : null,
    };
  }

  function makeId(input = {}) {
    const name = normalizeText(input.name);
    const source = normalizeSource(input.source || {});
    const destinationId = String(input.destination?.id || '');
    const sourceIdentity = source.sourceRef || source.sourceUrl || '';
    const material = [source.connector, sourceIdentity, destinationId, name].join('|');
    return `poi-candidate:${source.connector}:${fnv1a(material)}`;
  }

  function create(input = {}, now = Date.now()) {
    const name = String(input.name || '').trim();
    if (!name) throw new Error('POI candidate name is required');

    const status = input.status || 'unresolved';
    if (!VALID_STATUSES.has(status)) throw new Error(`Invalid POI candidate status: ${status}`);

    const source = normalizeSource(input.source || {});
    const discoveredAt = normalizeTimestamp(input.discoveredAt, now);
    const lastObservedAt = normalizeTimestamp(input.lastObservedAt ?? input.discoveredAt, now);

    const candidate = {
      schemaVersion: SCHEMA_VERSION,
      id: input.id ? String(input.id) : makeId({ ...input, name, source }),
      name,
      normalizedName: normalizeText(name),
      typeHint: input.typeHint == null ? null : String(input.typeHint),
      destination: input.destination ? clone(input.destination) : null,
      source,
      discoveredAt,
      lastObservedAt,
      status,
      metadata: input.metadata && typeof input.metadata === 'object' ? clone(input.metadata) : {},
    };

    return candidate;
  }

  function isCandidate(value) {
    if (!value || typeof value !== 'object') return false;
    if (value.schemaVersion !== SCHEMA_VERSION) return false;
    if (!String(value.id || '').trim()) return false;
    if (!String(value.name || '').trim()) return false;
    if (!String(value.source?.connector || '').trim()) return false;
    if (!VALID_STATUSES.has(value.status)) return false;
    return true;
  }

  window.WanderPOICandidate = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    create,
    isCandidate,
    normalizeText,
    makeId,
  });
})();

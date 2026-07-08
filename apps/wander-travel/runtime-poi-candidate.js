(() => {
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

  function makeId({ name, source, destination }) {
    const connector = source?.connector || 'unknown';
    const sourceRef = source?.sourceRef || source?.sourceUrl || '';
    const destinationRef = destination?.id || destination?.name || '';
    return `candidate:${connector}:${hash([normalizeText(name), sourceRef, destinationRef].join('|'))}`;
  }

  function create(input, at = Date.now()) {
    if (!input || typeof input !== 'object') throw new Error('POI candidate input is required');
    const name = String(input.name || '').trim();
    if (!name) throw new Error('POI candidate name is required');

    const source = input.source || {};
    if (!source.connector) throw new Error('POI candidate source.connector is required');
    if (!source.connectorVersion) throw new Error('POI candidate source.connectorVersion is required');

    const status = input.status || 'unresolved';
    if (!STATUSES.has(status)) throw new Error(`Invalid POI candidate status: ${status}`);

    const discoveredAt = iso(input.discoveredAt || at);
    const destination = input.destination ? {
      id: input.destination.id || null,
      name: input.destination.name || null,
      countryCode: input.destination.countryCode || null,
    } : null;

    const normalizedSource = {
      connector: String(source.connector),
      connectorVersion: String(source.connectorVersion),
      sourceUrl: source.sourceUrl || null,
      sourceRef: source.sourceRef || null,
      strategy: source.strategy || null,
    };

    return {
      schemaVersion: 1,
      id: input.id || makeId({ name, source: normalizedSource, destination }),
      name,
      normalizedName: normalizeText(name),
      typeHint: input.typeHint || null,
      destination,
      source: normalizedSource,
      discoveredAt,
      lastObservedAt: iso(input.lastObservedAt || discoveredAt),
      status,
      metadata: clone(input.metadata || {}),
    };
  }

  function isCandidate(value) {
    return Boolean(
      value &&
      value.schemaVersion === 1 &&
      typeof value.id === 'string' &&
      typeof value.name === 'string' &&
      value.source?.connector &&
      value.source?.connectorVersion &&
      STATUSES.has(value.status),
    );
  }

  window.WanderPOICandidate = Object.freeze({
    create,
    isCandidate,
    normalizeText,
    makeId,
    statuses: Object.freeze(Array.from(STATUSES)),
  });
})();

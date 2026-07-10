(() => {
  const SCHEMA_VERSION = 2;

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
    if (Number.isNaN(date.getTime())) throw new Error('Invalid consolidated POI timestamp');
    return date.toISOString();
  }

  function uniqueStrings(values = []) {
    return Array.from(new Set((Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)));
  }

  function normalizeIdentifiers(identifiers = []) {
    const seen = new Set();
    const result = [];
    for (const item of Array.isArray(identifiers) ? identifiers : []) {
      const namespace = String(item?.namespace || '').trim().toLowerCase();
      const value = String(item?.value || '').trim();
      if (!namespace || !value) continue;
      const key = `${namespace}:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ namespace, value });
    }
    return result;
  }

  function normalizeNotes(notes = []) {
    return (Array.isArray(notes) ? notes : []).map((note) => {
      const text = String(note?.text || '').trim();
      if (!text) return null;
      const confidence = Number(note.confidence == null ? 1 : note.confidence);
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        throw new Error('Consolidated POI note confidence must be between 0 and 1');
      }
      return {
        text,
        kind: note.kind || 'note',
        language: note.language || null,
        confidence,
        source: note.source ? clone(note.source) : null,
        metadata: clone(note.metadata || {}),
      };
    }).filter(Boolean);
  }

  function makeId(memberIds = []) {
    const stableMembers = uniqueStrings(memberIds).sort();
    if (!stableMembers.length) throw new Error('Consolidated POI memberIds are required');
    return `consolidated-poi:${hash(stableMembers.join('|'))}`;
  }

  function create(input, at = Date.now()) {
    if (!input || typeof input !== 'object') throw new Error('Consolidated POI input is required');
    const name = String(input.name || '').trim();
    if (!name) throw new Error('Consolidated POI name is required');

    const memberIds = uniqueStrings(input.memberIds).sort();
    if (!memberIds.length) throw new Error('Consolidated POI memberIds are required');

    const sources = Array.isArray(input.sources) ? input.sources.map((source) => ({
      id: String(source?.id || ''),
      version: source?.version == null ? null : String(source.version),
      ref: source?.ref == null ? null : String(source.ref),
      url: source?.url == null ? null : String(source.url),
    })).filter((source) => source.id) : [];

    const confidence = Number(input.confidence == null ? 1 : input.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error('Consolidated POI confidence must be between 0 and 1');
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      id: input.id || makeId(memberIds),
      name,
      normalizedName: input.normalizedName || null,
      aliases: uniqueStrings(input.aliases),
      categories: clone(Array.isArray(input.categories) ? input.categories : []),
      identifiers: normalizeIdentifiers(input.identifiers),
      location: clone(input.location || null),
      address: clone(input.address || null),
      confidence,
      sources,
      memberIds,
      notes: normalizeNotes(input.notes),
      evidence: clone(Array.isArray(input.evidence) ? input.evidence : []),
      tagsBySource: clone(input.tagsBySource || {}),
      attributesBySource: clone(input.attributesBySource || {}),
      createdAt: iso(input.createdAt || at),
      updatedAt: iso(input.updatedAt || at),
      resolution: clone(input.resolution || {}),
      metadata: clone(input.metadata || {}),
    };
  }

  function isConsolidatedPOI(value) {
    return Boolean(
      value &&
      value.schemaVersion === SCHEMA_VERSION &&
      typeof value.id === 'string' &&
      typeof value.name === 'string' &&
      Array.isArray(value.memberIds) &&
      value.memberIds.length > 0 &&
      Array.isArray(value.sources) &&
      Array.isArray(value.identifiers) &&
      Array.isArray(value.notes) &&
      Array.isArray(value.evidence) &&
      Number.isFinite(value.confidence) &&
      value.confidence >= 0 &&
      value.confidence <= 1,
    );
  }

  window.WanderConsolidatedPOI = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    create,
    isConsolidatedPOI,
    makeId,
  });
})();

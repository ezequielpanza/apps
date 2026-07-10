(() => {
  const SCHEMA_VERSION = 2;

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
    if (Number.isNaN(date.getTime())) throw new Error('Invalid normalized POI timestamp');
    return date.toISOString();
  }

  function normalizeSource(source = {}) {
    if (!source.id) throw new Error('Normalized POI source.id is required');
    if (!source.version) throw new Error('Normalized POI source.version is required');
    return {
      id: String(source.id),
      version: String(source.version),
      ref: source.ref == null ? null : String(source.ref),
      url: source.url == null ? null : String(source.url),
      strategy: source.strategy == null ? null : String(source.strategy),
    };
  }

  function normalizeLocation(location) {
    if (!location) return null;
    const lat = Number(location.lat);
    const lng = Number(location.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('Invalid normalized POI latitude');
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error('Invalid normalized POI longitude');
    return {
      lat,
      lng,
      method: location.method || null,
      accuracyRadiusM: Number.isFinite(Number(location.accuracyRadiusM))
        ? Math.max(0, Number(location.accuracyRadiusM))
        : null,
      geometryType: location.geometryType || 'point',
    };
  }

  function normalizeAddress(address) {
    if (!address) return null;
    return {
      label: address.label || null,
      houseNumber: address.houseNumber || null,
      street: address.street || null,
      locality: address.locality || null,
      region: address.region || null,
      postalCode: address.postalCode || null,
      countryCode: address.countryCode ? String(address.countryCode).toLowerCase() : null,
    };
  }

  function normalizeCategories(categories = []) {
    const seen = new Set();
    const result = [];
    for (const category of Array.isArray(categories) ? categories : []) {
      const normalized = typeof category === 'string'
        ? { id: normalizeText(category), label: String(category), sourceRef: null }
        : {
            id: category?.id ? String(category.id) : normalizeText(category?.label),
            label: category?.label ? String(category.label) : null,
            sourceRef: category?.sourceRef == null ? null : String(category.sourceRef),
          };
      if (!normalized.id || seen.has(normalized.id)) continue;
      seen.add(normalized.id);
      result.push(normalized);
    }
    return result;
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

  function normalizeEvidence(evidence = [], defaultSource) {
    return (Array.isArray(evidence) ? evidence : []).map((item) => {
      if (!item?.type) throw new Error('Normalized POI evidence type is required');
      const confidence = Number(item.confidence);
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        throw new Error('Normalized POI evidence confidence must be between 0 and 1');
      }
      return {
        type: String(item.type),
        value: clone(item.value == null ? null : item.value),
        location: normalizeLocation(item.location),
        confidence,
        source: normalizeSource(item.source || defaultSource),
        metadata: clone(item.metadata || {}),
      };
    });
  }

  function normalizeContentItem(item, defaultSource, options = {}) {
    const text = String(item?.text || '').trim();
    if (!text) return null;
    const confidence = Number(item.confidence == null ? 1 : item.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error('Normalized POI content confidence must be between 0 and 1');
    }
    return {
      text,
      kind: item.kind || options.defaultKind || null,
      language: item.language || null,
      confidence,
      source: normalizeSource(item.source || defaultSource),
      metadata: clone(item.metadata || {}),
    };
  }

  function normalizeRating(item, defaultSource) {
    const value = Number(item?.value);
    const scaleMin = Number(item?.scaleMin == null ? 0 : item.scaleMin);
    const scaleMax = Number(item?.scaleMax);
    if (!Number.isFinite(value) || !Number.isFinite(scaleMin) || !Number.isFinite(scaleMax) || scaleMax <= scaleMin) {
      throw new Error('Invalid normalized POI rating');
    }
    if (value < scaleMin || value > scaleMax) throw new Error('Normalized POI rating is outside its scale');
    return {
      value,
      scaleMin,
      scaleMax,
      count: Number.isFinite(Number(item.count)) ? Math.max(0, Math.trunc(Number(item.count))) : null,
      label: item.label || null,
      source: normalizeSource(item.source || defaultSource),
      observedAt: item.observedAt ? iso(item.observedAt) : null,
      metadata: clone(item.metadata || {}),
    };
  }

  function normalizeContent(content = {}, defaultSource) {
    const descriptions = (Array.isArray(content.descriptions) ? content.descriptions : [])
      .map((item) => normalizeContentItem(item, defaultSource, { defaultKind: 'description' }))
      .filter(Boolean);
    const reviewSummaries = (Array.isArray(content.reviewSummaries) ? content.reviewSummaries : [])
      .map((item) => {
        const normalized = normalizeContentItem(item, defaultSource, { defaultKind: 'review_summary' });
        return normalized ? {
          ...normalized,
          basedOnCount: Number.isFinite(Number(item.basedOnCount)) ? Math.max(0, Math.trunc(Number(item.basedOnCount))) : null,
        } : null;
      })
      .filter(Boolean);
    const notes = (Array.isArray(content.notes) ? content.notes : [])
      .map((item) => normalizeContentItem(item, defaultSource, { defaultKind: 'note' }))
      .filter(Boolean);
    const ratings = (Array.isArray(content.ratings) ? content.ratings : [])
      .map((item) => normalizeRating(item, defaultSource));

    return { descriptions, ratings, reviewSummaries, notes };
  }

  function makeId({ name, source, location }) {
    const coordinate = location ? `${location.lat},${location.lng}` : '';
    const identity = source.ref
      ? `ref:${source.ref}`
      : source.url
        ? `url:${source.url}`
        : `fallback:${normalizeText(name)}|${coordinate}`;
    return `normalized-poi:${source.id}:${hash(identity)}`;
  }

  function create(input, at = Date.now()) {
    if (!input || typeof input !== 'object') throw new Error('Normalized POI input is required');
    const name = String(input.name || '').trim();
    if (!name) throw new Error('Normalized POI name is required');

    const source = normalizeSource(input.source);
    const location = normalizeLocation(input.location);
    const confidence = Number(input.confidence == null ? 1 : input.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error('Normalized POI confidence must be between 0 and 1');
    }

    const aliases = Array.from(new Set(
      (Array.isArray(input.aliases) ? input.aliases : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ));

    const destination = input.destination ? {
      id: input.destination.id || null,
      name: input.destination.name || null,
      countryCode: input.destination.countryCode ? String(input.destination.countryCode).toLowerCase() : null,
    } : null;

    const normalized = {
      schemaVersion: SCHEMA_VERSION,
      id: input.id || makeId({ name, source, location }),
      name,
      normalizedName: normalizeText(name),
      aliases,
      categories: normalizeCategories(input.categories),
      identifiers: normalizeIdentifiers(input.identifiers),
      location,
      address: normalizeAddress(input.address),
      source,
      confidence,
      observedAt: iso(input.observedAt || at),
      destination,
      content: normalizeContent(input.content, source),
      tags: clone(input.tags || {}),
      attributes: clone(input.attributes || {}),
      metadata: clone(input.metadata || {}),
    };

    return {
      ...normalized,
      evidence: normalizeEvidence(input.evidence, source),
    };
  }

  function isNormalizedPOI(value) {
    return Boolean(
      value &&
      value.schemaVersion === SCHEMA_VERSION &&
      typeof value.id === 'string' &&
      typeof value.name === 'string' &&
      value.source?.id &&
      value.source?.version &&
      Number.isFinite(value.confidence) &&
      value.confidence >= 0 &&
      value.confidence <= 1 &&
      Array.isArray(value.categories) &&
      Array.isArray(value.identifiers) &&
      Array.isArray(value.evidence) &&
      value.content &&
      Array.isArray(value.content.descriptions) &&
      Array.isArray(value.content.ratings) &&
      Array.isArray(value.content.reviewSummaries) &&
      Array.isArray(value.content.notes),
    );
  }

  window.WanderNormalizedPOI = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    create,
    isNormalizedPOI,
    normalizeText,
    normalizeLocation,
    normalizeSource,
    normalizeIdentifiers,
    normalizeContent,
    makeId,
  });
})();

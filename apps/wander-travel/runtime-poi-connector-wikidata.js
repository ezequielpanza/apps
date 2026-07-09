(() => {
  const ID = 'wikidata';
  const VERSION = '0.1.0';
  const DEFAULT_ENDPOINT = 'https://query.wikidata.org/sparql';

  function finiteNumber(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`Invalid ${label}`);
    return number;
  }

  function validateCenter(input = {}) {
    const lat = finiteNumber(input.lat, 'Wikidata latitude');
    const lng = finiteNumber(input.lng, 'Wikidata longitude');
    if (lat < -90 || lat > 90) throw new Error('Invalid Wikidata latitude');
    if (lng < -180 || lng > 180) throw new Error('Invalid Wikidata longitude');
    return { lat, lng };
  }

  function clampRadiusKm(value) {
    const radius = Number(value == null ? 10 : value);
    if (!Number.isFinite(radius)) throw new Error('Invalid Wikidata radiusKm');
    return Math.min(Math.max(radius, 0.1), 100);
  }

  function clampLimit(value) {
    const limit = Math.trunc(Number(value == null ? 100 : value));
    if (!Number.isFinite(limit)) throw new Error('Invalid Wikidata limit');
    return Math.min(Math.max(limit, 1), 500);
  }

  function escapeLanguage(value) {
    const language = String(value || 'es,en').trim();
    if (!/^[a-z,-]+$/i.test(language)) throw new Error('Invalid Wikidata language list');
    return language;
  }

  function buildNearbyQuery(input = {}) {
    const center = validateCenter(input);
    const radiusKm = clampRadiusKm(input.radiusKm);
    const limit = clampLimit(input.limit);
    const language = escapeLanguage(input.language);

    return [
      'SELECT ?item ?itemLabel ?location ?instance ?instanceLabel WHERE {',
      '  SERVICE wikibase:around {',
      '    ?item wdt:P625 ?location .',
      `    bd:serviceParam wikibase:center "Point(${center.lng} ${center.lat})"^^geo:wktLiteral .`,
      `    bd:serviceParam wikibase:radius "${radiusKm}" .`,
      '  }',
      '  OPTIONAL { ?item wdt:P31 ?instance . }',
      `  SERVICE wikibase:label { bd:serviceParam wikibase:language "${language}". }`,
      '}',
      `LIMIT ${limit}`,
    ].join('\n');
  }

  function buildQueryUrl(input = {}) {
    const endpoint = String(input.endpoint || DEFAULT_ENDPOINT);
    const url = new URL(endpoint);
    url.searchParams.set('query', buildNearbyQuery(input));
    url.searchParams.set('format', 'json');
    return url.toString();
  }

  function extractQid(uri) {
    const match = String(uri || '').match(/\/entity\/(Q\d+)$/i);
    return match ? match[1].toUpperCase() : null;
  }

  function parseWktPoint(value) {
    const match = String(value || '').match(/^Point\((-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\)$/i);
    if (!match) return null;
    const lng = Number(match[1]);
    const lat = Number(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  }

  function connectorSource({ sourceUrl, sourceRef, strategy }) {
    return {
      connector: ID,
      connectorVersion: VERSION,
      sourceUrl: sourceUrl || null,
      sourceRef: sourceRef || null,
      strategy: strategy || null,
    };
  }

  function aggregateBindings(bindings = []) {
    const entities = new Map();

    for (const row of bindings) {
      const qid = extractQid(row?.item?.value);
      const location = parseWktPoint(row?.location?.value);
      if (!qid || !location) continue;

      if (!entities.has(qid)) {
        entities.set(qid, {
          qid,
          label: row?.itemLabel?.value || qid,
          location,
          instances: new Map(),
        });
      }

      const entity = entities.get(qid);
      if ((!entity.label || entity.label === qid) && row?.itemLabel?.value) {
        entity.label = row.itemLabel.value;
      }

      const instanceQid = extractQid(row?.instance?.value);
      if (instanceQid) {
        entity.instances.set(instanceQid, {
          qid: instanceQid,
          label: row?.instanceLabel?.value || instanceQid,
        });
      }
    }

    return Array.from(entities.values(), (entity) => ({
      ...entity,
      instances: Array.from(entity.instances.values()),
    }));
  }

  async function discover(input = {}) {
    window.WanderSourcePolicy?.assertCapability(ID, 'automatedAcquisition');

    const center = validateCenter(input);
    const radiusKm = clampRadiusKm(input.radiusKm);
    const limit = clampLimit(input.limit);
    const language = escapeLanguage(input.language);
    const endpoint = String(input.endpoint || DEFAULT_ENDPOINT);
    const observedAt = input.observedAt || Date.now();
    const queryUrl = buildQueryUrl({ center, ...center, radiusKm, limit, language, endpoint });

    const response = await fetch(queryUrl, {
      headers: {
        accept: 'application/sparql-results+json, application/json;q=0.9',
      },
    });

    if (!response.ok) {
      const error = new Error(`Wikidata query failed with HTTP ${response.status}`);
      error.code = 'WIKIDATA_HTTP_ERROR';
      error.status = response.status;
      throw error;
    }

    const payload = await response.json();
    const entities = aggregateBindings(payload?.results?.bindings || []);
    const candidates = [];
    const evidence = [];

    for (const entity of entities) {
      const itemUrl = `https://www.wikidata.org/wiki/${entity.qid}`;
      const source = connectorSource({
        sourceUrl: endpoint,
        sourceRef: entity.qid,
        strategy: 'wdqs-nearby-p625',
      });

      const candidate = window.WanderPOICandidate.create({
        name: entity.label || entity.qid,
        typeHint: entity.instances[0]?.label || entity.instances[0]?.qid || null,
        destination: input.destination || null,
        source,
        discoveredAt: observedAt,
        lastObservedAt: observedAt,
        status: 'unresolved',
        metadata: {
          qid: entity.qid,
          itemUrl,
          center,
          radiusKm,
        },
      }, observedAt);

      candidates.push(candidate);

      evidence.push(window.WanderPOIEvidence.create({
        candidateId: candidate.id,
        type: 'source_entity_id',
        value: entity.qid,
        source,
        confidence: 1,
        observedAt,
      }, observedAt));

      evidence.push(window.WanderPOIEvidence.create({
        candidateId: candidate.id,
        type: 'entity_coordinates',
        location: {
          ...entity.location,
          method: 'wikidata_p625',
        },
        value: {
          property: 'P625',
          qid: entity.qid,
        },
        source,
        confidence: 0.97,
        observedAt,
      }, observedAt));

      for (const instance of entity.instances) {
        evidence.push(window.WanderPOIEvidence.create({
          candidateId: candidate.id,
          type: 'source_instance_of',
          value: {
            property: 'P31',
            qid: instance.qid,
            label: instance.label,
          },
          source,
          confidence: 0.95,
          observedAt,
        }, observedAt));
      }
    }

    return {
      candidates,
      evidence,
      diagnostics: {
        sourceId: ID,
        endpoint,
        queryUrl,
        center,
        radiusKm,
        requestedLimit: limit,
        rawBindingCount: Array.isArray(payload?.results?.bindings) ? payload.results.bindings.length : 0,
        candidateCount: candidates.length,
      },
    };
  }

  const connector = Object.freeze({
    id: ID,
    version: VERSION,
    experimental: true,
    capabilities: Object.freeze([
      'nearby-entity-discovery',
      'qid-evidence',
      'p625-coordinate-evidence',
      'p31-type-evidence',
    ]),
    endpoint: DEFAULT_ENDPOINT,
    buildNearbyQuery,
    buildQueryUrl,
    extractQid,
    parseWktPoint,
    aggregateBindings,
    discover,
  });

  window.WanderPOIConnectorWikidata = connector;
  window.WanderPOIConnectors?.register(connector);
})();

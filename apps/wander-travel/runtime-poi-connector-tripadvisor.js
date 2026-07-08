(() => {
  const ID = 'tripadvisor';
  const VERSION = '0.1.0';

  const SOURCE_INSTRUCTIONS = Object.freeze({
    discovery: Object.freeze([
      {
        strategy: 'destination-listing',
        description: 'Open a public Tripadvisor destination tourism page, inspect highlighted place cards, and capture each place name plus any visible detail URL, position, category, rating, and review count.',
      },
    ]),
    detailResolutionPriority: Object.freeze([
      'map-link-entity-coordinates',
      'json-ld-geo',
      'embedded-state-geo',
      'map-link-viewport-coordinates',
      'visible-address',
      'locality-hint',
    ]),
    notes: Object.freeze([
      'Discovery output is a POI candidate, not a canonical POI.',
      'Keep every extracted value as evidence with source URL, strategy, connector version, and confidence.',
      'Do not treat a map viewport center as exact POI coordinates.',
      'Do not merge candidates only because their names look similar.',
    ]),
  });

  const RESEARCH = Object.freeze({
    luperonDestinationPage: 'https://www.tripadvisor.com.ar/Tourism-g644386-Luperon_Puerto_Plata_Province_Dominican_Republic-Vacations.html',
    fixturePath: 'tests/fixtures/poi/tripadvisor-luperon.json',
    discoveryStrategy: 'destination-listing',
    observedCandidateCount: 5,
  });

  function connectorSource({ sourceUrl, sourceRef, strategy }) {
    return {
      connector: ID,
      connectorVersion: VERSION,
      sourceUrl: sourceUrl || null,
      sourceRef: sourceRef || null,
      strategy: strategy || null,
    };
  }

  function discover(input = {}) {
    const sourceUrl = String(input.sourceUrl || '').trim();
    if (!sourceUrl) throw new Error('Tripadvisor discovery sourceUrl is required');

    const destination = input.destination || null;
    const items = Array.isArray(input.items) ? input.items : [];
    const section = input.section || null;
    const observedAt = input.observedAt || Date.now();

    const candidates = [];
    const evidence = [];

    items.forEach((item, index) => {
      const name = String(item?.name || '').trim();
      if (!name) return;

      const position = Number.isInteger(item.position) ? item.position : index + 1;
      const sourceRef = item.sourceRef || item.detailUrl || `listing:${position}:${name}`;
      const source = connectorSource({
        sourceUrl,
        sourceRef,
        strategy: 'destination-listing',
      });

      const candidate = window.WanderPOICandidate.create({
        name,
        typeHint: item.typeHint || item.categoryHint || null,
        destination,
        source,
        discoveredAt: observedAt,
        lastObservedAt: observedAt,
        status: 'unresolved',
        metadata: {
          section,
          listingPosition: position,
          detailUrl: item.detailUrl || null,
        },
      }, observedAt);

      candidates.push(candidate);
      evidence.push(window.WanderPOIEvidence.create({
        candidateId: candidate.id,
        type: 'source_listing_presence',
        value: {
          section,
          position,
          categoryHint: item.categoryHint || item.typeHint || null,
          rating: Number.isFinite(Number(item.rating)) ? Number(item.rating) : null,
          reviewCount: Number.isFinite(Number(item.reviewCount)) ? Number(item.reviewCount) : null,
        },
        source,
        confidence: 0.9,
        observedAt,
      }, observedAt));

      if (item.detailUrl) {
        evidence.push(window.WanderPOIEvidence.create({
          candidateId: candidate.id,
          type: 'source_detail_url',
          value: String(item.detailUrl),
          source: connectorSource({
            sourceUrl,
            sourceRef: String(item.detailUrl),
            strategy: 'destination-listing-detail-link',
          }),
          confidence: 1,
          observedAt,
        }, observedAt));
      }
    });

    return {
      candidates,
      evidence,
      diagnostics: {
        sourceUrl,
        strategy: 'destination-listing',
        inputItems: items.length,
        candidateCount: candidates.length,
        section,
      },
    };
  }

  function parseGoogleMapsUrl(url) {
    if (!url) return { entityLocation: null, viewport: null };
    let text;
    try {
      text = decodeURIComponent(String(url));
    } catch {
      text = String(url);
    }

    const entityMatch = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    const viewportMatch = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)z/);

    const entityLocation = entityMatch ? {
      lat: Number(entityMatch[1]),
      lng: Number(entityMatch[2]),
    } : null;

    const viewport = viewportMatch ? {
      lat: Number(viewportMatch[1]),
      lng: Number(viewportMatch[2]),
      zoom: Number(viewportMatch[3]),
    } : null;

    return { entityLocation, viewport };
  }

  function extractLocationEvidence(input = {}) {
    if (!input.candidateId) throw new Error('Tripadvisor location extraction candidateId is required');
    const observedAt = input.observedAt || Date.now();
    const sourceUrl = input.sourceUrl || null;
    const result = [];

    if (String(input.address || '').trim()) {
      result.push(window.WanderPOIEvidence.create({
        candidateId: input.candidateId,
        type: 'visible_address',
        value: String(input.address).trim(),
        source: connectorSource({
          sourceUrl,
          sourceRef: sourceUrl,
          strategy: 'detail-page-visible-address',
        }),
        confidence: 0.78,
        observedAt,
      }, observedAt));
    }

    const parsed = parseGoogleMapsUrl(input.mapUrl);
    if (parsed.entityLocation) {
      result.push(window.WanderPOIEvidence.create({
        candidateId: input.candidateId,
        type: 'map_link_entity_coordinates',
        location: {
          ...parsed.entityLocation,
          method: 'map_link_entity_coordinates',
        },
        value: { mapUrl: input.mapUrl },
        source: connectorSource({
          sourceUrl,
          sourceRef: input.mapUrl,
          strategy: 'map-link-entity-coordinates',
        }),
        confidence: 0.98,
        observedAt,
      }, observedAt));
    } else if (parsed.viewport) {
      result.push(window.WanderPOIEvidence.create({
        candidateId: input.candidateId,
        type: 'map_link_viewport_coordinates',
        location: {
          lat: parsed.viewport.lat,
          lng: parsed.viewport.lng,
          method: 'map_link_viewport_coordinates',
        },
        value: {
          mapUrl: input.mapUrl,
          zoom: parsed.viewport.zoom,
        },
        source: connectorSource({
          sourceUrl,
          sourceRef: input.mapUrl,
          strategy: 'map-link-viewport-coordinates',
        }),
        confidence: 0.72,
        observedAt,
      }, observedAt));
    }

    return result;
  }

  const connector = Object.freeze({
    id: ID,
    version: VERSION,
    experimental: true,
    capabilities: Object.freeze([
      'destination-listing-discovery',
      'detail-address-evidence',
      'map-link-coordinate-evidence',
    ]),
    sourceInstructions: SOURCE_INSTRUCTIONS,
    research: RESEARCH,
    discover,
    parseGoogleMapsUrl,
    extractLocationEvidence,
  });

  window.WanderPOIConnectorTripadvisor = connector;
  window.WanderPOIConnectors?.register(connector);
})();

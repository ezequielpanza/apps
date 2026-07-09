(() => {
  const ID = 'google-maps';
  const VERSION = '0.1.0';

  const QUERY_PROFILES = Object.freeze({
    attractions: Object.freeze({
      key: 'attractions',
      label: 'Atracciones',
      queryTemplate: '{place} que hacer',
    }),
    restaurants: Object.freeze({
      key: 'restaurants',
      label: 'Restaurantes',
      queryTemplate: '{place} restaurantes',
    }),
    hotels: Object.freeze({
      key: 'hotels',
      label: 'Hoteles',
      queryTemplate: '{place} hoteles',
    }),
    museums: Object.freeze({
      key: 'museums',
      label: 'Museos',
      queryTemplate: '{place} museos',
    }),
    pharmacies: Object.freeze({
      key: 'pharmacies',
      label: 'Farmacias',
      queryTemplate: '{place} farmacias',
    }),
    atms: Object.freeze({
      key: 'atms',
      label: 'Cajeros automáticos',
      queryTemplate: '{place} cajeros automaticos',
    }),
  });

  const SOURCE_INSTRUCTIONS = Object.freeze({
    discovery: Object.freeze([
      {
        strategy: 'semantic-category-search',
        description: 'Run one explicit semantic query profile for a destination, capture visible result cards, and preserve the exact query that produced each candidate.',
      },
    ]),
    locationPriority: Object.freeze([
      'place-url-entity-coordinates',
      'place-url-destination-coordinates',
      'visible-address',
      'place-url-viewport-coordinates',
    ]),
    notes: Object.freeze([
      'Search results are POI candidates, not consolidated POIs.',
      'The same place may appear in multiple query profiles and must remain separate evidence until resolution.',
      'Do not treat @lat,lng,zoom as exact POI coordinates unless another signal confirms the location.',
      'Preserve source entity identifiers without assigning undocumented semantics to them.',
    ]),
  });

  function normalizePlaceName(value) {
    return String(value || '').trim();
  }

  function buildQuery(profileKey, destinationName) {
    const profile = QUERY_PROFILES[profileKey];
    if (!profile) throw new Error(`Unknown Google Maps query profile: ${profileKey}`);
    const place = normalizePlaceName(destinationName);
    if (!place) throw new Error('Google Maps destination name is required');
    return profile.queryTemplate.replace('{place}', place);
  }

  function buildSearchUrl(profileKey, destinationName) {
    const query = buildQuery(profileKey, destinationName);
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  function safeDecode(value) {
    try { return decodeURIComponent(value); } catch { return value; }
  }

  function parseMapsUrl(url) {
    if (!url) {
      return {
        entityLocation: null,
        destinationLocation: null,
        viewport: null,
        sourceEntityIds: [],
        placeSlug: null,
        searchQuery: null,
      };
    }

    const raw = String(url);
    const text = safeDecode(raw);
    const entityMatch = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    const destinationMatch = text.match(/(?:[?&]|^)daddr=[^&]*@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i)
      || text.match(/(?:[?&]|^)daddr=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
    const viewportMatch = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)z/);
    const dataIdMatch = text.match(/!1s([^!/?#]+)/);
    const secondaryIdMatch = text.match(/!16s([^!?#]+)/);
    const placeSlugMatch = text.match(/\/maps\/place\/([^/@?#]+)/i);
    const searchQueryMatch = text.match(/\/maps\/search\/([^/@?#]+)/i);

    const sourceEntityIds = [];
    if (dataIdMatch?.[1]) {
      sourceEntityIds.push({ type: 'source_entity_id', value: safeDecode(dataIdMatch[1]) });
    }
    if (secondaryIdMatch?.[1]) {
      sourceEntityIds.push({ type: 'source_entity_id', value: safeDecode(secondaryIdMatch[1]) });
    }

    return {
      entityLocation: entityMatch ? {
        lat: Number(entityMatch[1]),
        lng: Number(entityMatch[2]),
      } : null,
      destinationLocation: destinationMatch ? {
        lat: Number(destinationMatch[1]),
        lng: Number(destinationMatch[2]),
      } : null,
      viewport: viewportMatch ? {
        lat: Number(viewportMatch[1]),
        lng: Number(viewportMatch[2]),
        zoom: Number(viewportMatch[3]),
      } : null,
      sourceEntityIds,
      placeSlug: placeSlugMatch?.[1]
        ? safeDecode(placeSlugMatch[1]).replace(/\+/g, ' ')
        : null,
      searchQuery: searchQueryMatch?.[1]
        ? safeDecode(searchQueryMatch[1]).replace(/\+/g, ' ')
        : null,
    };
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

  function addLocationEvidence({ candidateId, sourceUrl, sourceRef, parsed, observedAt, evidence }) {
    if (parsed.entityLocation) {
      evidence.push(window.WanderPOIEvidence.create({
        candidateId,
        type: 'place_url_entity_coordinates',
        location: {
          ...parsed.entityLocation,
          method: 'place_url_entity_coordinates',
        },
        value: { placeUrl: sourceRef },
        source: connectorSource({
          sourceUrl,
          sourceRef,
          strategy: 'place-url-entity-coordinates',
        }),
        confidence: 0.98,
        observedAt,
      }, observedAt));
    } else if (parsed.destinationLocation) {
      evidence.push(window.WanderPOIEvidence.create({
        candidateId,
        type: 'place_url_destination_coordinates',
        location: {
          ...parsed.destinationLocation,
          method: 'place_url_destination_coordinates',
        },
        value: { placeUrl: sourceRef },
        source: connectorSource({
          sourceUrl,
          sourceRef,
          strategy: 'place-url-destination-coordinates',
        }),
        confidence: 0.96,
        observedAt,
      }, observedAt));
    } else if (parsed.viewport) {
      evidence.push(window.WanderPOIEvidence.create({
        candidateId,
        type: 'place_url_viewport_coordinates',
        location: {
          lat: parsed.viewport.lat,
          lng: parsed.viewport.lng,
          method: 'place_url_viewport_coordinates',
        },
        value: {
          placeUrl: sourceRef,
          zoom: parsed.viewport.zoom,
        },
        source: connectorSource({
          sourceUrl,
          sourceRef,
          strategy: 'place-url-viewport-coordinates',
        }),
        confidence: 0.55,
        observedAt,
      }, observedAt));
    }
  }

  function discover(input = {}) {
    const destination = input.destination || null;
    const destinationName = destination?.name || input.destinationName || '';
    const profileKey = input.profileKey;
    const query = input.query || buildQuery(profileKey, destinationName);
    const sourceUrl = input.sourceUrl || buildSearchUrl(profileKey, destinationName);
    const items = Array.isArray(input.items) ? input.items : [];
    const observedAt = input.observedAt || Date.now();

    const candidates = [];
    const evidence = [];

    items.forEach((item, index) => {
      const name = normalizePlaceName(item?.name);
      if (!name) return;
      const position = Number.isInteger(item.position) ? item.position : index + 1;
      const placeUrl = item.placeUrl || null;
      const sourceRef = item.sourceRef || placeUrl || `search:${profileKey}:${position}:${name}`;
      const source = connectorSource({
        sourceUrl,
        sourceRef,
        strategy: 'semantic-category-search',
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
          profileKey,
          query,
          resultPosition: position,
          placeUrl,
        },
      }, observedAt);

      candidates.push(candidate);
      evidence.push(window.WanderPOIEvidence.create({
        candidateId: candidate.id,
        type: 'source_search_presence',
        value: {
          profileKey,
          query,
          position,
          categoryHint: item.categoryHint || item.typeHint || null,
          rating: Number.isFinite(Number(item.rating)) ? Number(item.rating) : null,
          reviewCount: Number.isFinite(Number(item.reviewCount)) ? Number(item.reviewCount) : null,
        },
        source,
        confidence: 0.9,
        observedAt,
      }, observedAt));

      if (String(item.address || '').trim()) {
        evidence.push(window.WanderPOIEvidence.create({
          candidateId: candidate.id,
          type: 'visible_address',
          value: String(item.address).trim(),
          source,
          confidence: 0.85,
          observedAt,
        }, observedAt));
      }

      if (placeUrl) {
        evidence.push(window.WanderPOIEvidence.create({
          candidateId: candidate.id,
          type: 'source_place_url',
          value: placeUrl,
          source: connectorSource({
            sourceUrl,
            sourceRef: placeUrl,
            strategy: 'search-result-place-link',
          }),
          confidence: 1,
          observedAt,
        }, observedAt));

        const parsed = parseMapsUrl(placeUrl);
        parsed.sourceEntityIds.forEach((identifier) => {
          evidence.push(window.WanderPOIEvidence.create({
            candidateId: candidate.id,
            type: identifier.type,
            value: identifier.value,
            source: connectorSource({
              sourceUrl,
              sourceRef: placeUrl,
              strategy: 'place-url-source-entity-id',
            }),
            confidence: 1,
            observedAt,
          }, observedAt));
        });

        addLocationEvidence({
          candidateId: candidate.id,
          sourceUrl,
          sourceRef: placeUrl,
          parsed,
          observedAt,
          evidence,
        });
      }
    });

    return {
      candidates,
      evidence,
      diagnostics: {
        profileKey,
        query,
        sourceUrl,
        inputItems: items.length,
        candidateCount: candidates.length,
      },
    };
  }

  const connector = Object.freeze({
    id: ID,
    version: VERSION,
    experimental: true,
    capabilities: Object.freeze([
      'semantic-category-search',
      'search-result-discovery',
      'place-url-identity-evidence',
      'place-url-coordinate-evidence',
    ]),
    queryProfiles: QUERY_PROFILES,
    sourceInstructions: SOURCE_INSTRUCTIONS,
    buildQuery,
    buildSearchUrl,
    parseMapsUrl,
    discover,
  });

  window.WanderPOIConnectorGoogleMaps = connector;
  window.WanderPOIConnectors?.register(connector);
})();

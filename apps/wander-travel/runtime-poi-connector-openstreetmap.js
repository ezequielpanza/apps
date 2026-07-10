(() => {
  const ID = 'openstreetmap';
  const VERSION = '0.2.0';
  const DEFAULT_ENDPOINT = 'https://overpass-api.de/api/interpreter';

  const QUERY_PROFILES = Object.freeze({
    discovery: Object.freeze([
      '["tourism"]',
      '["historic"]',
      '["leisure"]',
      '["natural"]',
      '["amenity"~"^(restaurant|cafe|fast_food|bar|pub|pharmacy|atm|bank|hospital|clinic|fuel|ferry_terminal|drinking_water|toilets)$"]',
    ]),
    food: Object.freeze([
      '["amenity"~"^(restaurant|cafe|fast_food|bar|pub|ice_cream|food_court)$"]',
    ]),
    lodging: Object.freeze([
      '["tourism"~"^(hotel|hostel|guest_house|motel|apartment|camp_site|caravan_site|chalet)$"]',
    ]),
    museums: Object.freeze([
      '["tourism"~"^(museum|gallery)$"]',
    ]),
    pharmacies: Object.freeze([
      '["amenity"="pharmacy"]',
    ]),
    atms: Object.freeze([
      '["amenity"="atm"]',
      '["amenity"="bank"]["atm"="yes"]',
    ]),
    nautical: Object.freeze([
      '["leisure"="marina"]',
      '["amenity"="ferry_terminal"]',
      '["amenity"="fuel"]',
      '["harbour"]',
      '["seamark:type"]',
      '["mooring"]',
    ]),
  });

  const PRIMARY_CATEGORY_KEYS = Object.freeze([
    'tourism', 'historic', 'amenity', 'leisure', 'natural',
    'shop', 'harbour', 'man_made', 'seamark:type', 'mooring',
  ]);

  const FALLBACK_LABELS = Object.freeze({
    'amenity=atm': 'ATM',
    'amenity=pharmacy': 'Pharmacy',
    'amenity=restaurant': 'Restaurant',
    'amenity=cafe': 'Cafe',
    'amenity=fast_food': 'Fast food',
    'amenity=bar': 'Bar',
    'amenity=pub': 'Pub',
    'tourism=hotel': 'Hotel',
    'tourism=hostel': 'Hostel',
    'tourism=guest_house': 'Guest house',
    'tourism=museum': 'Museum',
    'tourism=gallery': 'Gallery',
    'leisure=marina': 'Marina',
    'amenity=ferry_terminal': 'Ferry terminal',
    'amenity=fuel': 'Fuel',
  });

  function validateCenter(input = {}) {
    const lat = Number(input.lat);
    const lng = Number(input.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('Invalid OpenStreetMap latitude');
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error('Invalid OpenStreetMap longitude');
    return { lat, lng };
  }

  function clampRadiusM(value) {
    const radius = Number(value == null ? 5000 : value);
    if (!Number.isFinite(radius)) throw new Error('Invalid OpenStreetMap radiusM');
    return Math.min(Math.max(Math.round(radius), 50), 50000);
  }

  function profileSelectors(profileKey) {
    const selectors = QUERY_PROFILES[profileKey || 'discovery'];
    if (!selectors) throw new Error(`Unknown OpenStreetMap query profile: ${profileKey}`);
    return selectors;
  }

  function buildQuery(input = {}) {
    const center = validateCenter(input);
    const radiusM = clampRadiusM(input.radiusM);
    const profileKey = input.profile || 'discovery';
    const selectors = profileSelectors(profileKey);
    const statements = selectors.map((selector) => `  nwr(around:${radiusM},${center.lat},${center.lng})${selector};`);
    return ['[out:json][timeout:25];', '(', ...statements, ');', 'out center tags;'].join('\n');
  }

  function objectRef(element) {
    return `${element.type}/${element.id}`;
  }

  function objectUrl(element) {
    return `https://www.openstreetmap.org/${element.type}/${element.id}`;
  }

  function elementLocation(element) {
    if (element?.type === 'node' && Number.isFinite(Number(element.lat)) && Number.isFinite(Number(element.lon))) {
      return {
        lat: Number(element.lat), lng: Number(element.lon), method: 'osm_node',
        accuracyRadiusM: null, geometryType: 'point', confidence: 0.99,
      };
    }
    if (Number.isFinite(Number(element?.center?.lat)) && Number.isFinite(Number(element?.center?.lon))) {
      return {
        lat: Number(element.center.lat), lng: Number(element.center.lon), method: 'osm_geometry_center',
        accuracyRadiusM: null, geometryType: element.type || 'geometry', confidence: 0.88,
      };
    }
    return null;
  }

  function localizedNames(tags = {}) {
    const aliases = [];
    ['alt_name', 'short_name', 'old_name', 'loc_name'].forEach((key) => {
      if (tags[key]) aliases.push(...String(tags[key]).split(';'));
    });
    Object.entries(tags).forEach(([key, value]) => {
      if (key.startsWith('name:') && value && value !== tags.name) aliases.push(String(value));
    });
    return Array.from(new Set(aliases.map((value) => value.trim()).filter(Boolean)));
  }

  function categoryPairs(tags = {}) {
    const result = [];
    PRIMARY_CATEGORY_KEYS.forEach((key) => {
      if (!tags[key]) return;
      const value = String(tags[key]);
      result.push({ id: `osm:${key}=${value}`, label: `${key}=${value}`, sourceRef: `${key}=${value}` });
    });
    return result;
  }

  function identifiersFromTags(tags = {}, ref) {
    const identifiers = [{ namespace: 'openstreetmap', value: ref }];
    if (tags.wikidata) {
      String(tags.wikidata).split(';').map((value) => value.trim()).filter(Boolean)
        .forEach((value) => identifiers.push({ namespace: 'wikidata', value }));
    }
    if (tags.wikipedia) identifiers.push({ namespace: 'wikipedia', value: String(tags.wikipedia).trim() });
    return identifiers;
  }

  function contentFromTags(tags = {}) {
    const descriptions = [];
    const notes = [];
    if (tags.description) descriptions.push({ text: String(tags.description), kind: 'description', confidence: 0.9 });
    if (tags.inscription) notes.push({ text: String(tags.inscription), kind: 'inscription', confidence: 0.95 });
    return { descriptions, ratings: [], reviewSummaries: [], notes };
  }

  function fallbackName(tags = {}, element) {
    for (const key of PRIMARY_CATEGORY_KEYS) {
      if (!tags[key]) continue;
      const pair = `${key}=${tags[key]}`;
      if (FALLBACK_LABELS[pair]) return FALLBACK_LABELS[pair];
      return String(tags[key]).replace(/_/g, ' ');
    }
    return `OSM ${element.type} ${element.id}`;
  }

  function addressFromTags(tags = {}) {
    const address = {
      label: tags['addr:full'] || null,
      houseNumber: tags['addr:housenumber'] || null,
      street: tags['addr:street'] || null,
      locality: tags['addr:city'] || tags['addr:place'] || null,
      region: tags['addr:state'] || null,
      postalCode: tags['addr:postcode'] || null,
      countryCode: tags['addr:country'] || null,
    };
    return Object.values(address).some(Boolean) ? address : null;
  }

  function normalizeElement(element, context) {
    const location = elementLocation(element);
    if (!location) return null;

    const tags = element.tags && typeof element.tags === 'object' ? element.tags : {};
    const ref = objectRef(element);
    const source = {
      id: ID, version: VERSION, ref, url: objectUrl(element), strategy: `overpass:${context.profile}`,
    };
    const name = String(tags.name || tags['name:es'] || tags.brand || tags.operator || fallbackName(tags, element)).trim();

    return window.WanderNormalizedPOI.create({
      name,
      aliases: localizedNames(tags),
      categories: categoryPairs(tags),
      identifiers: identifiersFromTags(tags, ref),
      location: {
        lat: location.lat, lng: location.lng, method: location.method,
        accuracyRadiusM: location.accuracyRadiusM, geometryType: location.geometryType,
      },
      address: addressFromTags(tags),
      source,
      confidence: location.confidence,
      observedAt: context.observedAt,
      destination: context.destination,
      content: contentFromTags(tags),
      tags,
      attributes: { osmType: element.type, osmId: element.id, profile: context.profile },
      evidence: [
        { type: 'source_entity_id', value: { type: element.type, id: element.id }, confidence: 1 },
        { type: 'osm_tags', value: tags, confidence: 1 },
        {
          type: 'entity_coordinates',
          value: { objectType: element.type, objectId: element.id, locationMethod: location.method },
          location: {
            lat: location.lat, lng: location.lng, method: location.method, geometryType: location.geometryType,
          },
          confidence: location.confidence,
        },
      ],
      metadata: { queryCenter: context.center, radiusM: context.radiusM },
    }, context.observedAt);
  }

  async function search(input = {}) {
    const center = validateCenter(input);
    const radiusM = clampRadiusM(input.radiusM);
    const profile = input.profile || 'discovery';
    profileSelectors(profile);
    const endpoint = String(input.endpoint || DEFAULT_ENDPOINT);
    const observedAt = input.observedAt || Date.now();
    const query = buildQuery({ ...center, radiusM, profile });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!response.ok) {
      const error = new Error(`OpenStreetMap Overpass query failed with HTTP ${response.status}`);
      error.code = 'OVERPASS_HTTP_ERROR';
      error.status = response.status;
      throw error;
    }

    const payload = await response.json();
    const elements = Array.isArray(payload?.elements) ? payload.elements : [];
    const context = {
      center, radiusM, profile, observedAt, destination: input.destination || null,
    };
    const pois = elements.map((element) => normalizeElement(element, context)).filter(Boolean);
    return {
      pois,
      diagnostics: { endpoint, profile, center, radiusM, rawElementCount: elements.length, poiCount: pois.length },
    };
  }

  const connector = Object.freeze({
    id: ID,
    version: VERSION,
    capabilities: Object.freeze([
      'nearby-search', 'query-profiles', 'node-way-relation', 'tag-normalization',
      'geometry-center', 'cross-source-identifiers', 'descriptive-content',
    ]),
    endpoint: DEFAULT_ENDPOINT,
    queryProfiles: QUERY_PROFILES,
    buildQuery,
    elementLocation,
    identifiersFromTags,
    contentFromTags,
    normalizeElement,
    search,
  });

  window.WanderPOIConnectorOpenStreetMap = connector;
  window.WanderPOIEngine?.register(connector);
})();

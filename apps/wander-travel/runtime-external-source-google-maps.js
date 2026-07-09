(() => {
  const ID = 'google-maps';
  const VERSION = '0.2.0';

  const QUERY_PROFILES = Object.freeze({
    attractions: Object.freeze({ key: 'attractions', label: 'Atracciones', queryTemplate: '{place} que hacer' }),
    restaurants: Object.freeze({ key: 'restaurants', label: 'Restaurantes', queryTemplate: '{place} restaurantes' }),
    hotels: Object.freeze({ key: 'hotels', label: 'Hoteles', queryTemplate: '{place} hoteles' }),
    museums: Object.freeze({ key: 'museums', label: 'Museos', queryTemplate: '{place} museos' }),
    pharmacies: Object.freeze({ key: 'pharmacies', label: 'Farmacias', queryTemplate: '{place} farmacias' }),
    atms: Object.freeze({ key: 'atms', label: 'Cajeros automáticos', queryTemplate: '{place} cajeros automaticos' }),
  });

  function normalizePlaceName(value) {
    return String(value || '').trim();
  }

  function assertExternalPolicy() {
    return window.WanderSourcePolicy?.assertCapability(ID, 'externalDiscovery');
  }

  function buildQuery(profileKey, destinationName) {
    assertExternalPolicy();
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

  function buildExternalIntent(profileKey, destinationName) {
    const query = buildQuery(profileKey, destinationName);
    return {
      sourceId: ID,
      mode: 'external_only',
      profileKey,
      query,
      url: buildSearchUrl(profileKey, destinationName),
      storeAllowed: false,
    };
  }

  window.WanderExternalSourceGoogleMaps = Object.freeze({
    id: ID,
    version: VERSION,
    mode: 'external_only',
    queryProfiles: QUERY_PROFILES,
    buildQuery,
    buildSearchUrl,
    buildExternalIntent,
  });
})();

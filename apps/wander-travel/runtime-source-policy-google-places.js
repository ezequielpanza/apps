(() => {
  const policy = window.WanderSourcePolicy;
  if (!policy) return;

  policy.register({
    id: 'google-places',
    mode: policy.modes.STORE_ALLOWED,
    automatedAcquisition: true,
    storePOIs: true,
    externalDiscovery: true,
    reviewedAt: '2026-07-13',
    termsUrl: 'https://cloud.google.com/maps-platform/terms',
    reason: 'Official Places API (New) results can feed Wander through the protected Cloudflare Worker endpoint.',
    notes: [
      'The API key remains server-side as GOOGLE_MAPS_API_KEY.',
      'Preserve Google Place ID and source provenance.',
      'Respect Google Maps Platform storage, attribution, and display requirements.',
    ],
  });
})();
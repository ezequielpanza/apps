const EARTH_RADIUS_M = 6371000;

function toRadians(value) {
  return value * Math.PI / 180;
}

function distanceMeters(a, b) {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)));
}

function component(components, type) {
  const item = components?.find((entry) => entry.types?.includes(type));
  return item?.long_name || item?.short_name || null;
}

function confidenceFor(distanceM, accuracyM) {
  const accuracy = Number.isFinite(accuracyM) ? Math.max(accuracyM, 5) : 15;
  if (distanceM <= accuracy) return "high";
  if (distanceM <= Math.max(accuracy * 2, 30)) return "medium";
  return "low";
}

async function reverseGeocode(apiKey, location) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${location.latitude},${location.longitude}`);
  url.searchParams.set("language", "es");
  url.searchParams.set("key", apiKey);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`geocoding_${response.status}`);
  const data = await response.json();
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") throw new Error(`geocoding_${data.status}`);
  const result = data.results?.[0] || null;
  if (!result) return null;
  return {
    address: result.formatted_address || null,
    neighborhood: component(result.address_components, "neighborhood") || component(result.address_components, "sublocality"),
    city: component(result.address_components, "locality") || component(result.address_components, "administrative_area_level_2"),
    region: component(result.address_components, "administrative_area_level_1"),
    country: component(result.address_components, "country"),
    postalCode: component(result.address_components, "postal_code"),
    addressPlaceId: result.place_id || null
  };
}

async function nearbyPlaces(apiKey, location, radiusM) {
  const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types,places.googleMapsUri"
    },
    body: JSON.stringify({
      maxResultCount: 10,
      rankPreference: "DISTANCE",
      locationRestriction: {
        circle: {
          center: { latitude: location.latitude, longitude: location.longitude },
          radius: radiusM
        }
      }
    })
  });
  if (!response.ok) throw new Error(`places_${response.status}`);
  const data = await response.json();
  return (data.places || []).map((place) => {
    const point = place.location || {};
    const distanceM = Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
      ? distanceMeters(location, point)
      : null;
    return {
      name: place.displayName?.text || null,
      placeId: place.id || null,
      address: place.formattedAddress || null,
      distanceM,
      type: place.primaryType || place.types?.[0] || null,
      types: Array.isArray(place.types) ? place.types.slice(0, 8) : [],
      googleMapsUrl: place.googleMapsUri || (place.id ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.id)}` : null)
    };
  }).filter((place) => place.name);
}

export async function resolveLocation(env, location) {
  if (!env.GOOGLE_MAPS_API_KEY || !location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;

  const cacheKey = `resolved:${location.latitude.toFixed(4)}:${location.longitude.toFixed(4)}`;
  const cached = await env.CONTEXTUM_KV.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (_) {}
  }

  const accuracyM = Number.isFinite(location.accuracyM) ? location.accuracyM : 15;
  const radiusM = Math.min(150, Math.max(40, Math.ceil(accuracyM * 3)));
  const [addressResult, placesResult] = await Promise.allSettled([
    reverseGeocode(env.GOOGLE_MAPS_API_KEY, location),
    nearbyPlaces(env.GOOGLE_MAPS_API_KEY, location, radiusM)
  ]);

  const address = addressResult.status === "fulfilled" ? addressResult.value : null;
  const nearbyPlaces = placesResult.status === "fulfilled" ? placesResult.value : [];
  const primaryPlace = nearbyPlaces[0] || null;
  const resolved = {
    provider: "google-maps",
    resolvedAt: new Date().toISOString(),
    searchRadiusM: radiusM,
    confidence: primaryPlace && Number.isFinite(primaryPlace.distanceM)
      ? confidenceFor(primaryPlace.distanceM, accuracyM)
      : (address ? "address-only" : "unresolved"),
    ...(address || {}),
    primaryPlace,
    nearbyPlaces: nearbyPlaces.slice(0, 5)
  };

  await env.CONTEXTUM_KV.put(cacheKey, JSON.stringify(resolved), { expirationTtl: 900 });
  return resolved;
}

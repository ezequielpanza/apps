(() => {
  const context = window.WanderContext;
  const store = window.WanderPOIStore;
  if (!context) return;

  let lastId = null;

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function radians(value) {
    return value * Math.PI / 180;
  }

  function distanceMeters(a, b) {
    const radius = 6371008.8;
    const dLat = radians(b.lat - a.lat);
    const dLng = radians(b.lng - a.lng);
    const lat1 = radians(a.lat);
    const lat2 = radians(b.lat);
    const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return radius * 2 * Math.asin(Math.min(1, Math.sqrt(value)));
  }

  function pointInRing(point, ring) {
    if (!Array.isArray(ring) || ring.length < 4) return false;
    let inside = false;
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
      const currentPoint = ring[index];
      const previousPoint = ring[previous];
      const yi = Number(currentPoint?.lat);
      const xi = Number(currentPoint?.lng);
      const yj = Number(previousPoint?.lat);
      const xj = Number(previousPoint?.lng);
      if (![yi, xi, yj, xj].every(Number.isFinite)) continue;
      const intersects = ((yi > point.lat) !== (yj > point.lat)) &&
        (point.lng < ((xj - xi) * (point.lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function insideBounds(point, bounds) {
    if (!bounds) return true;
    return point.lat >= Number(bounds.south) && point.lat <= Number(bounds.north) &&
      point.lng >= Number(bounds.west) && point.lng <= Number(bounds.east);
  }

  function geometryAreaHint(geometry) {
    const bounds = geometry?.bounds;
    if (!bounds) return Infinity;
    const height = Math.max(0, Number(bounds.north) - Number(bounds.south));
    const width = Math.max(0, Number(bounds.east) - Number(bounds.west));
    return height * width;
  }

  function isContainerTags(tags = {}) {
    const tourism = String(tags.tourism || '');
    const amenity = String(tags.amenity || '');
    const leisure = String(tags.leisure || '');
    const shop = String(tags.shop || '');
    const aeroway = String(tags.aeroway || '');
    const building = String(tags.building || '');
    const landuse = String(tags.landuse || '');

    return /^(hotel|resort|hostel|guest_house|motel|camp_site|theme_park|attraction)$/.test(tourism) ||
      /^(hospital|university|college|school|marketplace)$/.test(amenity) ||
      /^(marina|sports_centre|stadium|resort|water_park)$/.test(leisure) ||
      shop === 'mall' ||
      /^(aerodrome|terminal)$/.test(aeroway) ||
      /^(retail|commercial|hotel|hospital|university|school|civic)$/.test(building) ||
      /^(commercial|retail|recreation_ground)$/.test(landuse);
  }

  function containingArea(point) {
    if (!store?.listConsolidated) return null;
    const candidates = [];

    for (const poi of store.listConsolidated()) {
      const osmAttributes = poi?.attributesBySource?.openstreetmap;
      const geometry = osmAttributes?.containmentGeometry;
      const tags = poi?.tagsBySource?.openstreetmap || {};
      if (!geometry || !isContainerTags(tags) || !insideBounds(point, geometry.bounds)) continue;
      const polygons = Array.isArray(geometry.polygons) ? geometry.polygons : [];
      if (!polygons.some((ring) => pointInRing(point, ring))) continue;
      candidates.push({ poi, geometry, areaHint: geometryAreaHint(geometry) });
    }

    candidates.sort((left, right) => left.areaHint - right.areaHint || right.poi.confidence - left.poi.confidence);
    return candidates[0] || null;
  }

  function clear() {
    if (lastId === null && !context.value('currentPOI.current')) return;
    context.remove('currentPOI.current');
    context.remove('currentPOI.value');
    context.remove('currentPOI.container');
    context.remove('currentPOI.distanceM');
    context.remove('currentPOI.status');
    lastId = null;
  }

  function detect() {
    const location = context.getEffectiveLocation?.();
    const items = context.value('nearby.items');
    if (!location) {
      clear();
      return null;
    }

    const lat = finite(location.lat);
    const lng = finite(location.lng);
    if (lat === null || lng === null) {
      clear();
      return null;
    }

    const point = { lat, lng };
    const containerMatch = containingArea(point);
    const container = containerMatch ? {
      id: containerMatch.poi.id,
      name: containerMatch.poi.name || 'Establecimiento',
      categories: containerMatch.poi.categories || [],
      location: containerMatch.poi.location || null,
      address: containerMatch.poi.address || null,
      detectionMode: 'inside_area',
      source: 'openstreetmap',
    } : null;

    const accuracy = Math.max(5, finite(location.accuracy) ?? 50);
    const speedKmh = Math.max(0, finite(context.value('motion.speedKmh')) ?? 0);
    const moving = context.value('motion.status') === 'moving';
    const enterRadius = Math.min(moving ? 75 : 120, Math.max(moving ? 28 : 35, accuracy * (moving ? 1.15 : 1.5)));
    const exitRadius = enterRadius * 1.45;

    const candidates = (Array.isArray(items) ? items : [])
      .filter((item) => item?.location && finite(item.location.lat) !== null && finite(item.location.lng) !== null)
      .map((item) => ({
        item,
        distanceM: distanceMeters(point, { lat: Number(item.location.lat), lng: Number(item.location.lng) }),
      }))
      .sort((a, b) => a.distanceM - b.distanceM);

    const nearest = candidates[0] || null;
    let specific = null;
    if (nearest) {
      const sameAsCurrent = lastId && String(nearest.item.id) === String(lastId);
      const threshold = sameAsCurrent ? exitRadius : enterRadius;
      if (nearest.distanceM <= threshold && !(moving && speedKmh > 45 && nearest.distanceM > 35)) {
        specific = { nearest, threshold };
      }
    }

    if (!specific && !container) {
      clear();
      return null;
    }

    const confidence = specific
      ? Math.max(0.35, Math.min(0.98, 1 - specific.nearest.distanceM / Math.max(specific.threshold, 1)))
      : 0.96;

    const value = specific ? {
      id: specific.nearest.item.id,
      name: specific.nearest.item.name || 'POI actual',
      categories: specific.nearest.item.categories || [],
      location: specific.nearest.item.location,
      address: specific.nearest.item.address || null,
      distanceM: Math.round(specific.nearest.distanceM),
      accuracyM: Math.round(accuracy),
      detectionMode: 'near_point',
      container,
      detectedAt: new Date().toISOString(),
    } : {
      ...container,
      distanceM: 0,
      accuracyM: Math.round(accuracy),
      container,
      detectedAt: new Date().toISOString(),
    };

    const options = {
      source: 'current-poi-provider',
      kind: 'inferred',
      ttlMs: 60000,
      confidence,
    };
    context.set('currentPOI.current', value, options);
    context.set('currentPOI.value', value, options);
    if (container) context.set('currentPOI.container', container, options);
    else context.remove('currentPOI.container');
    context.set('currentPOI.distanceM', value.distanceM, options);
    context.set('currentPOI.status', container && !specific ? 'inside_container' : 'detected', options);
    lastId = value.id;
    return value;
  }

  context.subscribe((key) => {
    if (
      key === 'nearby.items' ||
      key === 'location.effective' ||
      key.startsWith('location.effective.') ||
      key === 'motion.status' ||
      key === 'motion.speedKmh'
    ) detect();
  });

  const providers = window.WanderProviders || (window.WanderProviders = {});
  providers.currentPOI = Object.freeze({
    detect,
    clear,
    pointInRing,
    containingArea,
    getCurrent: () => context.value('currentPOI.current') || null,
    getContainer: () => context.value('currentPOI.container') || null,
  });
  detect();
})();
(() => {
  const context = window.WanderContext;
  const engine = window.WanderPOIEngine;
  const store = window.WanderPOIStore;
  if (!context || !engine) return;

  const providers = window.WanderProviders || (window.WanderProviders = {});
  const DEFAULT_SOURCES = Object.freeze(['openstreetmap', 'wikidata']);

  let config = {
    sources: [...DEFAULT_SOURCES],
    profile: 'discovery',
    language: 'es,en',
    minNetworkIntervalMs: 60000,
    maxContextItems: 40,
    wikidataLimit: 150,
  };

  let lastSearch = null;
  let lastNetworkAt = 0;
  let activePromise = null;
  let refreshTimer = null;
  let queuedForce = false;
  let requestSequence = 0;

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function finiteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function validCoordinate(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }
  function radians(value) { return value * Math.PI / 180; }

  function distanceMeters(left, right) {
    if (!left || !right) return Infinity;
    const radius = 6371008.8;
    const dLat = radians(right.lat - left.lat);
    const dLng = radians(right.lng - left.lng);
    const lat1 = radians(left.lat);
    const lat2 = radians(right.lat);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return radius * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function bearingDegrees(from, to) {
    if (!from || !to) return null;
    const lat1 = radians(from.lat);
    const lat2 = radians(to.lat);
    const dLng = radians(to.lng - from.lng);
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function currentLocation() {
    const effective = context.getEffectiveLocation?.();
    if (!effective) return null;
    const lat = finiteNumber(effective.lat);
    const lng = finiteNumber(effective.lng);
    if (!validCoordinate(lat, lng)) return null;
    const effectiveSpeedKmh = Math.max(0, (finiteNumber(effective.speedMps) || 0) * 3.6);
    const inferredSpeedKmh = finiteNumber(context.value('motion.speedKmh'));
    return {
      lat,
      lng,
      accuracy: finiteNumber(effective.accuracy),
      speedKmh: Math.max(0, inferredSpeedKmh ?? effectiveSpeedKmh),
      mobilityMode: context.value('mobility.mode', 'unknown'),
      source: effective.source || 'unknown',
    };
  }

  function planFor(location) {
    const speed = Math.max(0, finiteNumber(location?.speedKmh) || 0);
    const mode = String(location?.mobilityMode || 'unknown');
    if (mode === 'walking' || mode === 'running') return { radiusM: 1800, moveThresholdM: 350, maxAgeMs: 10 * 60 * 1000 };
    if (mode === 'cycling') return { radiusM: 4500, moveThresholdM: 900, maxAgeMs: 8 * 60 * 1000 };
    if (speed >= 80 || mode === 'aircraft') return { radiusM: 15000, moveThresholdM: 5000, maxAgeMs: 4 * 60 * 1000 };
    if (speed >= 30 || ['car', 'bus', 'train', 'motorcycle'].includes(mode)) return { radiusM: 8000, moveThresholdM: 2200, maxAgeMs: 6 * 60 * 1000 };
    if (speed >= 8 || ['boat', 'sailing'].includes(mode)) return { radiusM: 5000, moveThresholdM: 1000, maxAgeMs: 8 * 60 * 1000 };
    if (speed >= 2) return { radiusM: 2200, moveThresholdM: 450, maxAgeMs: 10 * 60 * 1000 };
    return { radiusM: 3000, moveThresholdM: 250, maxAgeMs: 15 * 60 * 1000 };
  }

  function destinationFromContext() {
    const place = context.value('place.current');
    if (!place || typeof place !== 'object') return null;
    return {
      id: place.cityId || place.zoneId || place.regionId || place.countryId || null,
      name: place.city || place.zone || place.region || place.country || null,
      countryCode: place.countryCode || null,
    };
  }

  function shouldSearch(location, force = false) {
    if (force || !lastSearch) return true;
    const plan = planFor(location);
    const movedM = distanceMeters(lastSearch.center, location);
    const ageMs = Date.now() - lastSearch.at;
    return movedM >= plan.moveThresholdM || ageMs >= plan.maxAgeMs;
  }

  function categoryText(poi) {
    return (poi.categories || []).map((category) => `${category.id || ''} ${category.label || ''}`.toLowerCase()).join(' ');
  }
  function interestBoost(poi) {
    const text = categoryText(poi);
    if (/historic|museum|attraction|monument|castle|fort|archae|heritage/.test(text)) return 1;
    if (/beach|natural|viewpoint|park|marina|gallery/.test(text)) return 0.8;
    if (/restaurant|cafe|pharmacy|hospital|atm|bank|fuel/.test(text)) return 0.55;
    return 0.35;
  }

  function rankPOI(poi, center) {
    const distanceM = poi.location ? distanceMeters(center, poi.location) : Infinity;
    const distanceScore = Number.isFinite(distanceM) ? 1 / (1 + distanceM / 1200) : 0;
    const sourceScore = Math.min(1, Math.max(1, poi.sources?.length || 1) / 2);
    const confidence = Math.max(0, Math.min(1, Number(poi.confidence) || 0));
    const score = distanceScore * 0.55 + confidence * 0.25 + sourceScore * 0.12 + interestBoost(poi) * 0.08;
    return {
      score: Math.round(score * 10000) / 10000,
      distanceM: Number.isFinite(distanceM) ? Math.round(distanceM) : null,
      bearingDeg: poi.location ? Math.round(bearingDegrees(center, poi.location) * 10) / 10 : null,
    };
  }

  function contextItem(poi, center) {
    const rank = rankPOI(poi, center);
    return {
      id: poi.id,
      name: poi.name,
      aliases: clone(poi.aliases || []),
      categories: clone(poi.categories || []),
      location: clone(poi.location),
      address: clone(poi.address),
      confidence: poi.confidence,
      sources: clone(poi.sources || []),
      memberIds: clone(poi.memberIds || []),
      notes: clone(poi.notes || []),
      distanceM: rank.distanceM,
      bearingDeg: rank.bearingDeg,
      relevanceScore: rank.score,
    };
  }

  function writeStatus(status, confidence = 1) {
    context.set('nearby.status', status, { source: 'nearby-provider', kind: 'derived', ttlMs: 10 * 60 * 1000, confidence });
  }
  function writeResult(payload, confidence = 0.9) {
    const options = { source: 'nearby-provider', kind: 'derived', ttlMs: 15 * 60 * 1000, confidence };
    context.set('nearby.current', payload, options);
    context.set('nearby.items', payload.items, options);
    context.set('nearby.updatedAt', payload.updatedAt, options);
    context.set('nearby.diagnostics', payload.diagnostics, { ...options, ttlMs: 30 * 60 * 1000 });
  }

  function scheduleRefresh(delayMs = 500, force = false) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refresh(force);
    }, delayMs);
  }

  async function runSearch(location, force = false) {
    const sequence = ++requestSequence;
    const plan = planFor(location);
    const request = {
      lat: location.lat,
      lng: location.lng,
      radiusM: plan.radiusM,
      radiusKm: plan.radiusM / 1000,
      profile: config.profile,
      language: config.language,
      limit: config.wikidataLimit,
      destination: destinationFromContext(),
      observedAt: new Date().toISOString(),
    };

    writeStatus('searching', 0.75);
    lastNetworkAt = Date.now();

    try {
      const result = await engine.searchMany(config.sources, request);
      if (sequence !== requestSequence) return null;

      if (store?.ingestNormalized) {
        for (const batch of result.batches) {
          try { store.ingestNormalized(batch.pois); } catch {}
        }
      }

      const consolidation = engine.consolidate(result.pois);
      if (store?.upsertConsolidated) {
        consolidation.consolidated.forEach((poi) => {
          try { store.upsertConsolidated(poi); } catch {}
        });
      }

      const items = consolidation.consolidated
        .map((poi) => contextItem(poi, location))
        .sort((a, b) => b.relevanceScore - a.relevanceScore || (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity))
        .slice(0, config.maxContextItems);

      const successfulSources = result.batches.map((batch) => batch.sourceId);
      const status = items.length
        ? (result.errors.length ? 'available_partial' : 'available')
        : (result.errors.length === config.sources.length ? 'unavailable' : 'empty');
      const updatedAt = new Date().toISOString();

      lastSearch = { center: { lat: location.lat, lng: location.lng }, at: Date.now(), radiusM: plan.radiusM, status };
      const payload = {
        status,
        center: { lat: location.lat, lng: location.lng, accuracy: location.accuracy, source: location.source },
        radiusM: plan.radiusM,
        mobility: { mode: location.mobilityMode, speedKmh: Math.round(location.speedKmh * 10) / 10 },
        items,
        updatedAt,
        diagnostics: {
          requestedSources: [...config.sources],
          successfulSources,
          errors: clone(result.errors),
          normalizedCount: result.pois.length,
          consolidatedCount: consolidation.consolidated.length,
          mergedGroupCount: consolidation.diagnostics.mergedGroupCount,
          ambiguityCount: consolidation.diagnostics.ambiguityCount,
          force: Boolean(force),
        },
      };

      writeResult(payload, result.errors.length ? 0.75 : 0.9);
      writeStatus(status, result.errors.length ? 0.75 : 0.9);
      return clone(payload);
    } catch (error) {
      if (sequence !== requestSequence) return null;
      writeStatus('unavailable', 0.4);
      context.set('nearby.diagnostics', {
        requestedSources: [...config.sources],
        error: error?.message || String(error),
        code: error?.code || null,
        at: new Date().toISOString(),
      }, { source: 'nearby-provider', kind: 'derived', ttlMs: 10 * 60 * 1000, confidence: 0.4 });
      return null;
    }
  }

  async function refresh(force = false) {
    const location = currentLocation();
    if (!location) {
      writeStatus('pending', 0.5);
      return null;
    }
    if (!shouldSearch(location, force)) return null;

    if (activePromise) {
      queuedForce = queuedForce || force;
      return activePromise;
    }

    const elapsed = Date.now() - lastNetworkAt;
    if (!force && elapsed < config.minNetworkIntervalMs) {
      scheduleRefresh(Math.max(500, config.minNetworkIntervalMs - elapsed), false);
      return null;
    }

    activePromise = runSearch(location, force).finally(() => {
      activePromise = null;
      const forceNext = queuedForce;
      queuedForce = false;
      if (forceNext) scheduleRefresh(50, true);
    });
    return activePromise;
  }

  function configure(next = {}) {
    config = {
      ...config,
      ...next,
      sources: Array.isArray(next.sources) && next.sources.length ? [...new Set(next.sources.map(String))] : config.sources,
      minNetworkIntervalMs: Math.max(10000, Number(next.minNetworkIntervalMs ?? config.minNetworkIntervalMs)),
      maxContextItems: Math.max(1, Math.min(200, Math.trunc(Number(next.maxContextItems ?? config.maxContextItems)))),
      wikidataLimit: Math.max(1, Math.min(500, Math.trunc(Number(next.wikidataLimit ?? config.wikidataLimit)))),
    };
    return getConfig();
  }

  function getConfig() { return clone(config); }
  function getCurrent() { return clone(context.value('nearby.current')); }

  context.subscribe((key) => {
    if (key === 'location.effective' || key.startsWith('location.effective.')) scheduleRefresh(450, false);
    else if (key === 'motion.speedKmh' || key === 'mobility.mode') scheduleRefresh(900, false);
    else if (key === 'place.current') scheduleRefresh(1200, false);
  });

  providers.nearby = Object.freeze({
    refresh,
    configure,
    getConfig,
    getCurrent,
    planFor,
    shouldSearch,
    rankPOI,
    distanceMeters,
    bearingDegrees,
  });

  refresh(false);
})();

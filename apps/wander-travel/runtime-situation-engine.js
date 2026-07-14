(() => {
  const context = window.WanderContext;
  const engine = window.WanderEngine;
  if (!context || !engine?.subscribeEvaluation) return;

  const RULE_SET_VERSION = '1.4.0';
  const HISTORY_WINDOW_MS = 10 * 60 * 1000;
  const listeners = new Set();
  const motionHistory = [];
  let lastResult = null;
  let stationarySince = null;

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function named(value) {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return value.name || value.label || value.displayName || null;
  }

  function stationaryPlaceName() {
    const poi = context.value?.('currentPOI.current') || context.value?.('poi.current') || context.value?.('place.currentPOI');
    const container = context.value?.('place.currentContainer') || context.value?.('container.current');
    const place = context.value?.('place.current');
    return named(poi) || named(container) || named(place?.zone) || named(place?.neighborhood) || named(place?.city) || named(place) || null;
  }

  function movementPlaceName() {
    const container = context.value?.('place.currentContainer') || context.value?.('container.current');
    const place = context.value?.('place.current');
    return named(container) || named(place?.zone) || named(place?.neighborhood) || named(place?.district) || named(place?.city) || named(place?.region) || named(place) || null;
  }

  function placeType() {
    const poi = context.value?.('currentPOI.current') || context.value?.('poi.current') || context.value?.('place.currentPOI');
    const container = context.value?.('place.currentContainer') || context.value?.('container.current');
    const place = context.value?.('place.current');
    return poi?.primaryType || poi?.type || container?.primaryType || container?.type || place?.type || null;
  }

  function candidate(id, ruleId, score, label, evidence = [], contradictions = []) {
    return { stateId: id, ruleId, score, label, evidence, contradictions };
  }

  function recordMotionSample(speed, motion, now) {
    motionHistory.push({ at: now, speed: speed ?? 0, moving: motion === 'moving' });
    while (motionHistory.length && now - motionHistory[0].at > HISTORY_WINDOW_MS) motionHistory.shift();
  }

  function motionMetrics() {
    if (!motionHistory.length) return { sampleCount: 0, averageSpeedKmh: null, maxSpeedKmh: null, speedVariance: null, stopCount: 0, stopRatio: null, accelerationMean: null, accelerationVariance: null };
    const speeds = motionHistory.map((sample) => sample.speed);
    const average = speeds.reduce((sum, value) => sum + value, 0) / speeds.length;
    const variance = speeds.reduce((sum, value) => sum + (value - average) ** 2, 0) / speeds.length;
    const accelerations = [];
    let stopCount = 0;
    let stopped = speeds[0] <= 0.8;
    for (let index = 1; index < motionHistory.length; index += 1) {
      const previous = motionHistory[index - 1];
      const current = motionHistory[index];
      const hours = Math.max((current.at - previous.at) / 3600000, 1 / 3600);
      accelerations.push((current.speed - previous.speed) / hours);
      const isStopped = current.speed <= 0.8;
      if (isStopped && !stopped) stopCount += 1;
      stopped = isStopped;
    }
    const accelerationMean = accelerations.length ? accelerations.reduce((sum, value) => sum + Math.abs(value), 0) / accelerations.length : 0;
    const accelerationVariance = accelerations.length
      ? accelerations.reduce((sum, value) => sum + (Math.abs(value) - accelerationMean) ** 2, 0) / accelerations.length
      : 0;
    return {
      sampleCount: speeds.length,
      averageSpeedKmh: Math.round(average * 10) / 10,
      maxSpeedKmh: Math.round(Math.max(...speeds) * 10) / 10,
      speedVariance: Math.round(variance * 10) / 10,
      stopCount,
      stopRatio: Math.round((speeds.filter((value) => value <= 0.8).length / speeds.length) * 100) / 100,
      accelerationMean: Math.round(accelerationMean),
      accelerationVariance: Math.round(accelerationVariance),
    };
  }

  function normalizeProviderMethod(mode) {
    const value = String(mode || '').toLowerCase();
    const aliases = {
      on_foot: 'walking', walking: 'walking', running: 'running',
      cycling: 'bicycle', bicycle: 'bicycle', bike: 'bicycle',
      scooter: 'scooter', kick_scooter: 'scooter', electric_scooter: 'electric_scooter', escooter: 'electric_scooter',
      motorcycle: 'motorcycle', motorbike: 'motorcycle',
      driving: 'car', car: 'car', automobile: 'car',
      bus: 'bus', train: 'train', transit: 'public_transport', public_transport: 'public_transport',
      sailing: 'boat', boating: 'boat', boat: 'boat', aircraft: 'aircraft', airplane: 'aircraft',
    };
    return aliases[value] || null;
  }

  function methodLabel(method) {
    const labels = {
      stationary: 'Detenido', walking: 'Caminando', running: 'Corriendo', bicycle: 'Bicicleta',
      scooter: 'Monopatín', electric_scooter: 'Monopatín eléctrico', motorcycle: 'Moto', car: 'Auto',
      bus: 'Bus', train: 'Tren', public_transport: 'Transporte público', boat: 'Barco', aircraft: 'Avión', unknown: 'Desconocido',
    };
    return labels[method] || method;
  }

  function inferMovementMethod({ rawMobility, speed, motion, routeType, metrics }) {
    if (motion === 'stationary' || (speed !== null && speed <= 0.3)) {
      return { id: 'stationary', label: 'Detenido', confidence: 0.96, source: 'motion-state', evidence: ['motion_stationary'], candidates: [{ id: 'stationary', score: 0.96 }] };
    }

    const providerMethod = normalizeProviderMethod(rawMobility);
    if (providerMethod) {
      return { id: providerMethod, label: methodLabel(providerMethod), confidence: 0.94, source: 'mobility-provider', evidence: [`provider_${providerMethod}`], candidates: [{ id: providerMethod, score: 0.94 }] };
    }

    const currentSpeed = speed ?? metrics.averageSpeedKmh ?? 0;
    const averageSpeed = metrics.averageSpeedKmh ?? currentSpeed;
    const maxSpeed = metrics.maxSpeedKmh ?? currentSpeed;
    const route = String(routeType || '').toLowerCase();
    const candidates = [];
    const add = (id, score, evidence) => candidates.push({ id, score, evidence });

    if (/water|marina|harbour|harbor|river|sea|ocean/.test(route)) add('boat', 0.88, ['water_context']);
    if (/rail|train|station/.test(route)) add('train', 0.9, ['rail_context']);
    if (averageSpeed <= 7 && maxSpeed <= 11) add('walking', 0.78, ['pedestrian_speed_range']);
    if (averageSpeed > 7 && averageSpeed <= 14) {
      add('bicycle', 0.65, ['micromobility_speed_range']);
      add('scooter', 0.61, ['micromobility_speed_range']);
      if (metrics.stopCount >= 2) add('electric_scooter', 0.64, ['frequent_short_stops']);
    }
    if (averageSpeed > 14 && averageSpeed <= 32) {
      add('bicycle', maxSpeed <= 35 ? 0.62 : 0.4, ['urban_micromobility_speed']);
      add('electric_scooter', 0.64, ['urban_micromobility_speed']);
      add('motorcycle', 0.55, ['motorized_two_wheel_possible']);
      add('car', 0.52, ['urban_vehicle_possible']);
    }
    if (averageSpeed > 32 || maxSpeed > 45) {
      add('car', 0.76, ['road_vehicle_speed']);
      add('motorcycle', 0.61, ['road_vehicle_speed']);
      add('bus', metrics.stopCount >= 3 ? 0.58 : 0.42, ['repeated_stops']);
    }
    if (maxSpeed > 130) {
      add('train', 0.64, ['very_high_ground_speed']);
      add('aircraft', 0.52, ['very_high_speed_without_altitude_confirmation']);
    }
    if (!candidates.length && motion === 'moving') add('unknown', 0.45, ['movement_detected_insufficient_classification']);

    candidates.sort((a, b) => b.score - a.score);
    const selected = candidates[0] || { id: 'unknown', score: 0.35, evidence: ['insufficient_evidence'] };
    const runnerUp = candidates[1] || null;
    const ambiguity = runnerUp ? Math.max(0, selected.score - runnerUp.score) : 1;
    return {
      id: selected.id,
      label: methodLabel(selected.id),
      confidence: selected.score,
      source: 'movement-pattern-inference',
      evidence: selected.evidence || [],
      candidates: candidates.slice(0, 4).map((item) => ({ id: item.id, label: methodLabel(item.id), score: item.score })),
      ambiguity,
      needsClarification: selected.id === 'unknown' || ambiguity < 0.08,
    };
  }

  function movementLabel(method, placeName) {
    const suffix = placeName ? ` por ${placeName}` : '';
    const labels = {
      walking: `Caminando${suffix}`, running: `Corriendo${suffix}`, bicycle: `Andando en bicicleta${suffix}`,
      scooter: `Andando en monopatín${suffix}`, electric_scooter: `Andando en monopatín eléctrico${suffix}`,
      motorcycle: `En moto${suffix}`, car: `Conduciendo${suffix}`, bus: `Viajando en bus${suffix}`,
      train: `Viajando en tren${suffix}`, public_transport: `Viajando en transporte público${suffix}`,
      boat: placeName ? `Navegando cerca de ${placeName}` : 'Navegando', aircraft: `Volando${suffix}`,
    };
    return labels[method] || (placeName ? `En movimiento por ${placeName}` : 'En movimiento');
  }

  function build(evaluation, reason = 'engine') {
    const situation = evaluation?.situation || engine.inferSituation?.() || {};
    const speed = number(situation.speedKmh);
    const rawMobility = String(situation.mobility?.mode || 'unknown');
    const motion = String(situation.motion?.status || 'pending');
    const stationaryName = stationaryPlaceName();
    const movementName = movementPlaceName();
    const type = placeType();
    const now = Date.now();

    recordMotionSample(speed, motion, now);
    const metrics = motionMetrics();
    const method = inferMovementMethod({ rawMobility, speed, motion, routeType: type, metrics });

    if (motion === 'stationary') {
      if (!stationarySince) stationarySince = now;
    } else stationarySince = null;

    const stationaryMinutes = stationarySince ? Math.max(0, (now - stationarySince) / 60000) : 0;
    const candidates = [];

    if (!situation.locationAvailable) {
      candidates.push(candidate('context_pending', 'location_required', 0.98, 'Preparando contexto', ['location_unavailable']));
    } else if (motion === 'stationary') {
      candidates.push(candidate(
        stationaryName ? 'stationary_at_place' : 'stationary',
        stationaryName ? 'stationary_inside_known_place' : 'stationary_generic',
        stationaryName ? 0.86 : 0.76,
        stationaryName ? `Detenido en ${stationaryName}` : 'Detenido',
        ['motion_stationary', stationaryName ? 'known_place' : 'place_unknown']
      ));
      if (stationaryMinutes >= 45) {
        const socialVenue = /bar|night_club|restaurant|cafe/i.test(String(type || ''));
        candidates.push(candidate('possible_rest', 'prolonged_stationary_possible_rest', socialVenue ? 0.42 : 0.62, 'Posible descanso', ['stationary_45m'], socialVenue ? ['social_venue'] : []));
      }
    } else {
      candidates.push(candidate(
        method.id === 'unknown' ? 'moving' : method.id,
        method.source === 'mobility-provider' ? 'provider_movement_method_inside_area' : 'inferred_movement_method_inside_area',
        method.confidence,
        movementLabel(method.id, movementName),
        [...method.evidence, movementName ? 'movement_area_context' : 'movement_area_unknown', 'poi_suppressed_while_moving']
      ));
    }

    candidates.sort((a, b) => b.score - a.score);
    const selected = candidates[0] || candidate('unknown', 'fallback_unknown', 0.35, 'Estado desconocido', ['insufficient_evidence']);
    const runnerUp = candidates[1] || null;
    const confidence = Math.max(0, Math.min(1, selected.score));

    return {
      inferenceId: `sit_${now}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: now,
      reason,
      ruleSetVersion: RULE_SET_VERSION,
      selectedState: { id: selected.stateId, label: selected.label, score: selected.score, confidence, ruleId: selected.ruleId },
      candidates,
      evidence: {
        locationAvailable: Boolean(situation.locationAvailable), speedKmh: speed, motion,
        movementMethod: method, movementMetrics: metrics,
        stationaryMinutes: Math.round(stationaryMinutes * 10) / 10,
        placeName: motion === 'stationary' ? stationaryName : movementName,
        placeType: motion === 'stationary' ? type : null,
        movementArea: motion === 'moving' ? movementName : null,
        currentPOIAllowed: motion === 'stationary',
        unavailableSignals: ['accelerometer', 'gyroscope', 'step_counter', 'map_matched_route_type', 'vertical_speed'],
        dayOfWeek: new Date(now).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase(),
        hour: new Date(now).getHours(),
      },
      ambiguity: runnerUp ? Math.max(0, selected.score - runnerUp.score) : (method.ambiguity ?? 1),
    };
  }

  function publish(result) {
    lastResult = result;
    const options = { source: 'situation-engine', kind: 'inferred', confidence: result.selectedState.confidence };
    const method = result.evidence.movementMethod;
    context.set?.('situation.current', result, options);
    context.set?.('mobility.method', method, { source: method.source, kind: 'inferred', confidence: method.confidence });
    context.set?.('mobility.methodId', method.id, { source: method.source, kind: 'inferred', confidence: method.confidence });
    context.set?.('mobility.methodConfidence', method.confidence, { source: method.source, kind: 'derived', confidence: 1 });
    context.set?.('mobility.methodEvidence', method.evidence || [], { source: method.source, kind: 'derived', confidence: method.confidence });
    context.set?.('mobility.methodCandidates', method.candidates || [], { source: method.source, kind: 'derived', confidence: method.confidence });
    context.setContext?.({ status: result.selectedState.label, source: 'situation-engine', confidence: result.selectedState.confidence });
    listeners.forEach((listener) => { try { listener(result); } catch {} });
    window.dispatchEvent(new CustomEvent('wander:situation', { detail: result }));
  }

  engine.subscribeEvaluation((evaluation, reason) => publish(build(evaluation, reason)));

  window.WanderSituationEngine = {
    version: RULE_SET_VERSION,
    evaluate: () => {
      const result = build(engine.getLastEvaluation?.() || engine.evaluate?.(), 'manual');
      publish(result);
      return result;
    },
    getCurrent: () => lastResult,
    subscribe(listener) {
      listeners.add(listener);
      if (lastResult) listener(lastResult);
      return () => listeners.delete(listener);
    },
  };

  publish(build(engine.getLastEvaluation?.() || engine.evaluate?.(), 'init'));
})();
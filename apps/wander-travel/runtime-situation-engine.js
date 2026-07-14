(() => {
  const context = window.WanderContext;
  const engine = window.WanderEngine;
  if (!context || !engine?.subscribeEvaluation) return;

  const RULE_SET_VERSION = '1.3.0';
  const listeners = new Set();
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
    return poi?.primaryType || poi?.type || container?.primaryType || container?.type || null;
  }

  function candidate(id, ruleId, score, label, evidence = [], contradictions = []) {
    return { stateId: id, ruleId, score, label, evidence, contradictions };
  }

  function movementLabel(mode, placeName) {
    const suffix = placeName ? ` por ${placeName}` : '';
    switch (mode) {
      case 'walking':
      case 'on_foot': return `Caminando${suffix}`;
      case 'cycling':
      case 'bicycle':
      case 'bike': return `Andando en bicicleta${suffix}`;
      case 'scooter':
      case 'kick_scooter':
      case 'electric_scooter':
      case 'escooter': return `Andando en monopatín${suffix}`;
      case 'motorcycle':
      case 'motorbike': return `En moto${suffix}`;
      case 'driving':
      case 'car':
      case 'automobile': return `Conduciendo${suffix}`;
      case 'bus':
      case 'train':
      case 'transit':
      case 'public_transport': return `Viajando${suffix}`;
      case 'sailing':
      case 'boating': return placeName ? `Navegando cerca de ${placeName}` : 'Navegando';
      default: return placeName ? `En movimiento por ${placeName}` : 'En movimiento';
    }
  }

  function normalizedMobility(mode, speed) {
    const explicit = String(mode || 'unknown').toLowerCase();
    if (explicit !== 'unknown' && explicit !== 'moving' && explicit !== 'stationary') return explicit;
    if (speed === null) return explicit;
    if (speed > 0.3 && speed <= 7) return 'walking';
    if (speed > 7 && speed <= 12) return 'cycling';
    if (speed > 12) return 'driving';
    return explicit;
  }

  function inferVehicle(mobility, rawMobility) {
    const mode = String(mobility || 'unknown').toLowerCase();
    const explicit = rawMobility && !['unknown', 'moving', 'stationary'].includes(String(rawMobility).toLowerCase());
    const source = explicit ? 'mobility-provider' : 'speed-inference';
    const confidence = explicit ? 0.94 : 0.58;
    const vehicles = {
      cycling: ['bicycle', 'Bicicleta'], bicycle: ['bicycle', 'Bicicleta'], bike: ['bicycle', 'Bicicleta'],
      scooter: ['scooter', 'Monopatín'], kick_scooter: ['scooter', 'Monopatín'], electric_scooter: ['electric_scooter', 'Monopatín eléctrico'], escooter: ['electric_scooter', 'Monopatín eléctrico'],
      motorcycle: ['motorcycle', 'Moto'], motorbike: ['motorcycle', 'Moto'],
      driving: ['car', 'Auto'], car: ['car', 'Auto'], automobile: ['car', 'Auto'],
      bus: ['bus', 'Bus'], train: ['train', 'Tren'], transit: ['public_transport', 'Transporte público'], public_transport: ['public_transport', 'Transporte público'],
      sailing: ['boat', 'Barco'], boating: ['boat', 'Barco'], aircraft: ['aircraft', 'Avión'],
    };
    const match = vehicles[mode];
    if (!match) return null;
    return { type: match[0], label: match[1], confidence, source, inferred: true };
  }

  function explicitMobilitySource(rawMobility) {
    return rawMobility && !['unknown', 'moving', 'stationary'].includes(String(rawMobility).toLowerCase()) ? 'provider' : 'speed_inference';
  }

  function build(evaluation, reason = 'engine') {
    const situation = evaluation?.situation || engine.inferSituation?.() || {};
    const speed = number(situation.speedKmh);
    const rawMobility = String(situation.mobility?.mode || 'unknown');
    const mobility = normalizedMobility(rawMobility, speed);
    const vehicle = inferVehicle(mobility, rawMobility);
    const motion = String(situation.motion?.status || 'pending');
    const stationaryName = stationaryPlaceName();
    const movementName = movementPlaceName();
    const type = placeType();
    const now = Date.now();

    if (motion === 'stationary') {
      if (!stationarySince) stationarySince = now;
    } else stationarySince = null;

    const stationaryMinutes = stationarySince ? Math.max(0, (now - stationarySince) / 60000) : 0;
    const candidates = [];

    if (!situation.locationAvailable) {
      candidates.push(candidate('context_pending', 'location_required', 0.98, 'Preparando contexto', ['location_unavailable']));
    } else {
      if (motion === 'stationary') {
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
      }

      if (motion === 'moving' || (speed !== null && speed > 0.3)) {
        const explicitMobility = rawMobility !== 'unknown' && rawMobility !== 'moving' && rawMobility !== 'stationary';
        const score = explicitMobility ? 0.94 : 0.78;
        const stateId = ['walking', 'on_foot'].includes(mobility) ? 'walking'
          : ['cycling', 'bicycle', 'bike'].includes(mobility) ? 'cycling'
          : ['scooter', 'kick_scooter', 'electric_scooter', 'escooter'].includes(mobility) ? 'scooter'
          : ['motorcycle', 'motorbike'].includes(mobility) ? 'motorcycle'
          : ['driving', 'car', 'automobile'].includes(mobility) ? 'driving'
          : ['sailing', 'boating'].includes(mobility) ? 'sailing'
          : ['bus', 'train', 'transit', 'public_transport'].includes(mobility) ? 'transit'
          : 'moving';
        candidates.push(candidate(
          stateId,
          explicitMobility ? 'provider_mobility_inside_area' : 'speed_inferred_mobility_inside_area',
          score,
          movementLabel(mobility, movementName),
          [explicitMobility ? `provider_${mobility}` : `speed_inferred_${mobility}`, vehicle ? `vehicle_${vehicle.type}` : 'vehicle_unknown', movementName ? 'movement_area_context' : 'movement_area_unknown', 'poi_suppressed_while_moving']
        ));
      }
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
        locationAvailable: Boolean(situation.locationAvailable), speedKmh: speed, mobility,
        mobilitySource: explicitMobilitySource(rawMobility), vehicle, motion,
        stationaryMinutes: Math.round(stationaryMinutes * 10) / 10,
        placeName: motion === 'stationary' ? stationaryName : movementName,
        placeType: motion === 'stationary' ? type : null,
        movementArea: motion === 'moving' ? movementName : null,
        currentPOIAllowed: motion === 'stationary',
        dayOfWeek: new Date(now).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase(),
        hour: new Date(now).getHours(),
      },
      ambiguity: runnerUp ? Math.max(0, selected.score - runnerUp.score) : 1,
    };
  }

  function publish(result) {
    lastResult = result;
    const options = { source: 'situation-engine', kind: 'inferred', confidence: result.selectedState.confidence };
    context.set?.('situation.current', result, options);
    context.set?.('mobility.inferredMode', result.evidence.mobility, { ...options, confidence: result.selectedState.confidence });
    if (result.evidence.vehicle) {
      context.set?.('mobility.vehicle', result.evidence.vehicle, { source: result.evidence.vehicle.source, kind: 'inferred', confidence: result.evidence.vehicle.confidence });
      context.set?.('mobility.vehicleType', result.evidence.vehicle.type, { source: result.evidence.vehicle.source, kind: 'inferred', confidence: result.evidence.vehicle.confidence });
    } else {
      context.remove?.('mobility.vehicle');
      context.remove?.('mobility.vehicleType');
    }
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
(() => {
  const context = window.WanderContext;
  const engine = window.WanderEngine;
  if (!context || !engine?.subscribeEvaluation) return;

  const RULE_SET_VERSION = '1.1.0';
  const listeners = new Set();
  let lastResult = null;
  let stationarySince = null;

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function stationaryPlaceName() {
    const poi = context.value?.('currentPOI.current') || context.value?.('poi.current') || context.value?.('place.currentPOI');
    const container = context.value?.('place.currentContainer') || context.value?.('container.current');
    const place = context.value?.('place.current');
    return poi?.name || container?.name || place?.zone || place?.neighborhood || place?.city || place?.name || null;
  }

  function movementPlaceName() {
    const place = context.value?.('place.current');
    return place?.zone || place?.neighborhood || place?.district || place?.city || place?.region || place?.name || null;
  }

  function placeType() {
    const poi = context.value?.('currentPOI.current') || context.value?.('poi.current') || context.value?.('place.currentPOI');
    const container = context.value?.('place.currentContainer') || context.value?.('container.current');
    return poi?.primaryType || poi?.type || container?.primaryType || container?.type || null;
  }

  function candidate(id, ruleId, score, label, evidence = [], contradictions = []) {
    return { stateId: id, ruleId, score, label, evidence, contradictions };
  }

  function build(evaluation, reason = 'engine') {
    const situation = evaluation?.situation || engine.inferSituation?.() || {};
    const speed = number(situation.speedKmh);
    const mobility = String(situation.mobility?.mode || 'unknown');
    const motion = String(situation.motion?.status || 'pending');
    const stationaryName = stationaryPlaceName();
    const movementName = movementPlaceName();
    const type = placeType();
    const now = Date.now();

    if (motion === 'stationary') {
      if (!stationarySince) stationarySince = now;
    } else {
      stationarySince = null;
    }

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
          candidates.push(candidate(
            'possible_rest',
            'prolonged_stationary_possible_rest',
            socialVenue ? 0.42 : 0.62,
            'Posible descanso',
            ['stationary_45m'],
            socialVenue ? ['social_venue'] : []
          ));
        }
      }

      if (mobility === 'walking' || (speed !== null && speed > 0.3 && speed <= 7)) {
        candidates.push(candidate('walking', 'walking_speed_or_provider', mobility === 'walking' ? 0.93 : 0.78, movementName ? `Caminando por ${movementName}` : 'Caminando', [mobility === 'walking' ? 'provider_walking' : 'walking_speed', 'poi_suppressed_while_moving']));
      }
      if (mobility === 'driving' || (speed !== null && speed > 12 && speed <= 180)) {
        candidates.push(candidate('driving', 'driving_speed_or_provider', mobility === 'driving' ? 0.94 : 0.8, movementName ? `Conduciendo por ${movementName}` : 'Conduciendo', [mobility === 'driving' ? 'provider_driving' : 'driving_speed', 'poi_suppressed_while_moving']));
      }
      if (mobility === 'sailing' || mobility === 'boating') {
        candidates.push(candidate('sailing', 'marine_mobility_provider', 0.95, movementName ? `Navegando cerca de ${movementName}` : 'Navegando', ['provider_marine_mode', 'poi_suppressed_while_moving']));
      }
      if (!candidates.length && motion === 'moving') {
        candidates.push(candidate('moving', 'generic_motion', 0.68, movementName ? `En movimiento por ${movementName}` : 'En movimiento', ['motion_moving', 'poi_suppressed_while_moving']));
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
      selectedState: {
        id: selected.stateId,
        label: selected.label,
        score: selected.score,
        confidence,
        ruleId: selected.ruleId,
      },
      candidates,
      evidence: {
        locationAvailable: Boolean(situation.locationAvailable),
        speedKmh: speed,
        mobility,
        motion,
        stationaryMinutes: Math.round(stationaryMinutes * 10) / 10,
        placeName: motion === 'stationary' ? stationaryName : movementName,
        placeType: motion === 'stationary' ? type : null,
        currentPOIAllowed: motion === 'stationary',
        dayOfWeek: new Date(now).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase(),
        hour: new Date(now).getHours(),
      },
      ambiguity: runnerUp ? Math.max(0, selected.score - runnerUp.score) : 1,
    };
  }

  function publish(result) {
    lastResult = result;
    context.set?.('situation.current', result, { source: 'situation-engine', kind: 'inferred', confidence: result.selectedState.confidence });
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
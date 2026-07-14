(() => {
  const context = window.WanderContext;
  const engine = window.WanderEngine;
  if (!context || !engine?.subscribeEvaluation) return;

  const RULE_SET_VERSION = '1.0.0';
  const listeners = new Set();
  let lastResult = null;
  let stationarySince = null;

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function placeName() {
    const poi = context.value?.('poi.current') || context.value?.('place.currentPOI');
    const container = context.value?.('place.currentContainer') || context.value?.('container.current');
    const place = context.value?.('place.current');
    return poi?.name || container?.name || place?.zone?.name || place?.city?.name || place?.name || null;
  }

  function placeType() {
    const poi = context.value?.('poi.current') || context.value?.('place.currentPOI');
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
    const name = placeName();
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
          name ? 'stationary_at_place' : 'stationary',
          name ? 'stationary_inside_known_place' : 'stationary_generic',
          name ? 0.86 : 0.76,
          name ? `Detenido en ${name}` : 'Detenido',
          ['motion_stationary', name ? 'known_place' : 'place_unknown']
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
        candidates.push(candidate('walking', 'walking_speed_or_provider', mobility === 'walking' ? 0.93 : 0.78, name ? `Caminando por ${name}` : 'Caminando', [mobility === 'walking' ? 'provider_walking' : 'walking_speed']));
      }
      if (mobility === 'driving' || (speed !== null && speed > 12 && speed <= 180)) {
        candidates.push(candidate('driving', 'driving_speed_or_provider', mobility === 'driving' ? 0.94 : 0.8, name ? `Conduciendo por ${name}` : 'Conduciendo', [mobility === 'driving' ? 'provider_driving' : 'driving_speed']));
      }
      if (mobility === 'sailing' || mobility === 'boating') {
        candidates.push(candidate('sailing', 'marine_mobility_provider', 0.95, name ? `Navegando cerca de ${name}` : 'Navegando', ['provider_marine_mode']));
      }
      if (!candidates.length && motion === 'moving') {
        candidates.push(candidate('moving', 'generic_motion', 0.68, name ? `En movimiento por ${name}` : 'En movimiento', ['motion_moving']));
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
        placeName: name,
        placeType: type,
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
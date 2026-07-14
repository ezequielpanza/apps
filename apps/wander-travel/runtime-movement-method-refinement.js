(() => {
  const context = window.WanderContext;
  const situationEngine = window.WanderSituationEngine;
  if (!context || !situationEngine?.subscribe) return;

  const INITIAL_DETECTION_MS = 60 * 1000;
  const MAX_REFINEMENT_MS = 10 * 60 * 1000;
  const samples = [];
  let movingSince = null;

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function label(id) {
    return ({
      stationary: 'Detenido', walking: 'Caminando', running: 'Corriendo', bicycle: 'Bicicleta',
      scooter: 'Monopatín', electric_scooter: 'Monopatín eléctrico', motorcycle: 'Moto', car: 'Auto',
      bus: 'Bus', train: 'Tren', public_transport: 'Transporte público', boat: 'Barco', aircraft: 'Avión',
      unknown: 'Desconocido',
    })[id] || id;
  }

  function addCandidate(candidates, id, score, evidence) {
    const existing = candidates.find((candidate) => candidate.id === id);
    if (existing) {
      if (score > existing.score) {
        existing.score = score;
        existing.evidence = evidence;
      }
      return;
    }
    candidates.push({ id, score, evidence });
  }

  function metrics(now) {
    while (samples.length && now - samples[0].at > MAX_REFINEMENT_MS) samples.shift();
    if (!samples.length) return { durationMs: 0, averageSpeedKmh: 0, maxSpeedKmh: 0, variance: 0, stopCount: 0 };
    const speeds = samples.map((sample) => sample.speed);
    const average = speeds.reduce((sum, value) => sum + value, 0) / speeds.length;
    const variance = speeds.reduce((sum, value) => sum + (value - average) ** 2, 0) / speeds.length;
    let stopCount = 0;
    let stopped = speeds[0] <= 0.8;
    for (let index = 1; index < speeds.length; index += 1) {
      const currentStopped = speeds[index] <= 0.8;
      if (currentStopped && !stopped) stopCount += 1;
      stopped = currentStopped;
    }
    return {
      durationMs: Math.max(0, now - (movingSince || now)),
      averageSpeedKmh: Math.round(average * 10) / 10,
      maxSpeedKmh: Math.round(Math.max(...speeds) * 10) / 10,
      variance: Math.round(variance * 10) / 10,
      stopCount,
    };
  }

  function infer(result, now) {
    const motion = result?.evidence?.motion || context.value('motion.status');
    const speed = finite(result?.evidence?.speedKmh ?? context.value('motion.speedKmh'));
    const provider = result?.evidence?.movementMethod;

    if (motion !== 'moving') {
      movingSince = null;
      samples.length = 0;
      return {
        id: 'stationary', label: 'Detenido', confidence: 0.96, phase: 'stable',
        detectionReady: true, observedDurationMs: 0, source: 'motion-state',
        evidence: ['motion_stationary'], candidates: [{ id: 'stationary', label: 'Detenido', score: 0.96 }],
      };
    }

    if (!movingSince) movingSince = now;
    samples.push({ at: now, speed: speed ?? 0 });

    if (provider?.source === 'mobility-provider') {
      return { ...provider, phase: 'stable', detectionReady: true, observedDurationMs: now - movingSince };
    }

    const observed = metrics(now);
    const candidates = [];
    const average = observed.averageSpeedKmh;
    const maximum = observed.maxSpeedKmh;
    const route = String(context.value('place.type') || '').toLowerCase();

    if (/water|marina|harbour|harbor|river|sea|ocean/.test(route)) addCandidate(candidates, 'boat', 0.88, ['water_context']);
    if (/rail|train|station/.test(route)) addCandidate(candidates, 'train', 0.9, ['rail_context']);
    if (average <= 7 && maximum <= 11) addCandidate(candidates, 'walking', 0.78, ['pedestrian_speed_range']);
    if (average > 7 && average <= 14) {
      addCandidate(candidates, 'bicycle', 0.65, ['micromobility_speed_range']);
      addCandidate(candidates, 'scooter', 0.61, ['micromobility_speed_range']);
      if (observed.stopCount >= 2) addCandidate(candidates, 'electric_scooter', 0.64, ['frequent_short_stops']);
    }
    if (average > 14 && average <= 32) {
      addCandidate(candidates, 'electric_scooter', 0.64, ['urban_micromobility_speed']);
      addCandidate(candidates, 'bicycle', maximum <= 35 ? 0.62 : 0.4, ['urban_micromobility_speed']);
      addCandidate(candidates, 'motorcycle', 0.55, ['motorized_two_wheel_possible']);
      addCandidate(candidates, 'car', 0.52, ['urban_vehicle_possible']);
    }
    if (average > 32 || maximum > 45) {
      addCandidate(candidates, 'car', 0.76, ['road_vehicle_speed']);
      addCandidate(candidates, 'motorcycle', 0.61, ['road_vehicle_speed']);
      addCandidate(candidates, 'bus', observed.stopCount >= 3 ? 0.58 : 0.42, ['repeated_stops']);
    }
    if (maximum > 130) {
      addCandidate(candidates, 'train', 0.64, ['very_high_ground_speed']);
      addCandidate(candidates, 'aircraft', 0.52, ['very_high_speed_without_altitude_confirmation']);
    }
    if (!candidates.length) addCandidate(candidates, 'unknown', 0.45, ['insufficient_classification']);

    candidates.sort((left, right) => right.score - left.score);
    const selected = candidates[0];
    const runnerUp = candidates[1] || null;
    const progress = Math.min(1, observed.durationMs / MAX_REFINEMENT_MS);
    const ready = observed.durationMs >= INITIAL_DETECTION_MS;
    const phase = ready ? (progress >= 1 ? 'stable' : 'refining') : 'preliminary';
    const confidence = Math.min(0.95, Math.max(0.35, selected.score * (ready ? 0.9 : 0.76) + progress * 0.14));
    const refinedCandidates = candidates.slice(0, 4).map((candidate) => ({
      id: candidate.id,
      label: label(candidate.id),
      score: Math.min(0.95, Math.max(0.3, candidate.score * (ready ? 0.9 : 0.76) + progress * 0.14)),
    }));

    return {
      id: selected.id,
      label: label(selected.id),
      confidence,
      phase,
      detectionReady: ready,
      observedDurationMs: observed.durationMs,
      source: 'movement-pattern-refinement',
      evidence: [...selected.evidence, ready ? 'one_minute_observation_complete' : 'collecting_first_minute'],
      candidates: refinedCandidates,
      ambiguity: runnerUp ? Math.max(0, selected.score - runnerUp.score) : 1,
      needsClarification: ready && (selected.id === 'unknown' || (runnerUp && selected.score - runnerUp.score < 0.08)),
      metrics: observed,
    };
  }

  function publish(method) {
    const options = { source: method.source, kind: 'inferred', confidence: method.confidence };
    context.set('mobility.method', method, options);
    context.set('mobility.methodId', method.id, options);
    context.set('mobility.methodConfidence', method.confidence, { ...options, kind: 'derived', confidence: 1 });
    context.set('mobility.methodEvidence', method.evidence || [], { ...options, kind: 'derived' });
    context.set('mobility.methodCandidates', method.candidates || [], { ...options, kind: 'derived' });
    context.set('mobility.methodPhase', method.phase, { ...options, kind: 'derived', confidence: 1 });
    context.set('mobility.methodObservedMs', method.observedDurationMs || 0, { ...options, kind: 'derived', confidence: 1 });
    context.set('mobility.methodDetectionReady', Boolean(method.detectionReady), { ...options, kind: 'derived', confidence: 1 });
  }

  situationEngine.subscribe((result) => publish(infer(result, Date.now())));

  window.WanderMovementMethodRefinement = Object.freeze({
    initialDetectionMs: INITIAL_DETECTION_MS,
    maxRefinementMs: MAX_REFINEMENT_MS,
    getCurrent: () => context.value('mobility.method') || null,
  });
})();
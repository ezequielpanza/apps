(() => {
  if (window.WanderSessionEngine) return;

  const context = window.WanderContext;
  if (!context) return;

  const SESSIONS_KEY = 'wander.sessions.v1';
  const ACTIVE_KEY = 'wander.session.active.v1';
  const SETTINGS_KEY = 'wander.sessions.settings.v1';
  const NIGHT_MIN_MS = 6 * 60 * 60 * 1000;
  const NIGHT_START_HOUR = 21;
  const NIGHT_END_HOUR = 10;
  const MIN_POINT_DISTANCE_M = 3;
  const MAX_ACCURACY_M = 120;
  const listeners = new Set();

  let sessions = loadArray(SESSIONS_KEY);
  let active = loadObject(ACTIVE_KEY);
  if (!active?.id) {
    active = null;
  } else {
    active.segments = Array.isArray(active.segments) ? active.segments : [];
    active.stays = Array.isArray(active.stays) ? active.stays : [];
    active.events = Array.isArray(active.events) ? active.events : [];
    active.status = 'active';
    active.endedAt = null;
    const interruptedMovement = [...active.segments].reverse().find((segment) => segment?.type === 'movement' && !segment.endedAt);
    if (interruptedMovement) {
      const lastPoint = Array.isArray(interruptedMovement.points) ? interruptedMovement.points[interruptedMovement.points.length - 1] : null;
      const recoveredEndAt = Number(lastPoint?.at || active.updatedAt || interruptedMovement.startedAt || Date.now());
      interruptedMovement.endedAt = Math.max(Number(interruptedMovement.startedAt || recoveredEndAt), recoveredEndAt);
      interruptedMovement.recoveredAfterInterruption = true;
    }
  }
  let settings = { autoEnabled: true, ...loadObject(SETTINGS_KEY) };
  let phase = settings.autoEnabled ? 'preparing' : 'disabled';
  let lastMotion = 'pending';
  let lastObservedAt = 0;
  let attachedVehicleId = active?.attachedVehicleId || null;
  let parkedCandidate = active?.parkedCandidate || null;

  function loadArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function loadObject(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  }

  function finite(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function validPosition(position) {
    const lat = finite(position?.lat);
    const lng = finite(position?.lng);
    return lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function makeId(prefix) {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function distanceMeters(a, b) {
    if (!validPosition(a) || !validPosition(b)) return 0;
    const radius = 6371000;
    const p1 = a.lat * Math.PI / 180;
    const p2 = b.lat * Math.PI / 180;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
    return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function currentPosition() {
    const location = context.getEffectiveLocation?.();
    if (!validPosition(location)) return null;
    return {
      lat: Number(location.lat),
      lng: Number(location.lng),
      accuracy: finite(location.accuracy),
      speedKmh: finite(context.value?.('motion.speedKmh')),
      heading: finite(location.heading),
      at: Date.parse(location.updatedAt || '') || Date.now(),
      source: location.source || 'unknown',
    };
  }

  function currentPOI() {
    return context.value?.('personalPOI.current') || context.value?.('currentPOI.current') || null;
  }

  function mobilityMode() {
    return String(context.value?.('mobility.methodId') || context.value?.('mobility.mode') || 'unknown').toLowerCase();
  }

  function isWalkingMode(mode) {
    return ['walking', 'walk', 'on-foot', 'foot', 'caminando'].includes(String(mode || '').toLowerCase());
  }

  function isVehicleMode(mode) {
    return ['car', 'driving', 'boat', 'sailing', 'motorboat', 'cycling', 'bicycle', 'bus', 'train', 'vehicle'].includes(String(mode || '').toLowerCase());
  }

  function persist() {
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      if (active) localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {}
    publishContext();
    listeners.forEach((listener) => { try { listener(snapshot()); } catch {} });
    window.dispatchEvent(new CustomEvent('wander:sessions-changed', { detail: snapshot() }));
  }

  function snapshot() {
    return {
      autoEnabled: Boolean(settings.autoEnabled),
      phase,
      active: clone(active),
      sessions: clone(sessions),
      attachedVehicleId,
    };
  }

  function publishContext() {
    const summary = active ? summarize(active) : null;
    context.set('sessions.autoEnabled', Boolean(settings.autoEnabled), { source: 'session-engine', kind: 'confirmed', confidence: 1 });
    context.set('sessions.phase', phase, { source: 'session-engine', kind: 'derived', confidence: 1 });
    if (summary) context.set('sessions.active', summary, { source: 'session-engine', kind: 'derived', confidence: 1 });
    else context.remove?.('sessions.active');
    context.set('sessions.historyCount', sessions.length, { source: 'session-engine', kind: 'derived', confidence: 1 });
  }

  function movementSegments(session) {
    return (session?.segments || []).filter((segment) => segment.type === 'movement');
  }

  function openMovement(session) {
    const segments = movementSegments(session);
    const segment = segments[segments.length - 1];
    return segment && !segment.endedAt ? segment : null;
  }

  function openStay(session) {
    const stays = session?.stays || [];
    const stay = stays[stays.length - 1];
    return stay && !stay.endedAt ? stay : null;
  }

  function calculateDistance(session) {
    return Math.round(movementSegments(session).reduce((sum, segment) => sum + Number(segment.distanceM || 0), 0));
  }

  function calculateDurations(session, now = Date.now()) {
    const movingDurationMs = movementSegments(session).reduce((sum, segment) => {
      return sum + Math.max(0, Number(segment.endedAt || now) - Number(segment.startedAt || now));
    }, 0);
    const stationaryDurationMs = (session?.stays || []).reduce((sum, stay) => {
      return sum + Math.max(0, Number(stay.endedAt || now) - Number(stay.startedAt || now));
    }, 0);
    return { movingDurationMs, stationaryDurationMs };
  }

  function summarize(session) {
    const durations = calculateDurations(session);
    return {
      id: session.id,
      name: session.name,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt || null,
      phase,
      distanceM: calculateDistance(session),
      movingDurationMs: Math.round(durations.movingDurationMs),
      stationaryDurationMs: Math.round(durations.stationaryDurationMs),
      segmentCount: movementSegments(session).length,
      stayCount: (session.stays || []).length,
      currentStay: clone(openStay(session)),
      closeReason: session.closeReason || null,
    };
  }

  function startSession(position, at = Date.now()) {
    if (active || !settings.autoEnabled || !validPosition(position)) return active;
    active = {
      schemaVersion: 1,
      id: makeId('session'),
      name: `Sesión · ${new Date(at).toLocaleString('es-AR')}`,
      status: 'active',
      startedAt: at,
      endedAt: null,
      closeReason: null,
      startPosition: { lat: position.lat, lng: position.lng },
      endPosition: null,
      segments: [],
      stays: [],
      events: [],
      attachedVehicleId: attachedVehicleId || null,
      parkedCandidate: parkedCandidate || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    return active;
  }

  function createMovement(position, at) {
    if (!active) return null;
    const segment = {
      id: makeId('movement'),
      type: 'movement',
      startedAt: at,
      endedAt: null,
      method: mobilityMode(),
      points: [],
      distanceM: 0,
    };
    active.segments.push(segment);
    addMovementPoint(segment, position, at, true);
    return segment;
  }

  function addMovementPoint(segment, position, at, force = false) {
    if (!segment || !validPosition(position)) return false;
    const accuracy = finite(position.accuracy);
    if (!force && accuracy !== null && accuracy > MAX_ACCURACY_M) return false;
    const point = {
      lat: Number(position.lat.toFixed(7)),
      lng: Number(position.lng.toFixed(7)),
      at,
      accuracy,
      speedKmh: finite(position.speedKmh),
      heading: finite(position.heading),
    };
    const last = segment.points[segment.points.length - 1];
    if (last) {
      const distance = distanceMeters(last, point);
      const elapsedMs = Math.max(1, at - Number(last.at || at));
      const plausibleSpeed = distance / (elapsedMs / 3600000);
      if (!force && distance < MIN_POINT_DISTANCE_M) return false;
      if (!force && elapsedMs < 30000 && plausibleSpeed > 250) return false;
      segment.distanceM = Math.round(Number(segment.distanceM || 0) + distance);
    }
    segment.points.push(point);
    return true;
  }

  function closeMovement(at) {
    const segment = openMovement(active);
    if (!segment) return null;
    segment.endedAt = Math.max(segment.startedAt, at);
    return segment;
  }

  function createStay(position, at) {
    if (!active || !validPosition(position)) return null;
    const poi = currentPOI();
    const stay = {
      id: makeId('stay'),
      type: 'stay',
      startedAt: at,
      endedAt: null,
      center: { lat: position.lat, lng: position.lng },
      radiusM: Math.max(5, finite(position.accuracy) || 10),
      sampleCount: 1,
      poiId: poi?.id || null,
      poiName: poi?.name || poi?.label || null,
      overnightCandidate: Boolean(poi?.overnight),
      overnight: false,
      closesSession: false,
    };
    active.stays.push(stay);
    return stay;
  }

  function updateStay(stay, position) {
    if (!stay || !validPosition(position)) return;
    const accuracy = finite(position.accuracy);
    if (accuracy !== null && accuracy > MAX_ACCURACY_M) return;
    const distance = distanceMeters(stay.center, position);
    const allowance = Math.max(20, Number(stay.radiusM || 10) * 2, (accuracy || 0) * 1.5);
    if (distance > allowance) return;
    const count = Math.max(1, Number(stay.sampleCount || 1));
    stay.center.lat = (stay.center.lat * count + position.lat) / (count + 1);
    stay.center.lng = (stay.center.lng * count + position.lng) / (count + 1);
    stay.sampleCount = count + 1;
    stay.radiusM = Math.max(5, Math.min(100, Math.max(Number(stay.radiusM || 5), distance, accuracy || 0)));
    const poi = currentPOI();
    if (poi) {
      stay.poiId = poi.id || stay.poiId;
      stay.poiName = poi.name || poi.label || stay.poiName;
      stay.overnightCandidate = Boolean(poi.overnight) || stay.overnightCandidate;
    }
  }

  function closeStay(at) {
    const stay = openStay(active);
    if (!stay) return null;
    stay.endedAt = Math.max(stay.startedAt, at);
    return stay;
  }

  function nightOverlapMs(startAt, endAt) {
    let total = 0;
    const firstDay = new Date(startAt);
    firstDay.setHours(0, 0, 0, 0);
    for (let day = firstDay.getTime() - 24 * 60 * 60 * 1000; day <= endAt; day += 24 * 60 * 60 * 1000) {
      const start = new Date(day);
      start.setHours(NIGHT_START_HOUR, 0, 0, 0);
      const end = new Date(day + 24 * 60 * 60 * 1000);
      end.setHours(NIGHT_END_HOUR, 0, 0, 0);
      total += Math.max(0, Math.min(endAt, end.getTime()) - Math.max(startAt, start.getTime()));
    }
    return total;
  }

  function shouldCloseOvernight(stay, now) {
    if (!stay || now - stay.startedAt < NIGHT_MIN_MS) return false;
    if (stay.overnightCandidate) return true;
    return nightOverlapMs(stay.startedAt, now) >= 4 * 60 * 60 * 1000;
  }

  function finishSession(reason = 'manual', effectiveAt = Date.now(), details = {}) {
    if (!active) return null;
    closeMovement(effectiveAt);
    const stay = openStay(active);
    if (stay && reason !== 'overnight') closeStay(effectiveAt);
    if (stay && reason === 'overnight') active.stays = active.stays.filter((item) => item.id !== stay.id);
    active.status = 'closed';
    active.endedAt = Math.max(active.startedAt, effectiveAt);
    active.closeReason = reason;
    active.endPosition = validPosition(details.position) ? { lat: details.position.lat, lng: details.position.lng } : null;
    active.updatedAt = Date.now();
    active.closure = {
      reason,
      effectiveAt: active.endedAt,
      detectedAt: Date.now(),
      poiId: details.poiId || stay?.poiId || null,
      poiName: details.poiName || stay?.poiName || null,
    };
    active.distanceM = calculateDistance(active);
    Object.assign(active, calculateDurations(active, active.endedAt));
    const completed = active;
    sessions.push(completed);
    active = null;
    parkedCandidate = null;
    phase = settings.autoEnabled ? 'waiting' : 'disabled';
    persist();
    return clone(completed);
  }

  function attachVehicleFromPOI(position, at) {
    const poi = currentPOI();
    if (!poi?.vehicle || !poi.id) return;
    attachedVehicleId = poi.id;
    parkedCandidate = null;
    window.WanderPersonalPOIs?.update?.(poi.id, {
      vehicleState: 'with-user', lat: position.lat, lng: position.lng, vehicleUpdatedAt: at,
    }, { silent: true });
    if (active) active.attachedVehicleId = attachedVehicleId;
  }

  function updateAttachedVehicle(position, motion, at) {
    if (!attachedVehicleId || !validPosition(position)) return;
    const mode = mobilityMode();
    if (motion === 'stationary') {
      if (!parkedCandidate) parkedCandidate = { lat: position.lat, lng: position.lng, at };
      window.WanderPersonalPOIs?.update?.(attachedVehicleId, {
        vehicleState: 'parked-candidate', lat: parkedCandidate.lat, lng: parkedCandidate.lng, vehicleUpdatedAt: at,
      }, { silent: true });
      if (active) active.parkedCandidate = parkedCandidate;
      return;
    }

    if (parkedCandidate) {
      const walkedAway = isWalkingMode(mode) && distanceMeters(parkedCandidate, position) >= 15;
      const slowUnknownAway = !isVehicleMode(mode) && distanceMeters(parkedCandidate, position) >= 30 && Number(position.speedKmh || 0) < 10;
      if (walkedAway || slowUnknownAway) {
        window.WanderPersonalPOIs?.update?.(attachedVehicleId, {
          vehicleState: 'parked', lat: parkedCandidate.lat, lng: parkedCandidate.lng, vehicleUpdatedAt: at,
        }, { silent: true });
        attachedVehicleId = null;
        parkedCandidate = null;
        if (active) {
          active.attachedVehicleId = null;
          active.parkedCandidate = null;
        }
        return;
      }
      if (isVehicleMode(mode) || Number(position.speedKmh || 0) >= 10) parkedCandidate = null;
      else return;
    }

    window.WanderPersonalPOIs?.update?.(attachedVehicleId, {
      vehicleState: 'with-user', lat: position.lat, lng: position.lng, vehicleUpdatedAt: at,
    }, { silent: true });
  }

  function observe(reason = 'context') {
    if (!settings.autoEnabled) {
      phase = 'disabled';
      publishContext();
      return;
    }

    const motion = String(context.value?.('motion.status') || 'pending').toLowerCase();
    const position = currentPosition();
    const at = position?.at || Date.now();
    if (!position || motion === 'pending') {
      phase = 'preparing';
      publishContext();
      return;
    }
    if (at === lastObservedAt && reason === 'location') return;
    lastObservedAt = at;

    if (motion === 'moving') {
      if (!active) startSession(position, at);
      const stay = openStay(active);
      if (stay) closeStay(at);
      if (!openMovement(active)) {
        if (lastMotion !== 'moving') attachVehicleFromPOI(position, at);
        createMovement(position, at);
      } else {
        addMovementPoint(openMovement(active), position, at);
      }
      updateAttachedVehicle(position, motion, at);
      phase = 'moving';
    } else if (motion === 'stationary') {
      if (!active) {
        phase = 'waiting';
        updateAttachedVehicle(position, motion, at);
      } else {
        if (openMovement(active)) closeMovement(at);
        const stay = openStay(active) || createStay(position, at);
        updateStay(stay, position);
        updateAttachedVehicle(position, motion, at);
        if (shouldCloseOvernight(stay, Date.now())) {
          phase = 'confirming-overnight';
          finishSession('overnight', stay.startedAt, {
            position: stay.center,
            poiId: stay.poiId,
            poiName: stay.poiName,
          });
          lastMotion = motion;
          return;
        }
        phase = stay && Date.now() - stay.startedAt >= NIGHT_MIN_MS - 30 * 60 * 1000 ? 'confirming-overnight' : 'staying';
      }
    }

    if (active) active.updatedAt = Date.now();
    lastMotion = motion;
    persist();
  }

  function setAutoEnabled(enabled) {
    const next = Boolean(enabled);
    if (next === settings.autoEnabled) return next;
    settings.autoEnabled = next;
    if (!next && active) finishSession('recording-disabled', Date.now(), { position: currentPosition() });
    phase = next ? 'preparing' : 'disabled';
    persist();
    if (next) observe('auto-enabled');
    return next;
  }

  function deleteSession(id) {
    const before = sessions.length;
    sessions = sessions.filter((session) => session.id !== id);
    if (sessions.length !== before) persist();
    return sessions.length !== before;
  }

  function renameSession(id, name) {
    const session = sessions.find((item) => item.id === id) || (active?.id === id ? active : null);
    if (!session || !String(name || '').trim()) return false;
    session.name = String(name).trim();
    session.updatedAt = Date.now();
    persist();
    return true;
  }

  context.subscribe?.((key) => {
    if (typeof key !== 'string') return;
    if (key === 'motion.status' || key === 'mobility.mode' || key === 'mobility.methodId' || key === 'personalPOI.current') observe('state');
    if (key === 'location.effective' || key.startsWith('location.effective.')) observe('location');
  });

  window.setInterval(() => observe('timer'), 15000);
  window.addEventListener('pagehide', () => { if (active) persist(); });

  window.WanderSessionEngine = Object.freeze({
    snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    observe,
    setAutoEnabled,
    isAutoEnabled: () => Boolean(settings.autoEnabled),
    finishSession: (reason = 'manual') => finishSession(reason, Date.now(), { position: currentPosition() }),
    deleteSession,
    renameSession,
    list: () => clone(sessions),
    getActive: () => clone(active),
    policy: Object.freeze({ nightMinMs: NIGHT_MIN_MS, nightStartHour: NIGHT_START_HOUR, nightEndHour: NIGHT_END_HOUR }),
  });

  publishContext();
  observe('startup');
  window.dispatchEvent(new CustomEvent('wander:session-engine-ready', { detail: snapshot() }));
})();

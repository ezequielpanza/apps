(() => {
  const STORAGE_KEY = 'wander.engine.place.v2';
  const LEVELS = ['country', 'city', 'zone'];
  const POLICY = Object.freeze({
    changeStableMs: {
      country: 60000,
      city: 30000,
      zone: 20000,
    },
    resumeGapMs: {
      country: 172800000,
      city: 86400000,
      zone: 21600000,
    },
    maxRecords: {
      country: 200,
      city: 1500,
      zone: 4000,
    },
    maxSeenDays: 60,
    maxContentItems: 5000,
    clarificationTtlMs: 900000,
  });

  const EMPTY = {
    schemaVersion: 2,
    presence: { country: {}, city: {}, zone: {} },
    userPlaces: {},
    content: {},
    active: { country: null, city: null, zone: null },
    candidates: { country: null, city: null, zone: null },
    pendingClarification: null,
  };

  let data = load();
  let persistTimer = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (stored?.schemaVersion === 2) {
        return {
          schemaVersion: 2,
          presence: {
            country: stored.presence?.country || {},
            city: stored.presence?.city || {},
            zone: stored.presence?.zone || {},
          },
          userPlaces: stored.userPlaces || {},
          content: stored.content || {},
          active: {
            country: stored.active?.country || null,
            city: stored.active?.city || null,
            zone: stored.active?.zone || null,
          },
          candidates: {
            country: stored.candidates?.country || null,
            city: stored.candidates?.city || null,
            zone: stored.candidates?.zone || null,
          },
          pendingClarification: stored.pendingClarification || null,
        };
      }
    } catch {}
    return clone(EMPTY);
  }

  function schedulePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(flush, 1200);
  }

  function flush() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  }

  function iso(at) {
    return new Date(at).toISOString();
  }

  function localDayKey(at) {
    const date = new Date(at);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function previousLocalDayKey(at) {
    const date = new Date(at);
    date.setDate(date.getDate() - 1);
    return localDayKey(date.getTime());
  }

  function makeId(prefix, at) {
    return prefix + '_' + at.toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function makeEvent(type, at, payload = {}) {
    return { type, at: iso(at), ...payload };
  }

  function descriptorFor(level, place) {
    if (!place) return null;
    if (level === 'country') {
      return place.countryId ? {
        id: place.countryId,
        name: place.country || null,
        parentId: null,
      } : null;
    }
    if (level === 'city') {
      return place.cityId ? {
        id: place.cityId,
        name: place.city || null,
        parentId: place.regionId || place.countryId || null,
      } : null;
    }
    return place.zoneId ? {
      id: place.zoneId,
      name: place.zone || null,
      parentId: place.cityId || place.regionId || place.countryId || null,
    } : null;
  }

  function basePresence(level, descriptor, at) {
    return {
      id: descriptor.id,
      level,
      name: descriptor.name,
      parentId: descriptor.parentId,
      firstSeenAt: iso(at),
      lastSeenAt: iso(at),
      previousSeenAt: null,
      seenCount: 0,
      seenDays: [],
    };
  }

  function prunePresence(level) {
    const records = data.presence[level];
    const keys = Object.keys(records);
    const limit = POLICY.maxRecords[level];
    if (keys.length <= limit) return;
    keys
      .sort((a, b) => Date.parse(records[a].lastSeenAt || 0) - Date.parse(records[b].lastSeenAt || 0))
      .slice(0, keys.length - limit)
      .forEach((key) => delete records[key]);
  }

  function ensurePresence(level, descriptor, at) {
    let record = data.presence[level][descriptor.id];
    if (!record) {
      record = data.presence[level][descriptor.id] = basePresence(level, descriptor, at);
      prunePresence(level);
    } else {
      record.name = descriptor.name || record.name;
      record.parentId = descriptor.parentId || record.parentId;
    }
    return record;
  }

  function userPlace(placeId) {
    return placeId ? data.userPlaces[placeId] || null : null;
  }

  function presenceStatus(level, record, at, seenTodayBefore, seenYesterday) {
    const explicit = userPlace(record.id);
    if (explicit?.known === true) return 'known';
    if (explicit?.known === false) return 'new_confirmed';
    if (seenTodayBefore || seenYesterday) return 'recent_presence';
    return 'assumed_new';
  }

  function touchPresence(level, descriptor, at) {
    const record = ensurePresence(level, descriptor, at);
    const today = localDayKey(at);
    const yesterday = previousLocalDayKey(at);
    const seenTodayBefore = record.seenDays.includes(today);
    const seenYesterday = record.seenDays.includes(yesterday);
    const previousSeenAt = record.lastSeenAt;

    record.previousSeenAt = record.seenCount > 0 ? previousSeenAt : null;
    record.lastSeenAt = iso(at);
    record.seenCount += 1;
    if (!record.seenDays.includes(today)) record.seenDays.push(today);
    if (record.seenDays.length > POLICY.maxSeenDays) {
      record.seenDays.splice(0, record.seenDays.length - POLICY.maxSeenDays);
    }

    return {
      record,
      status: presenceStatus(level, record, at, seenTodayBefore, seenYesterday),
      seenTodayBefore,
      seenYesterday,
    };
  }

  function openSession(level, descriptor, at, events) {
    const touched = touchPresence(level, descriptor, at);
    const session = {
      id: makeId(level, at),
      level,
      placeId: descriptor.id,
      name: descriptor.name,
      parentId: descriptor.parentId,
      enteredAt: at,
      lastSeenAt: at,
      presenceStatus: touched.status,
    };

    data.active[level] = session;
    data.candidates[level] = null;

    events.push(makeEvent(level + '.entered', at, {
      level,
      placeId: descriptor.id,
      name: descriptor.name,
      parentId: descriptor.parentId,
      presenceStatus: touched.status,
      seenCount: touched.record.seenCount,
      confidence: 0.92,
    }));

    events.push(makeEvent(level + '.' + touched.status, at, {
      level,
      placeId: descriptor.id,
      name: descriptor.name,
      presenceStatus: touched.status,
      previousSeenAt: touched.record.previousSeenAt,
      seenYesterday: touched.seenYesterday,
      knownByUser: userPlace(descriptor.id)?.known ?? null,
      confidence: touched.status === 'known' || touched.status === 'new_confirmed' ? 1 : 0.85,
    }));

    return session;
  }

  function closeSession(level, at, reason, events) {
    const session = data.active[level];
    if (!session) return;
    data.active[level] = null;
    data.candidates[level] = null;
    events.push(makeEvent(level + '.exited', at, {
      level,
      placeId: session.placeId,
      name: session.name,
      durationMs: Math.max(0, at - session.enteredAt),
      reason,
      confidence: 0.9,
    }));
  }

  function recoverExpired(at, events) {
    LEVELS.forEach((level) => {
      const session = data.active[level];
      if (!session) return;
      if (at - session.lastSeenAt > POLICY.resumeGapMs[level]) {
        closeSession(level, session.lastSeenAt, 'observation_gap', events);
      }
    });
  }

  function candidateMatches(candidate, descriptor) {
    return Boolean(candidate && candidate.placeId === (descriptor?.id || null));
  }

  function reconcileLevel(level, descriptor, placeAvailable, at, events) {
    const active = data.active[level];

    if (!active) {
      data.candidates[level] = null;
      if (placeAvailable && descriptor) openSession(level, descriptor, at, events);
      return;
    }

    if (!placeAvailable) return;

    if (descriptor?.id === active.placeId) {
      data.candidates[level] = null;
      active.lastSeenAt = at;
      const record = data.presence[level][active.placeId];
      if (record) record.lastSeenAt = iso(at);
      return;
    }

    const candidate = data.candidates[level];
    if (!candidateMatches(candidate, descriptor)) {
      data.candidates[level] = {
        placeId: descriptor?.id || null,
        descriptor: descriptor ? clone(descriptor) : null,
        startedAt: at,
      };
      return;
    }

    if (at - candidate.startedAt < POLICY.changeStableMs[level]) return;

    closeSession(level, at, descriptor ? 'place_changed' : 'place_unavailable', events);
    if (descriptor) openSession(level, descriptor, at, events);
  }

  function recordSummary(level, record, session, at = Date.now()) {
    if (!record) return null;
    const explicit = userPlace(record.id);
    return {
      level,
      placeId: record.id,
      name: record.name,
      parentId: record.parentId,
      presenceStatus: session?.presenceStatus || presenceStatus(
        level,
        record,
        at,
        record.seenDays.includes(localDayKey(at)),
        record.seenDays.includes(previousLocalDayKey(at)),
      ),
      knownByUser: explicit?.known ?? null,
      userNote: explicit?.note || null,
      firstSeenAt: record.firstSeenAt,
      lastSeenAt: record.lastSeenAt,
      previousSeenAt: record.previousSeenAt,
      seenCount: record.seenCount,
      seenDaysCount: record.seenDays.length,
      seenYesterday: record.seenDays.includes(previousLocalDayKey(at)),
      session: session ? {
        id: session.id,
        enteredAt: iso(session.enteredAt),
        durationMs: Math.max(0, at - session.enteredAt),
      } : null,
    };
  }

  function currentSummary(at = Date.now()) {
    const out = {};
    LEVELS.forEach((level) => {
      const session = data.active[level];
      if (!session) return;
      const record = data.presence[level][session.placeId];
      if (record) out[level] = recordSummary(level, record, session, at);
    });
    return Object.keys(out).length ? out : null;
  }

  function nextCheckAt() {
    const checks = [];
    LEVELS.forEach((level) => {
      const candidate = data.candidates[level];
      if (candidate) checks.push(candidate.startedAt + POLICY.changeStableMs[level]);
    });
    return checks.length ? Math.min(...checks) : null;
  }

  function update({ place, placeStatus } = {}, at = Date.now()) {
    const events = [];
    recoverExpired(at, events);

    const placeAvailable = placeStatus === 'available' && Boolean(place);
    LEVELS.forEach((level) => {
      reconcileLevel(level, descriptorFor(level, place), placeAvailable, at, events);
    });

    if (data.pendingClarification && at > data.pendingClarification.expiresAt) {
      data.pendingClarification = null;
    }

    schedulePersist();
    return {
      events,
      current: currentSummary(at),
      pendingClarification: data.pendingClarification ? clone(data.pendingClarification) : null,
      nextCheckAt: nextCheckAt(),
    };
  }

  function setPlaceFamiliarity({ placeId, level = null, name = null, known, note = null } = {}, at = Date.now()) {
    if (!placeId || typeof known !== 'boolean') return null;
    data.userPlaces[placeId] = {
      placeId,
      level,
      name,
      known,
      note: note || null,
      source: 'user',
      updatedAt: iso(at),
      confidence: 1,
    };

    LEVELS.forEach((candidateLevel) => {
      const session = data.active[candidateLevel];
      if (session?.placeId === placeId) {
        session.presenceStatus = known ? 'known' : 'new_confirmed';
      }
    });

    if (data.pendingClarification?.placeId === placeId) data.pendingClarification = null;
    schedulePersist();
    return clone(data.userPlaces[placeId]);
  }

  function mostSpecificCurrent() {
    const current = currentSummary();
    return current?.city || current?.zone || current?.country || null;
  }

  function requestClarification({ level = null, placeId = null, name = null, question = null } = {}, at = Date.now()) {
    const current = mostSpecificCurrent();
    const target = placeId ? { level, placeId, name } : current;
    if (!target?.placeId) return null;

    data.pendingClarification = {
      type: 'place_familiarity',
      level: target.level,
      placeId: target.placeId,
      name: target.name,
      question: question || ('¿Ya conocías ' + (target.name || 'este lugar') + '?'),
      askedAt: iso(at),
      expiresAt: at + POLICY.clarificationTtlMs,
    };
    schedulePersist();
    return clone(data.pendingClarification);
  }

  function normalizeText(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function classifyFamiliarityMessage(text) {
    const normalized = normalizeText(text);
    if (!normalized) return null;

    const knownPatterns = [
      /\bya lo conozco\b/,
      /\bya conozco\b/,
      /\bconozco (bien )?(este|esta|el|la)?\s*(lugar|ciudad|zona)?\b/,
      /\bestuve (aca|aqui) antes\b/,
      /\bvine antes\b/,
      /\bya estuve\b/,
      /\bvivi (aca|aqui)\b/,
    ];
    const newPatterns = [
      /\bnunca estuve\b/,
      /\bes mi primera vez\b/,
      /\bprimera vez (aca|aqui)\b/,
      /\bno lo conozco\b/,
      /\bno conozco (este|esta|el|la)?\s*(lugar|ciudad|zona)?\b/,
      /\bes nuevo para mi\b/,
    ];

    if (knownPatterns.some((pattern) => pattern.test(normalized))) return true;
    if (newPatterns.some((pattern) => pattern.test(normalized))) return false;
    return null;
  }

  function handleUserMessage(text, at = Date.now()) {
    const known = classifyFamiliarityMessage(text);
    if (known === null) return { handled: false };

    const pending = data.pendingClarification;
    const current = mostSpecificCurrent();
    const target = pending || current;
    if (!target?.placeId) return { handled: false };

    const record = setPlaceFamiliarity({
      placeId: target.placeId,
      level: target.level,
      name: target.name,
      known,
      note: String(text || '').trim(),
    }, at);

    return {
      handled: true,
      type: 'place_familiarity',
      known,
      placeId: target.placeId,
      level: target.level,
      name: target.name,
      record,
      message: known
        ? 'Entendido. Voy a tratar ' + (target.name || 'este lugar') + ' como conocido, sin dejar de contarte cosas nuevas.'
        : 'Entendido. Voy a tratar ' + (target.name || 'este lugar') + ' como nuevo para vos.',
    };
  }

  function pruneContent() {
    const entries = Object.entries(data.content);
    if (entries.length <= POLICY.maxContentItems) return;
    entries
      .sort((a, b) => Date.parse(a[1]?.lastToldAt || a[1]?.firstToldAt || 0) - Date.parse(b[1]?.lastToldAt || b[1]?.firstToldAt || 0))
      .slice(0, entries.length - POLICY.maxContentItems)
      .forEach(([key]) => delete data.content[key]);
  }

  function rememberContent({ contentId, placeId = null, topic = null, userKnewIt = null, interest = null } = {}, at = Date.now()) {
    if (!contentId) return null;
    const previous = data.content[contentId];
    data.content[contentId] = {
      contentId,
      placeId: placeId ?? previous?.placeId ?? null,
      topic: topic ?? previous?.topic ?? null,
      firstToldAt: previous?.firstToldAt || iso(at),
      lastToldAt: iso(at),
      tellCount: (previous?.tellCount || 0) + 1,
      userKnewIt: userKnewIt ?? previous?.userKnewIt ?? null,
      interest: interest ?? previous?.interest ?? null,
    };
    pruneContent();
    schedulePersist();
    return clone(data.content[contentId]);
  }

  function updateContentFeedback(contentId, { userKnewIt = undefined, interest = undefined } = {}) {
    const record = data.content[contentId];
    if (!record) return null;
    if (userKnewIt !== undefined) record.userKnewIt = userKnewIt;
    if (interest !== undefined) record.interest = interest;
    schedulePersist();
    return clone(record);
  }

  function hasToldContent(contentId) {
    return Boolean(contentId && data.content[contentId]);
  }

  function snapshot() {
    return clone(data);
  }

  function getCurrentSummary() {
    return currentSummary();
  }

  function getRecord(level, placeId) {
    const record = data.presence?.[level]?.[placeId];
    if (!record) return null;
    return {
      ...clone(record),
      user: userPlace(placeId) ? clone(userPlace(placeId)) : null,
    };
  }

  function getContentRecord(contentId) {
    const record = data.content[contentId];
    return record ? clone(record) : null;
  }

  function reset() {
    data = clone(EMPTY);
    flush();
  }

  window.addEventListener('pagehide', flush);
  window.WanderEnginePlace = {
    policy: POLICY,
    update,
    snapshot,
    getCurrentSummary,
    getRecord,
    setPlaceFamiliarity,
    requestClarification,
    handleUserMessage,
    rememberContent,
    updateContentFeedback,
    hasToldContent,
    getContentRecord,
    reset,
    flush,
  };
})();

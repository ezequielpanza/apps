(() => {
  if (window.WanderTravelLog) return;

  const ENTRY_KEY = 'wander.travelLog.entries.v1';
  const PLAN_KEY = 'wander.travelLog.plans.v1';
  const MAX_ENTRIES = 1800;
  const MAX_RECENT_CHANGES = 80;
  const CONTEXT_WINDOW_MS = 5 * 60 * 1000;
  const listeners = new Set();
  const previousContext = new Map();
  let recentChanges = [];
  let sessionBaselineReady = false;
  let lastActiveSessionId = null;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function readArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function saveArray(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function makeId(prefix) {
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `${prefix}-${random}`;
  }

  function timestamp(value = Date.now()) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
  }

  function dayKey(value = Date.now()) {
    const date = value instanceof Date ? value : new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function normalizeEntry(raw = {}) {
    return {
      id: String(raw.id || makeId('log')),
      kind: String(raw.kind || 'memory'),
      title: String(raw.title || 'Bitácora'),
      summary: String(raw.summary || ''),
      at: timestamp(raw.at || Date.now()),
      day: raw.day || dayKey(raw.at || Date.now()),
      source: String(raw.source || 'wander'),
      status: String(raw.status || 'recorded'),
      sessionId: raw.sessionId || null,
      poiId: raw.poiId || null,
      interactionId: raw.interactionId || null,
      planId: raw.planId || null,
      placeName: raw.placeName || null,
      contextChanges: Array.isArray(raw.contextChanges) ? clone(raw.contextChanges).slice(-20) : [],
      metadata: raw.metadata && typeof raw.metadata === 'object' ? clone(raw.metadata) : {},
      dedupeKey: raw.dedupeKey || null,
    };
  }

  function normalizePlan(raw = {}) {
    const scheduledAt = raw.scheduledAt ? timestamp(raw.scheduledAt) : null;
    return {
      id: String(raw.id || makeId('plan')),
      title: String(raw.title || 'Plan pendiente').trim() || 'Plan pendiente',
      notes: String(raw.notes || '').trim(),
      status: ['suggested', 'planned', 'confirmed', 'completed', 'cancelled', 'postponed'].includes(raw.status) ? raw.status : 'planned',
      scheduledAt,
      day: raw.day || (scheduledAt ? dayKey(scheduledAt) : null),
      placeName: raw.placeName || null,
      poiId: raw.poiId || null,
      sessionId: raw.sessionId || null,
      interactionId: raw.interactionId || null,
      createdAt: timestamp(raw.createdAt || Date.now()),
      updatedAt: timestamp(raw.updatedAt || Date.now()),
      source: String(raw.source || 'user'),
      metadata: raw.metadata && typeof raw.metadata === 'object' ? clone(raw.metadata) : {},
    };
  }

  let entries = readArray(ENTRY_KEY).map(normalizeEntry).slice(-MAX_ENTRIES);
  let plans = readArray(PLAN_KEY).map(normalizePlan);

  function persist() {
    saveArray(ENTRY_KEY, entries.slice(-MAX_ENTRIES));
    saveArray(PLAN_KEY, plans);
  }

  function notify(type, detail = {}) {
    const event = { type, ...clone(detail) };
    listeners.forEach((listener) => { try { listener(event); } catch {} });
    window.dispatchEvent(new CustomEvent('wander:travel-log-change', { detail: event }));
  }

  function activeSessionId() {
    return window.WanderSessionEngine?.getActive?.()?.id || null;
  }

  function currentPOI() {
    return window.WanderContext?.value?.('personalPOI.current')
      || window.WanderContext?.value?.('currentPOI.current')
      || null;
  }

  function addEntry(input = {}) {
    const now = Date.now();
    const dedupeKey = input.dedupeKey || null;
    const dedupeWindowMs = Math.max(0, Number(input.dedupeWindowMs) || 0);
    if (dedupeKey && dedupeWindowMs) {
      const duplicate = [...entries].reverse().find((entry) => entry.dedupeKey === dedupeKey && now - Date.parse(entry.at) <= dedupeWindowMs);
      if (duplicate) return clone(duplicate);
    }
    const poi = currentPOI();
    const entry = normalizeEntry({
      ...input,
      at: input.at || now,
      sessionId: input.sessionId ?? activeSessionId(),
      poiId: input.poiId ?? poi?.id ?? null,
      placeName: input.placeName ?? poi?.name ?? poi?.label ?? null,
      dedupeKey,
    });
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    persist();
    notify('entry-added', { entry });
    return clone(entry);
  }

  function addPlan(input = {}) {
    const plan = normalizePlan({
      ...input,
      sessionId: input.sessionId ?? activeSessionId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    plans.push(plan);
    persist();
    addEntry({
      kind: 'plan',
      title: plan.status === 'suggested' ? 'Sugerencia guardada' : 'Plan agregado',
      summary: plan.title,
      source: plan.source,
      planId: plan.id,
      poiId: plan.poiId,
      interactionId: plan.interactionId,
      placeName: plan.placeName,
      metadata: { scheduledAt: plan.scheduledAt, status: plan.status },
    });
    notify('plan-added', { plan });
    return clone(plan);
  }

  function updatePlan(id, changes = {}) {
    const plan = plans.find((candidate) => candidate.id === id);
    if (!plan) return null;
    const previousStatus = plan.status;
    Object.assign(plan, normalizePlan({ ...plan, ...changes, id: plan.id, createdAt: plan.createdAt, updatedAt: Date.now() }));
    persist();
    if (previousStatus !== plan.status) {
      const labels = {
        completed: 'Actividad realizada',
        cancelled: 'Plan cancelado',
        postponed: 'Plan pospuesto',
        confirmed: 'Plan confirmado',
        planned: 'Plan actualizado',
        suggested: 'Sugerencia pendiente',
      };
      addEntry({
        kind: 'plan',
        title: labels[plan.status] || 'Plan actualizado',
        summary: plan.title,
        source: 'user',
        planId: plan.id,
        poiId: plan.poiId,
        placeName: plan.placeName,
        metadata: { previousStatus, status: plan.status, scheduledAt: plan.scheduledAt },
      });
    }
    notify('plan-updated', { plan });
    return clone(plan);
  }

  function removePlan(id) {
    const index = plans.findIndex((plan) => plan.id === id);
    if (index < 0) return false;
    const [plan] = plans.splice(index, 1);
    persist();
    notify('plan-removed', { plan });
    return true;
  }

  function addNote(summary, options = {}) {
    const text = String(summary || '').trim();
    if (!text) return null;
    return addEntry({ kind: 'note', title: options.title || 'Nota', summary: text, source: 'user', ...options });
  }

  function valueSignature(value) {
    if (value == null) return 'null';
    try { return JSON.stringify(value); } catch { return String(value); }
  }

  function compactValue(value) {
    if (value == null) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return { count: value.length };
    const output = {};
    ['id', 'name', 'label', 'type', 'status', 'mode', 'methodId', 'event', 'reason', 'distanceM', 'temperatureC'].forEach((key) => {
      if (value[key] !== undefined && value[key] !== null) output[key] = value[key];
    });
    return Object.keys(output).length ? output : null;
  }

  function contextNarrative(key, before, after) {
    if (key === 'motion.status') {
      if (after === 'moving') return { kind: 'context', title: 'En movimiento', summary: 'Wander detectó que comenzó un desplazamiento.' };
      if (after === 'stationary') return { kind: 'context', title: 'Permanencia', summary: 'Wander detectó que se detuvieron.' };
    }
    if (key === 'mobility.mode' || key === 'mobility.methodId') {
      if (after) return { kind: 'context', title: 'Forma de desplazamiento', summary: `Wander interpretó el movimiento como ${String(after)}.` };
    }
    if (key === 'place.city' && after && after !== before) {
      return { kind: 'place', title: 'Nueva ciudad', summary: `Llegaron a ${String(after)}.`, placeName: String(after) };
    }
    if (key === 'currentPOI.current' || key === 'personalPOI.current' || key === 'history.currentPlace') {
      const previousName = before?.name || before?.label || null;
      const nextName = after?.name || after?.label || null;
      if (nextName && nextName !== previousName) return { kind: 'place', title: 'Llegada', summary: `Llegaron a ${nextName}.`, placeName: nextName, poiId: after?.id || null };
      if (!nextName && previousName) return { kind: 'place', title: 'Salida', summary: `Salieron de ${previousName}.`, placeName: previousName, poiId: before?.id || null };
    }
    if (key === 'environment.weatherStatus' && after && after !== before) {
      return { kind: 'weather', title: 'Cambio de clima', summary: String(after) };
    }
    if (key === 'journey.event' || key === 'situation.placeEvent') {
      const label = after?.label || after?.name || after?.event || after?.type || null;
      if (label) return { kind: 'context', title: 'Cambio de situación', summary: String(label), placeName: after?.placeName || null, poiId: after?.poiId || null };
    }
    return null;
  }

  const SIGNIFICANT_KEYS = new Set([
    'motion.status',
    'mobility.mode',
    'mobility.methodId',
    'place.city',
    'place.zone',
    'currentPOI.current',
    'personalPOI.current',
    'history.currentPlace',
    'environment.weatherStatus',
    'environment.temperatureC',
    'journey.event',
    'situation.placeEvent',
  ]);

  function trackContext(key, entry) {
    if (!SIGNIFICANT_KEYS.has(key)) return;
    const after = entry?.value ?? null;
    const signature = valueSignature(after);
    if (!previousContext.has(key)) {
      previousContext.set(key, { signature, value: clone(after) });
      return;
    }
    const previous = previousContext.get(key);
    if (previous.signature === signature) return;
    previousContext.set(key, { signature, value: clone(after) });
    const change = {
      key,
      before: compactValue(previous.value),
      after: compactValue(after),
      source: entry?.source || null,
      kind: entry?.kind || null,
      confidence: entry?.confidence ?? null,
      at: new Date().toISOString(),
    };
    recentChanges.push(change);
    const cutoff = Date.now() - 10 * 60 * 1000;
    recentChanges = recentChanges.filter((item) => Date.parse(item.at) >= cutoff).slice(-MAX_RECENT_CHANGES);

    const narrative = contextNarrative(key, previous.value, after);
    if (!narrative) return;
    addEntry({
      ...narrative,
      source: 'context',
      contextChanges: [change],
      dedupeKey: `${narrative.title}:${narrative.summary}`,
      dedupeWindowMs: 90 * 1000,
    });
  }

  function contextForInteraction() {
    const cutoff = Date.now() - CONTEXT_WINDOW_MS;
    return recentChanges.filter((change) => Date.parse(change.at) >= cutoff).slice(-12);
  }

  function interactionChanged(event) {
    const detail = event?.detail || {};
    if (detail.type === 'presented' && detail.interaction) {
      const interaction = detail.interaction;
      addEntry({
        kind: 'conversation',
        title: interaction.title || 'Wander',
        summary: interaction.message || '',
        source: 'wander',
        interactionId: interaction.id,
        poiId: interaction.poiId,
        placeName: interaction.placeName,
        contextChanges: contextForInteraction(),
        metadata: {
          reason: interaction.reason,
          channel: interaction.channel,
          interactionType: interaction.type,
          priority: interaction.priority,
        },
        dedupeKey: `interaction:${interaction.id}`,
        dedupeWindowMs: 24 * 60 * 60 * 1000,
      });
      return;
    }
    if (detail.type === 'response' && detail.response) {
      const response = detail.response;
      addEntry({
        kind: 'decision',
        title: 'Tu respuesta',
        summary: response.label || response.responseId || 'Respuesta registrada',
        source: 'user',
        interactionId: response.interactionId,
        poiId: response.poiId,
        metadata: { responseType: response.responseType, value: response.value },
      });
      return;
    }
    if (detail.type === 'completed' && detail.interaction) {
      const interaction = detail.interaction;
      addEntry({
        kind: 'conversation-status',
        title: 'Interacción cerrada',
        summary: interaction.status || 'completed',
        source: 'wander',
        interactionId: interaction.id,
        metadata: { status: interaction.status },
        dedupeKey: `interaction-complete:${interaction.id}:${interaction.status}`,
        dedupeWindowMs: 24 * 60 * 60 * 1000,
      });
    }
  }

  function sessionsChanged(event) {
    const state = event?.detail || window.WanderSessionEngine?.snapshot?.() || null;
    if (!state) return;
    const activeId = state.active?.id || null;
    if (!sessionBaselineReady) {
      sessionBaselineReady = true;
      lastActiveSessionId = activeId;
      return;
    }
    if (activeId && activeId !== lastActiveSessionId) {
      addEntry({
        kind: 'session-link',
        title: 'Comenzó un recorrido',
        summary: state.active?.name || 'Wander inició una nueva sesión técnica.',
        source: 'session-engine',
        sessionId: activeId,
        metadata: { status: 'active' },
        dedupeKey: `session-start:${activeId}`,
        dedupeWindowMs: 24 * 60 * 60 * 1000,
      });
    }
    if (lastActiveSessionId && !activeId) {
      const completed = (state.sessions || []).find((session) => session.id === lastActiveSessionId);
      if (completed) {
        const distance = Math.max(0, Math.round(Number(completed.distanceM) || 0));
        addEntry({
          kind: 'session-link',
          title: 'Recorrido finalizado',
          summary: `${completed.name || 'Sesión'} · ${distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${distance} m`}.`,
          source: 'session-engine',
          sessionId: completed.id,
          metadata: { status: completed.status, closeReason: completed.closeReason, startedAt: completed.startedAt, endedAt: completed.endedAt },
          dedupeKey: `session-end:${completed.id}`,
          dedupeWindowMs: 24 * 60 * 60 * 1000,
        });
      }
    }
    lastActiveSessionId = activeId;
  }

  function entriesForDay(value = Date.now()) {
    const key = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : dayKey(value);
    return entries.filter((entry) => entry.day === key).map(clone);
  }

  function plansForDay(value = Date.now()) {
    const key = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : dayKey(value);
    return plans.filter((plan) => plan.day === key).map(clone);
  }

  window.WanderContext?.subscribe?.((key, entry) => trackContext(key, entry));
  window.addEventListener('wander:interaction-change', interactionChanged);
  window.addEventListener('wander:sessions-changed', sessionsChanged);
  window.addEventListener('wander:session-engine-ready', (event) => sessionsChanged({ detail: event.detail }));

  window.WanderTravelLog = Object.freeze({
    addEntry,
    addNote,
    addPlan,
    updatePlan,
    removePlan,
    entriesForDay,
    plansForDay,
    listEntries: () => entries.map(clone),
    listPlans: () => plans.map(clone),
    contextForInteraction,
    dayKey,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    constants: { ENTRY_KEY, PLAN_KEY, MAX_ENTRIES, CONTEXT_WINDOW_MS },
  });

  window.dispatchEvent(new CustomEvent('wander:travel-log-ready', {
    detail: { entries: entries.length, plans: plans.length },
  }));
})();

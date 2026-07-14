(() => {
  const situationEngine = window.WanderSituationEngine;
  const context = window.WanderContext;
  if (!situationEngine || !context) return;

  const STORAGE_KEY = 'wander.ruleChecker.v1';
  const MAX_EVENTS = 5000;
  const MAX_CASES = 1000;
  const LOW_CONFIDENCE = 0.65;
  const CLOSE_GAP = 0.08;
  const QUESTION_COOLDOWN_MS = 6 * 60 * 60 * 1000;
  const MIN_STATIONARY_FOR_REST_QUESTION = 45;

  const state = load();
  let activeQuestion = null;

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        events: Array.isArray(parsed.events) ? parsed.events : [],
        cases: Array.isArray(parsed.cases) ? parsed.cases : [],
        lastQuestionAt: Number(parsed.lastQuestionAt) || 0,
        decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      };
    } catch {
      return { events: [], cases: [], lastQuestionAt: 0, decisions: [] };
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }

  function id(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function log(type, payload = {}) {
    const event = { eventId: id('rcl'), type, timestamp: Date.now(), ...payload };
    state.events.push(event);
    if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
    persist();
    renderTechnical();
    return event;
  }

  function findCase(caseId) {
    return state.cases.find((entry) => entry.caseId === caseId) || null;
  }

  function createCase(result, reasons) {
    const existing = state.cases.find((entry) => entry.inferenceId === result.inferenceId);
    if (existing) return existing;
    const item = {
      caseId: id('case'),
      inferenceId: result.inferenceId,
      createdAt: Date.now(),
      reasons,
      selectedState: result.selectedState,
      candidates: result.candidates,
      evidence: result.evidence,
      ruleSetVersion: result.ruleSetVersion,
      clarification: null,
      learningStatus: 'unresolved',
    };
    state.cases.push(item);
    if (state.cases.length > MAX_CASES) state.cases.splice(0, state.cases.length - MAX_CASES);
    persist();
    log('uncertain_case', { caseId: item.caseId, reasons, selectedState: result.selectedState.id });
    return item;
  }

  function audit(result) {
    const reasons = [];
    if (result.selectedState.confidence < LOW_CONFIDENCE) reasons.push('low_confidence');
    if (result.candidates.length > 1 && result.ambiguity < CLOSE_GAP) reasons.push('close_candidate_scores');
    if (result.selectedState.id === 'unknown') reasons.push('unknown_state');
    if ((result.selectedState.contradictions || []).length) reasons.push('contradictory_evidence');
    return reasons;
  }

  function questionFor(result) {
    if (result.selectedState.id === 'possible_rest') {
      return {
        text: `Detecté que el teléfono permaneció prácticamente inmóvil durante ${Math.round(result.evidence.stationaryMinutes)} minutos. ¿Estabas descansando o durmiendo?`,
        answers: [
          ['confirmed', 'Sí, estaba durmiendo'],
          ['resting_awake', 'Descansaba, pero estaba despierto'],
          ['doing_something_else', 'No, hacía otra cosa'],
          ['device_left_behind', 'El celular quedó quieto'],
          ['device_unavailable', 'Estaba apagado o sin batería'],
          ['later', 'Preguntarme después'],
        ],
      };
    }
    const second = result.candidates[1];
    return {
      text: second
        ? `Wander no está completamente seguro: interpretó “${result.selectedState.label}”, pero también podría ser “${second.label}”. ¿Cuál se acerca más?`
        : `Wander interpretó “${result.selectedState.label}”. ¿Es correcto?`,
      answers: [
        ['confirmed', 'Sí'],
        ['rejected', 'No'],
        ['doing_something_else', 'Estaba haciendo otra cosa'],
        ['later', 'Preguntarme después'],
      ],
    };
  }

  function shouldAsk(result, caseItem) {
    if (!caseItem || caseItem.clarification) return false;
    if (Date.now() - state.lastQuestionAt < QUESTION_COOLDOWN_MS) return false;
    if (result.selectedState.id === 'driving' || result.selectedState.id === 'sailing') return false;
    if (result.selectedState.id === 'possible_rest' && result.evidence.stationaryMinutes < MIN_STATIONARY_FOR_REST_QUESTION) return false;
    return caseItem.reasons.includes('low_confidence') || caseItem.reasons.includes('close_candidate_scores') || result.selectedState.id === 'possible_rest';
  }

  function ensureQuestionUI() {
    let panel = document.querySelector('#rule-checker-question');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'rule-checker-question';
    panel.className = 'rule-checker-question';
    panel.hidden = true;
    panel.innerHTML = '<div class="rule-checker-question-card"><span class="rule-checker-kicker">Wander necesita confirmar algo</span><p data-rule-question></p><div class="rule-checker-answers" data-rule-answers></div></div>';
    document.body.appendChild(panel);
    return panel;
  }

  function showQuestion(caseItem, result) {
    const question = questionFor(result);
    const panel = ensureQuestionUI();
    const text = panel.querySelector('[data-rule-question]');
    const answers = panel.querySelector('[data-rule-answers]');
    if (!text || !answers) return;
    activeQuestion = { caseId: caseItem.caseId, result };
    text.textContent = question.text;
    answers.innerHTML = '';
    question.answers.forEach(([value, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => answer(value));
      answers.appendChild(button);
    });
    panel.hidden = false;
    state.lastQuestionAt = Date.now();
    persist();
    log('clarification_asked', { caseId: caseItem.caseId, question: question.text });
  }

  function answer(response, correctedState = null) {
    if (!activeQuestion) return false;
    const item = findCase(activeQuestion.caseId);
    if (!item) return false;
    const now = Date.now();
    const responseMap = {
      confirmed: { accepted: true, label: 'positive_label' },
      rejected: { accepted: false, label: 'negative_label' },
      resting_awake: { accepted: false, label: 'corrected_label', correctedState: 'resting_awake' },
      doing_something_else: { accepted: false, label: 'negative_label', correctedState: correctedState || 'other_activity' },
      device_left_behind: { accepted: false, label: 'labeled_exception', exception: 'device_left_behind' },
      device_unavailable: { accepted: false, label: 'labeled_exception', exception: 'device_unavailable' },
      later: { accepted: null, label: 'deferred' },
    };
    const mapped = responseMap[response] || responseMap.rejected;
    item.clarification = {
      askedAt: state.lastQuestionAt,
      answeredAt: now,
      response,
      source: 'user',
      ...mapped,
    };
    item.learningStatus = mapped.label;
    state.decisions.push({
      decisionId: id('decision'),
      caseId: item.caseId,
      at: now,
      hypothesis: item.selectedState.id,
      response,
      correctedState: mapped.correctedState || null,
      exception: mapped.exception || null,
    });
    persist();
    log('user_correction', { caseId: item.caseId, response, correctedState: mapped.correctedState || null, exception: mapped.exception || null });
    const panel = ensureQuestionUI();
    panel.hidden = true;
    activeQuestion = null;
    return true;
  }

  function inspect(result) {
    log('rule_evaluation', {
      inferenceId: result.inferenceId,
      selectedState: result.selectedState.id,
      selectedRule: result.selectedState.ruleId,
      confidence: result.selectedState.confidence,
      candidates: result.candidates.map((entry) => ({ stateId: entry.stateId, ruleId: entry.ruleId, score: entry.score })),
    });
    const reasons = audit(result);
    if (!reasons.length) return;
    const item = createCase(result, reasons);
    if (shouldAsk(result, item)) showQuestion(item, result);
  }

  function renderTechnical() {
    const host = document.querySelector('#context-technical');
    if (!host) return;
    let block = host.querySelector('[data-rule-checker-summary]');
    if (!block) {
      block = document.createElement('div');
      block.dataset.ruleCheckerSummary = 'true';
      block.className = 'rule-checker-summary';
      host.appendChild(block);
    }
    const current = situationEngine.getCurrent?.();
    const unresolved = state.cases.filter((entry) => entry.learningStatus === 'unresolved').length;
    const labeled = state.cases.filter((entry) => entry.learningStatus !== 'unresolved').length;
    block.innerHTML = `<span>Rule Checker</span><strong>${current?.selectedState?.label || 'Sin inferencia'}</strong><small>Confianza ${Math.round((current?.selectedState?.confidence || 0) * 100)}% · ${unresolved} dudas · ${labeled} casos etiquetados</small>`;
  }

  function exportLearningHistory() {
    const payload = {
      exportedAt: new Date().toISOString(),
      ruleSetVersion: situationEngine.version,
      cases: state.cases,
      decisions: state.decisions,
      recentEvents: state.events.slice(-500),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `wander-rule-checker-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return payload;
  }

  situationEngine.subscribe(inspect);
  window.addEventListener('wander:app-ready', renderTechnical);
  setTimeout(renderTechnical, 1000);

  window.WanderRuleChecker = {
    inspect,
    answer,
    log,
    getEvents: () => [...state.events],
    getCases: () => [...state.cases],
    getDecisions: () => [...state.decisions],
    getCurrentQuestion: () => activeQuestion,
    exportLearningHistory,
    clear() {
      state.events.length = 0;
      state.cases.length = 0;
      state.decisions.length = 0;
      state.lastQuestionAt = 0;
      persist();
      renderTechnical();
    },
  };
})();
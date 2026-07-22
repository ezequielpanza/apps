(() => {
  const core = window.WanderInteractionCore;
  const engine = window.WanderEngine;
  const historyList = document.querySelector('#companion-history-list');
  const decisionBox = document.querySelector('#companion-decision');
  const profileBox = document.querySelector('#companion-profile-summary');
  if (!core || !historyList || !decisionBox || !profileBox) return;

  let renderToken = 0;
  let focusId = null;
  let focusTimer = null;

  function timeLabel(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  function readableReason(reason) {
    const labels = {
      stable_place_context: 'El lugar se mantuvo estable',
      nearby_contextual_option: 'Encontró una opción relevante cerca',
      user_requested_alternative: 'Pediste otra opción',
      intervention_cooldown: 'Está esperando para no interrumpir demasiado',
      traveler_moving_fast: 'Postergó el mensaje porque te movías rápido',
      navigation_active: 'Postergó el mensaje porque hay una navegación activa',
      map_unavailable: 'Esperó a que volvieras al mapa',
      content_already_told: 'Evitó repetir información',
      contextual_opportunity: 'Detectó una oportunidad contextual',
    };
    return labels[reason] || String(reason || 'Sin diagnóstico').replaceAll('_', ' ');
  }

  function entryCard(entry) {
    const article = document.createElement('article');
    article.className = 'companion-history-item';
    article.dataset.interactionId = entry.interactionId || '';
    article.dataset.interventionId = entry.interventionId || '';
    const header = document.createElement('div');
    header.className = 'companion-history-header';
    const title = document.createElement('strong');
    const time = document.createElement('time');
    time.textContent = timeLabel(entry.at || entry.createdAt);

    if (entry.kind === 'interaction_presented') {
      title.textContent = entry.title || 'Wander habló';
      article.dataset.kind = entry.type || 'inform';
      const message = document.createElement('p');
      message.textContent = entry.message || '';
      header.append(title, time);
      article.append(header, message);
      const meta = document.createElement('small');
      meta.textContent = `${entry.type || 'informar'} · ${entry.priority || 'normal'} · ${readableReason(entry.reason)}`;
      article.appendChild(meta);
      return article;
    }

    if (entry.kind === 'interaction_response') {
      title.textContent = 'Tu respuesta';
      article.dataset.kind = 'response';
      header.append(title, time);
      article.appendChild(header);
      const message = document.createElement('p');
      message.textContent = entry.label || entry.responseType || 'Respuesta registrada';
      article.appendChild(message);
      return article;
    }

    if (entry.kind === 'interaction_decision') {
      title.textContent = entry.disposition === 'present' ? 'Wander decidió hablar' : 'Wander decidió esperar';
      article.dataset.kind = 'decision';
      header.append(title, time);
      article.appendChild(header);
      const message = document.createElement('p');
      message.textContent = readableReason(entry.reason);
      article.appendChild(message);
      return article;
    }

    return null;
  }

  function focusRenderedEntry(id = focusId) {
    if (!id) return false;
    const card = Array.from(historyList.querySelectorAll('.companion-history-item')).find((item) => (
      item.dataset.interactionId === id || item.dataset.interventionId === id
    ));
    if (!card) return false;
    historyList.querySelectorAll('.is-notification-target').forEach((item) => item.classList.remove('is-notification-target'));
    card.classList.add('is-notification-target');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (focusTimer) clearTimeout(focusTimer);
    focusTimer = setTimeout(() => card.classList.remove('is-notification-target'), 9000);
    focusId = null;
    return true;
  }

  async function renderHistory() {
    const token = ++renderToken;
    const history = await core.getHistory(60);
    if (token !== renderToken) return;
    historyList.replaceChildren();
    const relevant = history.filter((entry) => ['interaction_presented', 'interaction_response', 'interaction_decision'].includes(entry.kind));
    if (!relevant.length) {
      const empty = document.createElement('p');
      empty.className = 'panel-note';
      empty.textContent = 'Wander todavía no tiene interacciones registradas.';
      historyList.appendChild(empty);
      return;
    }
    relevant.slice(0, 30).forEach((entry) => {
      const card = entryCard(entry);
      if (card) historyList.appendChild(card);
    });
    requestAnimationFrame(() => focusRenderedEntry());
  }

  function renderDecision() {
    const decision = core.getLastDecision() || window.WanderContext?.value?.('companion.lastDecision');
    decisionBox.replaceChildren();
    if (!decision) {
      decisionBox.textContent = 'Todavía no hay una decisión registrada.';
      return;
    }
    const strong = document.createElement('strong');
    strong.textContent = decision.disposition === 'present' ? 'Habló' : decision.disposition === 'defer' ? 'Esperó' : 'No intervino';
    const reason = document.createElement('span');
    reason.textContent = readableReason(decision.reason);
    const time = document.createElement('small');
    time.textContent = timeLabel(decision.at);
    decisionBox.append(strong, reason, time);
  }

  function renderProfile() {
    const state = engine?.getState?.() || {};
    const interests = Object.entries(state.profile?.interests || {})
      .filter(([, score]) => Number(score) !== 0)
      .sort((a, b) => Math.abs(Number(b[1])) - Math.abs(Number(a[1])))
      .slice(0, 8);
    profileBox.replaceChildren();
    const identity = document.createElement('p');
    const userId = String(state.identity?.userId || 'local');
    identity.textContent = `Perfil local anónimo · ${userId.slice(0, 14)}…`;
    profileBox.appendChild(identity);
    if (!interests.length) {
      const note = document.createElement('small');
      note.textContent = 'Todavía no hay preferencias aprendidas.';
      profileBox.appendChild(note);
      return;
    }
    const list = document.createElement('div');
    list.className = 'companion-interest-list';
    interests.forEach(([category, score]) => {
      const chip = document.createElement('span');
      chip.dataset.sentiment = Number(score) >= 0 ? 'positive' : 'negative';
      chip.textContent = `${category} ${Number(score) > 0 ? '+' : ''}${score}`;
      list.appendChild(chip);
    });
    profileBox.appendChild(list);
  }

  function render() {
    renderDecision();
    renderProfile();
    renderHistory();
  }

  function focus(id) {
    focusId = String(id || '').trim() || null;
    if (!focusId) return false;
    window.WanderScreen?.open?.('companion');
    if (focusRenderedEntry(focusId)) return true;
    renderHistory();
    return true;
  }

  core.subscribe(render);
  engine?.subscribe?.(renderProfile);
  window.addEventListener('wander:screen-change', (event) => {
    if (event.detail?.to === 'companion') render();
  });
  window.addEventListener('wander:memory-ready', render);
  render();

  window.WanderInteractionPanel = Object.freeze({
    render,
    renderHistory,
    focus,
  });
})();

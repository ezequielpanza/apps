(() => {
  const $ = (selector) => document.querySelector(selector);
  const MESSAGE_TIMEOUT_KEY = 'wander.settings.messageTimeoutMs';
  const DEFAULT_MESSAGE_TIMEOUT_MS = 5000;
  let messageTimer = null;
  let toastTimer = null;
  let toast = null;
  let replyForm = null;
  let actionRow = null;
  let choiceRow = null;
  let dismissHandler = null;

  function getMessageTimeoutMs() {
    try {
      const stored = Number(localStorage.getItem(MESSAGE_TIMEOUT_KEY));
      return Number.isFinite(stored) ? Math.max(0, Math.min(60000, stored)) : DEFAULT_MESSAGE_TIMEOUT_MS;
    } catch {
      return DEFAULT_MESSAGE_TIMEOUT_MS;
    }
  }

  function setMessageTimeoutMs(value) {
    const timeoutMs = Math.max(0, Math.min(60000, Number(value) || 0));
    try { localStorage.setItem(MESSAGE_TIMEOUT_KEY, String(timeoutMs)); } catch {}
    window.WanderContext?.set?.('settings.messageTimeoutMs', timeoutMs, { source: 'settings', kind: 'confirmed', confidence: 1 });
    return timeoutMs;
  }

  function setText(selector, value) {
    const item = $(selector);
    if (item) item.textContent = value;
  }

  function clearMessageTimer() {
    if (!messageTimer) return;
    clearTimeout(messageTimer);
    messageTimer = null;
  }

  function hideWander() {
    clearMessageTimer();
    clearReply();
    clearAction();
    clearChoices();
    dismissHandler = null;
    const card = $('#wander-card');
    if (card) card.hidden = true;
  }

  function ensureReplyForm() {
    if (replyForm?.isConnected) return replyForm;
    const card = $('#wander-card');
    if (!card) return null;
    replyForm = document.createElement('form');
    replyForm.className = 'wander-reply';
    replyForm.hidden = true;
    replyForm.innerHTML = '<input type="text" autocomplete="off"><span>Presioná Enter para responder</span>';
    card.appendChild(replyForm);
    return replyForm;
  }

  function clearReply() {
    if (!replyForm) return;
    replyForm.hidden = true;
    replyForm.onsubmit = null;
    const input = replyForm.querySelector('input');
    if (input) input.value = '';
  }

  function configureReply(reply) {
    clearReply();
    if (!reply || typeof reply.onSubmit !== 'function') return;
    const form = ensureReplyForm();
    const input = form?.querySelector('input');
    if (!form || !input) return;
    input.placeholder = reply.placeholder || 'Responder a Wander';
    input.setAttribute('aria-label', reply.ariaLabel || input.placeholder);
    form.onsubmit = (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) return;
      reply.onSubmit(value);
    };
    form.hidden = false;
  }

  function ensureActionRow() {
    if (actionRow?.isConnected) return actionRow;
    const card = $('#wander-card');
    if (!card) return null;
    actionRow = document.createElement('div');
    actionRow.className = 'wander-card-action';
    actionRow.hidden = true;
    actionRow.innerHTML = '<button type="button"></button>';
    card.appendChild(actionRow);
    return actionRow;
  }

  function clearAction() {
    if (!actionRow) return;
    actionRow.hidden = true;
    const button = actionRow.querySelector('button');
    if (button) {
      button.onclick = null;
      button.disabled = false;
    }
  }

  function configureAction(action) {
    clearAction();
    if (!action || typeof action.onInvoke !== 'function') return;
    const row = ensureActionRow();
    const button = row?.querySelector('button');
    if (!row || !button) return;
    button.textContent = action.label || 'Continuar';
    button.onclick = async () => {
      button.disabled = true;
      try { await action.onInvoke(); }
      finally { button.disabled = false; }
    };
    row.hidden = false;
  }

  function ensureChoiceRow() {
    if (choiceRow?.isConnected) return choiceRow;
    const card = $('#wander-card');
    if (!card) return null;
    choiceRow = document.createElement('div');
    choiceRow.className = 'wander-card-choices';
    choiceRow.hidden = true;
    card.appendChild(choiceRow);
    return choiceRow;
  }

  function clearChoices() {
    if (!choiceRow) return;
    choiceRow.hidden = true;
    choiceRow.replaceChildren();
  }

  function configureChoices(choices) {
    clearChoices();
    const valid = (Array.isArray(choices) ? choices : [])
      .filter((choice) => choice?.label && typeof choice.onInvoke === 'function');
    if (!valid.length) return;
    const row = ensureChoiceRow();
    if (!row) return;
    valid.forEach((choice) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = choice.label;
      button.className = choice.emphasis === 'primary' ? 'primary' : 'secondary';
      button.onclick = async () => {
        row.querySelectorAll('button').forEach((item) => { item.disabled = true; });
        try { await choice.onInvoke(); }
        finally {
          if (row.isConnected) row.querySelectorAll('button').forEach((item) => { item.disabled = false; });
        }
      };
      row.appendChild(button);
    });
    row.hidden = false;
  }

  function ensureToast() {
    if (toast?.isConnected) return toast;
    toast = document.createElement('div');
    toast.id = 'wander-toast';
    toast.className = 'wander-toast';
    toast.hidden = true;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = '<strong></strong><span></span>';
    document.body.appendChild(toast);
    return toast;
  }

  function hideToast() {
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = null;
    if (toast) toast.hidden = true;
  }

  function showToast(title, message = '', options = {}) {
    const item = ensureToast();
    if (toastTimer) clearTimeout(toastTimer);
    item.querySelector('strong').textContent = title || 'Wander';
    const copy = item.querySelector('span');
    copy.textContent = message || '';
    copy.hidden = !message;
    item.hidden = false;
    const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Math.max(500, Number(options.timeoutMs)) : 2400;
    toastTimer = setTimeout(hideToast, timeoutMs);
  }

  function shouldUseToast(title, options) {
    return options.compact === true || /^POI\s+(guardado|actualizado)$/i.test(String(title || ''));
  }

  function showWander(title, message, options = {}) {
    if (shouldUseToast(title, options)) return showToast(title, message, options);
    const card = $('#wander-card');
    clearMessageTimer();
    clearReply();
    clearAction();
    clearChoices();
    if (document.body.classList.contains('poi-editor-open') || !card) return false;
    card.hidden = false;
    setText('#wander-title', title);
    setText('#wander-message', message);
    configureReply(options.reply);
    configureAction(options.action);
    configureChoices(options.choices);
    dismissHandler = typeof options.onDismiss === 'function' ? options.onDismiss : null;

    if (options.persistent === true) return true;
    const timeoutMs = Number.isFinite(Number(options.timeoutMs))
      ? Math.max(0, Number(options.timeoutMs))
      : getMessageTimeoutMs();
    if (timeoutMs > 0) messageTimer = setTimeout(hideWander, timeoutMs);
    return true;
  }

  function dismissWander() {
    const onDismiss = dismissHandler;
    hideWander();
    try { onDismiss?.(); } catch {}
  }

  function syncRuntimeMetrics() {
    const context = window.WanderContext;
    const status = context?.value('context.status', 'Preparando contexto');
    const speed = Number(context?.value('motion.speedKmh'));
    const heading = Number(context?.value('motion.heading'));
    const moving = context?.value('motion.status') === 'moving';

    setText('#metric-status', status || 'Preparando contexto');
    setText('#metric-speed', Number.isFinite(speed) ? speed.toFixed(1) + ' km/h' : '—');
    setText('#metric-heading', moving && Number.isFinite(heading) ? Math.round(heading) + '°' : '—');
  }

  function setLocationPending() {
    syncRuntimeMetrics();
  }

  $('#close-wander')?.addEventListener('click', dismissWander);

  window.addEventListener('wander:screen-will-change', hideWander);
  window.addEventListener('wander:personal-poi-editor-open', hideWander);

  window.WanderContext?.subscribe((key) => {
    if (key === 'context.status' || key.startsWith('motion.')) syncRuntimeMetrics();
  });

  window.WanderContext?.set?.('settings.messageTimeoutMs', getMessageTimeoutMs(), { source: 'settings', kind: 'confirmed', confidence: 1 });
  syncRuntimeMetrics();

  window.WanderUI = {
    setText,
    showWander,
    hideWander,
    showToast,
    hideToast,
    syncRuntimeMetrics,
    setLocationPending,
    getMessageTimeoutMs,
    setMessageTimeoutMs,
    defaultMessageTimeoutMs: DEFAULT_MESSAGE_TIMEOUT_MS,
  };
})();

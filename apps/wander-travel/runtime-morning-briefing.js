(() => {
  if (window.WanderMorningBriefing) return;

  const LAST_DAY_KEY = 'wander.morningBriefing.lastDay.v1';
  const RETRY_KEY = 'wander.morningBriefing.retryAt.v1';
  const STARTUP_SILENCE_MS = 2 * 60 * 1000;
  const RETRY_WITHOUT_CONTEXT_MS = 30 * 1000;
  const sessionStartedAt = Date.now();
  let timer = null;
  let presenting = false;

  function dayKey() {
    return window.WanderTravelLog?.dayKey?.() || new Date().toISOString().slice(0, 10);
  }

  function read(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function write(key, value) {
    try { localStorage.setItem(key, String(value)); } catch {}
  }

  function morningWindow() {
    const hour = new Date().getHours();
    return hour >= 5 && hour < 14;
  }

  function startupRemaining() {
    return Math.max(0, STARTUP_SILENCE_MS - (Date.now() - sessionStartedAt));
  }

  function finiteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function cleanWeatherSummary(value) {
    if (value === null || value === undefined) return '';
    const text = String(value).replace(/\s+/g, ' ').trim();
    if (!text) return '';
    const normalized = text.toLowerCase();
    const placeholders = [
      'pending', 'loading', 'unknown', 'unavailable', 'error', 'idle', 'fetching',
      'pendiente', 'cargando', 'desconocido', 'no disponible', 'actualizando', 'sin datos',
    ];
    if (placeholders.some((placeholder) => normalized === placeholder || normalized.includes(placeholder))) return '';
    return text;
  }

  function weatherText() {
    const context = window.WanderContext;
    const summary = cleanWeatherSummary(
      context?.value?.('environment.weatherSummary')
      || context?.value?.('weather.today.summary')
      || context?.value?.('weather.forecast.today')
      || context?.value?.('environment.weatherStatus')
    );
    const temperature = finiteNumber(
      context?.value?.('environment.temperatureC') ?? context?.value?.('weather.temperatureC')
    );
    if (summary && temperature !== null) return `Para hoy: ${summary} y unos ${Math.round(temperature)} °C.`;
    if (summary) return `Para hoy: ${summary}.`;
    if (temperature !== null) return `Ahora hay unos ${Math.round(temperature)} °C.`;
    return '';
  }

  function placeText() {
    const context = window.WanderContext;
    const city = context?.value?.('place.city');
    const place = context?.value?.('history.currentPlace') || context?.value?.('currentPOI.current');
    const label = place?.name || place?.label || city || null;
    return label ? ` en ${label}` : '';
  }

  function planText() {
    const log = window.WanderTravelLog;
    if (!log) return '';
    const plans = log.plansForDay()
      .filter((plan) => !['completed', 'cancelled'].includes(plan.status))
      .sort((a, b) => Date.parse(a.scheduledAt || 0) - Date.parse(b.scheduledAt || 0));
    if (plans.length) {
      const labels = plans.slice(0, 3).map((plan) => {
        if (!plan.scheduledAt) return plan.title;
        const time = new Date(plan.scheduledAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        return `${plan.title} a las ${time}`;
      });
      const rest = plans.length > 3 ? ` y ${plans.length - 3} más` : '';
      return `Para hoy quedó: ${labels.join(', ')}${rest}.`;
    }
    const pending = log.listPlans().find((plan) => !plan.day && !['completed', 'cancelled'].includes(plan.status));
    if (pending) return `Quedó pendiente “${pending.title}”.`;
    return '';
  }

  function interaction() {
    const details = [weatherText(), planText()].filter(Boolean);
    if (!details.length) return null;
    const place = placeText();
    return {
      id: `morning-briefing-${dayKey()}`,
      interactionId: `morning-briefing-${dayKey()}`,
      kind: 'daily_briefing',
      interactionType: 'ask',
      priority: 'normal',
      title: `Buenos días${place}`,
      message: `${details.join(' ')} ¿Querés que organicemos el día?`,
      reason: 'first_daily_activation',
      topic: 'daily-plan',
    };
  }

  function respond(id, label) {
    window.WanderInteractionCore?.respond?.({ id, type: id, label });
  }

  function present() {
    if (presenting || !morningWindow() || document.visibilityState === 'hidden') return false;
    if (startupRemaining() > 0) return false;
    const today = dayKey();
    if (read(LAST_DAY_KEY) === today) return false;
    const retryAt = Number(read(RETRY_KEY));
    if (Number.isFinite(retryAt) && retryAt > 0 && Date.now() < retryAt) return false;
    const ui = window.WanderUI;
    const core = window.WanderInteractionCore;
    if (!ui || !core || !window.WanderTravelLog) return false;

    const item = interaction();
    if (!item) return false;
    const shown = ui.showWander(item.title, item.message, {
      persistent: true,
      choices: [
        {
          label: 'Ver y organizar el día',
          emphasis: 'primary',
          onInvoke: () => {
            respond('open_travel_log', 'Ver y organizar el día');
            core.complete('accepted');
            ui.hideWander?.();
            window.WanderTravelLogScreen?.open?.();
          },
        },
        {
          label: 'Recordámelo luego',
          onInvoke: () => {
            respond('remind_later', 'Recordámelo luego');
            core.complete('postponed');
            write(RETRY_KEY, Date.now() + 60 * 60 * 1000);
            write(LAST_DAY_KEY, '');
            ui.hideWander?.();
            schedule(60 * 60 * 1000);
          },
        },
        {
          label: 'Ya tengo el día organizado',
          onInvoke: () => {
            respond('already_planned', 'Ya tengo el día organizado');
            core.complete('acknowledged');
            ui.hideWander?.();
          },
        },
      ],
    });
    if (shown === false) return false;
    presenting = true;
    write(LAST_DAY_KEY, today);
    write(RETRY_KEY, 0);
    core.present(item, { reason: 'first_daily_activation', channel: 'in_app' });
    setTimeout(() => { presenting = false; }, 1000);
    return true;
  }

  function schedule(delay = RETRY_WITHOUT_CONTEXT_MS) {
    if (timer) clearTimeout(timer);
    const wait = Math.max(1000, Number(delay) || RETRY_WITHOUT_CONTEXT_MS, startupRemaining());
    timer = setTimeout(() => {
      timer = null;
      if (!present() && read(LAST_DAY_KEY) !== dayKey() && morningWindow()) schedule(RETRY_WITHOUT_CONTEXT_MS);
    }, wait);
  }

  function initialize() {
    schedule(Math.max(STARTUP_SILENCE_MS, startupRemaining()));
  }

  window.addEventListener('wander:app-ready', initialize, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(RETRY_WITHOUT_CONTEXT_MS);
  });
  window.addEventListener('focus', () => schedule(RETRY_WITHOUT_CONTEXT_MS));

  window.WanderMorningBriefing = Object.freeze({
    present,
    schedule,
    preview: interaction,
    startupRemaining,
  });
  if (window.WanderAppReady) initialize();
})();

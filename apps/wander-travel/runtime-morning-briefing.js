(() => {
  if (window.WanderMorningBriefing) return;

  const LAST_DAY_KEY = 'wander.morningBriefing.lastDay.v1';
  const RETRY_KEY = 'wander.morningBriefing.retryAt.v1';
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

  function weatherText() {
    const context = window.WanderContext;
    const summary = context?.value?.('environment.weatherSummary')
      || context?.value?.('weather.today.summary')
      || context?.value?.('weather.forecast.today')
      || context?.value?.('environment.weatherStatus');
    const temperature = Number(context?.value?.('environment.temperatureC') ?? context?.value?.('weather.temperatureC'));
    if (summary && Number.isFinite(temperature)) return `Para hoy: ${String(summary)} y unos ${Math.round(temperature)} °C.`;
    if (summary) return `Para hoy: ${String(summary)}.`;
    if (Number.isFinite(temperature)) return `Ahora hay unos ${Math.round(temperature)} °C; todavía estoy completando el pronóstico.`;
    return 'Todavía estoy actualizando el pronóstico del día.';
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
    if (!log) return 'No tengo planes guardados para hoy.';
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
    if (pending) return `No hay horarios confirmados, pero quedó pendiente “${pending.title}”.`;
    return 'No hay actividades confirmadas todavía.';
  }

  function interaction() {
    const place = placeText();
    return {
      id: `morning-briefing-${dayKey()}`,
      interactionId: `morning-briefing-${dayKey()}`,
      kind: 'daily_briefing',
      interactionType: 'ask',
      priority: 'normal',
      title: `Buenos días${place}`,
      message: `${weatherText()} ${planText()} ¿Querés que organicemos el día?`,
      reason: 'first_daily_activation',
      topic: 'daily-plan',
    };
  }

  function respond(id, label) {
    window.WanderInteractionCore?.respond?.({ id, type: id, label });
  }

  function present() {
    if (presenting || !morningWindow() || document.visibilityState === 'hidden') return false;
    const today = dayKey();
    if (read(LAST_DAY_KEY) === today) return false;
    const retryAt = Number(read(RETRY_KEY));
    if (Number.isFinite(retryAt) && Date.now() < retryAt) return false;
    const ui = window.WanderUI;
    const core = window.WanderInteractionCore;
    if (!ui || !core || !window.WanderTravelLog) return false;

    const item = interaction();
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

  function schedule(delay = 8000) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!present() && read(LAST_DAY_KEY) !== dayKey() && morningWindow()) schedule(30000);
    }, Math.max(1000, delay));
  }

  function initialize() {
    schedule(9000);
  }

  window.addEventListener('wander:app-ready', initialize, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(3500);
  });
  window.addEventListener('focus', () => schedule(3500));

  window.WanderMorningBriefing = Object.freeze({ present, schedule, preview: interaction });
  if (window.WanderAppReady) initialize();
})();

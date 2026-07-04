(() => {
  const $ = (selector) => document.querySelector(selector);

  function syncSummary() {
    const time = window.WanderContext?.value('time.now');
    const period = window.WanderContext?.value('time.dayPeriod');
    const next = window.WanderContext?.value('user.intent');

    if (time) window.WanderUI?.setText('#context-time', time);
    if (period) window.WanderUI?.setText('#context-period', period);
    if (next) window.WanderUI?.setText('#context-next', next);
  }

  $('#refresh-context-button')?.addEventListener('click', () => {
    window.WanderContext?.updateTime();
    window.WanderContext?.render();
    syncSummary();
  });

  window.WanderContext?.subscribe(syncSummary);
  syncSummary();
  window.WanderContext?.render();

  window.WanderContextPanel = { syncSummary };
})();

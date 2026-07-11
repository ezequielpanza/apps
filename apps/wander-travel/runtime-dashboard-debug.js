(() => {
  const panel = document.createElement('aside');
  panel.id = 'dashboard-debug-panel';
  panel.setAttribute('aria-live', 'polite');
  panel.innerHTML = `
    <strong>Dashboard Debug</strong>
    <pre id="dashboard-debug-output">Esperando...</pre>
    <div class="dashboard-debug-actions">
      <button type="button" data-dashboard-debug="inspect">Inspeccionar</button>
      <button type="button" data-dashboard-debug="render">Forzar render</button>
      <button type="button" data-dashboard-debug="restore">Forzar mount</button>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #dashboard-debug-panel{position:fixed;top:calc(66px + env(safe-area-inset-top,0px));right:10px;z-index:200;width:min(310px,calc(100vw - 20px));padding:12px;border-radius:14px;background:rgba(12,20,24,.94);color:#fff;box-shadow:0 12px 32px rgba(0,0,0,.28);font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
    #dashboard-debug-panel strong{display:block;margin-bottom:6px;font:800 13px/1.2 Inter,system-ui,sans-serif}
    #dashboard-debug-panel pre{margin:0;white-space:pre-wrap;word-break:break-word}
    .dashboard-debug-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
    .dashboard-debug-actions button{min-height:32px;border:0;border-radius:9px;padding:0 9px;background:#01e0cb;color:#083b37;font:800 11px/1 Inter,system-ui,sans-serif}
  `;
  document.head.appendChild(style);
  document.body.appendChild(panel);

  const output = panel.querySelector('#dashboard-debug-output');
  let lastEvent = 'init';

  function displayMode() {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return 'standalone';
    if (window.navigator?.standalone) return 'standalone-ios';
    return 'browser';
  }

  function inspect(eventName = 'inspect') {
    lastEvent = eventName;
    const dashboard = document.querySelector('#context-dashboard');
    const runtime = window.WanderContextDashboard;
    const style = dashboard ? getComputedStyle(dashboard) : null;
    const rect = dashboard?.getBoundingClientRect?.();
    const visibleFields = runtime?.getVisibleFields?.() || [];
    const controller = navigator.serviceWorker?.controller;
    const lines = [
      `HTML: ${dashboard ? 'OK' : 'NO'}`,
      `Runtime: ${runtime ? 'OK' : 'NO'}`,
      `Mode: ${displayMode()}`,
      `Visible fields: ${visibleFields.length} [${visibleFields.join(', ')}]`,
      `Hidden attr: ${dashboard ? dashboard.hasAttribute('hidden') : '-'}`,
      `hidden prop: ${dashboard ? dashboard.hidden : '-'}`,
      `display: ${style?.display || '-'}`,
      `visibility: ${style?.visibility || '-'}`,
      `opacity: ${style?.opacity || '-'}`,
      `pointer: ${style?.pointerEvents || '-'}`,
      `size: ${rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : '-'}`,
      `children: ${dashboard?.children?.length ?? '-'}`,
      `SW controller: ${controller ? 'YES' : 'NO'}`,
      `Version: ${window.WanderVersion || '-'}`,
      `Last event: ${lastEvent}`,
      `Time: ${new Date().toLocaleTimeString('es-AR', { hour12: false })}`,
    ];
    output.textContent = lines.join('\n');
    return lines;
  }

  panel.addEventListener('click', (event) => {
    const action = event.target.closest('[data-dashboard-debug]')?.dataset.dashboardDebug;
    if (!action) return;
    if (action === 'render') window.WanderContextDashboard?.render?.();
    if (action === 'restore') window.WanderContextDashboard?.restore?.();
    inspect(action);
  });

  ['load', 'pageshow', 'focus'].forEach((name) => {
    window.addEventListener(name, () => setTimeout(() => inspect(name), 150));
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') setTimeout(() => inspect('visibilitychange'), 150);
  });

  setTimeout(() => inspect('startup-250ms'), 250);
  setTimeout(() => inspect('startup-1500ms'), 1500);
  setInterval(() => inspect('interval'), 3000);

  window.WanderDashboardDebug = Object.freeze({ inspect });
})();

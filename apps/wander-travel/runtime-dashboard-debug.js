(() => {
  const panel = document.createElement('aside');
  panel.id = 'dashboard-debug-panel';
  panel.setAttribute('aria-live', 'polite');
  panel.innerHTML = `<strong>Dashboard Debug</strong><pre id="dashboard-debug-output">Esperando...</pre><div class="dashboard-debug-actions"><button type="button" data-dashboard-debug="inspect">Inspeccionar</button><button type="button" data-dashboard-debug="render">Forzar render</button><button type="button" data-dashboard-debug="mount">Forzar mount</button></div>`;

  const style = document.createElement('style');
  style.textContent = `#dashboard-debug-panel{position:fixed;top:calc(66px + env(safe-area-inset-top,0px));right:10px;z-index:220;width:min(310px,calc(100vw - 20px));padding:12px;border-radius:14px;background:rgba(12,20,24,.94);color:#fff;box-shadow:0 12px 32px rgba(0,0,0,.28);font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}#dashboard-debug-panel strong{display:block;margin-bottom:6px;font:800 13px/1.2 Inter,system-ui,sans-serif}#dashboard-debug-panel pre{margin:0;white-space:pre-wrap;word-break:break-word}.dashboard-debug-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.dashboard-debug-actions button{min-height:32px;border:0;border-radius:9px;padding:0 9px;background:#01e0cb;color:#083b37;font:800 11px/1 Inter,system-ui,sans-serif}`;
  document.head.appendChild(style);
  document.body.appendChild(panel);

  const output = panel.querySelector('#dashboard-debug-output');

  function displayMode() {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return 'standalone';
    if (window.navigator?.standalone) return 'standalone-ios';
    return 'browser';
  }

  function inspect(eventName = 'inspect') {
    const dashboard = document.querySelector('#context-dashboard');
    const computed = dashboard ? getComputedStyle(dashboard) : null;
    const rect = dashboard?.getBoundingClientRect?.();
    const visibleFields = window.WanderContextDashboard?.getVisibleFields?.() || [];
    output.textContent = [
      `HTML: ${dashboard ? 'OK' : 'NO'}`,
      `Runtime: ${window.WanderContextDashboard ? 'OK' : 'NO'}`,
      `Mode: ${displayMode()}`,
      `Parent: ${dashboard?.parentElement?.className || '-'}`,
      `Viewport mount: ${dashboard?.dataset?.dashboardViewportMounted || 'false'}`,
      `Visible fields: ${visibleFields.length} [${visibleFields.join(', ')}]`,
      `display: ${computed?.display || '-'}`,
      `visibility: ${computed?.visibility || '-'}`,
      `opacity: ${computed?.opacity || '-'}`,
      `z-index: ${computed?.zIndex || '-'}`,
      `position: ${computed?.position || '-'}`,
      `rect: ${rect ? `${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)}` : '-'}`,
      `Version: ${window.WanderVersion || '-'}`,
      `Last event: ${eventName}`,
    ].join('\n');
  }

  panel.addEventListener('click', (event) => {
    const action = event.target.closest('[data-dashboard-debug]')?.dataset.dashboardDebug;
    if (action === 'render') window.WanderContextDashboard?.render?.();
    if (action === 'mount') window.WanderDashboardViewport?.mount?.();
    inspect(action || 'inspect');
  });

  ['load', 'pageshow', 'focus', 'wander:app-ready'].forEach((name) => window.addEventListener(name, () => setTimeout(() => inspect(name), 150)));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && setTimeout(() => inspect('visibilitychange'), 150));
  setInterval(() => inspect('interval'), 3000);
  setTimeout(() => inspect('startup'), 500);
})();

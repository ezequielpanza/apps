(() => {
  const $ = (selector) => document.querySelector(selector);

  function installStyles() {
    if ($('#wander-topbar-styles')) return;
    const style = document.createElement('style');
    style.id = 'wander-topbar-styles';
    style.textContent = `
      .app-header{display:none!important}
      .map-tools{top:calc(26px + env(safe-area-inset-top,0px))!important;right:18px!important;z-index:42!important;display:flex!important;gap:10px!important}
      .map-tools #main-menu-button{display:none!important}
      .wander-top-query-bar{position:absolute;top:calc(18px + env(safe-area-inset-top,0px));left:18px;right:18px;z-index:90;display:grid;grid-template-columns:58px minmax(0,1fr) 58px;align-items:center;height:72px;border-radius:999px;background:rgba(255,255,255,.94);border:1px solid rgba(255,255,255,.78);box-shadow:0 18px 48px rgba(20,35,55,.22);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);overflow:hidden}
      .wander-top-query-bar .top-bar-icon{display:grid!important;place-items:center;width:58px!important;height:72px!important;min-width:58px!important;min-height:72px!important;border:0!important;border-radius:0!important;background:transparent!important;color:var(--green)!important;box-shadow:none!important;padding:0!important;font-size:0!important;line-height:1!important;cursor:pointer!important}
      .wander-menu-icon{width:31px;height:31px;fill:none;stroke:currentColor;stroke-width:2.35;stroke-linecap:round;stroke-linejoin:round}
      .wander-query-input{width:calc(100% - 8px);height:48px;min-width:0;border:1px solid rgba(23,63,59,.16);outline:0;border-radius:999px;background:rgba(244,247,247,.96);color:var(--text);font-size:1.02rem;font-weight:800;text-align:left;padding:0 18px;appearance:none;-webkit-appearance:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 1px 2px rgba(20,35,55,.03);transition:border-color .18s ease,box-shadow .18s ease,background .18s ease}
      .wander-query-input::placeholder{color:var(--text);opacity:.74}
      .wander-query-input:focus{border-color:rgba(23,63,59,.42);background:#fff;box-shadow:0 0 0 3px rgba(23,63,59,.09),inset 0 1px 0 rgba(255,255,255,.95)}
      .wander-query-input:focus::placeholder{opacity:.4}
      .top-bar-icon:active{transform:scale(.98)}
      .wander-search-button svg{width:34px;height:34px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
      .wander-button{display:none!important}
      .main-menu{top:calc(100px + env(safe-area-inset-top,0px))!important;left:18px!important;right:18px!important;min-width:0!important;z-index:95!important;border-radius:26px!important;padding:10px!important;box-shadow:0 24px 64px rgba(20,35,55,.24)!important;background:rgba(255,255,255,.98)!important;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
      .main-menu button{display:flex!important;align-items:center!important;gap:10px!important;min-height:46px!important;border-radius:16px!important;padding:0 14px!important;background:#f5f8f7!important;font-size:.96rem!important;color:var(--green)!important}
      .status-rail{bottom:calc(20px + env(safe-area-inset-bottom,0px))!important}
      .wander-card{bottom:calc(96px + env(safe-area-inset-bottom,0px))!important;max-height:calc(100dvh - 196px)!important}
      @media(max-width:380px){.wander-top-query-bar{left:12px;right:12px;height:64px;grid-template-columns:52px minmax(0,1fr) 52px}.wander-top-query-bar .top-bar-icon{width:52px!important;height:64px!important;min-width:52px!important;min-height:64px!important}.wander-query-input{width:calc(100% - 6px);height:44px;font-size:.95rem;padding:0 15px}.wander-search-button svg{width:31px;height:31px}.wander-menu-icon{width:28px;height:28px}.main-menu{top:calc(90px + env(safe-area-inset-top,0px))!important;left:12px!important;right:12px!important}}
      @media(min-width:821px){.wander-app[data-panel="none"]{grid-template-columns:minmax(0,1fr)!important}.wander-app:not([data-panel="none"]){grid-template-columns:minmax(0,1fr) 420px!important}.wander-app[data-panel="none"] .map-stage{grid-column:1!important}.side-panel[hidden]{display:none!important}.map-tools #settings-button{display:none!important}.wander-top-query-bar{top:24px;left:28px;right:auto;width:min(620px,calc(100vw - 80px));height:72px}.map-tools{top:24px!important;right:24px!important}.main-menu{top:108px!important;left:28px!important;right:auto!important;width:min(620px,calc(100vw - 80px))!important}.wander-card{left:28px!important;bottom:106px!important;width:420px!important;max-height:420px!important}.status-rail{bottom:28px!important}}
    `;
    document.head.appendChild(style);
  }

  function iconMenu() {
    return '<svg class="wander-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14"></path><path d="M5 12h14"></path><path d="M5 17h14"></path></svg>';
  }

  function iconSearch() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="M16 16l5 5"></path></svg>';
  }

  function createTopBar() {
    if ($('#wander-top-query-bar')) return;
    const stage = $('.map-stage');
    if (!stage) return;

    const bar = document.createElement('header');
    bar.id = 'wander-top-query-bar';
    bar.className = 'wander-top-query-bar';
    bar.setAttribute('aria-label', 'Consulta Wander');

    const menuButton = $('#main-menu-button');
    if (menuButton) {
      menuButton.classList.add('top-bar-icon', 'modern-menu-button');
      menuButton.innerHTML = iconMenu();
      bar.appendChild(menuButton);
    }

    const input = document.createElement('input');
    input.id = 'wander-query-input';
    input.className = 'wander-query-input';
    input.type = 'text';
    input.placeholder = 'Preguntar a Wander';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Preguntar a Wander');
    bar.appendChild(input);

    const search = document.createElement('button');
    search.id = 'wander-search-button';
    search.className = 'top-bar-icon wander-search-button';
    search.type = 'button';
    search.setAttribute('aria-label', 'Enviar pregunta a Wander');
    search.innerHTML = iconSearch();
    bar.appendChild(search);

    stage.appendChild(bar);
  }

  function currentQuestion() {
    return ($('#wander-query-input')?.value || '').trim();
  }

  function askWander() {
    const question = currentQuestion();
    if (!question) {
      $('#wander-query-input')?.focus();
      window.WanderContext?.set('user.intent', 'Preguntar a Wander', { source: 'topbar', ttlMs: 600000, confidence: 0.75 });
      window.WanderUI?.showWander('Preguntar a Wander', 'Escribí una pregunta o contame qué querés hacer. Wander va a usar el contexto del viaje como referencia.');
      return;
    }
    window.WanderContext?.set('user.intent', 'Preguntar a Wander', { source: 'topbar', ttlMs: 600000, confidence: 0.9 });
    window.WanderContext?.set('user.lastQuestion', question, { source: 'topbar', ttlMs: 600000, confidence: 1 });
    window.WanderUI?.showWander('Pregunta recibida', question + ' — La entrada ya funciona. El próximo paso es conectar esta pregunta con la IA contextual de Wander.');
    const input = $('#wander-query-input');
    if (input) input.value = '';
  }

  function bind() {
    installStyles();
    createTopBar();
    $('#wander-search-button')?.addEventListener('click', askWander);
    $('#wander-query-input')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        askWander();
      }
      if (event.key === 'Escape') event.target.blur();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();

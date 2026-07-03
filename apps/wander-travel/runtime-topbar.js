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
      .modern-menu-button span{display:block!important;width:28px!important;height:3px!important;margin:3px 0!important;border-radius:99px!important;background:currentColor!important}
      .wander-query-button{height:72px;min-width:0;border:0;background:transparent;color:var(--text);font-size:1.05rem;font-weight:850;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 10px;cursor:pointer}
      .wander-query-button:active,.top-bar-icon:active{transform:scale(.98)}
      .wander-search-button svg{width:34px;height:34px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
      .wander-button{display:none!important}
      .main-menu{top:calc(100px + env(safe-area-inset-top,0px))!important;left:18px!important;right:18px!important;min-width:0!important;z-index:95!important;border-radius:26px!important;padding:10px!important;box-shadow:0 24px 64px rgba(20,35,55,.24)!important;background:rgba(255,255,255,.98)!important;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
      .main-menu button{display:flex!important;align-items:center!important;gap:10px!important;min-height:46px!important;border-radius:16px!important;padding:0 14px!important;background:#f5f8f7!important;font-size:.96rem!important;color:var(--green)!important}
      .status-rail{bottom:calc(20px + env(safe-area-inset-bottom,0px))!important}
      .wander-card{bottom:calc(96px + env(safe-area-inset-bottom,0px))!important;max-height:calc(100dvh - 196px)!important}
      @media(max-width:380px){.wander-top-query-bar{left:12px;right:12px;height:64px;grid-template-columns:52px minmax(0,1fr) 52px}.wander-top-query-bar .top-bar-icon{width:52px!important;height:64px!important;min-width:52px!important;min-height:64px!important}.wander-query-button{height:64px;font-size:.98rem}.wander-search-button svg{width:31px;height:31px}.modern-menu-button span{width:25px!important;height:2.5px!important}.main-menu{top:calc(90px + env(safe-area-inset-top,0px))!important;left:12px!important;right:12px!important}}
      @media(min-width:821px){.wander-top-query-bar{top:24px;left:28px;right:auto;width:min(620px,calc(100vw - 500px));height:72px}.map-tools{top:24px!important;right:24px!important}.main-menu{top:108px!important;left:28px!important;right:auto!important;width:min(620px,calc(100vw - 500px))!important}.wander-card{left:28px!important;bottom:106px!important;width:420px!important;max-height:420px!important}.status-rail{bottom:28px!important}.side-panel[hidden]{display:block!important}}
    `;
    document.head.appendChild(style);
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
      menuButton.innerHTML = '<span></span><span></span><span></span>';
      bar.appendChild(menuButton);
    }

    const query = document.createElement('button');
    query.id = 'wander-query-button';
    query.className = 'wander-query-button';
    query.type = 'button';
    query.textContent = 'Preguntar a Wander';
    query.setAttribute('aria-label', 'Preguntar a Wander');
    bar.appendChild(query);

    const search = document.createElement('button');
    search.id = 'wander-search-button';
    search.className = 'top-bar-icon wander-search-button';
    search.type = 'button';
    search.setAttribute('aria-label', 'Explorar con Wander');
    search.innerHTML = iconSearch();
    bar.appendChild(search);

    stage.appendChild(bar);
  }

  function showQueryMessage() {
    window.WanderContext?.set('user.intent', 'Preguntar a Wander', { source: 'topbar', ttlMs: 600000, confidence: 0.8 });
    window.WanderUI?.showWander('Preguntar a Wander', 'Todavía no abrí el chat de IA en esta pantalla. Ya puedo usar WanderContext como base para la próxima etapa.');
  }

  function showExploreMessage() {
    window.WanderContext?.set('user.intent', 'Explorar cerca', { source: 'topbar', ttlMs: 600000, confidence: 0.8 });
    window.WanderUI?.showWander('Explorar con Wander', 'El próximo paso será conectar ubicación real y contexto de ciudad para sugerir qué descubrir cerca.');
  }

  function bind() {
    installStyles();
    createTopBar();
    $('#wander-query-button')?.addEventListener('click', showQueryMessage);
    $('#wander-search-button')?.addEventListener('click', showExploreMessage);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();

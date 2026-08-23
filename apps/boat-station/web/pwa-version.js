(function(){
  const params=new URLSearchParams(location.search);
  const isLocal=params.get('mode')==='station'||!!window.CoreBridge||!!window.BoatStationCore||!!window.NativeBridge;
  let localVersion='—',coreApkVersion='—',corePwaVersion='—',wrappedSync=false,wrappedRemote=false,wrappedCommand=false,refreshing=false,pull=null,refreshStatusTimer=0;

  function refreshLabel(source){return isLocal&&source==='remote-command'?'Actualización remota':'Actualizando'}
  function enforceRefreshText(label){const host=document.getElementById('remoteFreshness'),text=host?.querySelector('.remote-connection-text');if(text)text.textContent=label}
  function setRefreshUi(on,label){
    clearInterval(refreshStatusTimer);refreshStatusTimer=0;
    const host=document.getElementById('remoteFreshness');if(host)host.classList.toggle('refreshing',!!on);
    if(on){enforceRefreshText(label);refreshStatusTimer=setInterval(()=>enforceRefreshText(label),200)}
    else window.BoatStationRemoteUI?.markUpdated?.(Date.now());
  }
  function animateCoreRemotePull(label){
    if(!isLocal)return Promise.resolve();
    const deck=document.querySelector('.module-deck'),tab=deck?.querySelector('.hidden-refresh-module');
    if(!deck||!tab)return Promise.resolve();
    return new Promise(resolve=>{
      deck.classList.remove('refreshing');
      deck.classList.add('pulling');
      deck.style.setProperty('--deck-pull','0px');
      tab.classList.remove('armed');
      tab.textContent=label;
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        deck.style.setProperty('--deck-pull','50px');
        tab.classList.add('armed');
        setTimeout(()=>{
          deck.classList.remove('pulling');
          deck.classList.add('refreshing');
          tab.textContent=label;
          resolve();
        },240);
      }));
    });
  }
  function clearCoreRemotePull(){
    const deck=document.querySelector('.module-deck'),tab=deck?.querySelector('.hidden-refresh-module');
    if(!deck||!tab)return;
    deck.classList.remove('pulling','refreshing');
    deck.style.removeProperty('--deck-pull');
    tab.classList.remove('armed');
    tab.textContent='Actualizar';
  }
  async function fetchVersion(){try{const r=await fetch('./PWA_VERSION?v='+Date.now(),{cache:'no-store',headers:{'Cache-Control':'no-cache'}});if(r.ok)return(await r.text()).trim()}catch(_){}return''}
  async function loadLocalVersion(){const v=await fetchVersion();if(v)localVersion=v;render()}
  function render(){
    const host=document.getElementById('remoteFreshness');if(!host)return;
    let el=host.querySelector('.remote-pwa-versions');
    if(!el){el=document.createElement('span');el.className='remote-pwa-versions';host.appendChild(el)}
    const mismatch=localVersion!=='—'&&corePwaVersion!=='—'&&localVersion!==corePwaVersion;
    el.textContent=` · Remote ${localVersion} · Core ${coreApkVersion}${mismatch?' · actualización pendiente':''}`;
    el.classList.toggle('mismatch',mismatch);
  }
  async function refreshServiceWorker(){if(!('serviceWorker'in navigator))return;try{const reg=await navigator.serviceWorker.getRegistration();if(reg)await reg.update()}catch(_){}}
  async function runSystemRefresh(options={}){
    if(refreshing)return false;const source=options.source||'local',label=refreshLabel(source),remoteCore=isLocal&&source==='remote-command';refreshing=true;setRefreshUi(true,label);
    try{
      if(remoteCore)await animateCoreRemotePull(label);
      if(!isLocal&&options.sendCore!==false)try{await window.BoatStationRemoteCommand?.send?.('system.refresh',{source:'remote'})}catch(_){}
      await refreshServiceWorker();const latest=await fetchVersion();await new Promise(r=>setTimeout(r,remoteCore?500:650));if(latest)localVersion=latest;render();setRefreshUi(true,label);setTimeout(()=>location.reload(),remoteCore?260:180);return true;
    }catch(_){clearCoreRemotePull();setRefreshUi(false,label);refreshing=false;return false}
  }
  function executeRemoteCommand(command){if(command==='system.refresh'){runSystemRefresh({source:'remote-command',sendCore:false});return true}return false}
  window.BoatStationSystem={runSystemRefresh,executeRemoteCommand,getPwaVersion:()=>localVersion};

  function wrapDataSync(){if(wrappedSync||!window.BoatStationDataSync)return;const sync=window.BoatStationDataSync;if(typeof sync.exportSnapshot!=='function')return;const original=sync.exportSnapshot.bind(sync);sync.exportSnapshot=function(){const snapshot=original()||{};snapshot.pwaVersion=localVersion;return snapshot};wrappedSync=true}
  function wrapRemoteUi(){
    if(wrappedRemote||!window.BoatStationRemoteUI)return;
    const ui=window.BoatStationRemoteUI;if(typeof ui.scheduleData!=='function')return;
    const original=ui.scheduleData.bind(ui);
    ui.scheduleData=function(snapshot,apply){
      if(snapshot&&typeof snapshot.pwaVersion==='string'&&snapshot.pwaVersion.trim())corePwaVersion=snapshot.pwaVersion.trim();
      const apk=String(snapshot?.phone?.version||'').trim();
      if(apk)coreApkVersion=apk;
      render();
      return original(snapshot,apply);
    };
    wrappedRemote=true;render();
  }
  function wrapCommandSink(){if(wrappedCommand||!window.BoatStationGpsState||typeof window.BoatStationGpsState.executeRemoteCommand!=='function')return;const original=window.BoatStationGpsState.executeRemoteCommand.bind(window.BoatStationGpsState);window.BoatStationGpsState.executeRemoteCommand=function(command,payload){if(executeRemoteCommand(command,payload))return true;return original(command,payload)};wrappedCommand=true}

  function pullTargetBlocked(target){return !!target.closest('input,textarea,select,button,a,.drag-handle,.resize-handle,.handle,.sheet.open,.station-manager.open')}
  function installPullRefresh(){
    document.addEventListener('touchstart',e=>{
      if(refreshing||window.scrollY>1||e.touches.length!==1||pullTargetBlocked(e.target))return;
      const t=e.touches[0];pull={x:t.clientX,y:t.clientY,armed:false,claimed:false};
    },{passive:true,capture:true});
    document.addEventListener('touchmove',e=>{
      if(!pull||e.touches.length!==1)return;
      const t=e.touches[0],dx=t.clientX-pull.x,dy=t.clientY-pull.y;
      if(dy<=0){pull=null;return}
      if(!pull.claimed){
        if(Math.abs(dx)<8&&dy<8)return;
        if(Math.abs(dx)>dy*.65){pull=null;return}
        pull.claimed=true;
      }
      if(window.scrollY>1){pull=null;return}
      e.preventDefault();e.stopPropagation();
      pull.armed=dy>=82;
    },{passive:false,capture:true});
    document.addEventListener('touchend',e=>{
      if(!pull)return;
      const armed=pull.claimed&&pull.armed;pull=null;
      if(armed){e.preventDefault();e.stopPropagation();runSystemRefresh({source:isLocal?'local':'remote',sendCore:!isLocal})}
    },{passive:false,capture:true});
    document.addEventListener('touchcancel',()=>{pull=null},{passive:true,capture:true});
  }

  loadLocalVersion();installPullRefresh();
  const timer=setInterval(()=>{wrapDataSync();wrapRemoteUi();wrapCommandSink();render();if(wrappedSync&&wrappedRemote&&wrappedCommand)clearInterval(timer)},100);
})();

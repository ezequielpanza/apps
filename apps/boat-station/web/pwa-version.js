(function(){
  const params=new URLSearchParams(location.search);
  const isLocal=params.get('mode')==='station'||!!window.CoreBridge||!!window.BoatStationCore||!!window.NativeBridge;
  let localVersion='—',coreVersion='—',wrappedSync=false,wrappedRemote=false,wrappedCommand=false,refreshing=false,pull=null,refreshStatusTimer=0;

  function ensureIndicator(){
    let el=document.getElementById('systemRefreshIndicator');if(el)return el;
    const style=document.createElement('style');style.textContent='@keyframes bsRefreshSpin{to{transform:rotate(360deg)}}#systemRefreshIndicator{position:fixed;z-index:5000;left:50%;top:58px;transform:translate(-50%,-70px);transition:transform .2s ease;display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:18px;background:#0b2637;color:#d7eef7;font:600 12px system-ui,sans-serif;box-shadow:0 5px 18px #0007;pointer-events:none}#systemRefreshIndicator.show{transform:translate(-50%,0)}#systemRefreshIndicator .spin{display:inline-block;font-size:15px;animation:bsRefreshSpin .8s linear infinite}';document.head.appendChild(style);
    el=document.createElement('div');el.id='systemRefreshIndicator';el.innerHTML='<span class="spin">↻</span><span class="label">Actualizando</span>';document.body.appendChild(el);return el;
  }
  function enforceRefreshText(remote){const host=document.getElementById('remoteFreshness'),text=host?.querySelector('.remote-connection-text');if(text)text.textContent=remote?'Actualización remota':'Actualizando'}
  function setRefreshUi(on,remote){
    const indicator=ensureIndicator();indicator.querySelector('.label').textContent=remote?'Actualización remota':'Actualizando';indicator.classList.toggle('show',!!on);
    clearInterval(refreshStatusTimer);refreshStatusTimer=0;
    const host=document.getElementById('remoteFreshness');if(host)host.classList.toggle('refreshing',!!on);
    if(on){enforceRefreshText(remote);refreshStatusTimer=setInterval(()=>enforceRefreshText(remote),200)}
    else window.BoatStationRemoteUI?.markUpdated?.(Date.now());
  }
  async function fetchVersion(){try{const r=await fetch('./PWA_VERSION?v='+Date.now(),{cache:'no-store',headers:{'Cache-Control':'no-cache'}});if(r.ok)return(await r.text()).trim()}catch(_){}return''}
  async function loadLocalVersion(){const v=await fetchVersion();if(v)localVersion=v;render()}
  function render(){const host=document.getElementById('remoteFreshness');if(!host)return;let el=host.querySelector('.remote-pwa-versions');if(!el){el=document.createElement('span');el.className='remote-pwa-versions';host.appendChild(el)}const mismatch=localVersion!=='—'&&coreVersion!=='—'&&localVersion!==coreVersion;el.textContent=` · Remote ${localVersion} · Core ${coreVersion}${mismatch?' · actualización pendiente':''}`;el.classList.toggle('mismatch',mismatch)}
  async function refreshServiceWorker(){if(!('serviceWorker'in navigator))return;try{const reg=await navigator.serviceWorker.getRegistration();if(reg)await reg.update()}catch(_){}}
  async function runSystemRefresh(options={}){
    if(refreshing)return false;const remote=options.source==='remote'||options.source==='remote-command'||(!isLocal&&options.sendCore!==false);refreshing=true;setRefreshUi(true,remote);
    try{
      if(!isLocal&&options.sendCore!==false)try{await window.BoatStationRemoteCommand?.send?.('system.refresh',{source:'remote'})}catch(_){}
      await refreshServiceWorker();const latest=await fetchVersion();await new Promise(r=>setTimeout(r,650));if(latest)localVersion=latest;render();setRefreshUi(true,remote);setTimeout(()=>location.reload(),180);return true;
    }catch(_){setRefreshUi(false,remote);refreshing=false;return false}
  }
  function executeRemoteCommand(command){if(command==='system.refresh'){runSystemRefresh({source:'remote-command',sendCore:false});return true}return false}
  window.BoatStationSystem={runSystemRefresh,executeRemoteCommand,getPwaVersion:()=>localVersion};

  function wrapDataSync(){if(wrappedSync||!window.BoatStationDataSync)return;const sync=window.BoatStationDataSync;if(typeof sync.exportSnapshot!=='function')return;const original=sync.exportSnapshot.bind(sync);sync.exportSnapshot=function(){const snapshot=original()||{};snapshot.pwaVersion=localVersion;return snapshot};wrappedSync=true}
  function wrapRemoteUi(){if(wrappedRemote||!window.BoatStationRemoteUI)return;const ui=window.BoatStationRemoteUI;if(typeof ui.scheduleData!=='function')return;const original=ui.scheduleData.bind(ui);ui.scheduleData=function(snapshot,apply){if(snapshot&&typeof snapshot.pwaVersion==='string'&&snapshot.pwaVersion.trim())coreVersion=snapshot.pwaVersion.trim();render();return original(snapshot,apply)};wrappedRemote=true;render()}
  function wrapCommandSink(){if(wrappedCommand||!window.BoatStationGpsState||typeof window.BoatStationGpsState.executeRemoteCommand!=='function')return;const original=window.BoatStationGpsState.executeRemoteCommand.bind(window.BoatStationGpsState);window.BoatStationGpsState.executeRemoteCommand=function(command,payload){if(executeRemoteCommand(command,payload))return true;return original(command,payload)};wrappedCommand=true}

  function installPullRefresh(){
    document.addEventListener('touchstart',e=>{if(refreshing||window.scrollY>1||e.touches.length!==1||e.target.closest('input,textarea,select,.sheet.open,.station-manager.open'))return;const t=e.touches[0];pull={x:t.clientX,y:t.clientY,armed:false}},{passive:true});
    document.addEventListener('touchmove',e=>{if(!pull||e.touches.length!==1)return;const t=e.touches[0],dx=t.clientX-pull.x,dy=t.clientY-pull.y;if(dy<0||Math.abs(dx)>Math.abs(dy)*.8){pull=null;return}pull.armed=dy>=82},{passive:true});
    document.addEventListener('touchend',()=>{if(!pull)return;const armed=pull.armed;pull=null;if(armed)runSystemRefresh({source:isLocal?'local':'remote',sendCore:!isLocal})},{passive:true});
  }

  loadLocalVersion();installPullRefresh();
  const timer=setInterval(()=>{wrapDataSync();wrapRemoteUi();wrapCommandSink();render();if(wrappedSync&&wrappedRemote&&wrappedCommand)clearInterval(timer)},100);
})();

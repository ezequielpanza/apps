(function(){
  let localVersion='—';
  let coreVersion='—';
  let wrappedSync=false;
  let wrappedRemote=false;

  async function loadLocalVersion(){
    try{
      const r=await fetch('./PWA_VERSION?v='+Date.now(),{cache:'no-store'});
      if(r.ok){const v=(await r.text()).trim();if(v)localVersion=v}
    }catch(_){}
    render();
  }

  function render(){
    const host=document.getElementById('remoteFreshness');
    if(!host)return;
    let el=host.querySelector('.remote-pwa-versions');
    if(!el){el=document.createElement('span');el.className='remote-pwa-versions';host.appendChild(el)}
    const mismatch=localVersion!=='—'&&coreVersion!=='—'&&localVersion!==coreVersion;
    el.textContent=` · Remote ${localVersion} · Core ${coreVersion}${mismatch?' · actualización pendiente':''}`;
    el.classList.toggle('mismatch',mismatch);
  }

  function wrapDataSync(){
    if(wrappedSync||!window.BoatStationDataSync)return;
    const sync=window.BoatStationDataSync;
    if(typeof sync.exportSnapshot!=='function')return;
    const original=sync.exportSnapshot.bind(sync);
    sync.exportSnapshot=function(){const snapshot=original()||{};snapshot.pwaVersion=localVersion;return snapshot};
    wrappedSync=true;
  }

  function wrapRemoteUi(){
    if(wrappedRemote||!window.BoatStationRemoteUI)return;
    const ui=window.BoatStationRemoteUI;
    if(typeof ui.scheduleData!=='function')return;
    const original=ui.scheduleData.bind(ui);
    ui.scheduleData=function(snapshot,apply){
      if(snapshot&&typeof snapshot.pwaVersion==='string'&&snapshot.pwaVersion.trim())coreVersion=snapshot.pwaVersion.trim();
      render();
      return original(snapshot,apply);
    };
    wrappedRemote=true;
    render();
  }

  loadLocalVersion();
  const timer=setInterval(()=>{wrapDataSync();wrapRemoteUi();render();if(wrappedSync&&wrappedRemote)clearInterval(timer)},100);
})();

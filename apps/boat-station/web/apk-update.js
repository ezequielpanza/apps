(function(){
  if(window.BoatStationApkUpdate)return;
  const params=new URLSearchParams(location.search);
  const isCore=params.get('mode')==='station'||!!window.CoreBridge||!!window.BoatStationCore||!!window.NativeBridge;
  if(!isCore)return;

  const RELEASE_BASE='https://boat-station.pages.dev';
  const VERSION_URL='https://raw.githubusercontent.com/ezequielpanza/apps/main/apps/boat-station/web/APK_VERSION';
  const APK_URL=new URL('/BoatStation-LastVersion.apk',RELEASE_BASE).href;
  let installed='';
  let latest='';
  let checking=false;
  let checkPromise=null;
  let lastCheck=0;
  let downloadState='';
  let downloadPoll=0;

  function parts(v){return String(v||'').trim().split('.').map(x=>parseInt(x,10)||0)}
  function newer(a,b){
    const aa=parts(a),bb=parts(b),n=Math.max(aa.length,bb.length);
    for(let i=0;i<n;i++){const x=aa[i]||0,y=bb[i]||0;if(x!==y)return x>y}
    return false;
  }
  function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
  function menuInner(){return document.querySelector('#menuSheet .sheet-inner')}
  function removeRow(){document.querySelectorAll('[data-core-apk-update]').forEach(el=>el.remove())}
  function nativeDownloadState(){
    try{
      if(typeof window.CoreBridge?.getApkDownloadState!=='function')return '';
      return String(window.CoreBridge.getApkDownloadState()||'');
    }catch(_){return ''}
  }
  function nativeDownloadedVersion(){
    try{return String(window.CoreBridge?.getApkDownloadVersion?.()||'').trim()}catch(_){return ''}
  }
  function syncNativeDownloadState(){
    const state=nativeDownloadState();
    if(!state)return;
    if(state==='downloading'){setDownloadState('downloading');return}
    if(state==='ready'){
      const downloaded=nativeDownloadedVersion();
      if(latest&&downloaded&&newer(latest,downloaded)){setDownloadState('');return}
      setDownloadState('ready');return;
    }
    if(state==='failed'){setDownloadState('error');return}
    if(state==='none'&&(downloadState==='installing'||downloadState==='ready'))setDownloadState('');
  }
  function setDownloadState(state){
    if(downloadState===state)return;
    downloadState=state;
    render();
    clearInterval(downloadPoll);
    downloadPoll=0;
    if(state==='starting'||state==='downloading')downloadPoll=setInterval(syncNativeDownloadState,1000);
  }
  function stateDetail(){
    if(downloadState==='starting')return'Preparando descarga…';
    if(downloadState==='downloading')return'Descargando…';
    if(downloadState==='legacy-downloading')return'Descargando en Android…';
    if(downloadState==='ready')return'Descarga completa · tocá Instalar';
    if(downloadState==='legacy-ready')return'Descarga iniciada · tocá Instalar';
    if(downloadState==='legacy-opening'||downloadState==='installing')return'Abriendo el instalador de Android…';
    if(downloadState==='error')return'No se pudo descargar · tocá para reintentar';
    return'Última versión disponible';
  }
  function buttonLabel(defaultLabel){
    if(downloadState==='starting'||downloadState==='downloading'||downloadState==='legacy-downloading')return'Descargando…';
    if(downloadState==='ready'||downloadState==='legacy-ready')return'Instalar';
    if(downloadState==='legacy-opening'||downloadState==='installing')return'Abriendo…';
    if(downloadState==='error')return'Reintentar';
    return defaultLabel;
  }
  function launchLegacyDownload(url,installing){
    setDownloadState(installing?'legacy-opening':'legacy-downloading');
    try{
      if(window.CoreRuntimeBridge&&typeof window.CoreRuntimeBridge.downloadApk==='function'){
        const started=window.CoreRuntimeBridge.downloadApk(url,latest);
        if(started!==false)return true;
      }
    }catch(_){}
    try{
      if(window.CoreBridge&&typeof window.CoreBridge.downloadApk==='function'){
        window.CoreBridge.downloadApk(url);
        return true;
      }
    }catch(_){}
    try{window.open(url,'_system');return true}
    catch(_){setDownloadState('error');return false}
  }
  function download(version,ask){
    ask=!!ask;
    if(ask&&!window.confirm(version?'Descargar Boat Station '+version+'?':'Descargar la última versión de Boat Station?'))return false;
    const targetVersion=String(version||latest||'').trim();
    if(downloadState==='ready'||downloadState==='legacy-ready'){
      const downloaded=nativeDownloadedVersion();
      if(downloadState==='ready'&&latest&&downloaded&&newer(latest,downloaded)){
        setDownloadState('');
      }else if(typeof window.CoreBridge?.installDownloadedApk==='function'){
        try{
          const started=window.CoreBridge.installDownloadedApk();
          if(started!==false){setDownloadState('installing');return true}
        }catch(_){}
        setDownloadState('ready');return false;
      }else{
        return launchLegacyDownload(APK_URL,true);
      }
    }
    setDownloadState('starting');
    try{
      if(typeof window.CoreBridge?.startApkDownload==='function'){
        const started=window.CoreBridge.startApkDownload(APK_URL,targetVersion);
        if(started!==false){setDownloadState('downloading');syncNativeDownloadState();return true}
        setDownloadState('error');return false;
      }
    }catch(_){setDownloadState('error');return false}
    return launchLegacyDownload(APK_URL,false);
  }
  function render(){
    removeRow();
    const staticRow=document.querySelector('[data-server-apk-download]');
    const status=staticRow?.querySelector('small');
    const staticButton=staticRow?.querySelector('[data-server-apk-button]');
    const blocked=downloadState==='starting'||downloadState==='downloading'||downloadState==='legacy-downloading'||downloadState==='installing'||downloadState==='legacy-opening';
    if(status)status.textContent=stateDetail();
    if(staticButton){staticButton.textContent=buttonLabel('Descargar Última Versión');staticButton.disabled=blocked}
    if(!installed||!latest){if(staticRow)staticRow.hidden=false;return}
    const updateAvailable=newer(latest,installed);
    if(staticRow)staticRow.hidden=updateAvailable;
    if(!updateAvailable){if(status)status.textContent='Ya tenés la última versión';if(staticButton){staticButton.textContent='Última versión instalada';staticButton.disabled=true}return;}
    const inner=menuInner();if(!inner)return;
    const row=document.createElement('div');
    row.className='option remote-apk-row';
    row.dataset.coreApkUpdate='1';
    row.style.display='flex';
    row.style.alignItems='center';
    row.style.justifyContent='space-between';
    row.style.gap='12px';
    let sub=updateAvailable?'APK instalada: '+installed:'Versión instalada: '+installed;
    if(downloadState)sub=stateDetail();
    const heading=updateAvailable?'Nueva versión '+latest:'Última versión disponible';
    const label=buttonLabel(updateAvailable?'Actualizar':'Descargar Última Versión');
    row.innerHTML='<span style="min-width:0;flex:1">'+escapeHtml(heading)+'<br><small class="sub">'+escapeHtml(sub)+'</small></span><button type="button" class="btn" data-core-apk-download '+(blocked?'disabled':'')+'>'+escapeHtml(label)+'</button>';
    row.querySelector('[data-core-apk-download]')?.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();download(latest,false)});
    const title=inner.querySelector('h3');
    if(title&&title.nextSibling)inner.insertBefore(row,title.nextSibling);else inner.appendChild(row);
  }
  async function check(force){
    force=!!force;
    const now=Date.now();
    if(checking)return checkPromise||latest;
    if(!force&&now-lastCheck<5*60*1000)return latest;
    checking=true;lastCheck=now;
    const request=(async()=>{
      try{
        const response=await fetch(VERSION_URL+'?v='+now,{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
        if(response.ok){latest=(await response.text()).trim();render();syncNativeDownloadState()}
      }catch(_){}
      return latest;
    })();
    checkPromise=request;
    try{return await request}
    finally{checking=false;if(checkPromise===request)checkPromise=null}
  }
  function capture(value){
    const version=String(value?.version||value?.apkVersion||'').trim();
    if(!version)return;
    installed=version;render();check(true);
  }
  function wrapPhone(){
    const api=window.BoatStation;if(!api||typeof api.updatePhone!=='function')return false;
    if(api.updatePhone.__apkUpdateWrapped)return true;
    const original=api.updatePhone;
    function wrapped(value){capture(value);return original.call(api,value)}
    wrapped.__apkUpdateWrapped=true;api.updatePhone=wrapped;return true;
  }
  try{if(window.CoreBridge&&typeof CoreBridge.getApkVersion==='function')installed=String(CoreBridge.getApkVersion()||'').trim()}catch(_){}
  if(!wrapPhone()){const timer=setInterval(()=>{if(wrapPhone())clearInterval(timer)},50);setTimeout(()=>clearInterval(timer),10000)}
  document.getElementById('menuBtn')?.addEventListener('click',()=>{check(true);syncNativeDownloadState()},true);
  window.addEventListener('focus',()=>{
    if(downloadState==='legacy-opening'||downloadState==='legacy-downloading')setDownloadState('legacy-ready');
    check(false);syncNativeDownloadState();
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'){
      if(downloadState==='legacy-opening'||downloadState==='legacy-downloading')setDownloadState('legacy-ready');
      syncNativeDownloadState();
    }
  });
  window.addEventListener('boatstation-core-ready',()=>{try{if(window.CoreBridge&&typeof CoreBridge.getApkVersion==='function')installed=String(CoreBridge.getApkVersion()||'').trim()}catch(_){}check(true);syncNativeDownloadState()});
  window.addEventListener('boatstation-apk-install-error',()=>setDownloadState('ready'));
  setTimeout(()=>{check(true);syncNativeDownloadState()},1000);
  window.BoatStationApkUpdate={check:()=>check(true),getInstalled:()=>installed,getLatest:()=>latest,getLatestApkUrl:()=>APK_URL,downloadLatest:(ask=false)=>download(latest,ask)};
})();
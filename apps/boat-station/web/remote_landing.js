(function(){
  const params=new URLSearchParams(location.search);
  const isLocal=window.BoatStationRuntime?.isServer()??(params.get('mode')==='station'||!!window.CoreBridge||!!window.BoatStationCore||!!window.NativeBridge);
  if(isLocal)return;
  const isNative=window.BoatStationRuntime?.isNative?.()===true;

  document.documentElement.classList.add('bs-remote');
  const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,16);
  const pretty=v=>(norm(v).match(/.{1,4}/g)||[]).join('-');
  const stations=()=>{try{const a=JSON.parse(localStorage.getItem('bs.remote.stations')||'[]');return Array.isArray(a)?a:[]}catch{return[]}};
  const active=()=>{const a=stations(),id=localStorage.getItem('bs.remote.activeStation');return a.find(x=>x.stationId===id)||a[0]||null};
  const apkVersion=async()=>{try{const r=await fetch('/APK_VERSION?v='+Date.now(),{cache:'no-store',headers:{'Cache-Control':'no-cache'}});if(!r.ok)return'';return (await r.text()).trim()}catch{return''}};

  let installPrompt=null;
  const standalone=()=>window.matchMedia?.('(display-mode: standalone)')?.matches||window.navigator.standalone===true;
  const installBar=document.createElement('div');
  installBar.id='remoteInstallBar';
  installBar.className='remote-install-bar';
  installBar.innerHTML='<span>Instalá Boat Station Remote</span><div class="remote-install-actions"><button type="button" id="remoteInstallBtn">Instalar</button><button type="button" id="remoteInstallDismiss">Omitir</button></div>';
  const installBtn=installBar.querySelector('#remoteInstallBtn');
  const dismissBtn=installBar.querySelector('#remoteInstallDismiss');
  const hideInstall=()=>installBar.classList.remove('show');
  const showInstall=()=>{if(!standalone()&&installPrompt)installBar.classList.add('show')};
  document.body.appendChild(installBar);
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;showInstall()});
  window.addEventListener('appinstalled',()=>{installPrompt=null;hideInstall()});
  dismissBtn.onclick=()=>hideInstall();
  installBtn.onclick=async()=>{
    if(!installPrompt)return;
    hideInstall();
    try{await installPrompt.prompt();await installPrompt.userChoice}catch(_){}
    installPrompt=null;
  };
  if(standalone())hideInstall();

  if(active())return;

  const gate=document.createElement('div');gate.id='remoteLanding';
  gate.innerHTML='<div class="rl-card"><img class="rl-logo" src="./icon.png" alt="Boat Station"><h1>Boat Station Remote</h1><p class="rl-intro">'+(isNative?'Este teléfono está en modo cliente. Vinculalo a una estación o usalo como servidor.':'Accedé a Boat Station desde la web o instalá la app Android para convertir un teléfono en la estación del barco.')+'</p>'+(isNative?'<button class="rl-mode" id="rlUseServer" type="button">Usar este teléfono como servidor</button>':'<button class="rl-apk" id="rlApk" type="button">Descargar Boat Station APK</button>')+'<div class="rl-separator"><span>'+ (isNative?'Vincular como cliente':'Ya tenés la app') +'</span></div><p class="rl-pair-copy">Ingresá el código de vinculación que muestra Boat Station en el teléfono.</p><input id="rlCode" maxlength="19" placeholder="XXXX-XXXX-XXXX-XXXX" autocomplete="one-time-code"><button id="rlConnect" type="button">Vincular estación</button><button id="rlScan" type="button">Escanear QR de otra app</button><div class="rl-status" id="rlStatus"></div></div>';
  document.body.appendChild(gate);
  const input=gate.querySelector('#rlCode'),status=gate.querySelector('#rlStatus'),apkBtn=gate.querySelector('#rlApk'),scanBtn=gate.querySelector('#rlScan');
  gate.querySelector('#rlUseServer')?.addEventListener('click',()=>window.BoatStationRuntime?.setRole?.('server'));
  let scannedPair=null;
  if(!window.BoatStationRuntime?.isNative())scanBtn.hidden=true;
  scanBtn.onclick=()=>{status.textContent='Apuntá al QR que muestra la APK servidor.';try{window.NativeToolsBridge?.scanQr?.()}catch{status.textContent='No se pudo iniciar el escáner'}};
  window.addEventListener('boatstation-qr-scanned',event=>{if(!document.getElementById('remoteLanding'))return;try{const raw=String(event.detail?.value||'');let payload={};try{payload=JSON.parse(raw)}catch{payload={manualCode:raw}}const code=norm(payload.manualCode||String(payload.stationId||'').replace(/^bs-/i,''));if(code.length!==16)throw new Error('El QR no contiene un código de estación válido');const stationId=payload.stationId||'bs-'+code,token=payload.token||'pc-'+code;if(stationId!=='bs-'+code||token!=='pc-'+code)throw new Error('El QR no pertenece a una estación Boat Station válida');scannedPair={stationId,token,name:payload.stationName||payload.boatName||'Estación'};input.value=pretty(code);status.textContent='QR leído. Vinculando…';event.stopImmediatePropagation();gate.querySelector('#rlConnect').click()}catch(error){status.textContent=error.message||'No se pudo leer el QR';event.stopImmediatePropagation()}});
  if(apkBtn){let apkHref='/BoatStation.apk';apkVersion().then(v=>{if(v){apkBtn.textContent=`Descargar Boat Station APK ${v}`;apkHref=`/BoatStation-${v}.apk`}});apkBtn.onclick=()=>{window.location.href=apkHref};}
  input.addEventListener('input',()=>input.value=pretty(input.value));
  gate.querySelector('#rlConnect').onclick=()=>{
    const code=norm(input.value);
    if(code.length!==16){status.textContent='Ingresá los 16 caracteres';return}
    const row=scannedPair&&norm(scannedPair.stationId.replace(/^bs-/i,''))===code?scannedPair:{stationId:'bs-'+code,token:'pc-'+code,name:'Estación'};
    localStorage.setItem('bs.remote.stations',JSON.stringify([row]));
    localStorage.setItem('bs.remote.activeStation',row.stationId);
    location.reload();
  };
})();
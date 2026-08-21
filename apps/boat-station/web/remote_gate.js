(function(){
  const params=new URLSearchParams(location.search);
  const isInsideApk=params.get('mode')==='station'||!!window.CoreBridge||!!window.BoatStationCore;

  function adjustSupervisionMenu(){
    const btn=document.querySelector('#showQrBtn');
    if(!btn)return;
    const row=btn.closest('.option')||btn.parentElement;
    if(isInsideApk){
      btn.textContent='Mostrar QR para supervisar remotamente';
      btn.style.width='100%';
      if(row){Array.from(row.children).forEach(el=>{if(el!==btn)el.style.display='none'});row.style.display='flex'}
    }else if(row){row.style.display='none'}
  }

  function clearRemotePairing(){
    ['bs.remote.pairing','bs.remote.paired','bs.stationId','bs.pairingToken','bs.boatName'].forEach(k=>localStorage.removeItem(k));
    location.reload();
  }

  function ensureRemoteConnectionMenu(){
    if(isInsideApk)return;
    const inner=document.querySelector('#menuSheet .sheet-inner');
    if(!inner||document.querySelector('#remoteConnectionRow'))return;
    const paired=localStorage.getItem('bs.remote.paired')==='1';
    const boat=localStorage.getItem('bs.boatName')||'Boat Station';
    const row=document.createElement('div');
    row.className='option';
    row.id='remoteConnectionRow';
    row.innerHTML='<span>Conexión remota<br><small class="sub">'+(paired?'Conectado a '+boat:'Sin vincular')+'</small></span><button class="btn" id="remoteRelinkBtn">'+(paired?'Vincular otra':'Vincular')+'</button>';
    inner.appendChild(row);
    const unlink=document.createElement('div');
    unlink.className='option danger';
    unlink.id='remoteUnlinkRow';
    unlink.textContent='Desvincular Boat Station';
    if(paired)inner.appendChild(unlink);
    row.querySelector('#remoteRelinkBtn').onclick=clearRemotePairing;
    if(paired)unlink.onclick=clearRemotePairing;
  }

  function syncMenus(){adjustSupervisionMenu();ensureRemoteConnectionMenu()}
  syncMenus();
  new MutationObserver(syncMenus).observe(document.documentElement,{childList:true,subtree:true});
  if(isInsideApk)return;

  const style=document.createElement('style');
  style.textContent=`#bsRemoteGate{position:fixed;inset:0;z-index:10000;background:radial-gradient(circle at 70% -10%,#0d3450 0,#071c2d 34%,#061522 70%);color:#f4f8fb;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;padding:22px}#bsRemoteGate .gate-card{width:min(460px,100%);background:#0b2335;border:1px solid #17394f;border-radius:24px;padding:24px;box-shadow:0 18px 70px #0007;text-align:center}#bsRemoteGate .gate-logo{width:76px;height:76px;border-radius:18px;object-fit:contain;margin:0 auto 12px;display:block}#bsRemoteGate h1{margin:4px 0 6px;font-size:24px}#bsRemoteGate p{margin:0 0 18px;color:#94a7b6;line-height:1.45}#bsRemoteGate .gate-btn,#bsRemoteGate .gate-link{width:100%;min-height:48px;border-radius:13px;border:1px solid #24516a;background:#102f45;color:#fff;font-size:15px;font-weight:750;display:flex;align-items:center;justify-content:center;text-decoration:none;margin-top:10px;padding:10px 14px}#bsRemoteGate .gate-btn.primary{background:#123d54;border-color:#2d728f;color:#dffcff}#bsRemoteGate .gate-link{background:#081c2b;color:#9fdce6}#bsRemoteGate .manual{display:none;margin-top:14px}#bsRemoteGate .manual.open{display:block}#bsRemoteGate input{width:100%;box-sizing:border-box;background:#071827;color:#fff;border:1px solid #24516a;border-radius:12px;padding:13px;text-align:center;font-size:18px;letter-spacing:.12em;text-transform:uppercase;outline:none}#bsRemoteGate .hint{font-size:12px;color:#718797;margin-top:8px}#bsRemoteGate video{display:none;width:100%;border-radius:15px;margin-top:14px;background:#000;max-height:320px}#bsRemoteGate video.open{display:block}#bsRemoteGate .status{min-height:18px;margin-top:10px;font-size:13px;color:#9fdce6}`;
  document.head.appendChild(style);

  const gate=document.createElement('div');
  gate.id='bsRemoteGate';
  gate.innerHTML=`<div class="gate-card"><img class="gate-logo" src="boat_station_logo.png" onerror="this.src='icon.png'" alt="Boat Station"><h1>Boat Station</h1><p>Vinculá este dispositivo con la Boat Station del barco para ver sus módulos y datos.</p><button class="gate-btn primary" id="bsScanQr">Escanear QR</button><button class="gate-btn" id="bsManualToggle">Ingresar código</button><div class="manual" id="bsManualBox"><input id="bsManualCode" maxlength="19" inputmode="text" autocomplete="one-time-code" placeholder="XXXX-XXXX-XXXX-XXXX"><button class="gate-btn primary" id="bsManualConnect">Vincular</button><div class="hint">Código de 16 caracteres mostrado por Boat Station Local</div></div><video id="bsQrVideo" playsinline></video><div class="status" id="bsPairStatus"></div><a class="gate-link" id="bsApkDownload" href="/BoatStation.apk" download>Descargar APK de Boat Station</a></div>`;
  document.body.appendChild(gate);

  const status=gate.querySelector('#bsPairStatus'),manual=gate.querySelector('#bsManualBox'),input=gate.querySelector('#bsManualCode'),video=gate.querySelector('#bsQrVideo');
  let stream=null;
  fetch('/APK_VERSION',{cache:'no-store'}).then(r=>r.ok?r.text():Promise.reject()).then(v=>{v=v.trim();if(v){const a=gate.querySelector('#bsApkDownload');a.textContent='Descargar versión '+v;a.href='/BoatStation-Core-'+encodeURIComponent(v)+'.apk'}}).catch(()=>{});

  function normalizeCode(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,16)}
  function prettyCode(v){const s=normalizeCode(v);return s.match(/.{1,4}/g)?.join('-')||''}
  input.addEventListener('input',()=>{input.value=prettyCode(input.value)});

  function savePairing(payload){
    try{
      let data=payload;
      if(typeof data==='string'){
        const t=data.trim();
        data=t.startsWith('{')?JSON.parse(t):{manualCode:normalizeCode(t)};
      }
      localStorage.setItem('bs.remote.pairing',JSON.stringify(data));
      if(data.stationId)localStorage.setItem('bs.stationId',data.stationId);
      if(data.token)localStorage.setItem('bs.pairingToken',data.token);
      if(data.boatName)localStorage.setItem('bs.boatName',data.boatName);
      localStorage.setItem('bs.remote.paired','1');
      status.textContent='Vinculación guardada';
      stopCamera();
      gate.remove();
      window.dispatchEvent(new CustomEvent('boatstation-remote-paired',{detail:data}));
      const old=document.querySelector('#remoteConnectionRow');if(old)old.remove();
      const oldUnlink=document.querySelector('#remoteUnlinkRow');if(oldUnlink)oldUnlink.remove();
      ensureRemoteConnectionMenu();
    }catch(e){status.textContent='No se pudo interpretar la vinculación'}
  }

  gate.querySelector('#bsManualToggle').onclick=()=>{manual.classList.toggle('open');if(manual.classList.contains('open'))input.focus()};
  gate.querySelector('#bsManualConnect').onclick=()=>{const code=normalizeCode(input.value);if(code.length!==16){status.textContent='Ingresá los 16 caracteres';return}savePairing({type:'boat-station-manual',manualCode:code})};

  async function stopCamera(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}video.srcObject=null;video.classList.remove('open')}
  async function scanLoop(detector){if(!stream)return;try{const codes=await detector.detect(video);if(codes&&codes.length){savePairing(codes[0].rawValue||'');return}}catch(e){}requestAnimationFrame(()=>scanLoop(detector))}
  gate.querySelector('#bsScanQr').onclick=async()=>{
    if(!navigator.mediaDevices?.getUserMedia){status.textContent='La cámara no está disponible en este navegador';return}
    if(!('BarcodeDetector'in window)){status.textContent='Este navegador no admite lectura QR directa. Usá el código manual.';manual.classList.add('open');input.focus();return}
    try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});video.srcObject=stream;video.classList.add('open');await video.play();status.textContent='Apuntá la cámara al QR de Boat Station Local';const detector=new BarcodeDetector({formats:['qr_code']});scanLoop(detector)}catch(e){status.textContent='No se pudo abrir la cámara'}
  };

  if(localStorage.getItem('bs.remote.paired')==='1')gate.remove();
})();

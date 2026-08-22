(function(){
  const q=(s,r)=>(r||document).querySelector(s), qa=(s,r)=>Array.from((r||document).querySelectorAll(s));
  const params=new URLSearchParams(location.search);
  const isLocal=params.get('mode')==='station'||!!window.CoreBridge||!!window.BoatStationCore||!!window.NativeBridge;
  const base=()=>String(window.BOAT_STATION_BACKEND||'').replace(/\/$/,'');
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const normalize=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,16);
  const pretty=v=>(normalize(v).match(/.{1,4}/g)||[]).join('-');

  function detectedName(){
    const saved=localStorage.getItem('bs.stationName');if(saved)return saved;
    let n='';
    try{const ua=navigator.userAgent||'';const m=ua.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build\/|;|\))/i);if(m)n=m[1].trim()}catch(e){}
    if(!n)try{n=(navigator.userAgentData&&navigator.userAgentData.platform)||navigator.platform||''}catch(e){}
    if(!n||/^(Linux|Android|Win32|MacIntel|iPhone|iPad)$/i.test(n))n='Estación';
    localStorage.setItem('bs.stationName',n);return n;
  }
  function stationName(){return localStorage.getItem('bs.stationName')||detectedName()}
  function localIdentity(){
    let code=normalize(localStorage.getItem('bs.stationCode'));
    if(code.length!==16){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';code='';for(let i=0;i<16;i++)code+=chars[Math.floor(Math.random()*chars.length)];localStorage.setItem('bs.stationCode',code)}
    const stationId='bs-'+code,token='pc-'+code;
    localStorage.setItem('bs.stationId',stationId);localStorage.setItem('bs.pairingToken',token);localStorage.setItem('bs.boatName',stationName());
    return{stationId,token,manualCode:code,stationName:stationName(),boatName:stationName()};
  }
  function readStations(){try{const a=JSON.parse(localStorage.getItem('bs.remote.stations')||'[]');return Array.isArray(a)?a:[]}catch(e){return[]}}
  function writeStations(a){localStorage.setItem('bs.remote.stations',JSON.stringify(a));}
  function migrateLegacy(){
    let a=readStations();if(a.length)return a;
    try{const p=JSON.parse(localStorage.getItem('bs.remote.pairing')||'{}');if(p.stationId&&p.token){a=[{stationId:p.stationId,token:p.token,manualCode:p.manualCode||'',name:p.boatName||'Boat Station',addedAt:Date.now()}];writeStations(a);localStorage.setItem('bs.remote.activeStation',p.stationId)}}catch(e){}
    return a;
  }
  migrateLegacy();
  function addPair(data){
    if(typeof data==='string'){const t=data.trim();try{data=t.startsWith('{')?JSON.parse(t):{manualCode:normalize(t)}}catch(e){data={manualCode:normalize(t)}}}
    data=data||{};const code=normalize(data.manualCode||'');
    if(code.length===16&&!data.stationId){data.stationId='bs-'+code;data.token='pc-'+code;data.manualCode=code}
    if(!data.stationId||!data.token)throw new Error('Vinculación inválida');
    const a=readStations();const old=a.find(x=>x.stationId===data.stationId);const row={stationId:data.stationId,token:data.token,manualCode:data.manualCode||code,name:data.stationName||data.boatName||(old&&old.name)||'Boat Station',addedAt:(old&&old.addedAt)||Date.now(),lastSeen:(old&&old.lastSeen)||0};
    const out=a.filter(x=>x.stationId!==row.stationId);out.push(row);writeStations(out);localStorage.setItem('bs.remote.activeStation',row.stationId);localStorage.setItem('bs.remote.paired','1');localStorage.setItem('bs.remote.pairing',JSON.stringify(row));window.dispatchEvent(new CustomEvent('boatstation-remote-paired',{detail:row}));return row;
  }
  window.BoatStationStations={isLocal,readStations,addPair,active:function(){const a=readStations(),id=localStorage.getItem('bs.remote.activeStation');return a.find(x=>x.stationId===id)||a[0]||null},stationName};

  const css=document.createElement('style');css.textContent=`
  #stationManagerRow{cursor:pointer}.station-manager{position:fixed;inset:0;z-index:650;background:#071827;color:#f4f8fb;display:none;overflow:auto;padding:calc(env(safe-area-inset-top) + 14px) 14px calc(env(safe-area-inset-bottom) + 24px)}.station-manager.open{display:block}.sm-head{display:flex;align-items:center;gap:10px;margin-bottom:16px;position:sticky;top:0;background:#071827;padding:4px 0 10px;z-index:2}.sm-head h2{margin:0;font-size:20px}.sm-back{width:42px;height:42px;border:1px solid #24516a;border-radius:11px;background:#102f45;color:#fff;font-size:24px}.sm-card{background:#0b2335;border:1px solid #17394f;border-radius:16px;padding:14px;margin:10px 0}.sm-label{font-size:12px;color:#94a7b6;margin-bottom:6px}.sm-input{width:100%;background:#071827;color:#fff;border:1px solid #24516a;border-radius:11px;padding:12px;font-size:16px}.sm-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.sm-btn{min-height:44px;border:1px solid #24516a;background:#102f45;color:#fff;border-radius:11px;padding:10px;font-weight:700}.sm-btn.primary{border-color:#2d728f;background:#123d54;color:#dffcff}.sm-list{margin-top:8px}.sm-row{display:flex;align-items:center;gap:10px;border-top:1px solid #17394f;padding:12px 0}.sm-row:first-child{border-top:0}.sm-row-main{flex:1;min-width:0}.sm-name{font-weight:780;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sm-sub{font-size:12px;color:#94a7b6;margin-top:3px}.sm-active{color:#1ed7e5;font-size:12px;font-weight:800}.sm-code{font-size:24px;letter-spacing:.08em;text-align:center;font-weight:850;margin:8px 0 12px}.sm-qr{display:block;width:min(280px,80vw);height:min(280px,80vw);margin:10px auto;background:#fff;border-radius:12px}.sm-video{display:none;width:100%;max-height:54vh;background:#000;border-radius:14px;margin-top:10px}.sm-video.open{display:block}.sm-status{font-size:12px;color:#9fdce6;min-height:18px;margin-top:8px}.sm-danger{color:#ff8b8b}.sm-empty{color:#94a7b6;padding:12px 0}`;document.head.appendChild(css);

  const panel=document.createElement('div');panel.className='station-manager';panel.id='stationManager';panel.innerHTML='<div class="sm-head"><button class="sm-back" id="smBack">‹</button><h2>Gestión de Estaciones</h2></div><div id="smBody"></div>';document.body.appendChild(panel);q('#smBack').onclick=()=>closeManager();
  function closeManager(){panel.classList.remove('open');stopCamera()}
  function openManager(){q('#menuSheet')&&q('#menuSheet').classList.remove('open');panel.classList.add('open');renderManager()}

  function ensureMenu(){
    const inner=q('#menuSheet .sheet-inner');if(!inner)return;
    let row=q('#stationManagerRow',inner);if(!row){row=document.createElement('div');row.className='option';row.id='stationManagerRow';row.innerHTML='<span>Gestión de Estaciones<br><small class="sub" id="stationManagerSummary"></small></span><button class="btn">Abrir</button>';const version=qa('.option',inner).find(r=>(r.textContent||'').trim().startsWith('Versión'));if(version&&version.nextSibling)inner.insertBefore(row,version.nextSibling);else inner.appendChild(row);row.onclick=openManager}
    const s=q('#stationManagerSummary');if(s){if(isLocal)s.textContent='Esta estación: '+stationName();else{const a=readStations(),act=window.BoatStationStations.active();s.textContent=act?'Activa: '+(act.name||'Estación'):a.length+' vinculadas'}}
  }

  let stream=null;
  async function stopCamera(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}const v=q('#smVideo');if(v){v.srcObject=null;v.classList.remove('open')}}
  async function beginScan(){const status=q('#smStatus'),video=q('#smVideo');if(!navigator.mediaDevices?.getUserMedia){status.textContent='La cámara no está disponible';return}if(!('BarcodeDetector'in window)){status.textContent='Este navegador no admite lectura QR directa. Usá el código.';return}try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});video.srcObject=stream;video.classList.add('open');await video.play();status.textContent='Apuntá la cámara al QR';const det=new BarcodeDetector({formats:['qr_code']});(async function loop(){if(!stream)return;try{const c=await det.detect(video);if(c&&c.length){const row=addPair(c[0].rawValue||'');status.textContent='Vinculada a '+(row.name||'Boat Station');await stopCamera();renderManager();return}}catch(e){}requestAnimationFrame(loop)})()}catch(e){status.textContent='No se pudo abrir la cámara'}}

  function renderManager(){
    ensureMenu();const body=q('#smBody');const name=stationName();
    if(isLocal){
      const id=localIdentity();body.innerHTML='<div class="sm-card"><div class="sm-label">Nombre de la estación</div><input class="sm-input" id="smName" value="'+esc(name)+'"></div><div class="sm-card"><div class="sm-label">Vincular otra estación con esta</div><div class="sm-code">'+esc(pretty(id.manualCode))+'</div><img class="sm-qr" id="smQr" alt="QR de vinculación"><div class="sm-actions"><button class="sm-btn primary" id="smRefreshQr">Mostrar QR</button><button class="sm-btn" id="smCopyCode">Copiar código</button></div></div><div class="sm-card"><div class="sm-label">Estaciones conectadas a esta estación</div><div class="sm-list" id="smClients"><div class="sm-empty">Buscando estaciones conectadas…</div></div></div>';
      q('#smName').onchange=e=>{const v=e.target.value.trim()||'Estación';localStorage.setItem('bs.stationName',v);localStorage.setItem('bs.boatName',v);ensureMenu();renderManager()};
      const payload=JSON.stringify({type:'boat-station-pair',stationId:id.stationId,token:id.token,manualCode:id.manualCode,stationName:stationName(),boatName:stationName()});
      const show=()=>{const img=q('#smQr');if(window.V200Bridge&&typeof V200Bridge.qrDataUrl==='function')img.src=V200Bridge.qrDataUrl(payload);else img.style.display='none'};show();q('#smRefreshQr').onclick=show;q('#smCopyCode').onclick=async()=>{try{await navigator.clipboard.writeText(pretty(id.manualCode));q('#smCopyCode').textContent='Copiado'}catch(e){}};fetchClients();
    }else{
      const a=readStations(),active=window.BoatStationStations.active();let rows=a.map(x=>'<div class="sm-row"><div class="sm-row-main"><div class="sm-name">'+esc(x.name||'Boat Station')+'</div><div class="sm-sub">'+esc(x.stationId)+(active&&active.stationId===x.stationId?' · <span class="sm-active">ACTIVA</span>':'')+'</div></div><button class="sm-btn" data-active="'+esc(x.stationId)+'">'+(active&&active.stationId===x.stationId?'Activa':'Elegir')+'</button><button class="sm-btn sm-danger" data-remove="'+esc(x.stationId)+'">×</button></div>').join('');
      body.innerHTML='<div class="sm-card"><div class="sm-label">Nombre de la estación</div><input class="sm-input" id="smName" value="'+esc(name)+'"></div><div class="sm-card"><div class="sm-label">Conectar a una estación</div><div class="sm-actions"><button class="sm-btn primary" id="smScan">Escanear QR</button><button class="sm-btn" id="smManualToggle">Ingresar código</button></div><div id="smManual" style="display:none;margin-top:10px"><input class="sm-input" id="smCode" maxlength="19" placeholder="XXXX-XXXX-XXXX-XXXX"><button class="sm-btn primary" id="smConnect" style="width:100%;margin-top:8px">Vincular</button></div><video class="sm-video" id="smVideo" playsinline></video><div class="sm-status" id="smStatus"></div></div><div class="sm-card"><div class="sm-label">Estaciones vinculadas</div><div class="sm-list">'+(rows||'<div class="sm-empty">No hay estaciones vinculadas</div>')+'</div></div>';
      q('#smName').onchange=e=>{const v=e.target.value.trim()||'Estación';localStorage.setItem('bs.stationName',v);ensureMenu();renderManager()};q('#smScan').onclick=beginScan;q('#smManualToggle').onclick=()=>{const m=q('#smManual');m.style.display=m.style.display==='none'?'block':'none'};q('#smCode').oninput=e=>e.target.value=pretty(e.target.value);q('#smConnect').onclick=()=>{try{const row=addPair({manualCode:normalize(q('#smCode').value)});q('#smStatus').textContent='Vinculada a '+(row.name||'Boat Station');renderManager()}catch(e){q('#smStatus').textContent='Código inválido'}};
      qa('[data-active]',body).forEach(b=>b.onclick=()=>{localStorage.setItem('bs.remote.activeStation',b.dataset.active);window.dispatchEvent(new Event('boatstation-active-station-changed'));renderManager()});qa('[data-remove]',body).forEach(b=>b.onclick=()=>{let out=readStations().filter(x=>x.stationId!==b.dataset.remove);writeStations(out);if(localStorage.getItem('bs.remote.activeStation')===b.dataset.remove)localStorage.setItem('bs.remote.activeStation',out[0]?out[0].stationId:'');renderManager();window.dispatchEvent(new Event('boatstation-active-station-changed'))});
    }
  }
  async function fetchClients(){const wrap=q('#smClients');if(!wrap||!isLocal)return;const id=localIdentity(),b=base();if(!b){wrap.innerHTML='<div class="sm-empty">Backend no configurado</div>';return}try{const r=await fetch(b+'/api/station/'+encodeURIComponent(id.stationId)+'/clients',{headers:{Authorization:'Bearer '+id.token},cache:'no-store'});if(!r.ok)throw 0;const d=await r.json(),c=d.clients||[];wrap.innerHTML=c.length?c.map((x,i)=>'<div class="sm-row"><div class="sm-row-main"><div class="sm-name">'+esc(x.name||('Estación '+(i+1)))+'</div><div class="sm-sub">Conectada ahora</div></div></div>').join(''):'<div class="sm-empty">Ninguna estación conectada ahora</div>'}catch(e){wrap.innerHTML='<div class="sm-empty">No se pudo consultar las estaciones</div>'}}

  function publishLocal(){if(!isLocal)return;const b=base();if(!b)return;const id=localIdentity(),cards=q('#cards');const snapshot={cardsHtml:cards?cards.innerHTML:'',boatName:stationName()};fetch(b+'/api/station/'+encodeURIComponent(id.stationId)+'/state',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:id.token,boatName:stationName(),snapshot,version:window.BOAT_STATION_WEB_VERSION||null})}).catch(()=>{})}
  ensureMenu();new MutationObserver(ensureMenu).observe(document.documentElement,{childList:true,subtree:true});if(isLocal){publishLocal();setInterval(publishLocal,2000);setInterval(()=>{if(panel.classList.contains('open'))fetchClients()},3000)}
})();
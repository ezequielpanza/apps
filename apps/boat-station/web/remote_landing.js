(function(){
  const params=new URLSearchParams(location.search);
  const isLocal=params.get('mode')==='station'||!!window.CoreBridge||!!window.BoatStationCore||!!window.NativeBridge;
  if(isLocal)return;

  document.documentElement.classList.add('bs-remote');
  const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,16);
  const pretty=v=>(norm(v).match(/.{1,4}/g)||[]).join('-');
  const stations=()=>{try{const a=JSON.parse(localStorage.getItem('bs.remote.stations')||'[]');return Array.isArray(a)?a:[]}catch{return[]}};
  const active=()=>{const a=stations(),id=localStorage.getItem('bs.remote.activeStation');return a.find(x=>x.stationId===id)||a[0]||null};
  const apkVersion=async()=>{try{const r=await fetch('/APK_VERSION?v='+Date.now(),{cache:'no-store',headers:{'Cache-Control':'no-cache'}});if(!r.ok)return'';return (await r.text()).trim()}catch{return''}};

  if(active())return;

  const gate=document.createElement('div');gate.id='remoteLanding';
  gate.innerHTML='<div class="rl-card"><img class="rl-logo" src="./icon.png" alt="Boat Station"><h1>Boat Station</h1><p class="rl-intro">Accedé a Boat Station desde la web o instalá la app Android para convertir un teléfono en la estación del barco.</p><button class="rl-apk" id="rlApk" type="button">Descargar Boat Station APK</button><div class="rl-separator"><span>Ya tenés la app</span></div><p class="rl-pair-copy">Ingresá el código de vinculación que muestra Boat Station en el teléfono.</p><input id="rlCode" maxlength="19" placeholder="XXXX-XXXX-XXXX-XXXX" autocomplete="one-time-code"><button id="rlConnect" type="button">Vincular estación</button><div class="rl-status" id="rlStatus"></div></div>';
  document.body.appendChild(gate);
  const input=gate.querySelector('#rlCode'),status=gate.querySelector('#rlStatus'),apkBtn=gate.querySelector('#rlApk');
  let apkHref='/BoatStation.apk';
  apkVersion().then(v=>{if(v){apkBtn.textContent=`Descargar Boat Station APK ${v}`;apkHref=`/BoatStation-${v}.apk`}});
  apkBtn.onclick=()=>{window.location.href=apkHref};
  input.addEventListener('input',()=>input.value=pretty(input.value));
  gate.querySelector('#rlConnect').onclick=()=>{
    const code=norm(input.value);
    if(code.length!==16){status.textContent='Ingresá los 16 caracteres';return}
    const row={stationId:'bs-'+code,token:'pc-'+code,name:'Estación'};
    localStorage.setItem('bs.remote.stations',JSON.stringify([row]));
    localStorage.setItem('bs.remote.activeStation',row.stationId);
    location.reload();
  };
})();
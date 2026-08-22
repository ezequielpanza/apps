(function(){
  const params=new URLSearchParams(location.search);
  const isLocal=params.get('mode')==='station'||!!window.CoreBridge||!!window.BoatStationCore||!!window.NativeBridge;
  if(isLocal)return;

  document.documentElement.classList.add('bs-remote');
  const backend='https://boat-station-backend.ezequielpanza.workers.dev';
  const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,16);
  const pretty=v=>(norm(v).match(/.{1,4}/g)||[]).join('-');
  function stations(){try{const a=JSON.parse(localStorage.getItem('bs.remote.stations')||'[]');return Array.isArray(a)?a:[]}catch{return[]}}
  function active(){const a=stations(),id=localStorage.getItem('bs.remote.activeStation');return a.find(x=>x.stationId===id)||a[0]||null}

  const css=document.createElement('style');
  css.textContent=`
    html.bs-remote #cards{visibility:hidden}
    html.bs-remote #addBtn{display:none!important}
    #remoteLanding{position:fixed;inset:0;z-index:850;background:radial-gradient(circle at 50% 0,#0e3148 0,#071b2b 42%,#061522 100%);display:flex;align-items:center;justify-content:center;padding:24px;color:#f4f8fb;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
    #remoteLanding .rl-card{width:min(430px,100%);text-align:center;padding:28px 24px;border:1px solid #17394f;border-radius:26px;background:#0b2335;box-shadow:0 24px 80px #0008}
    #remoteLanding .rl-logo{width:86px;height:86px;border-radius:20px;display:block;margin:0 auto 14px}
    #remoteLanding h1{font-size:27px;margin:0 0 8px;letter-spacing:.02em}
    #remoteLanding p{margin:0 auto 20px;color:#94a7b6;line-height:1.45;max-width:330px}
    #remoteLanding input{width:100%;background:#071827;color:#fff;border:1px solid #2a5972;border-radius:14px;padding:14px 12px;text-align:center;font-size:20px;font-weight:750;letter-spacing:.08em;text-transform:uppercase;outline:none}
    #remoteLanding button{width:100%;margin-top:10px;min-height:48px;border:1px solid #2f6682;background:#102f45;color:#e8f4f9;border-radius:14px;font-size:16px;font-weight:750}
    #remoteLanding .rl-status{min-height:19px;margin-top:10px;color:#9fdce6;font-size:13px}
  `;
  document.head.appendChild(css);

  const current=active();
  if(current){
    const clientId=localStorage.getItem('bs.remote.clientId')||('web-'+Math.random().toString(36).slice(2)+Date.now().toString(36));
    localStorage.setItem('bs.remote.clientId',clientId);
    async function sync(){
      try{
        const r=await fetch(`${backend}/api/station/${encodeURIComponent(current.stationId)}/state?clientId=${encodeURIComponent(clientId)}&clientName=${encodeURIComponent(localStorage.getItem('bs.stationName')||'Web')}`,{headers:{Authorization:'Bearer '+current.token},cache:'no-store'});
        if(!r.ok)return;
        const d=await r.json();
        if(!d.snapshot?.cardsHtml)return;
        const cards=document.getElementById('cards');if(cards)cards.innerHTML=d.snapshot.cardsHtml;
        document.documentElement.classList.remove('bs-remote');
      }catch{}
    }
    setTimeout(sync,100);setInterval(sync,2000);
    return;
  }

  const gate=document.createElement('div');gate.id='remoteLanding';
  gate.innerHTML='<div class="rl-card"><img class="rl-logo" src="./icon.png" alt="Boat Station"><h1>Boat Station</h1><p>Ingresá el código de vinculación que muestra la estación del barco.</p><input id="rlCode" maxlength="19" placeholder="XXXX-XXXX-XXXX-XXXX" autocomplete="one-time-code"><button id="rlConnect">Vincular estación</button><div class="rl-status" id="rlStatus"></div></div>';
  document.body.appendChild(gate);
  const input=gate.querySelector('#rlCode'),status=gate.querySelector('#rlStatus');
  input.addEventListener('input',()=>input.value=pretty(input.value));
  gate.querySelector('#rlConnect').onclick=()=>{
    const code=norm(input.value);
    if(code.length!==16){status.textContent='Ingresá los 16 caracteres';return}
    const row={stationId:'bs-'+code,token:'pc-'+code,name:'Estación'};
    localStorage.setItem('bs.remote.stations',JSON.stringify([row]));
    localStorage.setItem('bs.remote.activeStation',row.stationId);
    localStorage.setItem('bs.remote.paired','1');
    location.reload();
  };
})();

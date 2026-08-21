(function(){
  const params=new URLSearchParams(location.search);
  const isCore=params.get('mode')==='station'||!!window.CoreBridge||!!window.BoatStationCore;
  if(isCore)return;

  const q=(s,r)=> (r||document).querySelector(s);
  let clientId=localStorage.getItem('bs.remote.clientId');
  if(!clientId){clientId='web-'+Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem('bs.remote.clientId',clientId)}
  const clientName=localStorage.getItem('bs.remote.clientName')||navigator.platform||'Web Remote';
  let lastOk=0,lastBoat='';

  function pair(){
    let p={};try{p=JSON.parse(localStorage.getItem('bs.remote.pairing')||'{}')}catch(e){}
    const manual=(p.manualCode||'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
    if(manual.length===16&&!p.stationId){p.stationId='bs-'+manual;p.token='pc-'+manual;localStorage.setItem('bs.remote.pairing',JSON.stringify(p));localStorage.setItem('bs.stationId',p.stationId);localStorage.setItem('bs.pairingToken',p.token)}
    p.stationId=p.stationId||localStorage.getItem('bs.stationId')||'';
    p.token=p.token||localStorage.getItem('bs.pairingToken')||'';
    return p;
  }
  function backend(){return String(window.BOAT_STATION_BACKEND||'').replace(/\/$/,'')}
  function statusRow(){
    const inner=q('#menuSheet .sheet-inner');if(!inner)return null;
    let row=q('#remoteConnectionStatus',inner);
    if(!row){row=document.createElement('div');row.className='option';row.id='remoteConnectionStatus';row.innerHTML='<span>Conexión remota<br><small class="sub" id="remoteConnectionText">Sin datos</small></span><span class="status" id="remoteConnectionAge"></span>';inner.appendChild(row)}
    return row;
  }
  function renderConnection(){
    statusRow();
    const t=q('#remoteConnectionText'),a=q('#remoteConnectionAge');if(!t||!a)return;
    const age=lastOk?Math.round((Date.now()-lastOk)/1000):null;
    t.textContent=lastBoat?('Conectado a '+lastBoat):'Esperando datos de Boat Station';
    a.textContent=age==null?'':(age<5?'Ahora':age+' s');
    a.className='status'+(age!=null&&age<15?' ok':'');
  }
  function applySnapshot(data){
    const snap=data&&data.snapshot||{};
    lastBoat=data.boatName||snap.boatName||'Boat Station';lastOk=Date.now();
    if(snap.cardsHtml){const cards=q('#cards');if(cards&&cards.innerHTML!==snap.cardsHtml)cards.innerHTML=snap.cardsHtml}
    const add=q('#addBtn');if(add)add.style.display='none';
    document.body.dataset.remoteMode='1';
    renderConnection();
  }
  async function poll(){
    const p=pair(),base=backend();
    if(!base||!p.stationId||!p.token){renderConnection();return}
    try{
      const u=base+'/api/station/'+encodeURIComponent(p.stationId)+'/state?clientId='+encodeURIComponent(clientId)+'&clientName='+encodeURIComponent(clientName);
      const r=await fetch(u,{headers:{Authorization:'Bearer '+p.token},cache:'no-store'});
      if(!r.ok)throw new Error('HTTP '+r.status);
      applySnapshot(await r.json());
    }catch(e){renderConnection()}
  }
  window.addEventListener('boatstation-remote-paired',()=>{lastOk=0;poll()});
  poll();setInterval(poll,2000);setInterval(renderConnection,1000);
})();

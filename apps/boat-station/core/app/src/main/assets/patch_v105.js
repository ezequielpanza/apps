(function(){
  const BACKEND='https://boat-station-backend.ezequielpanza.workers.dev';
  const q=(s,r)=> (r||document).querySelector(s),qa=(s,r)=>Array.from((r||document).querySelectorAll(s));
  let lastPublish=0,lastClients=0,publishing=false;

  function identity(){
    let code=(localStorage.getItem('bs.pairingCode')||'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
    if(code.length!==16)return null;
    const stationId='bs-'+code,token='pc-'+code;
    localStorage.setItem('bs.stationId',stationId);localStorage.setItem('bs.pairingToken',token);
    return {stationId,token};
  }
  function boatName(){return localStorage.getItem('bs.boatName')||localStorage.getItem('boatName')||'Boat Station'}
  function snapshot(){
    const cards=q('#cards');
    return {boatName:boatName(),cardsHtml:cards?cards.innerHTML:'',capturedAt:Date.now(),order:(()=>{try{return JSON.parse(localStorage.getItem('bs.order')||'[]')}catch(e){return[]}})()};
  }
  async function publish(){
    const id=identity();if(!id||publishing)return;
    publishing=true;
    try{
      await fetch(BACKEND+'/api/station/'+encodeURIComponent(id.stationId)+'/state',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:id.token,boatName:boatName(),version:'1.0.5',snapshot:snapshot()})});
      lastPublish=Date.now();
    }catch(e){}finally{publishing=false}
  }
  function ensureRemoteRow(){
    const btn=q('#showQrBtn');if(!btn)return null;
    const row=btn.closest('.option')||btn.parentElement;
    if(row){
      const label=Array.from(row.children).find(el=>el!==btn);
      if(label)label.textContent='Supervisión remota';
      btn.textContent='Mostrar QR para supervisar remotamente';
      btn.style.width='auto';
    }
    const inner=q('#menuSheet .sheet-inner');if(!inner)return row;
    let clients=q('#connectedClientsRow',inner);
    if(!clients){clients=document.createElement('div');clients.id='connectedClientsRow';clients.className='option';clients.innerHTML='<span>Clientes conectados<br><small class="sub" id="connectedClientsNames">Ninguno</small></span><b id="connectedClientsCount">0</b>';if(row&&row.nextSibling)inner.insertBefore(clients,row.nextSibling);else inner.appendChild(clients)}
    return clients;
  }
  async function refreshClients(){
    ensureRemoteRow();const id=identity();if(!id)return;
    try{
      const r=await fetch(BACKEND+'/api/station/'+encodeURIComponent(id.stationId)+'/clients',{headers:{Authorization:'Bearer '+id.token},cache:'no-store'});if(!r.ok)return;
      const d=await r.json(),clients=d.clients||[];
      const c=q('#connectedClientsCount'),n=q('#connectedClientsNames');if(c)c.textContent=String(clients.length);if(n)n.textContent=clients.length?clients.map(x=>x.name||'Remote').join(', '):'Ninguno';lastClients=Date.now();
    }catch(e){}
  }
  function tick(){ensureRemoteRow();if(Date.now()-lastPublish>1800)publish();if(Date.now()-lastClients>4500)refreshClients()}
  tick();setInterval(tick,1000);
})();

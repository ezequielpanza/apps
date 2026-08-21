(function(){
  const q=(s,r)=> (r||document).querySelector(s);
  const qa=(s,r)=>Array.from((r||document).querySelectorAll(s));
  const VERSION='1.0.2';
  const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function randomCode(){
    let raw='';
    try{
      const a=new Uint8Array(16);crypto.getRandomValues(a);
      for(let i=0;i<16;i++)raw+=ALPHABET[a[i]%ALPHABET.length];
    }catch(e){
      for(let i=0;i<16;i++)raw+=ALPHABET[Math.floor(Math.random()*ALPHABET.length)];
    }
    return raw.match(/.{1,4}/g).join('-');
  }
  function pairingCode(){
    let c=localStorage.getItem('bs.pairingCode');
    if(!c){c=randomCode();localStorage.setItem('bs.pairingCode',c)}
    return c;
  }
  function pairingIdentity(){
    const code=pairingCode();
    const compact=code.replace(/-/g,'');
    const stationId='bs-'+compact;
    const token='pc-'+compact;
    localStorage.setItem('bs.stationId',stationId);
    localStorage.setItem('bs.pairingToken',token);
    return {code,stationId,token};
  }
  function showCode(sheet,code){
    let box=q('#pairingManualCode',sheet);
    if(!box){
      box=document.createElement('div');
      box.id='pairingManualCode';
      box.style.cssText='margin:14px 0 4px;padding:14px 12px;border:1px solid #24516a;border-radius:14px;background:#081c2b;text-align:center';
      box.innerHTML='<div style="font-size:11px;color:#94a7b6;margin-bottom:6px">CÓDIGO DE VINCULACIÓN</div><div class="pair-code" style="font-size:22px;font-weight:850;letter-spacing:.12em;color:#f4f8fb"></div><div style="font-size:11px;color:#94a7b6;margin-top:7px">También podés ingresarlo manualmente en Boat Station Remote.</div>';
      const raw=q('#pairingRaw',sheet);
      if(raw&&raw.parentNode)raw.parentNode.insertBefore(box,raw);else sheet.querySelector('.sheet-inner')?.appendChild(box);
    }
    q('.pair-code',box).textContent=code;
  }
  function installPairingOverride(){
    const btn=q('#showQrBtn'),sheet=q('#pairingSheet');
    if(!btn||!sheet||btn.dataset.v102==='1')return;
    btn.dataset.v102='1';
    btn.addEventListener('click',()=>{
      setTimeout(()=>{
        const id=pairingIdentity();
        let ids=[];try{ids=JSON.parse(localStorage.getItem('bs.order')||'[]')}catch(e){}
        const names={gps:'GPS',phone:'Estado del teléfono',seastate:'Sea State',compass:'Brújula'};
        const mods=ids.map(x=>names[x]||(String(x).startsWith('bank-')?'Banco de baterías':x));
        const payload=JSON.stringify({type:'boat-station-pair',version:VERSION,stationId:id.stationId,token:id.token,pairingCode:id.code,boatName:localStorage.getItem('bs.boatName')||localStorage.getItem('boatName')||'Boat Station',modules:mods});
        const raw=q('#pairingRaw');if(raw)raw.textContent=payload;
        const qr=q('#pairingQr');if(qr&&window.V200Bridge&&V200Bridge.qrDataUrl)qr.src=V200Bridge.qrDataUrl(payload);
        showCode(sheet,id.code);
      },0);
    },true);
  }
  function fixBatteryScanList(){
    const area=q('#batteryScanArea');
    if(!area||area.dataset.v102==='1')return;
    area.dataset.v102='1';
    area.addEventListener('click',e=>{
      const pick=e.target.closest('[data-pick]');
      if(!pick)return;
      setTimeout(()=>{
        area.innerHTML='';
        const st=q('#btState');if(st)st.textContent='Conectando…';
      },80);
    },true);
  }
  function setVersion(){
    const web=q('#webVersion');if(web)web.textContent='Web '+VERSION;
    qa('#menuSheet .option').forEach(r=>{if((r.textContent||'').trim().startsWith('Versión')){const s=q('small',r);if(s)s.textContent=VERSION}});
  }
  function tick(){setVersion();installPairingOverride();fixBatteryScanList()}
  tick();
  setInterval(tick,2500);
  const root=document.body;
  if(root)new MutationObserver(()=>{clearTimeout(window.__bsV102mo);window.__bsV102mo=setTimeout(tick,120)}).observe(root,{childList:true,subtree:true});
})();

export function createGpsModule(requestRender){
  const state={fix:null,recording:false,route:[],importName:'',root:null};
  const fmt=(v,n=6)=>Number.isFinite(Number(v))?Number(v).toFixed(n):'—';
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

  function summary(){
    if(!state.fix)return 'Sin señal';
    return `${fmt(state.fix.lat,4)}, ${fmt(state.fix.lon,4)}`;
  }

  function page(index){
    if(index===0){
      const f=state.fix||{};
      return `<div class="gps-coords"><div class="gps-coord"><div class="value" data-gps-lat>${fmt(f.lat)}°</div><div class="label">Latitud</div></div><div class="gps-coord"><div class="value" data-gps-lon>${fmt(f.lon)}°</div><div class="label">Longitud</div></div></div><div class="metric-grid three"><div class="metric"><div class="value" data-gps-speed>${Number.isFinite(Number(f.speedKts))?Number(f.speedKts).toFixed(1):'—'} kn</div><div class="label">Velocidad</div></div><div class="metric"><div class="value" data-gps-bearing>${Number.isFinite(Number(f.bearing))?Math.round(Number(f.bearing)):'—'}°</div><div class="label">Rumbo</div></div><div class="metric"><div class="value" data-gps-accuracy>${Number.isFinite(Number(f.accuracy))?Math.round(Number(f.accuracy)):'—'} m</div><div class="label">Precisión</div></div></div>`;
    }
    return `<canvas class="gps-map" data-gps-map></canvas><div class="gps-actions"><button class="btn" data-gps-action="${state.recording?'stop':'start'}">${state.recording?'Detener grabación':'Iniciar grabación'}</button><button class="btn" data-gps-action="export" ${state.route.length?'':'disabled'}>Exportar ruta</button><button class="btn" data-gps-action="import">Importar ruta</button><button class="btn" data-gps-action="clear" ${state.route.length?'':'disabled'}>Limpiar ruta</button></div><div class="gps-status ${state.recording?'gps-rec':''}" data-gps-status>${statusText()}</div><input data-gps-file type="file" accept=".gpx,application/gpx+xml,text/xml" hidden>`;
  }

  function statusText(){
    return `${state.recording?'● Grabando ruta · ':''}${state.route.length} puntos${state.importName?` · ${esc(state.importName)}`:''}`;
  }

  function setText(selector,value){
    const el=state.root?.querySelector(selector);
    if(el&&el.textContent!==value)el.textContent=value;
  }

  function refreshLive(){
    const root=state.root;if(!root)return;
    const f=state.fix||{};
    const summaryEl=root.querySelector('.summary');
    if(summaryEl)summaryEl.textContent=summary();
    setText('[data-gps-lat]',`${fmt(f.lat)}°`);
    setText('[data-gps-lon]',`${fmt(f.lon)}°`);
    setText('[data-gps-speed]',`${Number.isFinite(Number(f.speedKts))?Number(f.speedKts).toFixed(1):'—'} kn`);
    setText('[data-gps-bearing]',`${Number.isFinite(Number(f.bearing))?Math.round(Number(f.bearing)):'—'}°`);
    setText('[data-gps-accuracy]',`${Number.isFinite(Number(f.accuracy))?Math.round(Number(f.accuracy)):'—'} m`);
    const status=root.querySelector('[data-gps-status]');
    if(status){status.textContent=statusText();status.classList.toggle('gps-rec',state.recording)}
    draw(root);
  }

  function update(fix){
    if(!fix||!Number.isFinite(Number(fix.lat))||!Number.isFinite(Number(fix.lon)))return;
    state.fix={...fix,lat:Number(fix.lat),lon:Number(fix.lon)};
    if(state.recording){
      const last=state.route[state.route.length-1];
      const next={lat:state.fix.lat,lon:state.fix.lon,time:state.fix.time||Date.now()};
      if(!last||last.lat!==next.lat||last.lon!==next.lon)state.route.push(next);
    }
    refreshLive();
  }

  function exportGpx(){
    if(!state.route.length)return;
    const pts=state.route.map(p=>`<trkpt lat="${p.lat}" lon="${p.lon}"><time>${new Date(p.time||Date.now()).toISOString()}</time></trkpt>`).join('');
    const xml=`<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Boat Station"><trk><name>Boat Station route</name><trkseg>${pts}</trkseg></trk></gpx>`;
    const url=URL.createObjectURL(new Blob([xml],{type:'application/gpx+xml'}));
    const a=document.createElement('a');a.href=url;a.download=`boat-station-route-${new Date().toISOString().replace(/[:.]/g,'-')}.gpx`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function importGpx(file){
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const doc=new DOMParser().parseFromString(String(reader.result),'application/xml');
        const pts=[...doc.querySelectorAll('trkpt')].map(n=>({lat:Number(n.getAttribute('lat')),lon:Number(n.getAttribute('lon')),time:Date.parse(n.querySelector('time')?.textContent||'')||Date.now()})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));
        if(!pts.length)return;
        state.route=pts;state.importName=file.name||'Ruta importada';requestRender('gps');
      }catch(_){ }
    };
    reader.readAsText(file);
  }

  function handleAction(action,root){
    if(action==='start'){state.recording=true;state.route=[];state.importName='';requestRender('gps');}
    else if(action==='stop'){state.recording=false;requestRender('gps');}
    else if(action==='export')exportGpx();
    else if(action==='import')root.querySelector('[data-gps-file]')?.click();
    else if(action==='clear'){state.recording=false;state.route=[];state.importName='';requestRender('gps');}
  }

  function draw(root){
    const canvas=root.querySelector('[data-gps-map]');if(!canvas)return;
    const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const dpr=window.devicePixelRatio||1;canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);const w=rect.width,h=rect.height;
    ctx.clearRect(0,0,w,h);ctx.strokeStyle='#17394f';ctx.lineWidth=1;
    for(let i=1;i<5;i++){const x=i*w/5,y=i*h/5;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
    const pts=state.route.length?state.route:(state.fix?[{lat:state.fix.lat,lon:state.fix.lon}]:[]);
    if(!pts.length){ctx.fillStyle='#94a7b6';ctx.font='13px sans-serif';ctx.fillText('Sin ruta GPS',12,22);return}
    const lats=pts.map(p=>p.lat),lons=pts.map(p=>p.lon),minLat=Math.min(...lats),maxLat=Math.max(...lats),minLon=Math.min(...lons),maxLon=Math.max(...lons),pad=18;
    const sx=v=>pad+(w-pad*2)*(v-minLon)/Math.max(0.000001,maxLon-minLon),sy=v=>h-pad-(h-pad*2)*(v-minLat)/Math.max(0.000001,maxLat-minLat);
    ctx.strokeStyle='#1ed7e5';ctx.lineWidth=2.5;ctx.beginPath();pts.forEach((p,i)=>{const x=sx(p.lon),y=sy(p.lat);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();
    const last=pts[pts.length-1];ctx.fillStyle='#8bd332';ctx.beginPath();ctx.arc(sx(last.lon),sy(last.lat),5,0,Math.PI*2);ctx.fill();
  }

  function afterRender(root){
    state.root=root;
    draw(root);
    root.querySelectorAll('[data-gps-action]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();handleAction(btn.dataset.gpsAction,root)}));
    root.querySelector('[data-gps-file]')?.addEventListener('change',e=>importGpx(e.target.files?.[0]));
  }

  return {id:'gps',name:'GPS',pages:2,summary,page,afterRender,update,state};
}

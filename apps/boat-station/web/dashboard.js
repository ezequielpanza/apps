import {number,position,fresh,vesselPosition,boatFootprint} from './dashboard-model.mjs';
const $=id=>document.getElementById(id),backend='https://boat-station-backend.ezequielpanza.workers.dev';
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}};
const stations=()=>{const rows=read('bs.remote.stations',[]);return Array.isArray(rows)?rows.filter(row=>row&&typeof row.stationId==='string'&&typeof row.token==='string'):[]};
const save=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
const records=new Map();let selected=localStorage.getItem('bs.remote.activeStation')||stations()[0]?.stationId||'',timer=0,running=false,pending=false,map=null,layer=null,baseLayer=null,baseMode=localStorage.getItem('bs.dashboard.basemap')||'street',fitPending=true;
const sensorFrame=$('sensorFrame');
const sensorResize=$('sensorResize');
const wakeButton=$('keepScreenOn'),wakeStatus=$('screenWakeStatus'),wakeKey='bs.dashboard.keepScreenOn';
let wakeEnabled=localStorage.getItem(wakeKey)==='true',wakeLock=null,wakeRequest=null,wakeGeneration=0;
function renderWakeStatus(message){wakeButton.setAttribute('aria-pressed',String(wakeEnabled));wakeStatus.textContent=message;wakeStatus.classList.toggle('connected',!!wakeLock)}
async function acquireWakeLock(){
  if(!wakeEnabled||document.hidden||wakeLock||wakeRequest)return;
  if(!navigator.wakeLock?.request){renderWakeStatus('No disponible en este dispositivo o navegador.');return}
  const generation=wakeGeneration;
  renderWakeStatus('Activando…');
  wakeRequest=navigator.wakeLock.request('screen');
  try{
    const lock=await wakeRequest;
    if(!wakeEnabled||document.hidden||generation!==wakeGeneration){await lock.release();return}
    wakeLock=lock;
    lock.addEventListener('release',()=>{if(wakeLock!==lock)return;wakeLock=null;if(wakeEnabled)renderWakeStatus(document.hidden?'En pausa hasta volver al Dashboard.':'El sistema liberó la pantalla. Desactivá y activá para reintentar.');else renderWakeStatus('Desactivado.');});
    renderWakeStatus('Pantalla encendida activa.');
  }catch(error){if(wakeEnabled&&generation===wakeGeneration)renderWakeStatus('No se pudo mantener la pantalla encendida. Desactivá y activá para reintentar.');}
  finally{wakeRequest=null;if(wakeEnabled&&!document.hidden&&generation!==wakeGeneration)acquireWakeLock()}
}
wakeButton.addEventListener('click',()=>{
  wakeEnabled=!wakeEnabled;wakeGeneration++;localStorage.setItem(wakeKey,String(wakeEnabled));
  if(wakeEnabled)acquireWakeLock();else{const lock=wakeLock;wakeLock=null;if(lock)lock.release().catch(()=>{});renderWakeStatus('Desactivado.')}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&wakeEnabled){wakeGeneration++;const lock=wakeLock;wakeLock=null;if(lock)lock.release().catch(()=>{});renderWakeStatus('En pausa hasta volver al Dashboard.')}else if(wakeEnabled)acquireWakeLock()});
renderWakeStatus(wakeEnabled?'Activando…':'Desactivado.');if(wakeEnabled)acquireWakeLock();
const maximizeSensors=$('maximizeSensors'),maximizeSensorsThree=$('maximizeSensorsThree'),showMap=$('showMap'),sensorStatus=$('sensorStatus'),dashboardMain=document.querySelector('main');let sensorColumns=0,statusObserver=null,bootstrapObserver=null;
const toggleFleet=$('toggleFleet');let sidebarClosed=localStorage.getItem('bs.dashboard.sidebarClosed')==='true';function setSidebarClosed(value){sidebarClosed=!!value;dashboardMain.classList.toggle('sidebar-closed',sidebarClosed);toggleFleet.setAttribute('aria-expanded',String(!sidebarClosed));toggleFleet.setAttribute('aria-label',sidebarClosed?'Abrir barra de Mi flota':'Cerrar barra de Mi flota');localStorage.setItem('bs.dashboard.sidebarClosed',String(sidebarClosed));requestAnimationFrame(()=>{map?.invalidateSize({pan:false});try{const win=sensorFrame.contentWindow;if(win)win.dispatchEvent(new win.Event('resize'))}catch{}})}toggleFleet.addEventListener('click',()=>setSidebarClosed(!sidebarClosed));setSidebarClosed(sidebarClosed);
function applySensorLayout(){try{const doc=sensorFrame.contentDocument,root=doc?.documentElement;if(root){root.classList.add('bs-dashboard-embedded');root.classList.toggle('bs-dashboard-expanded',sensorColumns>0);root.classList.toggle('bs-dashboard-three',sensorColumns===3)}const win=sensorFrame.contentWindow;if(win)setTimeout(()=>win.dispatchEvent(new win.Event('resize')),80)}catch(error){console.warn('No se pudo actualizar el diseño de sensores',error)}}
function connectSensorStatus(){try{statusObserver?.disconnect();bootstrapObserver?.disconnect();const doc=sensorFrame.contentDocument;if(!doc?.body)return;const attach=()=>{const source=doc.getElementById('remoteFreshness');if(!source)return false;const sync=()=>{sensorStatus.textContent=source.textContent.trim()||'Esperando conexión…';sensorStatus.classList.toggle('connected',source.classList.contains('connected'))};sync();statusObserver=new MutationObserver(sync);statusObserver.observe(source,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class']});bootstrapObserver?.disconnect();return true};if(!attach()){bootstrapObserver=new MutationObserver(attach);bootstrapObserver.observe(doc.body,{childList:true,subtree:true})}}catch(error){console.warn('No se pudo leer el estado de sensores',error)}}
sensorFrame.addEventListener('load',()=>{applySensorLayout();connectSensorStatus()});
function setSensorColumns(columns){sensorColumns=columns;dashboardMain.classList.toggle('sensors-maximized',columns>0);maximizeSensors.setAttribute('aria-pressed',String(columns===2));maximizeSensorsThree.setAttribute('aria-pressed',String(columns===3));showMap.hidden=columns===0;applySensorLayout();requestAnimationFrame(()=>map?.invalidateSize({pan:false}))}
maximizeSensors.addEventListener('click',()=>setSensorColumns(2));maximizeSensorsThree.addEventListener('click',()=>setSensorColumns(3));showMap.addEventListener('click',()=>setSensorColumns(0));
$('sensorMenu').addEventListener('click',()=>{try{sensorFrame.contentDocument?.getElementById('menuBtn')?.click()}catch(error){console.warn('Menú de sensores no disponible',error)}});
function applySensorWidth(value){const tabletLandscape=window.matchMedia('(min-width: 768px) and (max-width: 1100px) and (orientation: landscape)').matches,available=Math.max(220,window.innerWidth-(tabletLandscape?190:250)-(tabletLandscape?220:260)-8),width=Math.max(220,Math.min(560,available,Number(value)||300));document.documentElement.style.setProperty('--sensor-width',width+'px');localStorage.setItem('bs.dashboard.sensorWidth',String(width));sensorResize.setAttribute('aria-valuenow',String(width));requestAnimationFrame(()=>map?.invalidateSize({pan:false}))}
applySensorWidth(localStorage.getItem('bs.dashboard.sensorWidth')||300);
let resizePointer=null;
sensorResize.addEventListener('pointerdown',event=>{if(getComputedStyle(sensorResize).display==='none')return;resizePointer=event.pointerId;sensorResize.setPointerCapture(event.pointerId);sensorResize.classList.add('dragging');event.preventDefault()});
sensorResize.addEventListener('pointermove',event=>{if(resizePointer===event.pointerId)applySensorWidth(window.innerWidth-event.clientX)});
function stopResize(event){if(resizePointer===event.pointerId){resizePointer=null;sensorResize.classList.remove('dragging')}}
sensorResize.addEventListener('pointerup',stopResize);sensorResize.addEventListener('pointercancel',stopResize);
sensorResize.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();const current=Number(localStorage.getItem('bs.dashboard.sensorWidth'))||300;applySensorWidth(current+(event.key==='ArrowLeft'?20:-20))}});
window.addEventListener('resize',()=>{if(getComputedStyle(sensorResize).display!=='none')applySensorWidth(localStorage.getItem('bs.dashboard.sensorWidth')||300)});
function syncSensorFrame(id=selected){if(id)localStorage.setItem('bs.remote.activeStation',id);else localStorage.removeItem('bs.remote.activeStation');sensorFrame.src='./index.html?view=sensors&dashboard='+Date.now()+'&station='+encodeURIComponent(id||'')}
let clientId=localStorage.getItem('bs.remote.clientId');if(!clientId){clientId='web-'+crypto.randomUUID();localStorage.setItem('bs.remote.clientId',clientId)}
if(window.L){map=L.map('map').setView([20,-69],5);const baseLayers={street:L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}),satellite:L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'})};function setBasemap(mode){baseMode=mode==='satellite'?'satellite':'street';if(baseLayer)map.removeLayer(baseLayer);baseLayer=baseLayers[baseMode].addTo(map);$('basemapStreet').setAttribute('aria-pressed',String(baseMode==='street'));$('basemapSatellite').setAttribute('aria-pressed',String(baseMode==='satellite'));localStorage.setItem('bs.dashboard.basemap',baseMode)}setBasemap(baseMode);$('basemapStreet').onclick=()=>setBasemap('street');$('basemapSatellite').onclick=()=>setBasemap('satellite');layer=L.layerGroup().addTo(map);const resizeMap=()=>requestAnimationFrame(()=>map?.invalidateSize({pan:false}));if(window.ResizeObserver){const mapResizeObserver=new ResizeObserver(resizeMap);mapResizeObserver.observe(document.querySelector('.map-panel'))}window.addEventListener('resize',resizeMap);window.addEventListener('orientationchange',resizeMap);resizeMap()}else{$('map').textContent='No se pudo cargar el mapa. Los sensores siguen disponibles.'}
function choose(id){selected=id;localStorage.setItem('bs.remote.activeStation',id);render();syncSensorFrame(id)}
function render(){
  const previous=selected,rows=stations();
  if(!rows.some(row=>row.stationId===selected))selected=rows[0]?.stationId||'';
  if(previous!==selected)syncSensorFrame(selected);
  $('fleetCount').textContent=rows.length;$('boatList').replaceChildren();let live=0;
  for(const row of rows){const record=records.get(row.stationId),online=fresh(record);if(online)live++;const button=document.createElement('button');button.className='boat'+(row.stationId===selected?' active':'');button.setAttribute('aria-pressed',String(row.stationId===selected));const title=document.createElement('strong'),status=document.createElement('span');title.textContent=record?.telemetry?.stationName||row.name||'Barco';status.textContent=online?'● Datos recientes':record?.error||'Esperando datos';button.append(title,status);button.onclick=()=>choose(row.stationId);$('boatList').append(button)}
  if(!rows.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Vinculá la APK de Chez o los barcos que te compartan su código.';$('boatList').append(empty)}
  $('connection').textContent=live+' / '+rows.length+' con datos recientes';
  renderMap(rows);
}
function getVesselConfig(id){const row=stations().find(s=>s.stationId===id),telemetry=records.get(id)?.telemetry,remote=telemetry?.gpsState?.vessel,name=telemetry?.stationName||row?.name||'';if(remote&&typeof remote==='object')return{type:remote.type==='cat'?'cat':'mono',length:number(remote.length),beam:number(remote.beam),phoneForward:number(remote.phoneForward)||0,phoneStarboard:number(remote.phoneStarboard)||0,magneticCorrection:number(remote.magneticCorrection)||0};return /\bchez\b/i.test(name)?{type:'mono',length:12.5,beam:4.2,phoneForward:0,phoneStarboard:0,magneticCorrection:0}:{type:'mono'} }
function hullSvg(config,color){const cat=config.type==='cat',ratio=number(config.length)>0&&number(config.beam)>0?number(config.beam)/number(config.length):.36,beam=Math.max(14,Math.min(30,ratio*52)),left=(52-beam)/2,right=52-left;const shape=cat?'<path d="'+(26-beam*.42)+' 10 L'+(26-beam*.42)+' 44 L'+(26-beam*.42-5)+' 40 Z"/><path d="'+(26+beam*.42)+' 10 L'+(26+beam*.42)+' 44 L'+(26+beam*.42+5)+' 40 Z"/><path d="M'+(26-beam*.42-3)+' 17 H'+(26+beam*.42+3)+' M'+(26-beam*.42-3)+' 30 H'+(26+beam*.42+3)+'" fill="none" stroke="white" stroke-width="2"/>':'<path d="M26 3 Q'+right+' 10 '+right+' 18 L'+right+' 35 Q26 51 '+left+' 35 L'+left+' 18 Q'+left+' 10 26 3 Z"/>';return '<svg viewBox="0 0 52 54" aria-hidden="true"><g fill="'+color+'" stroke="white" stroke-width="1.8" stroke-linejoin="round">'+shape+'</g><path d="M26 9v15m-3-3 3 3 3-3" fill="none" stroke="#052335" stroke-width="1.5"/></svg>'}
function boatMagneticHeading(telemetry){const raw=number(telemetry?.boatStatus?.sensors?.heading);if(raw===null)return number(telemetry?.compass);const offset=number(telemetry?.boatStatus?.base?.headingOffset)||0,fine=number(telemetry?.boatStatus?.fine?.heading)||0;return ((raw+offset+fine)%360+360)%360}
function renderMap(rows){
  if(!map)return;
  layer.clearLayers();
  const points=[];
  let boatCount=0;
  for(const row of rows){
    const record=records.get(row.stationId),t=record?.telemetry,config=getVesselConfig(row.stationId),gpsPosition=position(t?.gps),online=fresh(record);
    if(gpsPosition){
      boatCount++;
      const vessel=vesselPosition(t.gps,boatMagneticHeading(t),config),center=vessel||gpsPosition,color=row.stationId===selected?'#35d6ba':'#62a4c5',outline=boatFootprint(center,vessel?.heading,config);
      for(const hull of outline){
        const shape=L.polygon(hull,{color,weight:1.5,opacity:online?.95:.55,fillColor:color,fillOpacity:online?.26:.12,lineJoin:'round'});
        shape.on('click',()=>choose(row.stationId)).addTo(layer)
      }
      if(!outline.length)L.circleMarker([center.lat,center.lon],{radius:4,color,fillOpacity:.8}).on('click',()=>choose(row.stationId)).addTo(layer);
      else L.circleMarker([center.lat,center.lon],{radius:3,color:'#f2fffc',weight:1,fillColor:color,fillOpacity:1}).on('click',()=>choose(row.stationId)).addTo(layer);
      points.push([center.lat,center.lon]);
      if($('routes').checked){
        const route=Array.isArray(t?.gpsState?.route)?t.gpsState.route.map(position).filter(Boolean).map(p=>[p.lat,p.lon]):[];
        if(route.length>1)L.polyline(route,{color:row.stationId===selected?'#339f9c':'#657e99',weight:3,opacity:.8}).addTo(layer)
      }
    }
  }
  $('mapNotice').hidden=points.length>0;
  $('mapNotice').textContent=rows.length?'Sin posiciones GPS recibidas. El mapa inicial no indica la ubicación de Chez.':'Vinculá un barco para ver su posición. El mapa inicial no indica la ubicación de Chez.';
  if(fitPending&&points.length){map.fitBounds(L.latLngBounds(points),{padding:[70,80],maxZoom:boatCount===1&&points.length===1?19:16});fitPending=false}
}
async function fetchState(row){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);try{const query=new URLSearchParams({clientId,clientName:'BoatStation Dashboard'}),response=await fetch(backend+'/api/station/'+encodeURIComponent(row.stationId)+'/state?'+query,{headers:{Authorization:'Bearer '+row.token},cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error(response.status===401?'Código no autorizado':'Error del servidor ('+response.status+')');const data=await response.json(),telemetry=data.snapshot?.telemetry;if(!telemetry||typeof telemetry!=='object')throw new Error('La estación aún no publicó datos');return {updatedAt:data.updatedAt,telemetry,error:null}}finally{clearTimeout(timeout)}}
async function cycle(){if(document.hidden)return;if(running){pending=true;return}clearTimeout(timer);running=true;$('refresh').disabled=true;try{const rows=stations();for(let i=0;i<rows.length;i+=4){await Promise.all(rows.slice(i,i+4).map(async row=>{try{const record=await fetchState(row);if(stations().some(s=>s.stationId===row.stationId&&s.token===row.token))records.set(row.stationId,record)}catch(error){records.set(row.stationId,{...records.get(row.stationId),error:error.name==='AbortError'?'Sin respuesta':error.message})}}));render()}}finally{running=false;$('refresh').disabled=false;render();if(!document.hidden)timer=setTimeout(cycle,pending?0:5000);pending=false}}
$('refresh').onclick=cycle;$('fit').onclick=()=>{fitPending=true;render()};$('routes').onchange=render;
$('pairOpen').onclick=()=>$('pairDialog').showModal();$('pairClose').onclick=()=>$('pairDialog').close();
$('pairCode').oninput=e=>{e.target.value=(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,16).match(/.{1,4}/g)||[]).join('-')};
$('pairForm').onsubmit=async event=>{event.preventDefault();const code=$('pairCode').value.replace(/-/g,'');if(code.length!==16){$('pairStatus').textContent='Ingresá un código de 16 caracteres.';return}const button=event.submitter;button.disabled=true;$('pairStatus').textContent='Verificando la estación…';const row={stationId:'bs-'+code,token:'pc-'+code};try{const record=await fetchState(row);save('bs.remote.stations',[...stations().filter(s=>s.stationId!==row.stationId),row]);records.set(row.stationId,record);fitPending=true;choose(row.stationId);$('pairDialog').close();$('pairForm').reset();$('pairStatus').textContent='';cycle()}catch(error){$('pairStatus').textContent=error.name==='AbortError'?'La estación no responde. Reintentá cuando esté conectada.':error.message}finally{button.disabled=false}};
document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden)cycle()});window.addEventListener('online',cycle);window.addEventListener('storage',event=>{if(event.key==='bs.remote.stations'||event.key==='bs.remote.activeStation'){selected=localStorage.getItem('bs.remote.activeStation')||'';render();cycle()}});
render();syncSensorFrame(selected);cycle();if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});



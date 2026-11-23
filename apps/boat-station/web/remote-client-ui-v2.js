const cards=document.getElementById('cards');
const addSheet=document.getElementById('addSheet');

function readJson(key,fallback){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback}catch{return fallback}}
function activeStationId(){return localStorage.getItem('bs.remote.activeStation')||'default'}
function activeStationName(){const id=activeStationId(),list=readJson('bs.remote.stations',[]);const station=Array.isArray(list)?list.find(x=>x?.stationId===id):null;return String(station?.name||'Chez').trim()||'Chez'}
function availableModules(){const id=activeStationId();return id?readJson('bs.remote.availableModules.'+id,[]):[]}

function filterAddSheet(){
  if(!addSheet)return;
  const allowed=new Set(availableModules());
  addSheet.querySelectorAll('[data-add-module]').forEach(btn=>{btn.style.display=allowed.has(btn.dataset.addModule)?'':'none'});
  const any=[...addSheet.querySelectorAll('[data-add-module]')].some(btn=>btn.style.display!=='none');
  let empty=addSheet.querySelector('[data-remote-no-modules]');
  if(!any){if(!empty){empty=document.createElement('div');empty.dataset.remoteNoModules='1';empty.className='subtle';empty.textContent='Esperando módulos activos de la estación…';addSheet.querySelector('.sheet-inner')?.appendChild(empty)}}else empty?.remove();
}

const freshness=document.createElement('div');
freshness.id='remoteFreshness';freshness.className='remote-freshness waiting';
freshness.innerHTML='<span class="remote-connection-dot" aria-hidden="true"></span><span class="remote-connection-text">Sin conexión</span><span class="remote-connection-detail">· esperando al Core</span><span class="remote-received-data" title="Datos recibidos de la estación durante esta sesión; no incluye mapas ni encabezados de red">↓ 0 B</span>';
if(cards?.parentNode)cards.parentNode.insertBefore(freshness,cards);
let lastSnapshotAt=0,interactionDepth=0,pendingData=null,pendingApply=null,interactionReleaseTimer=0,lastConnectivity=null,lastConnectivityName='';
let serverSyncSeconds=5;
function connectedMaxAge(){const local=Math.max(5,Math.min(60,Number(localStorage.getItem('bs.sync.intervalSeconds'))||5));return Math.max(30000,(local+serverSyncSeconds)*2000+5000)}
function elapsedLabel(ms){const seconds=Math.max(0,Math.floor(ms/1000));if(seconds<60)return `hace ${seconds} s`;const minutes=Math.floor(seconds/60);if(minutes<60)return `hace ${minutes} min`;const hours=Math.floor(minutes/60);if(hours<24)return `hace ${hours} h`;return `hace ${Math.floor(hours/24)} d`}
function markUpdated(time){const remoteTime=Number(time);lastSnapshotAt=Number.isFinite(remoteTime)&&remoteTime>0?Math.min(Date.now(),remoteTime):Date.now();renderFreshness()}
function publishConnectivity(connected){const stationName=activeStationName();if(lastConnectivity===connected&&lastConnectivityName===stationName)return;if(lastConnectivity===null&&!connected)return;lastConnectivity=connected;lastConnectivityName=stationName;window.dispatchEvent(new CustomEvent('boatstation-remote-connection',{detail:{connected,stationName}}))}
function renderFreshness(){const text=freshness.querySelector('.remote-connection-text'),detail=freshness.querySelector('.remote-connection-detail');if(!lastSnapshotAt){freshness.classList.remove('connected','disconnected');freshness.classList.add('waiting');if(text)text.textContent='Sin conexión';if(detail)detail.textContent='· esperando al Core';return}const age=Math.max(0,Date.now()-lastSnapshotAt),connected=age<=connectedMaxAge();freshness.classList.toggle('connected',connected);freshness.classList.toggle('disconnected',!connected);freshness.classList.remove('waiting');if(text)text.textContent=connected?`Conectado a ${activeStationName()}`:'Sin conexión';if(detail)detail.textContent=connected?'':`· última conexión ${elapsedLabel(age)}`;publishConnectivity(connected)}
function formatReceivedBytes(bytes){const value=Math.max(0,Number(bytes)||0);if(value<1000)return Math.floor(value)+' B';if(value<1000000)return (value/1000).toFixed(1).replace('.',',')+' KB';return (value/1000000).toFixed(value<100000000?1:0).replace('.',',')+' MB'}
function renderReceivedBytes(){const label=freshness.querySelector('.remote-received-data');if(label)label.textContent='↓ '+formatReceivedBytes(window.BoatStationReceivedBytes?.get?.()||0)}
setInterval(()=>{renderFreshness();renderReceivedBytes()},1000);

function beginInteraction(){clearTimeout(interactionReleaseTimer);interactionReleaseTimer=0;interactionDepth++}
function flushPending(){if(interactionDepth||!pendingApply)return;const apply=pendingApply,data=pendingData;pendingApply=null;pendingData=null;apply(data)}
function endInteraction(){interactionDepth=Math.max(0,interactionDepth-1);flushPending()}
function isBusy(){return interactionDepth>0||!!window.BoatStationPageLayout?.isResizing?.()||[...document.querySelectorAll('#cards .card')].some(card=>card.classList.contains('reordering'))}
function scheduleData(data,apply){serverSyncSeconds=Math.max(5,Math.min(60,Number(data?.syncIntervalSeconds)||5));markUpdated(data?.time);if(isBusy()){pendingData=data;pendingApply=apply;return false}apply(data);return true}

window.addEventListener('boatstation-page-interaction-start',beginInteraction);
window.addEventListener('boatstation-page-interaction-end',endInteraction);
window.addEventListener('boatstation-page-resize-start',beginInteraction);
window.addEventListener('boatstation-page-resize-end',endInteraction);

document.addEventListener('click',async event=>{
  const btn=event.target.closest('[data-remove-battery]');
  if(!btn)return;
  const send=window.BoatStationRemoteCommand?.send;
  if(typeof send!=='function')return;
  const id=String(btn.dataset.removeBattery||'');
  if(!id)return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  const original=btn.textContent;
  btn.disabled=true;
  btn.textContent='Eliminando…';
  const ok=await send('battery.remove',{id});
  if(!ok){btn.disabled=false;btn.textContent=original}
},{capture:true});

const addObserver=new MutationObserver(()=>requestAnimationFrame(filterAddSheet));if(addSheet)addObserver.observe(addSheet,{childList:true,subtree:true});
window.addEventListener('boatstation-module-catalog-updated',filterAddSheet);
window.BoatStationRemoteUI={isBusy,scheduleData,markUpdated,filterAddSheet};
filterAddSheet();renderFreshness();renderReceivedBytes();

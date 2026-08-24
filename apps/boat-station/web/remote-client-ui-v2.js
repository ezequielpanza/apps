const cards=document.getElementById('cards');
const addSheet=document.getElementById('addSheet');

function readJson(key,fallback){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback}catch{return fallback}}
function activeStationId(){return localStorage.getItem('bs.remote.activeStation')||'default'}
function activeStationName(){const id=activeStationId(),list=readJson('bs.remote.stations',[]);const station=Array.isArray(list)?list.find(x=>x?.stationId===id):null;return String(station?.name||'Estación').trim()||'Estación'}
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
freshness.innerHTML='<span class="remote-connection-dot" aria-hidden="true"></span><span class="remote-connection-text">Sin conexión</span><span class="remote-connection-detail">· esperando al Core</span>';
if(cards?.parentNode)cards.parentNode.insertBefore(freshness,cards);
let lastSnapshotAt=0,interactionDepth=0,pendingData=null,pendingApply=null,interactionReleaseTimer=0;
const CONNECTED_MAX_AGE_MS=30000;
function elapsedLabel(ms){const seconds=Math.max(0,Math.floor(ms/1000));if(seconds<60)return `hace ${seconds} s`;const minutes=Math.floor(seconds/60);if(minutes<60)return `hace ${minutes} min`;const hours=Math.floor(minutes/60);if(hours<24)return `hace ${hours} h`;return `hace ${Math.floor(hours/24)} d`}
function markUpdated(time){const remoteTime=Number(time);lastSnapshotAt=Number.isFinite(remoteTime)&&remoteTime>0?Math.min(Date.now(),remoteTime):Date.now();renderFreshness()}
function renderFreshness(){const text=freshness.querySelector('.remote-connection-text'),detail=freshness.querySelector('.remote-connection-detail');if(!lastSnapshotAt){freshness.classList.remove('connected','disconnected');freshness.classList.add('waiting');if(text)text.textContent='Sin conexión';if(detail)detail.textContent='· esperando al Core';return}const age=Math.max(0,Date.now()-lastSnapshotAt),connected=age<=CONNECTED_MAX_AGE_MS;freshness.classList.toggle('connected',connected);freshness.classList.toggle('disconnected',!connected);freshness.classList.remove('waiting');if(text)text.textContent=connected?`Conectado a ${activeStationName()}`:'Sin conexión';if(detail)detail.textContent=connected?'':`· última conexión ${elapsedLabel(age)}`}
setInterval(renderFreshness,1000);

function beginInteraction(){clearTimeout(interactionReleaseTimer);interactionReleaseTimer=0;interactionDepth++}
function flushPending(){if(interactionDepth||!pendingApply)return;const apply=pendingApply,data=pendingData;pendingApply=null;pendingData=null;apply(data)}
function endInteraction(){interactionDepth=Math.max(0,interactionDepth-1);flushPending()}
function isBusy(){return interactionDepth>0||!!window.BoatStationPageLayout?.isResizing?.()||[...document.querySelectorAll('#cards .card')].some(card=>card.classList.contains('reordering'))}
function scheduleData(data,apply){markUpdated(data?.time);if(isBusy()){pendingData=data;pendingApply=apply;return false}apply(data);return true}

window.addEventListener('boatstation-page-interaction-start',beginInteraction);
window.addEventListener('boatstation-page-interaction-end',endInteraction);
window.addEventListener('boatstation-page-resize-start',beginInteraction);
window.addEventListener('boatstation-page-resize-end',endInteraction);

const addObserver=new MutationObserver(()=>requestAnimationFrame(filterAddSheet));if(addSheet)addObserver.observe(addSheet,{childList:true,subtree:true});
window.addEventListener('boatstation-module-catalog-updated',filterAddSheet);
window.BoatStationRemoteUI={isBusy,scheduleData,markUpdated,filterAddSheet};
filterAddSheet();renderFreshness();

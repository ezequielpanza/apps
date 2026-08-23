const cards=document.getElementById('cards');
const addSheet=document.getElementById('addSheet');

function readJson(key,fallback){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback}catch{return fallback}}
function writeJson(key,value){localStorage.setItem(key,JSON.stringify(value))}
function activeStationId(){return localStorage.getItem('bs.remote.activeStation')||'default'}
function activeStationName(){const id=activeStationId(),list=readJson('bs.remote.stations',[]);const station=Array.isArray(list)?list.find(x=>x?.stationId===id):null;return String(station?.name||'Estación').trim()||'Estación'}
function pageKey(){return 'bs.remote.ui.pages.'+activeStationId()}
function heightKey(){return 'bs.remote.ui.heights.'+activeStationId()}
function pages(){return readJson(pageKey(),readJson('bs.remote.ui.pages',{}))}
function heights(){return readJson(heightKey(),readJson('bs.ui.heights',{}))}
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
freshness.id='remoteFreshness';
freshness.className='remote-freshness waiting';
freshness.innerHTML='<span class="remote-connection-dot" aria-hidden="true"></span><span class="remote-connection-text">Sin conexión</span><span class="remote-connection-detail">· esperando al Core</span>';
if(cards?.parentNode)cards.parentNode.insertBefore(freshness,cards);
let lastSnapshotAt=0;
const CONNECTED_MAX_AGE_MS=7000;
function elapsedLabel(ms){const seconds=Math.max(0,Math.floor(ms/1000));if(seconds<60)return `hace ${seconds} s`;const minutes=Math.floor(seconds/60);if(minutes<60)return `hace ${minutes} min`;const hours=Math.floor(minutes/60);if(hours<24)return `hace ${hours} h`;return `hace ${Math.floor(hours/24)} d`}
function markUpdated(time){const remoteTime=Number(time);lastSnapshotAt=Number.isFinite(remoteTime)&&remoteTime>0?Math.min(Date.now(),remoteTime):Date.now();renderFreshness()}
function renderFreshness(){const text=freshness.querySelector('.remote-connection-text'),detail=freshness.querySelector('.remote-connection-detail');if(!lastSnapshotAt){freshness.classList.remove('connected','disconnected');freshness.classList.add('waiting');if(text)text.textContent='Sin conexión';if(detail)detail.textContent='· esperando al Core';return}const age=Math.max(0,Date.now()-lastSnapshotAt),connected=age<=CONNECTED_MAX_AGE_MS;freshness.classList.toggle('connected',connected);freshness.classList.toggle('disconnected',!connected);freshness.classList.remove('waiting');if(text)text.textContent=connected?`Conectado a ${activeStationName()}`:'Sin conexión';if(detail)detail.textContent=connected?'':`· última conexión ${elapsedLabel(age)}`}
setInterval(renderFreshness,1000);

function pageCount(card){return card?.querySelectorAll('.page').length||0}
function currentPage(card){const id=card?.dataset.id;if(!id)return 0;const count=pageCount(card);return Math.max(0,Math.min(Math.max(0,count-1),Number(pages()[id])||0))}
function storedHeight(id,page){const value=heights()[id];if(value&&typeof value==='object'&&Number.isFinite(Number(value[page])))return Number(value[page]);if(Number.isFinite(Number(value))&&page===0)return Number(value);return null}
function saveHeight(id,page,height){if(!id||!Number.isFinite(height))return;const all=heights();const current=all[id]&&typeof all[id]==='object'?all[id]:{};all[id]={...current,[page]:Math.round(height)};writeJson(heightKey(),all)}
function naturalHeight(card,page){const el=card?.querySelector(`.page[data-page="${page}"]`);return el?el.scrollHeight:null}
function setTrackPage(card,page,animate){const track=card?.querySelector('.track');if(!track)return;if(!animate){track.style.transition='none';track.style.transform=`translateX(-${page*100}%)`;track.getBoundingClientRect();track.style.transition=''}else{track.style.transition='';requestAnimationFrame(()=>{track.style.transform=`translateX(-${page*100}%)`})}}
function applyCardState(card,{animate=false}={}){if(!card)return;const id=card.dataset.id,count=pageCount(card);if(!id||!count)return;const page=currentPage(card);setTrackPage(card,page,animate);card.querySelectorAll('.pager').forEach(p=>p.querySelectorAll('span').forEach((dot,i)=>dot.classList.toggle('on',i===page)));const body=card.querySelector('.card-body');if(!body)return;const saved=storedHeight(id,page),target=saved??naturalHeight(card,page);if(target!==null)body.style.height=`${target}px`}
function applyAll(){cards?.querySelectorAll('.card').forEach(card=>applyCardState(card,{animate:false}))}
function setPage(card,page){if(!card)return;const id=card.dataset.id,count=pageCount(card);if(!id||count<2)return;page=Math.max(0,Math.min(count-1,page));const state=pages();state[id]=page;writeJson(pageKey(),state);applyCardState(card,{animate:true})}

let interactionDepth=0,pendingData=null,pendingApply=null,interactionReleaseTimer=0;
function beginInteraction(){clearTimeout(interactionReleaseTimer);interactionReleaseTimer=0;interactionDepth++}
function flushPending(){if(interactionDepth||!pendingApply)return;const apply=pendingApply,data=pendingData;pendingApply=null;pendingData=null;apply(data);requestAnimationFrame(applyAll)}
function endInteraction(){interactionDepth=Math.max(0,interactionDepth-1);flushPending()}
function endInteractionAfter(ms){clearTimeout(interactionReleaseTimer);interactionReleaseTimer=setTimeout(()=>{interactionReleaseTimer=0;endInteraction()},Math.max(0,ms||0))}
function isBusy(){return interactionDepth>0||!!cards?.querySelector('.resizing,.reordering')}
function scheduleData(data,apply){markUpdated(data?.time);if(isBusy()){pendingData=data;pendingApply=apply;return false}apply(data);requestAnimationFrame(applyAll);return true}

window.BoatStationPageAdapter={
  getPage:currentPage,
  setPage,
  begin:()=>beginInteraction(),
  cancel:()=>endInteraction(),
  end:()=>endInteractionAfter(220)
};

let remoteResize=null;
function inputIsPrimary(event){return event.isPrimary!==false&&(event.pointerType!=='mouse'||event.button===0)}
function finishRemoteResize(event){if(!remoteResize||event.pointerId!==remoteResize.pointerId)return false;const g=remoteResize;remoteResize=null;g.card.classList.remove('resizing');const body=g.card.querySelector('.card-body');if(body)saveHeight(g.id,g.page,body.getBoundingClientRect().height);endInteraction();return true}

cards?.addEventListener('pointerdown',event=>{
  if(!inputIsPrimary(event))return;
  const resizeHandle=event.target.closest('.resize-handle');if(!resizeHandle)return;
  const card=resizeHandle.closest('.card'),body=card?.querySelector('.card-body');if(!card||!body)return;
  event.preventDefault();event.stopImmediatePropagation();
  remoteResize={pointerId:event.pointerId,card,id:card.dataset.id,page:currentPage(card),startY:event.clientY,startH:body.getBoundingClientRect().height};
  card.classList.add('resizing');beginInteraction();try{resizeHandle.setPointerCapture(event.pointerId)}catch{}
},{capture:true});
cards?.addEventListener('pointermove',event=>{if(!remoteResize||event.pointerId!==remoteResize.pointerId)return;event.preventDefault();event.stopImmediatePropagation();const body=remoteResize.card.querySelector('.card-body');const next=Math.max(70,Math.min(Math.max(120,window.innerHeight*.78),remoteResize.startH+(event.clientY-remoteResize.startY)));if(body)body.style.height=`${next}px`;saveHeight(remoteResize.id,remoteResize.page,next)},{capture:true,passive:false});
cards?.addEventListener('pointerup',event=>{if(finishRemoteResize(event)){event.preventDefault();event.stopImmediatePropagation()}},{capture:true});
cards?.addEventListener('pointercancel',event=>{if(finishRemoteResize(event))event.stopImmediatePropagation()},{capture:true});

// Remote uses the shared PointerEvent page engine. Suppress only the old Core touch
// page recognizer so it cannot commit a second page after the shared gesture finishes.
for(const type of ['touchstart','touchmove','touchend','touchcancel'])cards?.addEventListener(type,event=>event.stopImmediatePropagation(),{capture:true,passive:type!=='touchmove'});

const observer=new MutationObserver(records=>{for(const record of records){for(const node of record.addedNodes){if(node.nodeType===1&&node.matches?.('.card'))applyCardState(node,{animate:false})}}requestAnimationFrame(applyAll)});
if(cards)observer.observe(cards,{childList:true,subtree:false});
const addObserver=new MutationObserver(()=>requestAnimationFrame(filterAddSheet));if(addSheet)addObserver.observe(addSheet,{childList:true,subtree:true});
window.addEventListener('boatstation-module-catalog-updated',filterAddSheet);window.addEventListener('resize',applyAll);
window.BoatStationRemoteUI={isBusy,scheduleData,markUpdated,applyAll,filterAddSheet,setPage,currentPage};
applyAll();filterAddSheet();renderFreshness();

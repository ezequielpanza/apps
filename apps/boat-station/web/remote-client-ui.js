const cards=document.getElementById('cards');
const PAGE_KEY='bs.remote.ui.pages';
const HEIGHT_KEY='bs.ui.heights';

function readJson(key,fallback){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback}catch{return fallback}}
function writeJson(key,value){localStorage.setItem(key,JSON.stringify(value))}
function pages(){return readJson(PAGE_KEY,{})}
function heights(){return readJson(HEIGHT_KEY,{})}

const freshness=document.createElement('div');
freshness.id='remoteFreshness';
freshness.className='remote-freshness';
freshness.textContent='Esperando actualización…';
if(cards?.parentNode)cards.parentNode.insertBefore(freshness,cards);
let lastSnapshotAt=0;
function renderFreshness(){
  if(!lastSnapshotAt){freshness.textContent='Esperando actualización…';freshness.classList.add('waiting');return}
  const seconds=Math.max(0,Math.floor((Date.now()-lastSnapshotAt)/1000));
  freshness.classList.remove('waiting');
  freshness.textContent=seconds<=0?'Actualizado ahora':`Actualizado hace ${seconds} s`;
}
setInterval(renderFreshness,1000);

function pageCount(card){return card?.querySelectorAll('.page').length||0}
function currentPage(card){const id=card?.dataset.id;if(!id)return 0;const count=pageCount(card);return Math.max(0,Math.min(Math.max(0,count-1),Number(pages()[id])||0))}
function storedHeight(id,page){const all=heights(),value=all[id];if(value&&typeof value==='object'&&Number.isFinite(Number(value[page])))return Number(value[page]);if(Number.isFinite(Number(value))&&page===0)return Number(value);return null}
function saveHeight(id,page,height){if(!id||!Number.isFinite(height))return;const all=heights();const current=all[id]&&typeof all[id]==='object'?all[id]:{};all[id]={...current,[page]:Math.round(height)};writeJson(HEIGHT_KEY,all)}

function applyCardState(card){if(!card)return;const id=card.dataset.id,count=pageCount(card);if(!id||!count)return;const page=currentPage(card);const track=card.querySelector('.track');if(track)track.style.transform=`translateX(-${page*100}%)`;card.querySelectorAll('.pager').forEach(pager=>pager.querySelectorAll('span').forEach((dot,i)=>dot.classList.toggle('on',i===page)));const body=card.querySelector('.card-body'),height=storedHeight(id,page);if(body&&height!==null)body.style.height=`${height}px`}
function applyAll(){cards?.querySelectorAll('.card').forEach(applyCardState)}

function setPage(card,page){if(!card)return;const id=card.dataset.id,count=pageCount(card);if(!id||count<2)return;page=Math.max(0,Math.min(count-1,page));const state=pages();state[id]=page;writeJson(PAGE_KEY,state);applyCardState(card)}

let swipe=null;
let activeResize=null;
let interactionDepth=0;
let pendingSnapshot='';
function beginInteraction(){interactionDepth++}
function endInteraction(){interactionDepth=Math.max(0,interactionDepth-1);if(interactionDepth===0&&pendingSnapshot){const html=pendingSnapshot;pendingSnapshot='';applySnapshotNow(html)}}
function isBusy(){return interactionDepth>0||!!cards?.querySelector('.resizing,.reordering')}
function applySnapshotNow(html){if(!cards)return;cards.innerHTML=html||'';lastSnapshotAt=Date.now();renderFreshness();requestAnimationFrame(applyAll)}
function applySnapshot(html){if(isBusy()){pendingSnapshot=html||'';lastSnapshotAt=Date.now();renderFreshness();return false}applySnapshotNow(html);return true}
window.BoatStationRemoteUI={applySnapshot,isBusy};

cards?.addEventListener('pointerdown',event=>{
  if(event.button!==0&&event.pointerType!=='touch')return;
  const resizeHandle=event.target.closest('.resize-handle');
  if(resizeHandle){
    const card=resizeHandle.closest('.card');
    if(card){activeResize={pointerId:event.pointerId,card,id:card.dataset.id,page:currentPage(card)}}
    beginInteraction();
    return;
  }
  if(event.target.closest('.drag-handle')){beginInteraction();return}
  if(event.pointerType==='touch')return;
  if(event.target.closest('button,input,textarea,select,a'))return;
  const card=event.target.closest('.card');
  if(!card||pageCount(card)<2)return;
  swipe={pointerId:event.pointerId,card,startX:event.clientX,startY:event.clientY,active:false};
  beginInteraction();
});
cards?.addEventListener('pointermove',event=>{
  if(!swipe||event.pointerId!==swipe.pointerId)return;
  const dx=event.clientX-swipe.startX,dy=event.clientY-swipe.startY;
  if(!swipe.active){
    if(Math.abs(dx)<10&&Math.abs(dy)<10)return;
    if(Math.abs(dx)<=Math.abs(dy)*1.15){swipe=null;endInteraction();return}
    swipe.active=true;
  }
  event.preventDefault();
},{passive:false});
cards?.addEventListener('pointerup',event=>{
  if(activeResize&&event.pointerId===activeResize.pointerId){
    const {card,id,page}=activeResize;activeResize=null;
    const body=card?.querySelector('.card-body');
    if(body)saveHeight(id,page,body.getBoundingClientRect().height);
    endInteraction();
    return;
  }
  if(swipe&&event.pointerId===swipe.pointerId){
    const gesture=swipe;swipe=null;
    if(gesture.active){const dx=event.clientX-gesture.startX,dy=event.clientY-gesture.startY;if(Math.abs(dx)>=38&&Math.abs(dx)>Math.abs(dy)*1.1){const current=currentPage(gesture.card);setPage(gesture.card,dx<0?current+1:current-1)}}
    endInteraction();
    return;
  }
  if(interactionDepth>0)endInteraction();
});
cards?.addEventListener('pointercancel',()=>{swipe=null;activeResize=null;if(interactionDepth>0)endInteraction()});
window.addEventListener('pointerup',()=>{if(activeResize){const {card,id,page}=activeResize;activeResize=null;const body=card?.querySelector('.card-body');if(body)saveHeight(id,page,body.getBoundingClientRect().height)}if(interactionDepth>0&&!swipe)endInteraction()});
window.addEventListener('pointercancel',()=>{activeResize=null;if(interactionDepth>0)endInteraction()});

const observer=new MutationObserver(()=>requestAnimationFrame(applyAll));
if(cards)observer.observe(cards,{childList:true,subtree:false});
window.addEventListener('resize',applyAll);
applyAll();
renderFreshness();

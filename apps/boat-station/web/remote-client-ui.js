const cards=document.getElementById('cards');
const PAGE_KEY='bs.remote.ui.pages';
const HEIGHT_KEY='bs.ui.heights';

function readJson(key,fallback){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback}catch{return fallback}}
function writeJson(key,value){localStorage.setItem(key,JSON.stringify(value))}
function pages(){return readJson(PAGE_KEY,{})}
function heights(){return readJson(HEIGHT_KEY,{})}

function pageCount(card){return card?.querySelectorAll('.page').length||0}
function currentPage(card){const id=card?.dataset.id;if(!id)return 0;const count=pageCount(card);return Math.max(0,Math.min(Math.max(0,count-1),Number(pages()[id])||0))}
function storedHeight(id,page){const all=heights(),value=all[id];if(value&&typeof value==='object'&&Number.isFinite(Number(value[page])))return Number(value[page]);if(Number.isFinite(Number(value))&&page===0)return Number(value);return null}

function applyCardState(card){if(!card)return;const id=card.dataset.id,count=pageCount(card);if(!id||!count)return;const page=currentPage(card);const track=card.querySelector('.track');if(track)track.style.transform=`translateX(-${page*100}%)`;card.querySelectorAll('.pager').forEach(pager=>pager.querySelectorAll('span').forEach((dot,i)=>dot.classList.toggle('on',i===page)));const body=card.querySelector('.card-body'),height=storedHeight(id,page);if(body&&height!==null)body.style.height=`${height}px`}
function applyAll(){cards?.querySelectorAll('.card').forEach(applyCardState)}

function setPage(card,page){if(!card)return;const id=card.dataset.id,count=pageCount(card);if(!id||count<2)return;page=Math.max(0,Math.min(count-1,page));const state=pages();state[id]=page;writeJson(PAGE_KEY,state);applyCardState(card)}

let swipe=null;
cards?.addEventListener('pointerdown',event=>{
  if(event.pointerType==='touch')return;
  if(event.button!==0)return;
  if(event.target.closest('.drag-handle,.resize-handle,button,input,textarea,select,a'))return;
  const card=event.target.closest('.card');
  if(!card||pageCount(card)<2)return;
  swipe={pointerId:event.pointerId,card,startX:event.clientX,startY:event.clientY,active:false};
});
cards?.addEventListener('pointermove',event=>{
  if(!swipe||event.pointerId!==swipe.pointerId)return;
  const dx=event.clientX-swipe.startX,dy=event.clientY-swipe.startY;
  if(!swipe.active){
    if(Math.abs(dx)<10&&Math.abs(dy)<10)return;
    if(Math.abs(dx)<=Math.abs(dy)*1.15){swipe=null;return}
    swipe.active=true;
  }
  event.preventDefault();
},{passive:false});
cards?.addEventListener('pointerup',event=>{
  if(!swipe||event.pointerId!==swipe.pointerId)return;
  const gesture=swipe;swipe=null;
  if(!gesture.active)return;
  const dx=event.clientX-gesture.startX,dy=event.clientY-gesture.startY;
  if(Math.abs(dx)<38||Math.abs(dx)<=Math.abs(dy)*1.1)return;
  const current=currentPage(gesture.card);
  setPage(gesture.card,dx<0?current+1:current-1);
});
cards?.addEventListener('pointercancel',()=>{swipe=null});

// Core snapshots replace module markup as data changes. Reapply this browser's
// presentation state after each replacement without affecting station-side state.
const observer=new MutationObserver(()=>requestAnimationFrame(applyAll));
if(cards)observer.observe(cards,{childList:true,subtree:false});
window.addEventListener('resize',applyAll);
applyAll();

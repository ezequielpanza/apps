(function(){
  const KEY='bs.ui.heights';
  let drag=null;
  function read(){try{const v=JSON.parse(localStorage.getItem(KEY)||'{}');return v&&typeof v==='object'?v:{}}catch{return{}}}
  function pageIndex(card){const pager=card.querySelector('.pager'),dots=pager?[...pager.querySelectorAll('span')]:[];const i=dots.findIndex(x=>x.classList.contains('on'));return i>=0?i:0}
  function storedHeight(id,page){const all=read(),v=all[id];if(v&&typeof v==='object'&&Number.isFinite(Number(v[page])))return Number(v[page]);if(page===0&&Number.isFinite(Number(v)))return Number(v);return null}
  function saveHeight(id,page,height){const all=read(),current=all[id]&&typeof all[id]==='object'?all[id]:{};all[id]={...current,[page]:Math.round(height)};try{localStorage.setItem(KEY,JSON.stringify(all))}catch(_){}}
  function setHeight(body,h){const value=`${Math.round(h)}px`;if(body.style.height!==value)body.style.height=value}
  function pageMinimumHeight(card,page){
    const active=card?.querySelector(`.page[data-page="${page}"]`);if(!active)return 70;
    const declared=parseFloat(getComputedStyle(active).getPropertyValue('--bs-min-body-height'));
    return Number.isFinite(declared)?Math.max(70,declared):70;
  }
  function apply(card){
    if(!card||card.classList.contains('collapsed')||card.classList.contains('resizing'))return;
    if(drag&&drag.body===card.querySelector('.card-body'))return;
    const body=card.querySelector('.card-body');if(!body)return;
    const page=pageIndex(card),h=storedHeight(card.dataset.id,page);if(h!==null)setHeight(body,Math.max(pageMinimumHeight(card,page),h))
  }
  function applyAll(){document.querySelectorAll('#cards .card').forEach(apply)}
  document.addEventListener('pointerdown',e=>{const grip=e.target.closest('.resize-handle'),card=grip?.closest('.card');if(!card)return;const body=card.querySelector('.card-body');if(!body)return;const page=pageIndex(card);drag={id:card.dataset.id,page,card,body,startY:e.clientY,startH:body.getBoundingClientRect().height,minH:pageMinimumHeight(card,page),pointerId:e.pointerId,lastH:null}},true);
  document.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointerId)return;const max=Math.max(900,window.innerHeight*1.5),next=Math.max(drag.minH,Math.min(max,drag.startH+(e.clientY-drag.startY)));drag.lastH=next;const body=drag.body;requestAnimationFrame(()=>{if(body?.isConnected)setHeight(body,next)})},false);
  document.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.pointerId)return;const d=drag;drag=null;if(d.lastH!==null){saveHeight(d.id,d.page,d.lastH);if(d.body?.isConnected)setHeight(d.body,d.lastH)}},false);
  document.addEventListener('pointercancel',()=>{drag=null},false);
  const observer=new MutationObserver(()=>{if(drag)return;requestAnimationFrame(()=>requestAnimationFrame(applyAll))});
  observer.observe(document.getElementById('cards')||document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('resize',()=>requestAnimationFrame(applyAll));setTimeout(applyAll,250);
})();
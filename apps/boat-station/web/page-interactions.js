(function(){
  const cards=document.getElementById('cards');if(!cards)return;
  const THRESHOLD=38,LOCK=10;
  let swipe=null;
  const activeModules=new Set();
  const pendingRenders=new Map();

  function layout(){return window.BoatStationPageLayout||null}
  function pageCount(card){return card?.querySelectorAll('.page').length||0}
  function currentPage(card){return layout()?.currentPage?.(card)||0}
  function blocked(target){return !!target.closest('.card-head,.drag-handle,.resize-handle,button,input,textarea,select,a,.sheet,.station-manager')}
  function primary(event){return event.isPrimary!==false&&(event.pointerType!=='mouse'||event.button===0)}
  function moduleId(card){return card?.dataset?.id||''}

  function holdModule(id){id=String(id||'');if(!id)return;activeModules.add(id);window.dispatchEvent(new CustomEvent('boatstation-page-interaction-start',{detail:{id}}))}
  function releaseModule(id){id=String(id||'');if(!id)return;activeModules.delete(id);const pending=pendingRenders.get(id);pendingRenders.delete(id);window.dispatchEvent(new CustomEvent('boatstation-page-interaction-end',{detail:{id}}));if(pending)requestAnimationFrame(()=>{try{pending()}catch(error){console.warn('Boat Station deferred render',error)}})}
  function beginModuleInteraction(card){holdModule(moduleId(card))}
  function endModuleInteraction(card){releaseModule(moduleId(card))}
  function requestModuleRender(id,render){id=String(id||'');if(!id||typeof render!=='function')return false;if(activeModules.has(id)){pendingRenders.set(id,render);return true}render();return true}

  cards.addEventListener('pointerdown',event=>{
    if(!primary(event)||document.body.classList.contains('menu-open')||blocked(event.target)||layout()?.isResizing?.())return;
    const card=event.target.closest('.card');if(!card||pageCount(card)<2)return;
    const page=currentPage(card);
    swipe={pointerId:event.pointerId,card,page,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastT:performance.now(),vx:0,mode:'pending',started:false};
  },{capture:true});

  cards.addEventListener('pointermove',event=>{
    if(!swipe||event.pointerId!==swipe.pointerId)return;
    const dx=event.clientX-swipe.startX,dy=event.clientY-swipe.startY;
    if(swipe.mode==='pending'){
      if(Math.abs(dx)<LOCK&&Math.abs(dy)<LOCK)return;
      if(Math.abs(dx)<=Math.abs(dy)*1.15){swipe=null;return}
      swipe.mode='horizontal';swipe.started=true;beginModuleInteraction(swipe.card);
      try{swipe.card.setPointerCapture(event.pointerId)}catch{}
    }
    if(swipe.mode!=='horizontal')return;
    event.preventDefault();event.stopPropagation();
    const now=performance.now(),dt=Math.max(1,now-swipe.lastT);swipe.vx=(event.clientX-swipe.lastX)/dt;swipe.lastX=event.clientX;swipe.lastT=now;
    const track=swipe.card.querySelector('.track'),width=Math.max(1,swipe.card.querySelector('.viewport')?.clientWidth||swipe.card.clientWidth);if(!track)return;
    let pct=(-swipe.page*100)+(dx/width*100),min=-(pageCount(swipe.card)-1)*100;
    if(pct>0)pct=Math.min(18,pct*.32);if(pct<min)pct=Math.max(min-18,min+(pct-min)*.32);
    track.style.transition='none';track.style.transform=`translate3d(${pct}%,0,0)`;
  },{capture:true,passive:false});

  function finish(event,cancel=false){
    if(!swipe||event.pointerId!==swipe.pointerId)return;
    const gesture=swipe;swipe=null;
    const dx=event.clientX-gesture.startX,dy=event.clientY-gesture.startY;
    let target=gesture.page;
    if(!cancel&&gesture.mode==='horizontal'){
      const decisive=Math.abs(dx)>=THRESHOLD&&Math.abs(dx)>Math.abs(dy)*1.1;
      const flick=Math.abs(gesture.vx)>.45&&Math.abs(dx)>18;
      if(decisive||flick)target=gesture.page+(dx<0?1:-1);
    }
    target=Math.max(0,Math.min(pageCount(gesture.card)-1,target));
    layout()?.setPage?.(gesture.card,target,{animate:true});
    if(gesture.started)setTimeout(()=>endModuleInteraction(gesture.card),220);
  }
  cards.addEventListener('pointerup',event=>finish(event,false),{capture:true});
  cards.addEventListener('pointercancel',event=>finish(event,true),{capture:true});

  window.addEventListener('boatstation-page-resize-start',event=>holdModule(event.detail?.id));
  window.addEventListener('boatstation-page-resize-end',event=>releaseModule(event.detail?.id));

  window.BoatStationPageInteractions={currentPage,isInteracting:id=>activeModules.has(String(id||'')),requestRender:requestModuleRender};
})();

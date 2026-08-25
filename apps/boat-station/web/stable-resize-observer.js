(function(){
  if(window.__BoatStationStableResizeObserver||typeof window.ResizeObserver!=='function')return;
  const NativeResizeObserver=window.ResizeObserver;
  class StableResizeObserver{
    constructor(callback){
      this.callback=callback;
      this.pending=new Map();
      this.observer=new NativeResizeObserver((entries,observer)=>{
        const ready=[];
        for(const entry of entries){
          const card=entry.target instanceof Element?entry.target.closest('.card'):null;
          if(card?.classList.contains('resizing'))this.pending.set(entry.target,entry);
          else ready.push(entry);
        }
        if(ready.length)this.callback(ready,this);
      });
      this.onResizeEnd=event=>{
        const card=event.detail?.card||document.querySelector(`.card[data-id="${CSS.escape(String(event.detail?.id||''))}"]`);
        if(!card||!this.pending.size)return;
        const ready=[];
        for(const [target,entry] of this.pending){
          if(target===card||card.contains(target)){ready.push(entry);this.pending.delete(target)}
        }
        if(ready.length)requestAnimationFrame(()=>this.callback(ready,this));
      };
      window.addEventListener('boatstation-page-resize-end',this.onResizeEnd);
    }
    observe(target,options){return this.observer.observe(target,options)}
    unobserve(target){this.pending.delete(target);return this.observer.unobserve(target)}
    disconnect(){this.pending.clear();window.removeEventListener('boatstation-page-resize-end',this.onResizeEnd);return this.observer.disconnect()}
    takeRecords(){return this.observer.takeRecords()}
  }
  window.ResizeObserver=StableResizeObserver;
  window.__BoatStationStableResizeObserver=true;
})();

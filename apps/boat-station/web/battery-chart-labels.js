(function(){
  const COUNT=12;

  function num(v){return Number.isFinite(Number(v))?Number(v):null}
  function batteryState(){try{return window.BoatStationBatteryState?.exportRemoteState?.()||null}catch{return null}}
  function historyHours(){
    try{
      const saved=JSON.parse(localStorage.getItem('bs.batteries.state')||'{}');
      const h=Number(saved?.historyHours);
      return Number.isFinite(h)&&h>0?h:168;
    }catch{return 168}
  }
  function buckets(history,start,end){
    const step=Math.max(1,(end-start)/COUNT),out=Array.from({length:COUNT},()=>({sum:0,n:0}));
    for(const p of history||[]){
      const t=Number(p?.time),soc=num(p?.soc);if(!Number.isFinite(t)||soc===null||t<start||t>end)continue;
      const i=Math.max(0,Math.min(COUNT-1,Math.floor((t-start)/step)));out[i].sum+=soc;out[i].n++;
    }
    return out.map(b=>b.n?b.sum/b.n:null);
  }
  function drawLabels(canvas){
    if(!canvas||!canvas.isConnected)return;
    const state=batteryState();if(!state?.history?.length)return;
    const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;
    const hours=historyHours(),axisH=r.width<520?42:30,plotH=Math.max(20,r.height-axisH),end=Date.now(),start=end-hours*3600000,slot=r.width/COUNT;
    const values=buckets(state.history,start,end);if(!values.some(v=>v!==null))return;
    const dpr=window.devicePixelRatio||1,c=canvas.getContext('2d');if(!c)return;
    c.save();c.setTransform(dpr,0,0,dpr,0,0);c.textAlign='center';c.textBaseline='middle';c.font=`700 ${r.width<520?8:9}px system-ui, sans-serif`;
    values.forEach((soc,i)=>{
      if(soc===null)return;
      const pct=Math.max(0,Math.min(100,soc)),h=Math.max(1,pct/100*plotH),x=(i+.5)*slot;
      const inside=h>=18,y=inside?plotH-h+Math.min(h/2,12):Math.max(8,plotH-h-7);
      c.fillStyle=inside?'#ffffff':'#d9edf5';
      c.fillText(`${Math.round(pct)}%`,x,y);
    });
    c.restore();
  }
  function refresh(){document.querySelectorAll('canvas[data-battery-chart]').forEach(canvas=>requestAnimationFrame(()=>drawLabels(canvas)))}
  const observer=new MutationObserver(()=>setTimeout(refresh,0));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('resize',()=>setTimeout(refresh,0));
  setInterval(refresh,1000);
  setTimeout(refresh,250);
})();
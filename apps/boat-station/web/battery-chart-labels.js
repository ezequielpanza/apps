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
    return out.map(b=>b.n?{soc:b.sum/b.n,estimated:false}:null);
  }
  function interpolate(values){
    const out=values.map(v=>v?{...v}:null),real=[];
    values.forEach((v,i)=>{if(v)real.push(i)});
    for(let k=1;k<real.length;k++){
      const left=real[k-1],right=real[k];
      if(right-left<=1)continue;
      const a=values[left].soc,b=values[right].soc,delta=b-a;
      const trend=delta>.05?'charge':delta<-.05?'discharge':'idle';
      for(let i=left+1;i<right;i++){
        const ratio=(i-left)/(right-left);
        out[i]={soc:a+delta*ratio,estimated:true,trend};
      }
    }
    return out;
  }
  function estimatedColor(trend){
    if(trend==='charge')return '#b7d58e';
    if(trend==='discharge')return '#d99a9a';
    return '#78aeb4';
  }
  function drawOverlay(canvas){
    if(!canvas||!canvas.isConnected)return;
    const state=batteryState();if(!state?.history?.length)return;
    const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;
    const hours=historyHours(),axisH=r.width<520?42:30,plotH=Math.max(20,r.height-axisH),end=Date.now(),start=end-hours*3600000,slot=r.width/COUNT;
    const values=interpolate(buckets(state.history,start,end));if(!values.some(Boolean))return;
    const dpr=window.devicePixelRatio||1,c=canvas.getContext('2d');if(!c)return;
    c.save();c.setTransform(dpr,0,0,dpr,0,0);
    const bar=Math.max(1,slot*.7);
    values.forEach((item,i)=>{
      if(!item?.estimated)return;
      const pct=Math.max(0,Math.min(100,item.soc)),h=Math.max(1,pct/100*plotH),x=i*slot+(slot-bar)/2;
      c.fillStyle=estimatedColor(item.trend);
      c.fillRect(x,plotH-h,bar,h);
    });
    c.textAlign='center';c.textBaseline='middle';c.font=`700 ${r.width<520?8:9}px system-ui, sans-serif`;
    values.forEach((item,i)=>{
      if(!item)return;
      const pct=Math.max(0,Math.min(100,item.soc)),h=Math.max(1,pct/100*plotH),x=(i+.5)*slot;
      const inside=h>=18,y=inside?plotH-h+Math.min(h/2,12):Math.max(8,plotH-h-7);
      c.fillStyle=inside?'#ffffff':(item.estimated?'#b8c9cd':'#d9edf5');
      c.fillText(`${Math.round(pct)}%`,x,y);
    });
    c.restore();
  }
  function refresh(){document.querySelectorAll('canvas[data-battery-chart]').forEach(canvas=>requestAnimationFrame(()=>drawOverlay(canvas)))}
  const observer=new MutationObserver(()=>setTimeout(refresh,0));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target.closest('[data-history-zoom]'))setTimeout(refresh,40)},true);
  window.addEventListener('resize',()=>setTimeout(refresh,0));
  setTimeout(refresh,250);
})();
(function(){
  const COUNT=12;
  const THRESHOLD=.15;
  function num(v){return Number.isFinite(Number(v))?Number(v):null}
  function batteryState(){try{return window.BoatStationBatteryState?.exportRemoteState?.()||null}catch{return null}}
  function historyHours(){try{const saved=JSON.parse(localStorage.getItem('bs.batteries.state')||'{}'),h=Number(saved?.historyHours);return Number.isFinite(h)&&h>0?h:168}catch{return 168}}
  function markGranularity(hours){if(hours<=1)return 5*60000;if(hours<=3)return 15*60000;if(hours<=6)return 30*60000;if(hours<=24)return 60*60000;if(hours<=72)return 2*3600000;if(hours<=336)return 6*3600000;if(hours<=720)return 12*3600000;return 24*3600000}
  function roundedMark(time,hours){const step=markGranularity(hours);return Math.round(time/step)*step}
  function axisLabel(time,hours){const d=new Date(time),hh=String(d.getHours()).padStart(2,'0'),mm=String(d.getMinutes()).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0'),month=String(d.getMonth()+1).padStart(2,'0');if(hours<=12)return `${hh}:${mm}`;if(hours<=72)return `${day}/${month} ${hh}:${mm}`;if(hours<=336)return `${day}/${month} ${hh}h`;return `${day}/${month}`}
  function buckets(history,start,end){
    const step=Math.max(1,(end-start)/COUNT),out=Array.from({length:COUNT},()=>({socSum:0,socN:0,currentSum:0,currentN:0}));
    for(const p of history||[]){
      const t=Number(p?.time),soc=num(p?.soc),current=num(p?.current);if(!Number.isFinite(t)||t<start||t>end)continue;
      const i=Math.max(0,Math.min(COUNT-1,Math.floor((t-start)/step))),b=out[i];
      if(soc!==null){b.socSum+=soc;b.socN++}if(current!==null){b.currentSum+=current;b.currentN++}
    }
    return out.map(b=>b.socN?{soc:b.socSum/b.socN,current:b.currentN?b.currentSum/b.currentN:null,estimated:false}:null);
  }
  function interpolate(values){
    const out=values.map(v=>v?{...v}:null),real=[];values.forEach((v,i)=>{if(v)real.push(i)});
    for(let k=1;k<real.length;k++){
      const left=real[k-1],right=real[k];if(right-left<=1)continue;
      const a=values[left].soc,b=values[right].soc,delta=b-a,trend=delta>.05?'charge':delta<-.05?'discharge':'idle';
      for(let i=left+1;i<right;i++){const ratio=(i-left)/(right-left);out[i]={soc:a+delta*ratio,current:null,estimated:true,trend}}
    }
    return out;
  }
  function color(item){if(item.estimated)return item.trend==='charge'?'#a9c98a':item.trend==='discharge'?'#c98f8f':'#6c9ca3';const current=num(item.current);if(current===null||Math.abs(current)<=THRESHOLD)return '#1ed7e5';return current>THRESHOLD?'#8bd332':'#ff6e6e'}
  function draw(canvas){
    if(!canvas||!canvas.isConnected)return;const state=batteryState();if(!state?.history?.length)return;const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;
    const dpr=window.devicePixelRatio||1;canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);const c=canvas.getContext('2d');if(!c)return;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,r.width,r.height);
    const hours=historyHours(),axisH=r.width<520?42:30,plotH=Math.max(20,r.height-axisH),end=Date.now(),start=end-hours*3600000,slot=r.width/COUNT,values=interpolate(buckets(state.history,start,end));
    c.strokeStyle='#17394f';c.lineWidth=1;for(let i=1;i<5;i++){const y=i*plotH/5;c.beginPath();c.moveTo(0,y);c.lineTo(r.width,y);c.stroke()}
    const bar=Math.max(1,slot*.7);values.forEach((item,i)=>{if(!item)return;const pct=Math.max(0,Math.min(100,item.soc)),h=Math.max(1,pct/100*plotH),x=i*slot+(slot-bar)/2;c.fillStyle=color(item);c.fillRect(x,plotH-h,bar,h)});
    c.textAlign='center';c.textBaseline='middle';c.font=`700 ${r.width<520?8:9}px system-ui, sans-serif`;values.forEach((item,i)=>{if(!item)return;const pct=Math.max(0,Math.min(100,item.soc)),h=Math.max(1,pct/100*plotH),x=(i+.5)*slot,inside=h>=18,y=inside?plotH-h+Math.min(h/2,12):Math.max(8,plotH-h-7);c.fillStyle=inside?'#ffffff':'#d9edf5';c.fillText(`${Math.round(pct)}%`,x,y)});
    c.font=(r.width<520?'8px':'9px')+' system-ui, sans-serif';c.fillStyle='#7890a1';for(let i=0;i<COUNT;i++){const center=start+(i+.5)*(end-start)/COUNT,time=roundedMark(center,hours),text=axisLabel(time,hours),x=(i+.5)*slot,y=plotH+axisH/2;c.save();c.translate(x,y);if(r.width<520)c.rotate(-Math.PI/4);c.fillText(text,0,0);c.restore()}
  }
  function refresh(){document.querySelectorAll('canvas[data-battery-chart]').forEach(canvas=>requestAnimationFrame(()=>draw(canvas)))}
  const observer=new MutationObserver(()=>setTimeout(refresh,0));observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target.closest('[data-history-zoom]'))setTimeout(refresh,60)},true);window.addEventListener('resize',()=>setTimeout(refresh,0));setInterval(refresh,1000);setTimeout(refresh,250);
})();
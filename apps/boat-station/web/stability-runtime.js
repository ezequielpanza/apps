(function(){
  const api=window.BoatStation;if(!api||window.BoatStationStabilityRuntime)return;
  const timers=new Set();
  function throttleLatest(name,interval,keyOf){
    const original=api[name];if(typeof original!=='function')return;
    const slots=new Map();
    api[name]=function(value){
      const key=keyOf?String(keyOf(value)||'default'):'default';let slot=slots.get(key);
      if(!slot){slot={latest:value,last:0,timer:0};slots.set(key,slot)}else slot.latest=value;
      const now=performance.now(),wait=Math.max(0,interval-(now-slot.last));
      const deliver=()=>{slot.timer=0;timers.delete(slot);slot.last=performance.now();const next=slot.latest;try{original.call(api,next)}catch(err){console.error('Boat Station telemetry handler',name,err)}};
      if(wait<=0&&!slot.timer){deliver();return}
      if(!slot.timer){slot.timer=setTimeout(deliver,wait);timers.add(slot)}
    };
  }
  throttleLatest('updateCompass',500);
  throttleLatest('updateMotion',500);
  throttleLatest('updateBattery',500,value=>value?.id||value?.address||value?.deviceId||value?.mac||value?.name||'battery');
  window.addEventListener('pagehide',()=>{for(const slot of timers){if(slot.timer)clearTimeout(slot.timer);slot.timer=0}timers.clear()});
  window.BoatStationStabilityRuntime={active:true};
})();

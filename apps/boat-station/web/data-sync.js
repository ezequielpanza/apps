(function(){
  const api=window.BoatStation;
  if(!api||window.BoatStationDataSync)return;

  const state={gps:null,phone:null,compass:null,motion:null,batteries:{}};
  const copy=value=>{try{return JSON.parse(JSON.stringify(value))}catch{return value}};
  const wrap=(name,store)=>{
    const original=api[name];
    if(typeof original!=='function')return;
    api[name]=function(value){store(value);return original.call(api,value)};
  };

  wrap('updateGPS',value=>{state.gps=copy(value)});
  wrap('updatePhone',value=>{state.phone=copy(value)});
  wrap('updateCompass',value=>{state.compass=Number(value)});
  wrap('updateMotion',value=>{state.motion=Number(value)});
  const batteryHandler=typeof api.updateBattery==='function'?'updateBattery':(typeof api.onBatteryData==='function'?'onBatteryData':null);
  if(batteryHandler)wrap(batteryHandler,value=>{if(!value)return;const id=String(value.id||value.address||value.deviceId||value.mac||value.name||'battery');state.batteries[id]={...(state.batteries[id]||{}),...copy(value)}});
  if(typeof api.onBatteryConnection==='function')wrap('onBatteryConnection',value=>{if(!value)return;const id=String(value.id||value.address||value.deviceId||value.mac||value.name||'battery');state.batteries[id]={...(state.batteries[id]||{}),...copy(value)}});

  function exportSnapshot(){return{version:1,time:Date.now(),gps:copy(state.gps),phone:copy(state.phone),compass:state.compass,motion:state.motion,batteries:Object.values(state.batteries).map(copy)}}
  function applySnapshot(snapshot){
    if(!snapshot||typeof snapshot!=='object')return false;
    window.dispatchEvent(new CustomEvent('boatstation-data-update-start'));
    try{
      if(snapshot.gps)api.updateGPS?.(snapshot.gps);
      if(snapshot.phone)api.updatePhone?.(snapshot.phone);
      if(Number.isFinite(Number(snapshot.compass)))api.updateCompass?.(Number(snapshot.compass));
      if(Number.isFinite(Number(snapshot.motion)))api.updateMotion?.(Number(snapshot.motion));
      if(Array.isArray(snapshot.batteries))snapshot.batteries.forEach(b=>api.updateBattery?.(b));
      return true;
    }finally{
      window.dispatchEvent(new CustomEvent('boatstation-data-update-end',{detail:{time:Number(snapshot.time)||Date.now()}}));
    }
  }

  window.BoatStationDataSync={exportSnapshot,applySnapshot};
})();

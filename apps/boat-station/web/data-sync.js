(function(){
  const api=window.BoatStation;
  if(!api||window.BoatStationDataSync)return;

  const params=new URLSearchParams(location.search);
  const isLocal=params.get('mode')==='station'||!!window.CoreBridge||!!window.BoatStationCore||!!window.NativeBridge;
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

  function stationLayout(){
    const order=[...document.querySelectorAll('#cards .card[data-id]')].map(card=>card.dataset.id).filter(Boolean);
    return{order};
  }

  function stationName(){
    const n=String(localStorage.getItem('bs.stationName')||'').trim();
    return n||'Estación';
  }

  function exportSnapshot(){return{version:3,time:Date.now(),stationName:stationName(),gps:copy(state.gps),phone:copy(state.phone),compass:state.compass,motion:state.motion,batteries:Object.values(state.batteries).map(copy),layout:stationLayout()}}

  function seedRemoteLayoutOnce(snapshot){
    if(isLocal||!snapshot?.layout||!Array.isArray(snapshot.layout.order))return false;
    const stationId=localStorage.getItem('bs.remote.activeStation')||'';
    if(!stationId)return false;
    const marker='bs.remote.layoutSeeded.'+stationId;
    if(localStorage.getItem(marker)==='1')return false;
    const allowed=['gps','batteries','phone','seastate','compass'];
    const order=snapshot.layout.order.filter(id=>allowed.includes(id));
    if(order.length)localStorage.setItem('bs.ui.order',JSON.stringify(order));
    localStorage.setItem(marker,'1');
    if(order.length){location.reload();return true}
    return false;
  }

  function syncRemoteStationName(snapshot){
    if(isLocal)return;
    const stationId=localStorage.getItem('bs.remote.activeStation')||'';
    const nextName=String(snapshot?.stationName||'').trim();
    if(!stationId||!nextName)return;
    try{
      const list=JSON.parse(localStorage.getItem('bs.remote.stations')||'[]');
      if(!Array.isArray(list))return;
      let changed=false;
      for(const row of list){
        if(row&&row.stationId===stationId&&row.name!==nextName){row.name=nextName;changed=true}
      }
      if(changed){
        localStorage.setItem('bs.remote.stations',JSON.stringify(list));
        window.dispatchEvent(new CustomEvent('boatstation-station-name-updated',{detail:{stationId,name:nextName}}));
      }
    }catch(_){ }
  }

  function applyNow(snapshot){
    syncRemoteStationName(snapshot);
    if(seedRemoteLayoutOnce(snapshot))return true;
    window.dispatchEvent(new CustomEvent('boatstation-data-update-start'));
    try{
      if(snapshot.gps)api.updateGPS?.(snapshot.gps);
      if(snapshot.phone)api.updatePhone?.(snapshot.phone);
      if(Number.isFinite(Number(snapshot.compass)))api.updateCompass?.(Number(snapshot.compass));
      if(Number.isFinite(Number(snapshot.motion)))api.updateMotion?.(Number(snapshot.motion));
      if(Array.isArray(snapshot.batteries))snapshot.batteries.forEach(b=>api.updateBattery?.(b));
      return true;
    }finally{
      window.dispatchEvent(new CustomEvent('boatstation-data-update-end',{detail:{time:Number(snapshot.time)||Date.now(),stationName:String(snapshot.stationName||'')}}));
    }
  }
  function applySnapshot(snapshot){
    if(!snapshot||typeof snapshot!=='object')return false;
    const remoteUi=window.BoatStationRemoteUI;
    if(remoteUi?.scheduleData)return remoteUi.scheduleData(snapshot,applyNow);
    return applyNow(snapshot);
  }

  window.BoatStationDataSync={exportSnapshot,applySnapshot};
})();

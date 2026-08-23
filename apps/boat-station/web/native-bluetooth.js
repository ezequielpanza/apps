// Thin PWA <-> Android Core bridge for battery BLE. Native remains responsible for BLE logic.
const native=()=>window.NativeBridge;
const seen=new Map();
let scanList=[];
let scanEpoch=0;
let scanRetryTimer=0;

function savedBatteries(){
  try{
    const list=JSON.parse(native()?.getSavedBatteries?.()||'[]');
    return Array.isArray(list)?list:[];
  }catch(_){return []}
}
function linkedAddresses(){
  return new Set(savedBatteries().map(b=>String(b.address||'').toUpperCase()).filter(Boolean));
}
function isConfiguredBattery(data){
  if(!data)return false;
  const id=String(data.id??'');
  const address=String(data.address||data.mac||'').toUpperCase();
  return savedBatteries().some(b=>(id&&String(b.id)===id)||(address&&String(b.address||'').toUpperCase()===address));
}
function publishScan(){
  const linked=linkedAddresses();
  scanList=[...seen.values()].filter(d=>!linked.has(String(d.address||d.mac||'').toUpperCase())).sort((a,b)=>(b.rssi??-999)-(a.rssi??-999));
  window.BoatStation?.bluetoothDevices?.(scanList);
}

function nativeStart(){
  try{
    const n=native();
    if(n&&typeof n.startBatteryScan==='function'){n.startBatteryScan();return true}
  }catch(_){}
  return false;
}
function stopNativeScan(){
  scanEpoch++;
  clearTimeout(scanRetryTimer);scanRetryTimer=0;
  try{native()?.stopBatteryScan?.()}catch(_){ }
}
function startNativeScan(){
  const epoch=++scanEpoch;
  clearTimeout(scanRetryTimer);scanRetryTimer=0;
  seen.clear();scanList=[];publishScan();
  // Android BLE scanners can remain in a transient state immediately after a
  // previous device was selected. Explicitly stop the prior session and start
  // a fresh one on the next turn instead of reusing the old scan lifecycle.
  try{native()?.stopBatteryScan?.()}catch(_){ }
  setTimeout(()=>{if(epoch!==scanEpoch)return;nativeStart()},120);
  // If Android silently rejected the immediate restart, retry once. This also
  // recovers from an old native scan timeout that happened to fire meanwhile.
  scanRetryTimer=setTimeout(()=>{
    if(epoch!==scanEpoch||scanList.length)return;
    try{native()?.stopBatteryScan?.()}catch(_){ }
    setTimeout(()=>{if(epoch===scanEpoch)nativeStart()},180);
  },1800);
  return true;
}

function exposeCoreAdapter(){
  window.BoatStationCore=window.BoatStationCore||{};
  window.BoatStationCore.openBluetoothScanner=startNativeScan;
  window.BoatStationCore.stopBluetoothScanner=stopNativeScan;
}
window.addEventListener('boatstation-core-ready',exposeCoreAdapter);
exposeCoreAdapter();

function normalizeBatteryData(data){
  if(!data||typeof data!=='object')return data;
  const out={...data,connected:true};
  // Native Humsienk frames expose the BMS nominal/full capacity as totalAh.
  // The PWA battery model uses capacityAh. Keep the transport field too, but
  // normalize it here so all UI/bank calculations use one canonical name.
  const capacity=Number(data.capacityAh);
  const total=Number(data.totalAh);
  if((!Number.isFinite(capacity)||capacity<=0)&&Number.isFinite(total)&&total>0)out.capacityAh=total;
  return out;
}

function attachCallbacks(){
  if(!window.BoatStation){setTimeout(attachCallbacks,50);return;}
  exposeCoreAdapter();
  window.BoatStation.onBleScanResult=device=>{
    if(!device)return;
    const key=String(device.address||device.id||device.name||Math.random());
    seen.set(key,device);
    publishScan();
  };
  window.BoatStation.onBatteryData=data=>{
    // A GATT callback can arrive after the user deleted a battery. Never allow
    // that stale callback to recreate a removed battery in the PWA model.
    if(!isConfiguredBattery(data))return;
    window.BoatStation?.updateBattery?.(normalizeBatteryData(data));
  };
  window.BoatStation.onBatteryConnection=data=>{
    if(!isConfiguredBattery(data))return;
    window.BoatStation?.updateBattery?.(data);
  };
}
attachCallbacks();

// The scanner is PWA UI; scanning itself is exclusively performed by the Core.
document.addEventListener('click',e=>{
  if(e.target.closest('[data-open-scanner]')){
    exposeCoreAdapter();
    return;
  }
  const deviceButton=e.target.closest('[data-scan-device]');
  if(deviceButton){
    const device=scanList[Number(deviceButton.dataset.scanDevice)];
    if(!device||!native())return;
    e.preventDefault();e.stopImmediatePropagation();
    try{
      const address=String(device.address||device.mac||'');
      if(address&&linkedAddresses().has(address.toUpperCase())){publishScan();return;}
      let bankId=1;
      const banks=JSON.parse(native().getSavedBanks?.()||'[]');
      if(Array.isArray(banks)&&banks.length)bankId=Number(banks[0].id)||1;
      else bankId=Number(native().addBank?.('Banco principal'))||1;
      const name=device.name||device.deviceName||'Batería';
      const id=Number(native().addBattery?.(bankId,name,0,'auto'));
      if(id>0){
        window.BoatStation?.updateBattery?.({id,name,address,capacityAh:0,connected:false});
        native().setBatteryAddress?.(id,address);
        seen.delete(String(device.address||device.id||device.name||''));
        publishScan();
        stopNativeScan();
        document.querySelectorAll('.fullscreen-sheet.open').forEach(s=>s.classList.remove('open'));
      }
    }catch(_){}
    return;
  }
  const remove=e.target.closest('[data-remove-battery]');
  if(remove){try{native()?.deleteBattery?.(Number(remove.dataset.removeBattery))}catch(_){}}
  if(e.target.closest('[data-scanner-back]'))stopNativeScan();
},true);

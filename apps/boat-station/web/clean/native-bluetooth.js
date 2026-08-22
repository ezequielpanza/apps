// Thin PWA <-> Android Core bridge for battery BLE. Native remains responsible for BLE logic.
const native=()=>window.NativeBridge;
const seen=new Map();
let scanList=[];

function publishScan(){
  scanList=[...seen.values()].sort((a,b)=>(b.rssi??-999)-(a.rssi??-999));
  window.BoatStation?.bluetoothDevices?.(scanList);
}

function startNativeScan(){
  seen.clear();scanList=[];publishScan();
  try{
    const n=native();
    if(n&&typeof n.startBatteryScan==='function'){
      n.startBatteryScan();
      return true;
    }
  }catch(_){}
  return false;
}
function stopNativeScan(){try{native()?.stopBatteryScan?.()}catch(_){}}

function exposeCoreAdapter(){
  window.BoatStationCore=window.BoatStationCore||{};
  window.BoatStationCore.openBluetoothScanner=startNativeScan;
  window.BoatStationCore.stopBluetoothScanner=stopNativeScan;
}
window.addEventListener('boatstation-core-ready',exposeCoreAdapter);
exposeCoreAdapter();

function attachCallbacks(){
  if(!window.BoatStation){setTimeout(attachCallbacks,50);return;}
  exposeCoreAdapter();
  window.BoatStation.onBleScanResult=device=>{
    if(!device)return;
    const key=String(device.address||device.id||device.name||Math.random());
    seen.set(key,device);
    publishScan();
  };
  window.BoatStation.onBatteryData=data=>window.BoatStation?.updateBattery?.({...data,connected:true});
  window.BoatStation.onBatteryConnection=data=>window.BoatStation?.updateBattery?.(data);
}
attachCallbacks();

// The scanner is PWA UI; scanning itself is exclusively performed by the Core.
document.addEventListener('click',e=>{
  if(e.target.closest('[data-open-scanner]')){
    // app.js calls BoatStationCore.openBluetoothScanner as part of the same action.
    exposeCoreAdapter();
    return;
  }
  const deviceButton=e.target.closest('[data-scan-device]');
  if(deviceButton){
    const device=scanList[Number(deviceButton.dataset.scanDevice)];
    if(!device||!native())return;
    e.preventDefault();e.stopImmediatePropagation();
    try{
      let bankId=1;
      const banks=JSON.parse(native().getSavedBanks?.()||'[]');
      if(Array.isArray(banks)&&banks.length)bankId=Number(banks[0].id)||1;
      else bankId=Number(native().addBank?.('Banco principal'))||1;
      const name=device.name||device.deviceName||'Batería';
      const id=Number(native().addBattery?.(bankId,name,0,'auto'));
      if(id>0){
        window.BoatStation?.updateBattery?.({id,name,address:device.address||device.mac||'',capacityAh:0,connected:false});
        native().setBatteryAddress?.(id,device.address||device.mac||'');
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

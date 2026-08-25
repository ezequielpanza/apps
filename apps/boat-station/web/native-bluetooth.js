// Thin PWA <-> Android Core bridge for battery BLE. Native owns BLE logic.
const native=()=>window.NativeBridge;
const dedicatedScanner=()=>window.BatteryScannerBridge;
const scannerNative=()=>dedicatedScanner()||window.NativeBridge;
const seen=new Map();
let scanList=[],scanEpoch=0,scanRetryTimer=0,configCache=[],configLoadedAt=0;
const CONFIG_CACHE_MS=10000;

function savedBatteries(force=false){
  const now=Date.now();if(!force&&configLoadedAt&&now-configLoadedAt<CONFIG_CACHE_MS)return configCache;
  try{const list=JSON.parse(native()?.getSavedBatteries?.()||'[]');configCache=Array.isArray(list)?list:[];configLoadedAt=now}catch(_){if(!configLoadedAt){configCache=[];configLoadedAt=now}}
  return configCache;
}
function invalidateConfig(){configLoadedAt=0}
function linkedAddresses(){return new Set(savedBatteries().map(b=>String(b.address||'').toUpperCase()).filter(Boolean))}
function isConfiguredBattery(data){if(!data)return false;const id=String(data.id??''),address=String(data.address||data.mac||'').toUpperCase();return savedBatteries().some(b=>(id&&String(b.id)===id)||(address&&String(b.address||'').toUpperCase()===address))}
function publishScan(){const linked=linkedAddresses();scanList=[...seen.values()].filter(d=>!linked.has(String(d.address||d.mac||'').toUpperCase()));window.BoatStation?.bluetoothDevices?.(scanList)}
function nativeStart(){try{const n=scannerNative();if(n&&typeof n.startBatteryScan==='function'){n.startBatteryScan();return true}}catch(_){}return false}
function stopNativeScan(){scanEpoch++;clearTimeout(scanRetryTimer);scanRetryTimer=0;try{scannerNative()?.stopBatteryScan?.()}catch(_){}}
function startNativeScan(){const epoch=++scanEpoch;clearTimeout(scanRetryTimer);scanRetryTimer=0;seen.clear();scanList=[];invalidateConfig();savedBatteries(true);publishScan();if(dedicatedScanner()){nativeStart();return true}try{scannerNative()?.stopBatteryScan?.()}catch(_){}setTimeout(()=>{if(epoch===scanEpoch)nativeStart()},120);scanRetryTimer=setTimeout(()=>{if(epoch!==scanEpoch||scanList.length)return;try{scannerNative()?.stopBatteryScan?.()}catch(_){}setTimeout(()=>{if(epoch===scanEpoch)nativeStart()},220)},2500);return true}
function exposeCoreAdapter(){window.BoatStationCore=window.BoatStationCore||{};window.BoatStationCore.openBluetoothScanner=startNativeScan;window.BoatStationCore.stopBluetoothScanner=stopNativeScan}
window.addEventListener('boatstation-core-ready',()=>{invalidateConfig();savedBatteries(true);exposeCoreAdapter()});exposeCoreAdapter();
function normalizeBatteryData(data){if(!data||typeof data!=='object')return data;const out={...data,connected:true},capacity=Number(data.capacityAh),total=Number(data.totalAh);if((!Number.isFinite(capacity)||capacity<=0)&&Number.isFinite(total)&&total>0)out.capacityAh=total;return out}
function attachCallbacks(){if(!window.BoatStation){setTimeout(attachCallbacks,100);return}exposeCoreAdapter();invalidateConfig();savedBatteries(true);window.BoatStation.onBleScanResult=device=>{if(!device)return;const key=String(device.address||device.id||device.name||Math.random());seen.set(key,device);publishScan()};window.BoatStation.onBleScanStatus=status=>{const message=String(status?.message||'').trim(),el=document.querySelector('.scanner-status');if(el&&message&&el.textContent!==message)el.textContent=message};window.BoatStation.onBatteryData=data=>{if(!isConfiguredBattery(data))return;window.BoatStation?.updateBattery?.(normalizeBatteryData(data))};window.BoatStation.onBatteryConnection=data=>{if(!isConfiguredBattery(data))return;window.BoatStation?.updateBattery?.(data)}}
attachCallbacks();
document.addEventListener('click',e=>{
  if(e.target.closest('[data-open-scanner]')){invalidateConfig();exposeCoreAdapter();return}
  const deviceButton=e.target.closest('[data-scan-device]');if(deviceButton){const device=scanList[Number(deviceButton.dataset.scanDevice)];if(!device||!native())return;e.preventDefault();e.stopImmediatePropagation();try{const address=String(device.address||device.mac||'');if(address&&linkedAddresses().has(address.toUpperCase())){publishScan();return}let bankId=1;const banks=JSON.parse(native().getSavedBanks?.()||'[]');if(Array.isArray(banks)&&banks.length)bankId=Number(banks[0].id)||1;else bankId=Number(native().addBank?.('Banco principal'))||1;const name=device.name||device.deviceName||'Batería',id=Number(native().addBattery?.(bankId,name,0,'auto'));if(id>0){native().setBatteryAddress?.(id,address);invalidateConfig();savedBatteries(true);window.BoatStation?.updateBattery?.({id,name,address,capacityAh:0,connected:false});seen.delete(String(device.address||device.id||device.name||''));publishScan();stopNativeScan();document.querySelectorAll('.fullscreen-sheet.open').forEach(s=>s.classList.remove('open'))}}catch(_){}return}
  const remove=e.target.closest('[data-remove-battery]');if(remove){try{native()?.deleteBattery?.(Number(remove.dataset.removeBattery))}catch(_){}invalidateConfig();setTimeout(()=>savedBatteries(true),100)}
  if(e.target.closest('[data-scanner-back]'))stopNativeScan();
},true);

// Thin PWA <-> Android Core bridge for battery BLE. Native owns BLE logic.
const native=()=>window.NativeBridge;
const dedicatedScanner=()=>window.BatteryScannerBridge;
const scannerNative=()=>dedicatedScanner()||window.NativeBridge;
const REMOVED_KEY='bs.batteries.removedNative.v1';
const seen=new Map();
let scanList=[],scanEpoch=0,scanRetryTimer=0,configCache=[],configLoadedAt=0;
const CONFIG_CACHE_MS=10000;

function savedBatteries(force=false){
  const now=Date.now();if(!force&&configLoadedAt&&now-configLoadedAt<CONFIG_CACHE_MS)return configCache;
  try{const list=JSON.parse(native()?.getSavedBatteries?.()||'[]');configCache=Array.isArray(list)?list:[];configLoadedAt=now}catch(_){if(!configLoadedAt){configCache=[];configLoadedAt=now}}
  return configCache;
}
function invalidateConfig(){configLoadedAt=0}
function removedBatteries(){try{const list=JSON.parse(localStorage.getItem(REMOVED_KEY)||'[]');return Array.isArray(list)?list:[]}catch{return[]}}
function saveRemoved(list){try{localStorage.setItem(REMOVED_KEY,JSON.stringify(list))}catch{}}
function rememberRemoval(id){const sid=String(id??''),cfg=savedBatteries(true).find(b=>String(b.id)===sid),address=String(cfg?.address||'').toUpperCase(),list=removedBatteries().filter(x=>String(x.id)!==sid&&(address?String(x.address||'').toUpperCase()!==address:true));list.push({id:sid,address,time:Date.now()});saveRemoved(list.slice(-32))}
function clearRemovalForAddress(address,id){const key=String(address||'').toUpperCase(),sid=String(id??'');saveRemoved(removedBatteries().filter(x=>(sid&&String(x.id)===sid)||(key&&String(x.address||'').toUpperCase()===key)?false:true))}
function purgeRemovedBatteries(){const removed=removedBatteries();if(!removed.length)return false;invalidateConfig();const configs=savedBatteries(true);let changed=false;for(const cfg of configs){const id=String(cfg?.id??''),address=String(cfg?.address||'').toUpperCase(),match=removed.some(x=>(id&&String(x.id)===id)||(address&&String(x.address||'').toUpperCase()===address));if(!match)continue;try{native()?.deleteBattery?.(Number(cfg.id));changed=true}catch(_){}}if(changed){invalidateConfig();setTimeout(()=>{savedBatteries(true);publishScan()},120)}return changed}
function removeConfiguredBattery(id){const nativeId=Number(id);if(!Number.isFinite(nativeId))return false;rememberRemoval(id);invalidateConfig();try{native()?.deleteBattery?.(nativeId)}catch(_){return false}invalidateConfig();setTimeout(()=>{savedBatteries(true);publishScan()},100);return true}
function configuredByAddress(address){const key=String(address||'').toUpperCase();if(!key)return null;return savedBatteries().find(b=>String(b.address||'').toUpperCase()===key)||null}
function uiLinkedAddresses(){try{const list=window.BoatStationBatteryState?.exportRemoteState?.()?.batteries;if(!Array.isArray(list))return new Set();return new Set(list.map(b=>String(b.address||b.mac||'').toUpperCase()).filter(Boolean))}catch{return new Set()}}
function isRemovedBattery(data){if(!data)return false;const id=String(data.id??''),address=String(data.address||data.mac||'').toUpperCase();return removedBatteries().some(x=>(id&&String(x.id)===id)||(address&&String(x.address||'').toUpperCase()===address))}
function isConfiguredBattery(data){if(!data||isRemovedBattery(data))return false;const id=String(data.id??''),address=String(data.address||data.mac||'').toUpperCase();return savedBatteries().some(b=>(id&&String(b.id)===id)||(address&&String(b.address||'').toUpperCase()===address))}
function publishScan(){const linked=uiLinkedAddresses();scanList=[...seen.values()].filter(d=>!linked.has(String(d.address||d.mac||'').toUpperCase()));window.BoatStation?.bluetoothDevices?.(scanList)}
function nativeStart(){try{const n=scannerNative();if(n&&typeof n.startBatteryScan==='function'){n.startBatteryScan();return true}}catch(_){}return false}
function stopNativeScan(){scanEpoch++;clearTimeout(scanRetryTimer);scanRetryTimer=0;try{scannerNative()?.stopBatteryScan?.()}catch(_){}}
function startNativeScan(){const epoch=++scanEpoch;clearTimeout(scanRetryTimer);scanRetryTimer=0;seen.clear();scanList=[];invalidateConfig();purgeRemovedBatteries();savedBatteries(true);publishScan();if(dedicatedScanner()){nativeStart();return true}try{scannerNative()?.stopBatteryScan?.()}catch(_){}setTimeout(()=>{if(epoch===scanEpoch)nativeStart()},120);scanRetryTimer=setTimeout(()=>{if(epoch!==scanEpoch||scanList.length)return;try{scannerNative()?.stopBatteryScan?.()}catch(_){}setTimeout(()=>{if(epoch===scanEpoch)nativeStart()},220)},2500);return true}
function exposeCoreAdapter(){window.BoatStationCore=window.BoatStationCore||{};window.BoatStationCore.openBluetoothScanner=startNativeScan;window.BoatStationCore.stopBluetoothScanner=stopNativeScan;window.BoatStationCore.removeBattery=removeConfiguredBattery}
function hookRemoteRemoval(){const s=window.BoatStationBatteryState;if(!s||s.__nativeRemoveHooked||typeof s.executeRemoteCommand!=='function')return false;const original=s.executeRemoteCommand;s.executeRemoteCommand=function(command,payload){if(command==='battery.remove')removeConfiguredBattery(payload?.id);return original.call(s,command,payload)};s.__nativeRemoveHooked=true;return true}
window.addEventListener('boatstation-core-ready',()=>{invalidateConfig();purgeRemovedBatteries();savedBatteries(true);exposeCoreAdapter();hookRemoteRemoval()});exposeCoreAdapter();
function normalizeBatteryData(data){if(!data||typeof data!=='object')return data;const out={...data,connected:true},capacity=Number(data.capacityAh),total=Number(data.totalAh);if((!Number.isFinite(capacity)||capacity<=0)&&Number.isFinite(total)&&total>0)out.capacityAh=total;return out}
function closeScanner(){stopNativeScan();document.querySelectorAll('.fullscreen-sheet.open').forEach(s=>s.classList.remove('open'))}
function attachCallbacks(){if(!window.BoatStation){setTimeout(attachCallbacks,100);return}exposeCoreAdapter();hookRemoteRemoval();invalidateConfig();purgeRemovedBatteries();savedBatteries(true);window.BoatStation.onBleScanResult=device=>{if(!device)return;const key=String(device.address||device.id||device.name||Math.random());seen.set(key,device);publishScan()};window.BoatStation.onBleScanStatus=status=>{const message=String(status?.message||'').trim(),el=document.querySelector('.scanner-status');if(el&&message&&el.textContent!==message)el.textContent=message};window.BoatStation.onBatteryData=data=>{if(!isConfiguredBattery(data))return;window.BoatStation?.updateBattery?.(normalizeBatteryData(data))};window.BoatStation.onBatteryConnection=data=>{if(!isConfiguredBattery(data))return;window.BoatStation?.updateBattery?.(data)}}
attachCallbacks();
document.addEventListener('click',e=>{
  if(e.target.closest('[data-open-scanner]')){invalidateConfig();exposeCoreAdapter();return}
  const deviceButton=e.target.closest('[data-scan-device]');if(deviceButton){const device=scanList[Number(deviceButton.dataset.scanDevice)];if(!device||!native())return;e.preventDefault();e.stopImmediatePropagation();try{const address=String(device.address||device.mac||''),name=device.name||device.deviceName||'Batería',existing=configuredByAddress(address);if(existing){clearRemovalForAddress(address,existing.id);window.BoatStation?.updateBattery?.({...existing,id:existing.id,name:existing.name||name,address,connected:false});seen.delete(String(device.address||device.id||device.name||''));publishScan();closeScanner();return}let bankId=1;const banks=JSON.parse(native().getSavedBanks?.()||'[]');if(Array.isArray(banks)&&banks.length)bankId=Number(banks[0].id)||1;else bankId=Number(native().addBank?.('Banco principal'))||1;const id=Number(native().addBattery?.(bankId,name,0,'auto'));if(id>0){clearRemovalForAddress(address,id);native().setBatteryAddress?.(id,address);invalidateConfig();savedBatteries(true);window.BoatStation?.updateBattery?.({id,name,address,capacityAh:0,connected:false});seen.delete(String(device.address||device.id||device.name||''));publishScan();closeScanner()}}catch(_){}return}
  const remove=e.target.closest('[data-remove-battery]');if(remove)removeConfiguredBattery(remove.dataset.removeBattery);
  if(e.target.closest('[data-scanner-back]'))stopNativeScan();
},true);

(function(){
  const devices=[];
  const coreIdToAddress=new Map();
  let installed=false;

  function native(){return window.NativeBridge||null}
  function addressOf(d){return String(d?.address||d?.mac||d?.id||'')}
  function addScanDevice(d){
    const address=addressOf(d);if(!address)return;
    const i=devices.findIndex(x=>addressOf(x)===address);
    if(i>=0)devices[i]={...devices[i],...d};else devices.push(d);
    window.BoatStation?.bluetoothDevices?.(devices.slice());
  }
  function mappedBattery(data){
    if(!data)return data;
    const originalId=data.id;
    const address=data.address||coreIdToAddress.get(Number(originalId))||coreIdToAddress.get(String(originalId));
    if(address)return {...data,coreId:originalId,id:address,address};
    return data;
  }
  function install(){
    if(installed||!window.BoatStation){setTimeout(install,60);return}
    installed=true;
    const api=window.BoatStation;
    window.BoatStationCore=window.BoatStationCore||{};
    window.BoatStationCore.openBluetoothScanner=function(){
      devices.length=0;
      api.bluetoothDevices?.([]);
      const n=native();
      if(n&&typeof n.startBatteryScan==='function'){n.startBatteryScan();return true}
      return false;
    };
    window.BoatStationCore.stopBluetoothScanner=function(){const n=native();if(n&&typeof n.stopBatteryScan==='function')n.stopBatteryScan()};

    api.onBleScanResult=function(d){addScanDevice(d)};
    api.onBatteryConnection=function(d){
      if(d?.id!=null&&d?.address)coreIdToAddress.set(Number(d.id),String(d.address));
      api.updateBattery?.(mappedBattery(d));
    };
    api.onBatteryData=function(d){api.updateBattery?.(mappedBattery(d))};

    document.addEventListener('click',function(e){
      const row=e.target.closest?.('[data-scan-device]');
      if(row){
        const address=(row.querySelector('small')?.textContent||'').trim();
        const name=(row.querySelector('strong')?.textContent||'Batería').trim();
        const n=native();
        if(address&&n&&typeof n.addBattery==='function'&&typeof n.setBatteryAddress==='function'){
          try{
            const id=Number(n.addBattery(1,name,0,'auto'));
            if(Number.isFinite(id)&&id>0){coreIdToAddress.set(id,address);n.setBatteryAddress(id,address)}
          }catch(_){}
        }
      }
      if(e.target.closest?.('[data-scanner-back]'))window.BoatStationCore.stopBluetoothScanner?.();
    },true);
  }
  install();
})();

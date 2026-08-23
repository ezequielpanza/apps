(function(){
  if(window.BoatStationIndividualBatteryHistory)return;
  const KEY='bs.batteries.individualHistory',MAX_AGE=90*86400000,MIN_SAMPLE=30000;
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  const clone=v=>{try{return JSON.parse(JSON.stringify(v))}catch{return v}};
  let rows=[];try{const saved=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(saved))rows=saved}catch(_){ }
  const lastById=new Map();for(const r of rows){const id=String(r?.id||'');if(id)lastById.set(id,Number(r.time)||0)}
  function save(){const cutoff=Date.now()-MAX_AGE;rows=rows.filter(r=>Number(r.time)>=cutoff);try{localStorage.setItem(KEY,JSON.stringify(rows))}catch(_){}}
  function idOf(v){return String(v?.id||v?.address||v?.deviceId||v?.mac||v?.name||'battery')}
  function record(v){if(!v)return;const id=idOf(v),now=Date.now(),last=lastById.get(id)||0;if(now-last<MIN_SAMPLE)return;const soc=num(v.soc),current=num(v.current),capacityAh=num(v.capacityAh);if(soc===null)return;rows.push({time:now,id,name:String(v.name||v.deviceName||id),soc,current,capacityAh});lastById.set(id,now);if(rows.length%120===0)save();else try{localStorage.setItem(KEY,JSON.stringify(rows))}catch(_){}}
  const api=window.BoatStation;if(api){for(const name of ['updateBattery','onBatteryData']){const original=api[name];if(typeof original==='function'&&!original.__individualHistory){const wrapped=function(v){record(v);return original.call(api,v)};wrapped.__individualHistory=true;api[name]=wrapped}}}
  const bs=window.BoatStationBatteryState;if(bs){const originalExport=bs.exportRemoteState?.bind(bs);if(originalExport)bs.exportRemoteState=function(){const out=originalExport()||{};out.individualHistory=clone(rows);return out};const originalApply=bs.applyRemoteState?.bind(bs);if(originalApply)bs.applyRemoteState=function(remote){if(Array.isArray(remote?.individualHistory)){rows=clone(remote.individualHistory);save()}return originalApply(remote)}}
  window.BoatStationIndividualBatteryHistory={get:()=>clone(rows),record};
})();
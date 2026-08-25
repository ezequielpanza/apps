const CURRENT_KEY='bs.batteries.current.v1';
const HISTORY_KEY='bs.batteries.history.v1';
const LEGACY_KEY='bs.batteries.state';
const STAT_FIELDS_KEY='bs.batteries.statFields';
const HISTORY_INTERVAL_MS=30000;
const CURRENT_SAVE_DELAY_MS=2000;
const MAX_HISTORY_AGE_MS=90*86400000;

const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const num=v=>Number.isFinite(Number(v))?Number(v):null;
const clone=v=>{try{return JSON.parse(JSON.stringify(v))}catch{return v}};
const read=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback}catch{return fallback}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};

function migrate(){
  const current=read(CURRENT_KEY,null);if(current)return;
  const legacy=read(LEGACY_KEY,null);if(!legacy||typeof legacy!=='object')return;
  write(CURRENT_KEY,{bankName:legacy.bankName||'Banco principal',batteries:Array.isArray(legacy.batteries)?legacy.batteries:[]});
  if(Array.isArray(legacy.history)&&legacy.history.length)write(HISTORY_KEY,legacy.history);
}

export function createBatteriesModule(requestRender,openManager){
  migrate();
  const saved=read(CURRENT_KEY,{}),history=read(HISTORY_KEY,[]);
  const state={bankName:String(saved.bankName||'Banco principal'),batteries:Array.isArray(saved.batteries)?saved.batteries:[],history:Array.isArray(history)?history:[],scanDevices:[],remoteAuthoritative:false,remoteStats:null,root:null,lastHistoryAt:0};
  let currentSaveTimer=0,historyDirty=false;

  function saveCurrent(immediate=false){
    const persist=()=>{currentSaveTimer=0;write(CURRENT_KEY,{bankName:state.bankName,batteries:state.batteries})};
    if(immediate){if(currentSaveTimer)clearTimeout(currentSaveTimer);persist();return}
    if(!currentSaveTimer)currentSaveTimer=setTimeout(persist,CURRENT_SAVE_DELAY_MS);
  }
  function compactHistory(){
    const now=Date.now(),cutoff=now-MAX_HISTORY_AGE_MS,src=state.history.filter(p=>Number(p?.time)>=cutoff&&num(p?.soc)!==null).sort((a,b)=>a.time-b.time),bins=new Map();
    for(const p of src){const age=now-Number(p.time);let bucket=30000;if(age>14*86400000)bucket=7200000;else if(age>48*3600000)bucket=1800000;else if(age>6*3600000)bucket=300000;const key=Math.floor(Number(p.time)/bucket)*bucket;let b=bins.get(key);if(!b){b={time:Number(p.time),n:0,soc:0,current:0,currentN:0,voltage:0,voltageN:0};bins.set(key,b)}b.n++;b.soc+=Number(p.soc);const c=num(p.current);if(c!==null){b.current+=c;b.currentN++}const v=num(p.voltage);if(v!==null){b.voltage+=v;b.voltageN++}b.time=Math.max(b.time,Number(p.time))}
    state.history=[...bins.values()].map(b=>({time:b.time,soc:b.soc/b.n,current:b.currentN?b.current/b.currentN:null,voltage:b.voltageN?b.voltage/b.voltageN:null})).sort((a,b)=>a.time-b.time);
  }
  function saveHistory(){if(!historyDirty)return;historyDirty=false;compactHistory();write(HISTORY_KEY,state.history)}
  window.addEventListener('pagehide',()=>{saveCurrent(true);saveHistory()});

  function stats(){
    let cap=0,rem=0,current=0,voltageSum=0,voltageN=0,connected=0;
    for(const b of state.batteries){const c=num(b.capacityAh)||0,s=num(b.soc),r=num(b.remainingAh),a=num(b.current),v=num(b.voltage);cap+=c;rem+=r!==null?r:(s!==null&&c?s*c/100:0);if(a!==null)current+=a;if(v!==null){voltageSum+=v;voltageN++;if(b.connected!==false)connected++}}
    const voltage=voltageN?voltageSum/voltageN:null,soc=cap>0?Math.max(0,Math.min(100,rem/cap*100)):null;
    return{cap,rem,current,voltage,soc,power:voltage===null?null:voltage*current,connected,total:state.batteries.length};
  }
  function summary(){const s=stats();return s.soc===null?(s.cap?`${Math.round(s.cap)} Ah`:'Sin datos'):`${Math.round(s.soc)}% · ${Math.round(s.rem)}/${Math.round(s.cap)} Ah`}
  function metric(value,label){return `<div class="metric"><div class="value">${value}</div><div class="label">${label}</div></div>`}
  function individualBattery(b,i){const soc=num(b.soc),v=num(b.voltage),a=num(b.current),cap=num(b.capacityAh)||0,rem=num(b.remainingAh),shownRem=rem!==null?rem:(soc!==null&&cap?cap*soc/100:null),online=b.connected!==false&&v!==null;return `<div class="battery-mini ${online?'online':'offline'}"><div class="battery-mini-head"><strong>${esc(b.name||b.deviceName||`Batería ${i+1}`)}</strong><span class="battery-mini-link">${online?'⌁':'×'}</span></div><div class="battery-mini-body"><div class="battery-mini-ring" style="--soc:${soc??0}"><span>${soc===null?'—':Math.round(soc)+'%'}</span></div><div class="battery-mini-right"><div class="battery-mini-top"><div><b>${v===null?'—':v.toFixed(2)+' V'}</b><small>Voltaje</small></div><div><b>${a===null?'—':(a>=0?'+':'')+a.toFixed(1)+' A'}</b><small>Corriente</small></div></div><div class="battery-mini-charge"><span>${shownRem===null?'—':`${Math.round(shownRem)} / ${Math.round(cap)} Ah`}</span><small>Carga</small></div></div></div></div>`}
  function fmtDuration(hours){if(hours===null||!Number.isFinite(hours)||hours<0)return '—';if(hours<1)return `${Math.round(hours*60)} min`;if(hours<48){const h=Math.floor(hours),m=Math.round((hours-h)*60);return m?`${h} h ${m} min`:`${h} h`}return `${(hours/24).toFixed(hours<240?1:0)} días`}
  function energyStats(){
    if(state.remoteAuthoritative&&state.remoteStats)return state.remoteStats;
    const cutoff=Date.now()-7*86400000,points=state.history.filter(p=>Number(p.time)>=cutoff&&num(p.current)!==null&&num(p.voltage)!==null).sort((a,b)=>a.time-b.time),s=stats();if(points.length<2)return null;
    let dischargeAh=0,chargeAh=0,dischargeWh=0,dischargeMs=0,chargeMs=0,peakDrawW=0,peakChargeW=0,weightedDrawW=0,weightedDrawMs=0,coveredMs=0;
    for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dt=Math.min(5*60000,Math.max(0,Number(b.time)-Number(a.time)));if(!dt)continue;const current=(Number(a.current)+Number(b.current))/2,voltage=(Number(a.voltage)+Number(b.voltage))/2,power=voltage*current,h=dt/3600000;coveredMs+=dt;if(current<-.15){const draw=-current,p=-power;dischargeAh+=draw*h;dischargeWh+=p*h;dischargeMs+=dt;weightedDrawW+=p*dt;weightedDrawMs+=dt;peakDrawW=Math.max(peakDrawW,p)}else if(current>.15){chargeAh+=current*h;chargeMs+=dt;peakChargeW=Math.max(peakChargeW,power)}}
    if(!coveredMs)return null;const days=Math.max(coveredMs/86400000,1/24),dailyAh=dischargeAh/days,dailyWh=dischargeWh/days,avgDrawW=weightedDrawMs?weightedDrawW/weightedDrawMs:0;return{dailyAh,dailyWh,avgDrawW,fullAutonomy:dailyAh>0&&s.cap>0?s.cap/dailyAh*24:null,remainingAutonomy:dailyAh>0&&s.rem>0?s.rem/dailyAh*24:null,chargeEta:s.current>.15&&s.cap>s.rem?(s.cap-s.rem)/s.current:null,dischargeHoursDay:(dischargeMs/3600000)/days,chargeHoursDay:(chargeMs/3600000)/days,peakDrawW,peakChargeW,netAh:(chargeAh-dischargeAh)/days,coverageHours:coveredMs/3600000};
  }
  function selectedStats(){const all=['Consumo diario promedio','Consumo promedio','Autonomía máxima','Autonomía restante','Tiempo restante de carga','Tiempo descargando por día','Tiempo cargando por día','Consumo máximo','Carga máxima','Balance diario neto'];const v=read(STAT_FIELDS_KEY,null);return new Set(Array.isArray(v)&&v.length?v:all)}
  function statRow(label,value,detail=''){if(!selectedStats().has(label))return'';return `<div class="battery-item"><div class="battery-item-top"><span class="battery-name">${label}</span><span class="battery-soc">${value}</span></div>${detail?`<div class="battery-item-sub"><span>${detail}</span></div>`:''}</div>`}
  function statisticsPage(){const e=energyStats();if(!e)return `<div class="battery-empty"><div>Recolectando datos para estadísticas…</div><small>Se necesitan muestras de corriente y voltaje durante algunos minutos.</small></div>`;const coverage=e.coverageHours<24?`Basado en ${fmtDuration(e.coverageHours)} de datos`:`Basado en ${(e.coverageHours/24).toFixed(1)} días de datos`;return `<div class="battery-list battery-stats-list">${statRow('Consumo diario promedio',`${e.dailyAh.toFixed(1)} Ah/día`,`≈ ${Math.round(e.dailyWh)} Wh/día · promedio móvil hasta 7 días`)}${statRow('Consumo promedio',e.avgDrawW?`${Math.round(e.avgDrawW)} W`:'—','Promedio mientras el banco está descargando')}${statRow('Autonomía máxima',fmtDuration(e.fullAutonomy),'Banco al 100% con el consumo promedio actual')}${statRow('Autonomía restante',fmtDuration(e.remainingAutonomy),'Con la carga y consumo promedio actuales')}${statRow('Tiempo restante de carga',fmtDuration(e.chargeEta),e.chargeEta===null?'Disponible mientras el banco está cargando':'Estimado con la corriente de carga actual')}${statRow('Tiempo descargando por día',fmtDuration(e.dischargeHoursDay),'Promedio del período observado')}${statRow('Tiempo cargando por día',fmtDuration(e.chargeHoursDay),'Promedio del período observado')}${statRow('Consumo máximo',e.peakDrawW?`${Math.round(e.peakDrawW)} W`:'—','Pico registrado en el período')}${statRow('Carga máxima',e.peakChargeW?`${Math.round(e.peakChargeW)} W`:'—','Pico de potencia de carga registrado')}${statRow('Balance diario neto',`${e.netAh>=0?'+':''}${e.netAh.toFixed(1)} Ah/día`,e.netAh>=0?'En promedio entra más energía de la que sale':'En promedio sale más energía de la que entra')}<div class="battery-history-note">${coverage}</div></div>`}
  function batteryListPage(){if(!state.batteries.length)return `<div class="battery-empty"><div>No hay baterías vinculadas</div><button class="gps-action primary" type="button" data-battery-manage>Administrar Banco de Baterías</button></div>`;return `<div class="battery-list">${state.batteries.map(b=>{const soc=num(b.soc),v=num(b.voltage),a=num(b.current),c=num(b.capacityAh);return `<div class="battery-item"><div class="battery-item-top"><span class="battery-name">${esc(b.name||b.deviceName||'Batería')}</span><span class="battery-soc">${soc===null?'—':Math.round(soc)+'%'}</span></div><div class="battery-item-sub"><span>${c===null?'— Ah':Math.round(c)+' Ah'}</span><span>${v===null?'—':v.toFixed(2)+' V'}</span><span>${a===null?'—':a.toFixed(1)+' A'}</span><span class="${b.connected===false?'offline':'online'}">${b.connected===false?'Offline':'Conectada'}</span></div></div>`}).join('')}</div>`}
  function page(index){const s=stats();if(index===0){const minis=state.batteries.length?state.batteries.map(individualBattery).join(''):'<div class="battery-mini-empty">Sin baterías vinculadas</div>';return `<div class="battery-overview"><div class="battery-bank-panel"><div class="battery-hero"><div class="battery-ring" style="--soc:${s.soc??0}"><div><strong>${s.soc===null?'—':Math.round(s.soc)+'%'}</strong><span>Carga</span></div></div><div class="battery-bank-name">${esc(state.bankName)}</div><div class="battery-ah">${Math.round(s.rem)} / ${Math.round(s.cap)} Ah</div></div><div class="metric-grid three compact-bank-metrics">${metric(s.voltage===null?'—':s.voltage.toFixed(2)+' V','Voltaje')}${metric(s.current.toFixed(1)+' A','Corriente')}${metric(s.power===null?'—':Math.round(s.power)+' W','Potencia')}</div><div class="battery-connected">${s.connected} de ${s.total} baterías conectadas</div></div><div class="battery-mini-column">${minis}</div></div>`}if(index===1)return statisticsPage();return batteryListPage()}
  function afterRender(root){state.root=root;root.querySelectorAll('[data-battery-manage]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openManager?.()}))}
  function appendHistory(s){const now=Date.now();if(now-state.lastHistoryAt<HISTORY_INTERVAL_MS)return;state.lastHistoryAt=now;state.history.push({time:now,soc:s.soc,current:s.current,voltage:s.voltage});historyDirty=true;saveHistory()}
  function localUpdateBattery(data){if(!data)return;const id=String(data.id||data.address||data.deviceId||data.mac||data.name||'battery');let b=state.batteries.find(x=>String(x.id)===id);if(!b){b={id,name:data.name||data.deviceName||'Batería',capacityAh:num(data.capacityAh)||0,connected:true};state.batteries.push(b)}Object.assign(b,data,{id,connected:data.connected!==false});const s=stats();if(!state.remoteAuthoritative&&s.soc!==null)appendHistory(s);saveCurrent();requestRender('batteries')}
  function localAddBattery(device){const id=String(device.id||device.address||device.deviceId||device.mac||device.name||Date.now());if(state.batteries.some(b=>String(b.id)===id))return;state.batteries.push({id,name:device.name||device.deviceName||'Batería',deviceName:device.name||device.deviceName||'',address:device.address||device.mac||'',capacityAh:num(device.capacityAh)||0,connected:false});saveCurrent(true);requestRender('batteries')}
  function localRemoveBattery(id){state.batteries=state.batteries.filter(b=>String(b.id)!==String(id));saveCurrent(true);requestRender('batteries')}
  function localRenameBank(name){const n=String(name||'').trim();if(!n)return;state.bankName=n;saveCurrent(true);requestRender('batteries')}
  function addBattery(device){if(state.remoteAuthoritative){window.BoatStationRemoteCommand?.send?.('battery.add',{device:clone(device)});return}localAddBattery(device)}
  function removeBattery(id){if(state.remoteAuthoritative){window.BoatStationRemoteCommand?.send?.('battery.remove',{id:String(id)});return}localRemoveBattery(id)}
  function renameBank(name){if(state.remoteAuthoritative){window.BoatStationRemoteCommand?.send?.('battery.renameBank',{name:String(name||'').trim()});return}localRenameBank(name)}
  function setScanDevices(list){state.scanDevices=Array.isArray(list)?clone(list):[]}
  function exportRemoteState(){return{bankName:state.bankName,batteries:clone(state.batteries),statsSummary:clone(energyStats()),scanDevices:clone(state.scanDevices)}}
  function applyRemoteState(remote){if(!remote||typeof remote!=='object')return;state.remoteAuthoritative=true;if(typeof remote.bankName==='string'&&remote.bankName.trim())state.bankName=remote.bankName.trim();if(Array.isArray(remote.batteries))state.batteries=clone(remote.batteries);if(remote.statsSummary&&typeof remote.statsSummary==='object')state.remoteStats=clone(remote.statsSummary);if(Array.isArray(remote.scanDevices)){state.scanDevices=clone(remote.scanDevices);window.BoatStation?.bluetoothDevices?.(state.scanDevices)}requestRender('batteries')}
  function executeRemoteCommand(command,payload){if(command==='battery.renameBank')localRenameBank(payload?.name);else if(command==='battery.remove')localRemoveBattery(payload?.id);else if(command==='battery.add')localAddBattery(payload?.device||payload);else if(command==='battery.scan'){state.scanDevices=[];try{window.BoatStationCore?.openBluetoothScanner?.()||window.NativeBridge?.startBatteryScan?.()}catch{}}}
  window.BoatStationBatteryState={exportRemoteState,applyRemoteState,executeRemoteCommand,setScanDevices,isRemote:()=>state.remoteAuthoritative};
  return{id:'batteries',name:'Baterías',pages:3,summary,page,afterRender,state,updateBattery:localUpdateBattery,addBattery,removeBattery,renameBank,stats,exportRemoteState,applyRemoteState};
}

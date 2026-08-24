export function createBatteriesModule(requestRender,openManager){
  const read=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback}catch(_){return fallback}};
  const saved=read('bs.batteries.state',null);
  const state=saved&&typeof saved==='object'?saved:{bankName:'Banco principal',batteries:[],history:[],historyHours:168,root:null};
  delete state.capacityAh;state.root=null;state.remoteAuthoritative=false;state.scanDevices=[];
  state.history=Array.isArray(state.history)?state.history:[];
  state.batteries=Array.isArray(state.batteries)?state.batteries:[];
  const HISTORY_HOUR_LEVELS=[1,3,6,12,24,48,72,168,336,720,1440,2160];
  if(!Number.isFinite(Number(state.historyHours))&&Number.isFinite(Number(state.historyDays)))state.historyHours=Number(state.historyDays)*24;
  delete state.historyDays;if(!HISTORY_HOUR_LEVELS.includes(Number(state.historyHours)))state.historyHours=168;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[m]));
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  const clone=v=>{try{return JSON.parse(JSON.stringify(v))}catch{return v}};
  let saveTimer=0;
  function persist(){saveTimer=0;try{const copy={...state,root:undefined,remoteAuthoritative:undefined,scanDevices:undefined};localStorage.setItem('bs.batteries.state',JSON.stringify(copy))}catch(_){}}
  function save(immediate=false){if(immediate){if(saveTimer){clearTimeout(saveTimer);saveTimer=0}persist();return}if(saveTimer)return;saveTimer=setTimeout(persist,500)}
  window.addEventListener('pagehide',persist);
  function stats(){
    const list=state.batteries,connected=list.filter(b=>b.connected!==false&&num(b.voltage)!==null);let cap=0,rem=0,current=0,voltageSum=0,voltageN=0;
    for(const b of list){const c=num(b.capacityAh)||0,s=num(b.soc),r=num(b.remainingAh);cap+=c;rem+=r!==null?r:(s!==null&&c?s*c/100:0);const a=num(b.current);if(a!==null)current+=a;const v=num(b.voltage);if(v!==null){voltageSum+=v;voltageN++}}
    const voltage=voltageN?voltageSum/voltageN:null,soc=cap>0?Math.max(0,Math.min(100,rem/cap*100)):null;
    return{cap,rem,current,voltage,soc,power:voltage===null?null:voltage*current,connected:connected.length,total:list.length};
  }
  function summary(){const s=stats();return s.soc===null?(s.cap?`${Math.round(s.cap)} Ah`:'Sin datos'):`${Math.round(s.soc)}% · ${Math.round(s.rem)}/${Math.round(s.cap)} Ah`}
  function metric(value,label){return `<div class="metric"><div class="value">${value}</div><div class="label">${label}</div></div>`}
  function individualBattery(b,i){
    const soc=num(b.soc),v=num(b.voltage),a=num(b.current),cap=num(b.capacityAh)||0,rem=num(b.remainingAh);
    const shownRem=rem!==null?rem:(soc!==null&&cap?cap*soc/100:null),online=b.connected!==false&&v!==null;
    const socText=soc===null?'—':Math.round(soc)+'%';
    const vText=v===null?'—':v.toFixed(2)+' V';
    const aText=a===null?'—':(a>=0?'+':'')+a.toFixed(1)+' A';
    const ahText=shownRem===null?'—':`${Math.round(shownRem)} / ${Math.round(cap)} Ah`;
    return `<div class="battery-mini ${online?'online':'offline'}"><div class="battery-mini-head"><strong>${esc(b.name||b.deviceName||`Batería ${i+1}`)}</strong><span class="battery-mini-link">${online?'⌁':'×'}</span></div><div class="battery-mini-body"><div class="battery-mini-ring" style="--soc:${soc??0}"><span>${socText}</span></div><div class="battery-mini-right"><div class="battery-mini-top"><div><b>${vText}</b><small>Voltaje</small></div><div><b>${aText}</b><small>Corriente</small></div></div><div class="battery-mini-charge"><span>${ahText}</span><small>Carga</small></div></div></div></div>`;
  }
  function historyRangeLabel(){const h=Number(state.historyHours);if(h<24)return `${h} ${h===1?'hora':'horas'}`;const d=h/24;return `${d} ${d===1?'día':'días'}`}
  function historyPage(){return `<div class="battery-history-wrap"><div class="battery-history"><canvas data-battery-chart></canvas><div class="battery-history-note">Historial de carga del banco · <span data-history-range>${historyRangeLabel()}</span></div></div><div class="battery-history-zoom" aria-label="Zoom del historial"><button type="button" data-history-zoom="out" aria-label="Mostrar más historial">+</button><button type="button" data-history-zoom="in" aria-label="Mostrar menos historial">−</button></div></div>`}
  function batteryListPage(){if(!state.batteries.length)return `<div class="battery-empty"><div>No hay baterías vinculadas</div><button class="gps-action primary" type="button" data-battery-manage>Administrar Banco de Baterías</button></div>`;return `<div class="battery-list">${state.batteries.map(b=>{const soc=num(b.soc),v=num(b.voltage),a=num(b.current),c=num(b.capacityAh);return `<div class="battery-item"><div class="battery-item-top"><span class="battery-name">${esc(b.name||b.deviceName||'Batería')}</span><span class="battery-soc">${soc===null?'—':Math.round(soc)+'%'}</span></div><div class="battery-item-sub"><span>${c===null?'— Ah':Math.round(c)+' Ah'}</span><span>${v===null?'—':v.toFixed(2)+' V'}</span><span>${a===null?'—':a.toFixed(1)+' A'}</span><span class="${b.connected===false?'offline':'online'}">${b.connected===false?'Offline':'Conectada'}</span></div></div>`}).join('')}</div>`}
  function fmtDuration(hours){if(hours===null||!Number.isFinite(hours)||hours<0)return '—';if(hours<1)return `${Math.round(hours*60)} min`;if(hours<48){const h=Math.floor(hours),m=Math.round((hours-h)*60);return m?`${h} h ${m} min`:`${h} h`}return `${(hours/24).toFixed(hours<240?1:0)} días`}
  function energyStats(){
    const now=Date.now(),cutoff=now-7*86400000,points=state.history.filter(p=>Number(p.time)>=cutoff&&num(p.current)!==null&&num(p.voltage)!==null).sort((a,b)=>a.time-b.time),s=stats();
    if(points.length<2)return null;
    let dischargeAh=0,chargeAh=0,dischargeWh=0,chargeWh=0,dischargeMs=0,chargeMs=0,peakDrawW=0,peakChargeW=0,weightedDrawW=0,weightedDrawMs=0;
    let coveredMs=0;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],dt=Math.min(5*60000,Math.max(0,Number(b.time)-Number(a.time)));if(!dt)continue;
      const current=(Number(a.current)+Number(b.current))/2,voltage=(Number(a.voltage)+Number(b.voltage))/2,power=voltage*current,h=dt/3600000;coveredMs+=dt;
      if(current<-.15){const draw=-current,p=-power;dischargeAh+=draw*h;dischargeWh+=p*h;dischargeMs+=dt;weightedDrawW+=p*dt;weightedDrawMs+=dt;peakDrawW=Math.max(peakDrawW,p)}
      else if(current>.15){chargeAh+=current*h;chargeWh+=power*h;chargeMs+=dt;peakChargeW=Math.max(peakChargeW,power)}
    }
    if(coveredMs<=0)return null;
    const days=Math.max(coveredMs/86400000,1/24),dailyAh=dischargeAh/days,dailyWh=dischargeWh/days,avgDrawW=weightedDrawMs?weightedDrawW/weightedDrawMs:0,dischargeHoursDay=(dischargeMs/3600000)/days,chargeHoursDay=(chargeMs/3600000)/days;
    const fullAutonomy=dailyAh>0&&s.cap>0?s.cap/dailyAh*24:null,remainingAutonomy=dailyAh>0&&s.rem>0?s.rem/dailyAh*24:null;
    const chargeCurrent=s.current>.15?s.current:null,chargeRemaining=Math.max(0,s.cap-s.rem),chargeEta=chargeCurrent&&chargeRemaining>0?chargeRemaining/chargeCurrent:null;
    const netAh=(chargeAh-dischargeAh)/days,coverageHours=coveredMs/3600000;
    return{dailyAh,dailyWh,avgDrawW,fullAutonomy,remainingAutonomy,chargeEta,dischargeHoursDay,chargeHoursDay,peakDrawW,peakChargeW,netAh,coverageHours};
  }
  function statRow(label,value,detail=''){return `<div class="battery-item"><div class="battery-item-top"><span class="battery-name">${label}</span><span class="battery-soc">${value}</span></div>${detail?`<div class="battery-item-sub"><span>${detail}</span></div>`:''}</div>`}
  function statisticsPage(){
    const e=energyStats();
    if(!e)return `<div class="battery-empty"><div>Recolectando datos para estadísticas…</div><small>Se necesitan muestras de corriente y voltaje durante algunos minutos.</small></div>`;
    const daily=`${e.dailyAh.toFixed(1)} Ah/día`,dailyDetail=`≈ ${Math.round(e.dailyWh)} Wh/día · promedio móvil hasta 7 días`;
    const netText=(e.netAh>=0?'+':'')+e.netAh.toFixed(1)+' Ah/día';
    const chargeEta=e.chargeEta===null?'—':fmtDuration(e.chargeEta);
    const coverage=e.coverageHours<24?`Basado en ${fmtDuration(e.coverageHours)} de datos`:`Basado en ${(e.coverageHours/24).toFixed(1)} días de datos`;
    return `<div class="battery-list battery-stats-list">${statRow('Consumo diario promedio',daily,dailyDetail)}${statRow('Consumo promedio',e.avgDrawW?`${Math.round(e.avgDrawW)} W`:'—','Promedio mientras el banco está descargando')}${statRow('Autonomía máxima',fmtDuration(e.fullAutonomy),'Banco al 100% con el consumo promedio actual')}${statRow('Autonomía restante',fmtDuration(e.remainingAutonomy),'Con la carga y consumo promedio actuales')}${statRow('Tiempo restante de carga',chargeEta,e.chargeEta===null?'Disponible mientras el banco está cargando':'Estimado con la corriente de carga actual')}${statRow('Tiempo descargando por día',fmtDuration(e.dischargeHoursDay),'Promedio del período observado')}${statRow('Tiempo cargando por día',fmtDuration(e.chargeHoursDay),'Promedio del período observado')}${statRow('Consumo máximo',e.peakDrawW?`${Math.round(e.peakDrawW)} W`:'—','Pico registrado en el período')}${statRow('Carga máxima',e.peakChargeW?`${Math.round(e.peakChargeW)} W`:'—','Pico de potencia de carga registrado')}${statRow('Balance diario neto',netText,e.netAh>=0?'En promedio entra más energía de la que sale':'En promedio sale más energía de la que entra')}<div class="battery-history-note">${coverage}</div></div>`;
  }
  function page(index){
    const s=stats();
    if(index===0){const minis=state.batteries.length?state.batteries.map(individualBattery).join(''):'<div class="battery-mini-empty">Sin baterías vinculadas</div>';return `<div class="battery-overview"><div class="battery-bank-panel"><div class="battery-hero"><div class="battery-ring" style="--soc:${s.soc??0}"><div><strong>${s.soc===null?'—':Math.round(s.soc)+'%'}</strong><span>Carga</span></div></div><div class="battery-bank-name">${esc(state.bankName)}</div><div class="battery-ah">${Math.round(s.rem)} / ${Math.round(s.cap)} Ah</div></div><div class="metric-grid three compact-bank-metrics">${metric(s.voltage===null?'—':s.voltage.toFixed(2)+' V','Voltaje')}${metric(s.current.toFixed(1)+' A','Corriente')}${metric(s.power===null?'—':Math.round(s.power)+' W','Potencia')}</div><div class="battery-connected">${s.connected} de ${s.total} baterías conectadas</div></div><div class="battery-mini-column">${minis}</div></div>`}
    if(index===1)return historyPage();
    if(index===2)return statisticsPage();
    return batteryListPage();
  }
  function updateHistoryLabel(root){const el=root?.querySelector('[data-history-range]');if(el)el.textContent=historyRangeLabel()}
  function chartWindow(hours,count=12){
    const stepMinutes=Math.max(1,Math.round(Number(hours)*60/count));
    const step=stepMinutes*60000;
    const currentStart=Math.floor(Date.now()/step)*step;
    return{step,start:currentStart-step*(count-1),end:currentStart+step,currentStart};
  }
  function aggregateForChart(points,start,step,count){
    const buckets=Array.from({length:count},()=>({socSum:0,socN:0,currentSum:0,currentN:0,time:0}));
    const end=start+step*count;
    for(const p of points){
      const time=Number(p.time);if(!Number.isFinite(time)||time<start||time>=end)continue;
      const i=Math.floor((time-start)/step),b=buckets[i],soc=num(p.soc),current=num(p.current);
      if(soc!==null){b.socSum+=soc;b.socN++}
      if(current!==null){b.currentSum+=current;b.currentN++}
      b.time=time;
    }
    return buckets.map((b,i)=>b.socN?{time:b.time||start+(i+.5)*step,soc:b.socSum/b.socN,current:b.currentN?b.currentSum/b.currentN:null}:null);
  }
  function axisLabel(time,hours){const d=new Date(time),hh=String(d.getHours()).padStart(2,'0'),mm=String(d.getMinutes()).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0'),month=String(d.getMonth()+1).padStart(2,'0');if(hours<=12)return `${hh}:${mm}`;if(hours<=72)return `${day}/${month} ${hh}:${mm}`;if(hours<=336)return `${day}/${month} ${hh}h`;return `${day}/${month}`}
  function drawChart(root){
    const canvas=root.querySelector('[data-battery-chart]');if(!canvas)return;const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;
    const dpr=window.devicePixelRatio||1;canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,r.width,r.height);
    const hours=Number(state.historyHours),axisH=r.width<520?42:30,plotH=Math.max(20,r.height-axisH),windowSpec=chartWindow(hours,12),start=windowSpec.start,step=windowSpec.step,slot=r.width/12;
    c.strokeStyle='#17394f';c.lineWidth=1;for(let i=1;i<5;i++){const y=i*plotH/5;c.beginPath();c.moveTo(0,y);c.lineTo(r.width,y);c.stroke()}
    const pts=aggregateForChart(state.history,start,step,12);
    if(pts.some(Boolean)){
      const bar=Math.max(1,slot*.7);
      pts.forEach((p,i)=>{
        if(!p)return;
        const h=Math.max(1,(Math.max(0,Math.min(100,Number(p.soc)||0))/100)*plotH),x=i*slot+(slot-bar)/2,current=num(p.current);
        c.fillStyle=current===null||Math.abs(current)<=.15?'#1ed7e5':current>.15?'#8bd332':'#ff6e6e';
        c.fillRect(x,plotH-h,bar,h);
      });
    }
    c.font=(r.width<520?'8px':'9px')+' system-ui, sans-serif';c.fillStyle='#7890a1';c.textBaseline='middle';c.textAlign='center';for(let i=0;i<12;i++){const periodEnd=start+(i+1)*step,text=axisLabel(periodEnd,hours),x=(i+.5)*slot,y=plotH+(axisH/2);c.save();c.translate(x,y);if(r.width<520)c.rotate(-Math.PI/4);c.fillText(text,0,0);c.restore()}
  }
  function changeHistoryZoom(direction,root){const i=HISTORY_HOUR_LEVELS.indexOf(Number(state.historyHours)),next=direction==='out'?Math.min(HISTORY_HOUR_LEVELS.length-1,i+1):Math.max(0,i-1);if(next===i)return;state.historyHours=HISTORY_HOUR_LEVELS[next];save();updateHistoryLabel(root);drawChart(root)}
  function afterRender(root){state.root=root;drawChart(root);root.querySelectorAll('[data-battery-manage]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openManager?.()}));root.querySelectorAll('[data-history-zoom]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();changeHistoryZoom(b.dataset.historyZoom,root)}))}
  function compactHistory(){
    const now=Date.now(),cutoff=now-90*86400000,src=state.history.filter(p=>Number(p.time)>=cutoff&&Number.isFinite(Number(p.soc))).sort((a,b)=>a.time-b.time),bins=new Map();
    const fields=['soc','remainingAh','capacityAh','current','voltage','power'];
    for(const p of src){const age=now-Number(p.time);let bucket=30000;if(age>14*86400000)bucket=7200000;else if(age>48*3600000)bucket=1800000;else if(age>6*3600000)bucket=300000;const key=Math.floor(Number(p.time)/bucket)*bucket;let b=bins.get(key);if(!b){b={time:Number(p.time),values:{}};fields.forEach(f=>b.values[f]={sum:0,n:0});bins.set(key,b)}b.time=Math.max(b.time,Number(p.time));fields.forEach(f=>{const v=num(p[f]);if(v!==null){b.values[f].sum+=v;b.values[f].n++}})}
    state.history=[...bins.values()].map(b=>{const p={time:b.time};fields.forEach(f=>{const x=b.values[f];if(x.n)p[f]=x.sum/x.n});return p}).sort((a,b)=>a.time-b.time);
  }
  function appendHistory(s){const now=Date.now(),last=state.history[state.history.length-1];if(last&&now-last.time<=30000)return;state.history.push({time:now,soc:s.soc,remainingAh:s.rem,capacityAh:s.cap,current:s.current,voltage:s.voltage,power:s.power});if(state.history.length%120===0)compactHistory()}
  function localUpdateBattery(data){if(!data)return;const id=String(data.id||data.address||data.deviceId||data.mac||data.name||'battery');let b=state.batteries.find(x=>String(x.id)===id);if(!b){b={id,name:data.name||data.deviceName||'Batería',capacityAh:num(data.capacityAh)||0,connected:true};state.batteries.push(b)}Object.assign(b,data,{id,connected:data.connected!==false});const s=stats();if(s.soc!==null&&!state.remoteAuthoritative)appendHistory(s);save();requestRender('batteries')}
  function updateBattery(data){localUpdateBattery(data)}
  function exportRemoteState(){return{bankName:String(state.bankName||'Banco principal'),batteries:clone(state.batteries),history:clone(state.history),scanDevices:clone(state.scanDevices)}}
  function applyRemoteState(remote){if(!remote||typeof remote!=='object')return;const localHours=state.historyHours;state.remoteAuthoritative=true;if(typeof remote.bankName==='string'&&remote.bankName.trim())state.bankName=remote.bankName.trim();if(Array.isArray(remote.batteries))state.batteries=clone(remote.batteries);if(Array.isArray(remote.history))state.history=clone(remote.history).filter(p=>Number.isFinite(Number(p?.time))&&Number.isFinite(Number(p?.soc)));if(Array.isArray(remote.scanDevices)){state.scanDevices=clone(remote.scanDevices);window.BoatStation?.bluetoothDevices?.(state.scanDevices)}state.historyHours=localHours;save();requestRender('batteries')}
  function localAddBattery(device){const id=String(device.id||device.address||device.deviceId||device.mac||device.name||Date.now());if(state.batteries.some(b=>String(b.id)===id))return;state.batteries.push({id,name:device.name||device.deviceName||'Batería',deviceName:device.name||device.deviceName||'',address:device.address||device.mac||'',capacityAh:num(device.capacityAh)||0,connected:false});save(true);requestRender('batteries')}
  function addBattery(device){if(state.remoteAuthoritative){window.BoatStationRemoteCommand?.send?.('battery.add',{device:clone(device)});return}localAddBattery(device)}
  function localRemoveBattery(id){state.batteries=state.batteries.filter(b=>String(b.id)!==String(id));save(true);requestRender('batteries')}
  function removeBattery(id){if(state.remoteAuthoritative){window.BoatStationRemoteCommand?.send?.('battery.remove',{id:String(id)});return}localRemoveBattery(id)}
  function localRenameBank(name){const n=String(name||'').trim();if(!n)return;state.bankName=n;save(true);requestRender('batteries')}
  function renameBank(name){const n=String(name||'').trim();if(!n)return;if(state.remoteAuthoritative){window.BoatStationRemoteCommand?.send?.('battery.renameBank',{name:n});return}localRenameBank(n)}
  function localEditBattery(payload){const id=String(payload?.id||''),b=state.batteries.find(x=>String(x.id)===id);if(!b)return;if(typeof payload.name==='string'&&payload.name.trim())b.name=payload.name.trim();if(Number.isFinite(Number(payload.capacityAh))&&Number(payload.capacityAh)>=0)b.capacityAh=Number(payload.capacityAh);save(true);requestRender('batteries')}
  function editBattery(id,changes){const payload={id:String(id),...changes};if(state.remoteAuthoritative){window.BoatStationRemoteCommand?.send?.('battery.edit',payload);return}localEditBattery(payload)}
  function setScanDevices(list){state.scanDevices=Array.isArray(list)?clone(list):[]}
  function startLocalScan(){state.scanDevices=[];try{if(window.BoatStationCore?.openBluetoothScanner){window.BoatStationCore.openBluetoothScanner();return true}if(window.NativeBridge?.startBatteryScan){window.NativeBridge.startBatteryScan();return true}}catch(_){}return false}
  function executeRemoteCommand(command,payload){if(command==='battery.renameBank')localRenameBank(payload?.name);else if(command==='battery.remove')localRemoveBattery(payload?.id);else if(command==='battery.add')localAddBattery(payload?.device||payload);else if(command==='battery.edit')localEditBattery(payload);else if(command==='battery.scan')startLocalScan()}
  document.addEventListener('click',e=>{if(!state.remoteAuthoritative||!e.target.closest('[data-open-scanner]'))return;window.BoatStationRemoteCommand?.send?.('battery.scan')},true);
  window.BoatStationBatteryState={exportRemoteState,applyRemoteState,executeRemoteCommand,setScanDevices,isRemote:()=>state.remoteAuthoritative};
  return {id:'batteries',name:'Baterías',pages:4,summary,page,afterRender,state,updateBattery,addBattery,removeBattery,renameBank,editBattery,stats,exportRemoteState,applyRemoteState};
}
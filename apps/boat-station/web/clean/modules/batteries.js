export function createBatteriesModule(requestRender,openManager){
  const read=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback}catch(_){return fallback}};
  const saved=read('bs.batteries.state',null);
  const state=saved&&typeof saved==='object'?saved:{bankName:'Banco principal',batteries:[],history:[],historyHours:168,root:null};
  delete state.capacityAh;state.root=null;
  state.history=Array.isArray(state.history)?state.history:[];
  state.batteries=Array.isArray(state.batteries)?state.batteries:[];
  const HISTORY_HOUR_LEVELS=[1,3,6,12,24,48,72,168,336,720,1440,2160];
  if(!Number.isFinite(Number(state.historyHours))&&Number.isFinite(Number(state.historyDays)))state.historyHours=Number(state.historyDays)*24;
  delete state.historyDays;if(!HISTORY_HOUR_LEVELS.includes(Number(state.historyHours)))state.historyHours=168;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  function save(){try{const copy={...state,root:undefined};localStorage.setItem('bs.batteries.state',JSON.stringify(copy))}catch(_){}}
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
    const ahText=shownRem===null?'—':`${Math.round(shownRem)}/${Math.round(cap)} Ah`;
    return `<div class="battery-mini ${online?'online':'offline'}"><div class="battery-mini-head"><strong>${esc(b.name||b.deviceName||`Batería ${i+1}`)}</strong><span class="battery-mini-link">${online?'⌁':'×'}</span></div><div class="battery-mini-body"><div class="battery-mini-ring" style="--soc:${soc??0}"><span>${socText}</span></div><div class="battery-mini-values"><span>${vText}</span><span>${aText}</span><span class="battery-mini-ah">${ahText}</span></div></div></div>`;
  }
  function historyRangeLabel(){const h=Number(state.historyHours);if(h<24)return `${h} ${h===1?'hora':'horas'}`;const d=h/24;return `${d} ${d===1?'día':'días'}`}
  function page(index){
    const s=stats();
    if(index===0){
      const minis=state.batteries.length?state.batteries.map(individualBattery).join(''):'<div class="battery-mini-empty">Sin baterías vinculadas</div>';
      return `<div class="battery-overview"><div class="battery-bank-panel"><div class="battery-hero"><div class="battery-ring" style="--soc:${s.soc??0}"><div><strong>${s.soc===null?'—':Math.round(s.soc)+'%'}</strong><span>Carga</span></div></div><div class="battery-bank-name">${esc(state.bankName)}</div><div class="battery-ah">${Math.round(s.rem)} / ${Math.round(s.cap)} Ah</div></div><div class="metric-grid three compact-bank-metrics">${metric(s.voltage===null?'—':s.voltage.toFixed(2)+' V','Voltaje')}${metric(s.current.toFixed(1)+' A','Corriente')}${metric(s.power===null?'—':Math.round(s.power)+' W','Potencia')}</div><div class="battery-connected">${s.connected} de ${s.total} baterías conectadas</div></div><div class="battery-mini-column">${minis}</div></div>`;
    }
    if(index===1){if(!state.batteries.length)return `<div class="battery-empty"><div>No hay baterías vinculadas</div><button class="gps-action primary" type="button" data-battery-manage>Administrar Banco de Baterías</button></div>`;return `<div class="battery-list">${state.batteries.map(b=>{const soc=num(b.soc),v=num(b.voltage),a=num(b.current),c=num(b.capacityAh);return `<div class="battery-item"><div class="battery-item-top"><span class="battery-name">${esc(b.name||b.deviceName||'Batería')}</span><span class="battery-soc">${soc===null?'—':Math.round(soc)+'%'}</span></div><div class="battery-item-sub"><span>${c===null?'— Ah':Math.round(c)+' Ah'}</span><span>${v===null?'—':v.toFixed(2)+' V'}</span><span>${a===null?'—':a.toFixed(1)+' A'}</span><span class="${b.connected===false?'offline':'online'}">${b.connected===false?'Offline':'Conectada'}</span></div></div>`}).join('')}</div>`}
    return `<div class="battery-history-wrap"><div class="battery-history"><canvas data-battery-chart></canvas><div class="battery-history-note">Historial de carga del banco · <span data-history-range>${historyRangeLabel()}</span></div></div><div class="battery-history-zoom" aria-label="Zoom del historial"><button type="button" data-history-zoom="out" aria-label="Mostrar más historial">+</button><button type="button" data-history-zoom="in" aria-label="Mostrar menos historial">−</button></div></div>`;
  }
  function historyPoints(){const cutoff=Date.now()-Number(state.historyHours)*3600000;return state.history.filter(p=>Number(p.time)>=cutoff)}
  function updateHistoryLabel(root){const el=root?.querySelector('[data-history-range]');if(el)el.textContent=historyRangeLabel()}
  function drawChart(root){const canvas=root.querySelector('[data-battery-chart]');if(!canvas)return;const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;const dpr=window.devicePixelRatio||1;canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,r.width,r.height);c.strokeStyle='#17394f';c.lineWidth=1;for(let i=1;i<5;i++){const y=i*r.height/5;c.beginPath();c.moveTo(0,y);c.lineTo(r.width,y);c.stroke()}const pts=historyPoints();if(pts.length<2)return;const start=Date.now()-Number(state.historyHours)*3600000,end=Date.now(),span=Math.max(1,end-start);c.strokeStyle='#1ed7e5';c.lineWidth=2;c.beginPath();pts.forEach((p,i)=>{const x=Math.max(0,Math.min(r.width,((Number(p.time)-start)/span)*r.width)),y=r.height-(Math.max(0,Math.min(100,Number(p.soc)||0))/100*r.height);i?c.lineTo(x,y):c.moveTo(x,y)});c.stroke()}
  function changeHistoryZoom(direction,root){const i=HISTORY_HOUR_LEVELS.indexOf(Number(state.historyHours)),next=direction==='out'?Math.min(HISTORY_HOUR_LEVELS.length-1,i+1):Math.max(0,i-1);if(next===i)return;state.historyHours=HISTORY_HOUR_LEVELS[next];save();updateHistoryLabel(root);drawChart(root)}
  function afterRender(root){state.root=root;drawChart(root);root.querySelectorAll('[data-battery-manage]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openManager?.()}));root.querySelectorAll('[data-history-zoom]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();changeHistoryZoom(b.dataset.historyZoom,root)}))}
  function updateBattery(data){if(!data)return;const id=String(data.id||data.address||data.deviceId||data.mac||data.name||'battery');let b=state.batteries.find(x=>String(x.id)===id);if(!b){b={id,name:data.name||data.deviceName||'Batería',capacityAh:num(data.capacityAh)||0,connected:true};state.batteries.push(b)}Object.assign(b,data,{id,connected:data.connected!==false});const s=stats();if(s.soc!==null){const now=Date.now(),last=state.history[state.history.length-1];if(!last||now-last.time>30000)state.history.push({time:now,soc:s.soc});if(state.history.length>1000)state.history.splice(0,state.history.length-1000)}save();requestRender('batteries')}
  function addBattery(device){const id=String(device.id||device.address||device.deviceId||device.mac||device.name||Date.now());if(state.batteries.some(b=>String(b.id)===id))return;state.batteries.push({id,name:device.name||device.deviceName||'Batería',deviceName:device.name||device.deviceName||'',address:device.address||device.mac||'',capacityAh:num(device.capacityAh)||0,connected:false});save();requestRender('batteries')}
  function removeBattery(id){state.batteries=state.batteries.filter(b=>String(b.id)!==String(id));save();requestRender('batteries')}
  function renameBank(name){const n=String(name||'').trim();if(!n)return;state.bankName=n;save();requestRender('batteries')}
  return {id:'batteries',name:'Baterías',pages:3,summary,page,afterRender,state,updateBattery,addBattery,removeBattery,renameBank,stats};
}

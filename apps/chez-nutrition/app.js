const CONFIG={spreadsheetId:'1D1bh6oqja9iuET3O-zvkcuHSW54cBcq9Q7ihZ3KHmRw'};
const SHEETS={general:0,evolution:101,intakes:102};
const FALLBACK_GOALS={Eze:{kcal:1800,p:115,h:200,g:60,weight:65},Chilu:{kcal:1425,p:70,h:162,g:55,weight:42}};
let weightChart=null,calorieChart=null;
const $=id=>document.getElementById(id);
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const num=v=>{if(v==null||v==='')return 0;let s=String(v).trim().replace(/\s/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');const n=Number(s);return Number.isFinite(n)?n:0};
const localToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santo_Domingo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let selectedDate=localToday();
const PEOPLE=['Eze','Chilu'];
const PERSON_COLORS={Eze:{fill:'rgba(56,160,235,.70)',line:'#38a0eb'},Chilu:{fill:'rgba(244,114,182,.70)',line:'#f472b6'}};
const PERSON_STORAGE_KEY='chez-nutrition:selected-person';
let selectedPerson=(()=>{try{const saved=localStorage.getItem(PERSON_STORAGE_KEY);return PEOPLE.includes(saved)?saved:'Eze'}catch{return'Eze'}})();
function rememberSelectedPerson(){const grid=$('peopleGrid');if(!grid)return;const index=Math.round(grid.scrollLeft/Math.max(grid.clientWidth,1));selectedPerson=PEOPLE[clamp(index,0,PEOPLE.length-1)];try{localStorage.setItem(PERSON_STORAGE_KEY,selectedPerson)}catch{}}
function restoreSelectedPerson(){const grid=$('peopleGrid'),index=PEOPLE.indexOf(selectedPerson);if(index<0||!grid)return;requestAnimationFrame(()=>grid.scrollLeft=index*grid.clientWidth)}
function setupPeopleCarousel(){const grid=$('peopleGrid');grid.onscroll=rememberSelectedPerson;restoreSelectedPerson()}
const fmtDate=iso=>{const [y,m,d]=String(iso).split('-').map(Number);return y?new Intl.DateTimeFormat('es-AR',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,d))):iso};
const fmt=v=>Math.round(v).toLocaleString('es-AR');
const shiftDate=(iso,days)=>{const [y,m,d]=iso.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)};
function parseCSV(text){const rows=[];let row=[],cell='',q=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(q){if(c==='"'&&n==='"'){cell+='"';i++}else if(c==='"')q=false;else cell+=c}else{if(c==='"')q=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell=''}else cell+=c}}if(cell.length||row.length){row.push(cell.replace(/\r$/,''));rows.push(row)}return rows.filter(r=>r.some(x=>x!==''))}
async function fetchSheetCSV(gid){const urls=[`https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}/export?format=csv&gid=${gid}`,`https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid}`];let lastErr;for(const url of urls){try{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const t=await r.text();if(!t||t.trim().startsWith('<!DOCTYPE')||t.includes('<html'))throw new Error('Google devolvió HTML en vez de CSV');return parseCSV(t)}catch(e){lastErr=e}}throw lastErr||new Error('No se pudo leer la planilla')}
function rowsToObjects(rows){if(!rows.length)return[];const headers=rows[0].map(x=>x.trim());return rows.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]??'').trim()]))) }
function goalsFromGeneral(rows){const goals=structuredClone(FALLBACK_GOALS);for(const r of rows.slice(2)){const key=(r[0]||'').trim(),e=num(r[1]),c=num(r[2]);if(key==='Objetivo diario (kcal)'){if(e)goals.Eze.kcal=e;if(c)goals.Chilu.kcal=c}if(key==='Peso objetivo (kg)'){if(e)goals.Eze.weight=e;if(c)goals.Chilu.weight=c}if(key==='Objetivo proteína (g)'){if(e)goals.Eze.p=e;if(c)goals.Chilu.p=c}if(key==='Objetivo hidratos (g)'){if(e)goals.Eze.h=e;if(c)goals.Chilu.h=c}if(key==='Objetivo grasas (g)'){if(e)goals.Eze.g=e;if(c)goals.Chilu.g=c}}return goals}
function dayData(evolution,intakes,date){const out={date,people:{}};for(const person of ['Eze','Chilu']){const evo=[...evolution].reverse().find(r=>r.Fecha===date&&r.Persona===person)||{},its=intakes.filter(r=>r.Fecha===date&&r.Persona===person),totals=its.reduce((a,r)=>({kcal:a.kcal+num(r.kcal),p:a.p+num(r['P (g)']),h:a.h+num(r['H (g)']),g:a.g+num(r['G (g)'])}),{kcal:0,p:0,h:0,g:0});if(!its.length&&evo.Persona){totals.kcal=num(evo['Calorías']);totals.p=num(evo['Proteína (g)']);totals.h=num(evo['Hidratos (g)']);totals.g=num(evo['Grasas (g)'])}out.people[person]={evo,its,totals}}return out}
function progress(value,target){return target?clamp(value/target*100,0,100):0}
function progressBar(value,target){const ratio=target?value/target:0;if(ratio<=1)return `<div class="progress"><span style="width:${progress(value,target)}%"></span></div>`;const scale=Math.max(1.1,ratio),blue=100/scale,red=(ratio-1)/scale*100;return `<div class="progress"><span style="width:${blue}%"></span><span class="overage" style="left:${blue}%;width:${red}%"></span></div>`}
function deltaText(value,target,unit){const delta=target-value;return delta>=0?`Faltan ${fmt(delta)} ${unit}`:`Te pasaste por ${fmt(-delta)} ${unit}`}
function macro(letter,label,val,target){const delta=target-val,over=delta<0,status=over?`Exceso: ${fmt(-delta)} g`:`Faltan ${fmt(delta)} g`;return `<div class="macro${over?' is-over':''}"><div class="macro-name"><span class="macro-token">${letter}</span><span>${label}</span></div><div class="macro-main">${Math.round(val)} / ${target} g</div><div class="macro-rest"><span>${status}</span><span>${Math.round(progress(val,target))}%</span></div>${progressBar(val,target)}</div>`}
function personCard(name,data,goal,isToday){const t=data.totals,kcalDelta=goal.kcal-t.kcal,weight=num(data.evo['Peso (kg)']);return `<article class="panel person-card"><div class="person-head"><div><div class="eyebrow">${isToday?'Hoy':'Fecha seleccionada'}</div><div class="person-title">${name}</div></div><div class="muted">${weight?`${weight.toLocaleString('es-AR')} kg`:'Sin peso cargado'}</div></div><div class="kcal-block"><div class="metric-box"><div class="metric-label">Consumidas</div><div class="metric-value">${fmt(t.kcal)} kcal</div><div class="metric-sub">de ${fmt(goal.kcal)} kcal · ${Math.round(progress(t.kcal,goal.kcal))}%</div>${progressBar(t.kcal,goal.kcal)}</div><div class="metric-box"><div class="metric-label">${kcalDelta>=0?'Te faltan':'Te pasaste'}</div><div class="metric-value">${fmt(Math.abs(kcalDelta))} kcal</div><div class="metric-sub">${kcalDelta>=0?'para completar el objetivo':'por encima del objetivo'}</div></div></div><div class="macro-grid">${macro('P','Proteína',t.p,goal.p)}${macro('H','Hidratos',t.h,goal.h)}${macro('G','Grasas',t.g,goal.g)}</div><div class="target-note">Objetivo peso: ${goal.weight} kg · PHG objetivo: ${goal.p}/${goal.h}/${goal.g} g</div></article>`}
function renderIntakes(intakes,date,isToday){const rows=intakes.filter(r=>r.Fecha===date);$('intakes').innerHTML=rows.length?rows.map(r=>`<div class="intake-row"><div class="intake-moment">${r.Momento||''}</div><div><div class="intake-food"><span class="intake-person">${r.Persona}</span>${r['Alimento / bebida']||''}</div><div class="intake-macros">P ${fmt(num(r['P (g)']))} · H ${fmt(num(r['H (g)']))} · G ${fmt(num(r['G (g)']))} g</div></div><div class="intake-kcal">${fmt(num(r.kcal))} kcal</div></div>`).join(''):`<div class="empty">Todavía no hay ingestas cargadas para ${isToday?'hoy':fmtDate(date)}.</div>`}
function renderCharts(evolution,intakes,goals){
  const names=['Eze','Chilu'];
  const byPerson=Object.fromEntries(names.map(n=>[n,evolution.filter(r=>r.Persona===n)]));
  const byPersonIntakes=Object.fromEntries(names.map(n=>[n,intakes.filter(r=>r.Persona===n)]));
  const latestDate=[localToday(),...evolution.map(r=>r.Fecha).filter(Boolean),...intakes.map(r=>r.Fecha).filter(Boolean)].sort().at(-1);
  const labels=Array.from({length:7},(_,i)=>shiftDate(latestDate,i-6));
  const weightDatasets=[
    ...names.map(n=>({label:n,data:labels.map(d=>{const r=byPerson[n].find(x=>x.Fecha===d);return r?num(r['Peso (kg)']):null}),borderColor:PERSON_COLORS[n].line,backgroundColor:PERSON_COLORS[n].fill,pointBackgroundColor:PERSON_COLORS[n].fill,spanGaps:true,tension:.25})),
    ...names.map(n=>({label:`Objetivo ${n} · ${goals[n].weight} kg`,data:labels.map(()=>goals[n].weight),borderDash:[7,6],borderWidth:2,pointRadius:0,tension:0}))
  ];
  if(weightChart)weightChart.destroy();
  weightChart=new Chart($('weightChart'),{type:'line',data:{labels:labels.map(fmtDate),datasets:weightDatasets},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:false}}}});
  const dailyCalories=(name,date)=>{
    const entries=byPersonIntakes[name].filter(x=>x.Fecha===date);
    if(entries.length)return entries.reduce((sum,x)=>sum+num(x.kcal),0);
    const row=byPerson[name].find(x=>x.Fecha===date);
    return row?num(row['Calorías']):null;
  };
  const percentage=(name,date)=>{const kcal=dailyCalories(name,date);return kcal==null?null:kcal/goals[name].kcal*100};
  const overageColors={Eze:{fill:'rgba(220,38,38,.86)',line:'#dc2626'},Chilu:{fill:'rgba(190,24,93,.86)',line:'#be185d'}};
  const calorieDatasets=names.flatMap(name=>[
    {label:name,stack:name,data:labels.map(d=>{const pct=percentage(name,d);return pct==null?null:Math.min(pct,100)}),backgroundColor:PERSON_COLORS[name].fill,borderColor:PERSON_COLORS[name].line,borderWidth:1,borderRadius:6},
    {label:`Exceso ${name}`,stack:name,data:labels.map(d=>{const pct=percentage(name,d);return pct==null?null:Math.max(pct-100,0)}),backgroundColor:overageColors[name].fill,borderColor:overageColors[name].line,borderWidth:1,borderRadius:6}
  ]);
  calorieDatasets.push({type:'line',label:'Objetivo diario',data:labels.map(()=>100),borderColor:'#f59e0b',backgroundColor:'#f59e0b',borderDash:[6,5],borderWidth:2,pointRadius:0,tension:0});
  if(calorieChart)calorieChart.destroy();
  calorieChart=new Chart($('calorieChart'),{type:'bar',data:{labels:labels.map(fmtDate),datasets:calorieDatasets},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${Math.round(ctx.raw)}%`}}},scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true,title:{display:true,text:'% del objetivo'},ticks:{callback:value=>`${value}%`}}}}});
}
function showStatus(msg,error=false){const el=$('statusBar');el.textContent=msg;el.classList.remove('hidden');el.classList.toggle('error',error)}
function hideStatus(){$('statusBar').classList.add('hidden')}
function renderSelectedDate(){const isToday=selectedDate===localToday();$('todayLabel').textContent=isToday?new Intl.DateTimeFormat('es-AR',{dateStyle:'full',timeZone:'America/Santo_Domingo'}).format(new Date()):fmtDate(selectedDate);$('intakesEyebrow').textContent=isToday?'Hoy':fmtDate(selectedDate);$('todayBtn').disabled=isToday}
async function loadAll(){showStatus('Actualizando datos desde Google Sheets…');try{const [generalRows,evoRows,intakeRows]=await Promise.all([fetchSheetCSV(SHEETS.general),fetchSheetCSV(SHEETS.evolution),fetchSheetCSV(SHEETS.intakes)]),goals=goalsFromGeneral(generalRows),evolution=rowsToObjects(evoRows),intakes=rowsToObjects(intakeRows),day=dayData(evolution,intakes,selectedDate),isToday=selectedDate===localToday();$('peopleGrid').innerHTML=PEOPLE.map(n=>personCard(n,day.people[n],goals[n],isToday)).join('');setupPeopleCarousel();renderIntakes(intakes,selectedDate,isToday);renderCharts(evolution,intakes,goals);hideStatus()}catch(e){console.error(e);showStatus(`No pude leer la planilla: ${e.message}. Revisá que el enlace permita lectura.`,true)}}
function changeDate(days){selectedDate=shiftDate(selectedDate,days);renderSelectedDate();loadAll()}
window.addEventListener('DOMContentLoaded',()=>{renderSelectedDate();$('refreshBtn').addEventListener('click',loadAll);$('previousDayBtn').addEventListener('click',()=>changeDate(-1));$('nextDayBtn').addEventListener('click',()=>changeDate(1));$('todayBtn').addEventListener('click',()=>{selectedDate=localToday();renderSelectedDate();loadAll()});loadAll()});

(function(){
  const KEY='bs.batteries.statFields';
  const FIELDS=['Carga actual','Baterías conectadas','Potencia actual','Autonomía','Tiempo restante de carga','Horas de carga hoy','Horas de descarga hoy','Energía cargada hoy','Energía descargada hoy','Balance energético hoy','Corriente promedio hoy','Carga máxima hoy','Descarga máxima hoy'];
  const DEFAULT=['Carga actual','Baterías conectadas','Potencia actual','Autonomía','Horas de carga hoy','Horas de descarga hoy','Energía cargada hoy','Energía descargada hoy'];
  const LEGACY={'Autonomía restante':'Autonomía','Tiempo descargando por día':'Horas de descarga hoy','Tiempo cargando por día':'Horas de carga hoy','Carga máxima':'Carga máxima hoy','Consumo máximo':'Descarga máxima hoy','Balance diario neto':'Balance energético hoy'};
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const n=v=>Number.isFinite(Number(v))?Number(v):null;
  const selected=()=>{try{const raw=JSON.parse(localStorage.getItem(KEY)||'null');if(!Array.isArray(raw)||!raw.length)return DEFAULT.slice();const out=[];for(const item of raw){const id=LEGACY[item]||item;if(FIELDS.includes(id)&&!out.includes(id))out.push(id)}return out.length?out:DEFAULT.slice()}catch{return DEFAULT.slice()}};
  const save=list=>{try{localStorage.setItem(KEY,JSON.stringify(list))}catch{}}
  const fmtHours=h=>h===null||!Number.isFinite(h)||h<0?'—':h>=100?'99+ h':h>=10?`${h.toFixed(1)} h`:`${h.toFixed(2)} h`;
  const fmtEnergy=wh=>!Number.isFinite(wh)?'—':Math.abs(wh)>=1000?`${(wh/1000).toFixed(2)} kWh`:`${Math.round(wh)} Wh`;
  const row=(name,value,detail)=>`<div class="battery-item"><div class="battery-item-top"><span class="battery-name">${esc(name)}</span><span class="battery-soc">${esc(value)}</span></div><div class="battery-item-sub"><span>${esc(detail)}</span></div></div>`;

  function snapshot(){try{return window.BoatStationBatteryState?.exportRemoteState?.()||null}catch{return null}}
  function daily(history){
    const now=Date.now(),start=new Date();start.setHours(0,0,0,0);const dayStart=start.getTime(),samples=(Array.isArray(history)?history:[]).filter(p=>Number(p?.time)>=dayStart-300000&&Number(p?.time)<=now).sort((a,b)=>Number(a.time)-Number(b.time));
    let chargeMs=0,dischargeMs=0,chargeWh=0,dischargeWh=0,currentWeighted=0,currentMs=0,maxChargeW=0,maxDischargeW=0;
    for(let i=0;i<samples.length;i++){
      const p=samples[i],t=Math.max(dayStart,Number(p.time)||0),next=i+1<samples.length?Math.min(now,Number(samples[i+1].time)||now):now;if(next<=t)continue;const dt=Math.min(next-t,300000),current=n(p.current),voltage=n(p.voltage);if(current===null)continue;currentWeighted+=current*dt;currentMs+=dt;if(voltage===null)continue;const power=current*voltage;if(power>0){chargeMs+=dt;chargeWh+=power*dt/3600000;maxChargeW=Math.max(maxChargeW,power)}else if(power<0){dischargeMs+=dt;dischargeWh+=Math.abs(power)*dt/3600000;maxDischargeW=Math.max(maxDischargeW,Math.abs(power))}
    }
    return{chargeHours:chargeMs/3600000,dischargeHours:dischargeMs/3600000,chargeWh,dischargeWh,balanceWh:chargeWh-dischargeWh,avgCurrent:currentMs?currentWeighted/currentMs:null,maxChargeW,maxDischargeW};
  }
  function fieldRows(){
    const snap=snapshot();if(!snap)return '<div class="battery-mini-empty">Sin datos estadísticos.</div>';const s=snap.statsSummary||{},d=daily(snap.history),current=n(s.current),cap=n(s.cap),rem=n(s.rem),soc=n(s.soc),power=n(s.power),connected=Number(s.connected)||0,total=Number(s.total)||0;
    const autonomy=current!==null&&current<-.05&&rem!==null?rem/Math.abs(current):null,chargeTime=current!==null&&current>.05&&cap!==null&&rem!==null?Math.max(0,cap-rem)/current:null;
    const defs={
      'Carga actual':()=>row('Carga actual',soc===null?'—':`${Math.round(soc)}%`,cap===null||rem===null?'Sin datos de capacidad':`${Math.round(rem)} / ${Math.round(cap)} Ah`),
      'Baterías conectadas':()=>row('Baterías conectadas',`${connected} de ${total}`,'Datos recibidos por Bluetooth'),
      'Potencia actual':()=>row('Potencia actual',power===null?'—':`${Math.round(power)} W`,current===null?'Sin datos de corriente':current>.05?'Cargando':current<-.05?'Descargando':'En reposo'),
      'Autonomía':()=>row('Autonomía',fmtHours(autonomy),autonomy===null?'Disponible mientras descarga':'Al consumo instantáneo actual'),
      'Tiempo restante de carga':()=>row('Tiempo restante de carga',fmtHours(chargeTime),chargeTime===null?'Disponible mientras carga':'Hasta 100% al ritmo actual'),
      'Horas de carga hoy':()=>row('Horas de carga hoy',fmtHours(d.chargeHours),'Acumulado desde las 00:00'),
      'Horas de descarga hoy':()=>row('Horas de descarga hoy',fmtHours(d.dischargeHours),'Acumulado desde las 00:00'),
      'Energía cargada hoy':()=>row('Energía cargada hoy',fmtEnergy(d.chargeWh),'Energía integrada desde las 00:00'),
      'Energía descargada hoy':()=>row('Energía descargada hoy',fmtEnergy(d.dischargeWh),'Energía integrada desde las 00:00'),
      'Balance energético hoy':()=>row('Balance energético hoy',`${d.balanceWh>=0?'+':''}${fmtEnergy(d.balanceWh)}`,'Carga menos descarga'),
      'Corriente promedio hoy':()=>row('Corriente promedio hoy',d.avgCurrent===null?'—':`${d.avgCurrent>=0?'+':''}${d.avgCurrent.toFixed(1)} A`,'Promedio ponderado por tiempo'),
      'Carga máxima hoy':()=>row('Carga máxima hoy',`${Math.round(d.maxChargeW)} W`,'Máxima potencia de carga registrada'),
      'Descarga máxima hoy':()=>row('Descarga máxima hoy',`${Math.round(d.maxDischargeW)} W`,'Máxima potencia de descarga registrada')
    };
    return selected().map(id=>defs[id]?.()||'').join('')||'<div class="battery-mini-empty">Sin campos seleccionados.</div>';
  }
  function renderStats(){const host=document.querySelector('.card[data-id="batteries"] .page[data-page="2"] .battery-stats-list');if(!host)return;const html=fieldRows();if(host.dataset.statHtml===html)return;host.dataset.statHtml=html;host.innerHTML=html}

  function injectMenu(){const inner=[...document.querySelectorAll('.sheet-inner.compact-sheet')].find(x=>x.querySelector('h3')?.textContent?.trim()==='Baterías');if(!inner||inner.querySelector('[data-battery-stat-fields]'))return;const manage=inner.querySelector('[data-battery-manage-open]'),remove=inner.querySelector('[data-module-delete]'),btn=document.createElement('button');btn.className='option sheet-option';btn.type='button';btn.dataset.batteryStatFields='1';btn.textContent='Campos de estadística';if(manage)manage.insertAdjacentElement('afterend',btn);else if(remove)remove.insertAdjacentElement('beforebegin',btn);else inner.appendChild(btn)}
  function closeSheet(sheet){sheet.classList.remove('open');setTimeout(()=>sheet.remove(),0)}
  function selectorRows(){const order=selected(),ids=[...order,...FIELDS.filter(id=>!order.includes(id))];return ids.map(id=>{const on=order.includes(id),pos=order.indexOf(id);return `<div class="add-module-row" data-stat-row="${esc(id)}"><span>${esc(id)}</span><span style="display:flex;gap:6px;align-items:center"><button type="button" class="fullscreen-back" data-stat-up="${esc(id)}" ${!on||pos===0?'disabled':''}>↑</button><button type="button" class="fullscreen-back" data-stat-down="${esc(id)}" ${!on||pos===order.length-1?'disabled':''}>↓</button><button type="button" class="add-module-state ${on?'present':''}" data-stat-toggle="${esc(id)}">${on?'✓':'+'}</button></span></div>`}).join('')}
  function openSelector(){const sheet=document.createElement('div');sheet.className='sheet fullscreen-sheet open battery-stat-fields-sheet';const draw=()=>{sheet.innerHTML=`<div class="sheet-inner fullscreen-inner"><div class="fullscreen-head"><button class="fullscreen-back" type="button" data-stat-back>‹</button><h3>Campos de estadística</h3></div><div class="full-section"><div class="full-section-title">Elegir y ordenar campos visibles</div>${selectorRows()}</div></div>`};draw();document.body.appendChild(sheet);sheet.addEventListener('click',e=>{if(e.target.closest('[data-stat-back]')){closeSheet(sheet);return}const toggle=e.target.closest('[data-stat-toggle]'),up=e.target.closest('[data-stat-up]'),down=e.target.closest('[data-stat-down]');const btn=toggle||up||down;if(!btn)return;const id=btn.dataset.statToggle||btn.dataset.statUp||btn.dataset.statDown,list=selected(),i=list.indexOf(id);if(toggle){if(i>=0){if(list.length>1)list.splice(i,1)}else list.push(id)}else if(up&&i>0){[list[i-1],list[i]]=[list[i],list[i-1]]}else if(down&&i>=0&&i<list.length-1){[list[i],list[i+1]]=[list[i+1],list[i]]}save(list);draw();renderStats();window.dispatchEvent(new CustomEvent('boatstation-battery-stat-fields-changed',{detail:{fields:list}}))})}

  let queued=false;const queueRender=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;renderStats();injectMenu()})};
  document.addEventListener('click',e=>{if(e.target.closest('.card[data-id="batteries"] .more'))setTimeout(injectMenu,0);if(e.target.closest('[data-battery-stat-fields]')){e.preventDefault();e.stopPropagation();openSelector()}},true);
  window.addEventListener('boatstation-battery-stat-fields-changed',queueRender);
  new MutationObserver(()=>{queueRender();injectMenu()}).observe(document.documentElement,{subtree:true,childList:true});
  setInterval(()=>{renderStats();injectMenu()},2000);
  queueRender();
})();

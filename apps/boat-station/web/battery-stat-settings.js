(function(){
  const KEY='bs.batteries.statFields';
  const FIELDS=[
    ['Consumo diario promedio','Consumo diario promedio'],
    ['Consumo promedio','Consumo promedio'],
    ['Autonomía máxima','Autonomía máxima'],
    ['Autonomía restante','Autonomía restante'],
    ['Tiempo restante de carga','Tiempo restante de carga'],
    ['Tiempo descargando por día','Tiempo descargando por día'],
    ['Tiempo cargando por día','Tiempo cargando por día'],
    ['Consumo máximo','Consumo máximo'],
    ['Carga máxima','Carga máxima'],
    ['Balance diario neto','Balance diario neto']
  ];
  function selected(){try{const v=JSON.parse(localStorage.getItem(KEY)||'null');return Array.isArray(v)?v:FIELDS.map(x=>x[0])}catch{return FIELDS.map(x=>x[0])}}
  function save(list){try{localStorage.setItem(KEY,JSON.stringify(list))}catch(_){}apply()}
  function apply(){
    const keep=new Set(selected());
    document.querySelectorAll('.card[data-id="batteries"] .battery-stats-list .battery-item').forEach(row=>{
      const label=row.querySelector('.battery-name')?.textContent?.trim();
      if(label)row.style.display=keep.has(label)?'':'none';
    });
  }
  function closeSheet(sheet){sheet.classList.remove('open');setTimeout(()=>sheet.remove(),0)}
  function openSelector(){
    const current=new Set(selected()),sheet=document.createElement('div');sheet.className='sheet fullscreen-sheet open battery-stat-fields-sheet';
    sheet.innerHTML=`<div class="sheet-inner fullscreen-inner"><div class="fullscreen-head"><button class="fullscreen-back" type="button" data-stat-back>‹</button><h3>Campos de estadística</h3></div><div class="full-section"><div class="full-section-title">Elegir campos visibles</div>${FIELDS.map(([id,label])=>`<button class="add-module-row" type="button" data-stat-field="${id}"><span>${label}</span><span class="add-module-state ${current.has(id)?'present':''}">${current.has(id)?'✓':'+'}</span></button>`).join('')}</div></div>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click',e=>{
      if(e.target.closest('[data-stat-back]')){closeSheet(sheet);return}
      const btn=e.target.closest('[data-stat-field]');if(!btn)return;const id=btn.dataset.statField,list=new Set(selected());if(list.has(id)){if(list.size>1)list.delete(id)}else list.add(id);save([...list]);const on=list.has(id),state=btn.querySelector('.add-module-state');state.classList.toggle('present',on);state.textContent=on?'✓':'+';
    });
  }
  function injectMenu(){
    document.querySelectorAll('.sheet.open .compact-sheet').forEach(inner=>{
      if(inner.querySelector('h3')?.textContent?.trim()!=='Baterías'||inner.querySelector('[data-battery-stat-fields]'))return;
      const manage=inner.querySelector('[data-battery-manage-open]'),btn=document.createElement('button');btn.className='option sheet-option';btn.type='button';btn.dataset.batteryStatFields='1';btn.textContent='Elegir campos de estadística';
      if(manage)manage.insertAdjacentElement('afterend',btn);else inner.querySelector('[data-module-delete]')?.insertAdjacentElement('beforebegin',btn);
    })
  }
  document.addEventListener('click',e=>{if(e.target.closest('[data-battery-stat-fields]')){e.preventDefault();e.stopPropagation();openSelector()}},true);
  const observer=new MutationObserver(()=>{injectMenu();apply()});observer.observe(document.documentElement,{childList:true,subtree:true});
  injectMenu();apply();
})();
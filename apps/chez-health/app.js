const STORAGE_KEY = 'chez-health-weekly-checks-v2';

const FOOD_SECTIONS = [
  { id: 'produce', title: 'Frutas y vegetales' },
  { id: 'everyday', title: 'Alimentos para sumar durante la semana' },
  { id: 'proteins', title: 'Fuentes de proteína' },
  { id: 'extras', title: 'Aceite y condimentos' }
];

const FOOD_GROUPS = [
  {
    id: 'vegetables-green',
    section: 'produce',
    icon: '🥦',
    title: 'Vegetales verdes',
    examples: 'Apio, espinaca, brócoli, kale, lechuga, rúcula',
    target: 7,
    frequency: '1 consumo por día'
  },
  {
    id: 'vegetables-color',
    section: 'produce',
    icon: '🥕',
    title: 'Vegetales de colores',
    examples: 'Tomate, pimientos, berenjena, zanahoria, remolacha, palta',
    target: 7,
    frequency: '1 consumo por día'
  },
  {
    id: 'vegetables-carb',
    section: 'produce',
    icon: '🍠',
    title: 'Vegetales con carbohidratos',
    examples: 'Papa, batata, zapallo, yuca',
    target: 7,
    frequency: '1 consumo por día'
  },
  {
    id: 'fruits',
    section: 'produce',
    icon: '🍊',
    title: 'Frutas variadas',
    examples: 'Cítricos, papaya, uva, frutos rojos, ananá, manzana',
    target: 7,
    frequency: '1 consumo por día'
  },
  {
    id: 'whole-grains',
    section: 'everyday',
    icon: '🌾',
    title: 'Cereales integrales',
    examples: 'Avena, arroz integral, maíz, quinoa, cuscús integral, pan integral',
    target: 7,
    frequency: '1 consumo por día'
  },
  {
    id: 'legumes',
    section: 'everyday',
    icon: '🫘',
    title: 'Legumbres',
    examples: 'Porotos, frijoles, lentejas, garbanzos, arvejas',
    target: 3,
    frequency: '3 consumos por semana'
  },
  {
    id: 'nuts-seeds',
    section: 'everyday',
    icon: '🥜',
    title: 'Frutos secos',
    examples: 'Nueces, almendras, castañas, avellanas',
    target: 7,
    frequency: '1 consumo por día'
  },
  {
    id: 'seeds',
    section: 'everyday',
    icon: '🌱',
    title: 'Semillas',
    examples: 'Chía, linaza, sésamo, semillas de calabaza',
    target: 7,
    frequency: '1 consumo por día'
  },
  {
    id: 'calcium',
    section: 'everyday',
    icon: '🥛',
    title: 'Lácteos',
    examples: 'Yogur, quesos, leche (vaca, almendra o avena)',
    target: 7,
    frequency: '1 consumo por día'
  },
  {
    id: 'fish',
    section: 'proteins',
    icon: '🐟',
    title: 'Pescado',
    examples: 'Sardina, salmón, trucha, atún u otros pescados',
    target: 2,
    frequency: '2 consumos por semana'
  },
  {
    id: 'poultry',
    section: 'proteins',
    icon: '🍗',
    title: 'Pollo o pavo',
    examples: 'Preferiblemente sin piel y poco procesados',
    target: 2,
    frequency: '2 consumos por semana'
  },
  {
    id: 'beef',
    section: 'proteins',
    icon: '🥩',
    title: 'Carne vacuna magra',
    examples: 'Cortes magros, en porciones moderadas',
    target: 1,
    frequency: '1 consumo por semana'
  },
  {
    id: 'pork',
    section: 'proteins',
    icon: '🍖',
    title: 'Cerdo magro',
    examples: 'Lomo o cortes magros, poco procesados',
    target: 1,
    frequency: '1 consumo por semana'
  },
  {
    id: 'eggs',
    section: 'proteins',
    icon: '🥚',
    title: 'Huevos',
    examples: 'Como opción de proteína junto con otros alimentos',
    target: 3,
    frequency: '3 consumos por semana'
  },
  {
    id: 'olive-oil',
    section: 'extras',
    icon: '🫒',
    title: 'Aceite de oliva',
    examples: 'Para cocinar o condimentar',
    target: 7,
    frequency: '1 consumo por día'
  },
  {
    id: 'turmeric',
    section: 'extras',
    icon: '🟠',
    title: 'Cúrcuma',
    examples: 'Fresca o en polvo',
    target: 2,
    frequency: '2 consumos por semana'
  },
  {
    id: 'ginger',
    section: 'extras',
    icon: '🫚',
    title: 'Jengibre',
    examples: 'Fresco o en polvo',
    target: 2,
    frequency: '2 consumos por semana'
  },
  {
    id: 'lemon',
    section: 'extras',
    icon: '🍋',
    title: 'Limón',
    examples: 'En comidas o bebidas',
    target: 2,
    frequency: '2 consumos por semana'
  },
  {
    id: 'cinnamon',
    section: 'extras',
    icon: '🤎',
    title: 'Canela',
    examples: 'En preparaciones dulces o saladas',
    target: 2,
    frequency: '2 consumos por semana'
  }
];

const FOOD_CHOICES = {
  'vegetables-green':['Apio','Espinaca','Brócoli','Kale','Lechuga','Rúcula'],
  'vegetables-color':['Tomate','Pimientos','Berenjena','Zanahoria','Remolacha','Palta'],
  'vegetables-carb':['Papa','Batata','Zapallo','Yuca'],
  'fruits':['Cítricos','Papaya','Uva','Frutos rojos','Ananá','Manzana'],
  'whole-grains':['Avena','Arroz integral','Maíz','Quinoa','Cuscús integral','Pan integral'],
  'legumes':['Porotos','Frijoles','Lentejas','Garbanzos','Arvejas'],
  'nuts-seeds':['Nueces','Almendras','Castañas','Avellanas'],
  'seeds':['Chía','Linaza','Sésamo','Semillas de calabaza'],
  'calcium':['Yogur','Quesos','Leche de vaca','Bebida de almendra','Bebida de avena'],
  'fish':['Sardina','Salmón','Trucha','Atún','Otros pescados'],
  'poultry':['Pollo','Pavo'],
  'beef':['Carne vacuna magra'],
  'pork':['Cerdo magro'],
  'eggs':['Huevos'],
  'olive-oil':['Aceite de oliva'],
  'turmeric':['Cúrcuma'],
  'ginger':['Jengibre'],
  'lemon':['Limón'],
  'cinnamon':['Canela']
};
const MAX_MARK = 35 * 10100;
let customFoods = [];
let hiddenFoods = [];
let settingsCategory = null;
let settingsFood = null;
let foodNames = [];
let groupRecords = [];
let categoryGroups = [];
let assignments = [];
let orphanCategories = [];
let settingsGroup = null;
function activeCategories() { return FOOD_GROUPS.filter(f => !f.deleted); }
function choicesFor(categoryId) {
  const out = [];
  FOOD_GROUPS.forEach(source => {
    const options = (FOOD_CHOICES[source.id] || []).map((name,i) => ({name,slot:i+1})).concat(customFoods.filter(x => x.food === source.id).map(x => ({name:x.name,slot:x.slot})));
    options.forEach(choice => {
      if (hiddenSlot(source.id,choice.slot)) return;
      const assignment = assignments.find(a => a.food === source.id && a.slot === choice.slot);
      const dest = assignment ? assignment.category : (source.deleted ? (orphanCategories.includes(source.id) ? null : '__ignored') : source.id);
      if ((dest || '__orphan') !== categoryId) return;
      const renamed = foodNames.find(n => n.food === source.id && n.slot === choice.slot);
      out.push({food:source.id,slot:choice.slot,name:renamed ? renamed.name : choice.name});
    });
  });
  return out;
}
function categoryCount(id) {
  return choicesFor(id).reduce((sum,c) => sum + (savedState.checked[c.food] || []).filter(m => Math.floor(m/35) === c.slot).length,0);
}
function escapeHtml(v) { return String(v).replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function hiddenSlot(id, slot) { return hiddenFoods.some(function (h) { return h.food === id && h.slot === slot; }); }
async function changeCatalog(data) {
  try {
    const response = await fetch('./api/marks', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data), cache:'no-store'});
    if (!response.ok) { const message = await response.text(); throw new Error(message || 'No se pudo guardar'); }
    await syncShared();
  } catch (error) { alert('No se pudo guardar el cambio. Revisa la conexión e inténtalo de nuevo.'); }
}
const expanded = new Set();
const TARGETS_KEY = 'chez-health-targets-v1';
try { const targets = JSON.parse(localStorage.getItem(TARGETS_KEY) || '{}'); FOOD_GROUPS.forEach(function (food) { if (Number.isInteger(targets[food.id]) && targets[food.id] >= 0 && targets[food.id] <= 35) food.target = targets[food.id]; }); } catch (_) {}
function saveTargets() { try { localStorage.setItem(TARGETS_KEY, JSON.stringify(Object.fromEntries(FOOD_GROUPS.map(f => [f.id, f.target])))); } catch (_) {} }
const $ = function (id) { return document.getElementById(id); };
let savedState = loadState();
let deferredInstallPrompt = null;
let syncBusy = false;

function localDateString(date) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

function currentWeekStart() {
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const daysSinceMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday);
  return localDateString(monday);
}

function loadState() {
  const week = currentWeekStart();
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (stored && stored.week === week && stored.checked && typeof stored.checked === 'object') {
      const checked = {};
      FOOD_GROUPS.forEach(function (food) {
        const marks = Array.isArray(stored.checked[food.id]) ? stored.checked[food.id] : (checked[food.id] || []);
        checked[food.id] = Array.from(new Set(marks.filter(function (mark) {
          return Number.isInteger(mark) && mark >= 35 && mark < MAX_MARK;
        })));
      });
      return { week: week, checked: checked };
    }
  } catch (error) {
    // La lista sigue disponible aunque el almacenamiento local no responda.
  }
  return { week: week, checked: {} };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
    if (!syncBusy) $('storageNote').textContent = 'Guardado en este dispositivo. Sincronizando…';
  } catch (error) {
    $('storageNote').textContent = 'El navegador no permitió guardar las marcas en este dispositivo.';
  }
}

function dateFromLocalString(value) {
  const parts = value.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], 12);
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(date);
}

function weekLabel(week) {
  const start = dateFromLocalString(week);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  if (start.getFullYear() !== end.getFullYear()) {
    return formatShortDate(start) + ' – ' + formatShortDate(end) + ' ' + end.getFullYear();
  }
  if (start.getMonth() === end.getMonth()) {
    const month = new Intl.DateTimeFormat('es', { month: 'short' }).format(end);
    return start.getDate() + '–' + end.getDate() + ' ' + month;
  }
  return formatShortDate(start) + ' – ' + formatShortDate(end);
}

function checkedCount(food) {
  return categoryCount(food.id);
}

let checkAudioContext = null;
function playCheckSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    checkAudioContext = checkAudioContext || new AudioContextClass();
    if (checkAudioContext.state === 'suspended') checkAudioContext.resume().catch(function () {});
    const now = checkAudioContext.currentTime;
    const oscillator = checkAudioContext.createOscillator();
    const gain = checkAudioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(480, now);
    oscillator.frequency.linearRampToValueAtTime(732, now + 0.14);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    oscillator.connect(gain);
    gain.connect(checkAudioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.15);
  } catch (_) { /* El registro funciona aunque el sonido no esté disponible. */ }
}

function renderFoodList() {
  const categories = activeCategories();
  const orphanChoices = choicesFor('__orphan');
  const ungrouped = categories.filter(f => !categoryGroups.find(m => m.food === f.id)?.group_id);
  const sections = groupRecords.filter(g => !g.deleted).map(g => ({...g,foods:categories.filter(f => categoryGroups.find(m => m.food === f.id)?.group_id === g.id)}));
  if (ungrouped.length || orphanChoices.length) sections.push({id:'__ungrouped',title:'Sin agrupar',foods:ungrouped});
  function choiceRows(food, choices, count) {
    return choices.map(choice => {
      const marks = savedState.checked[choice.food] || [], base=choice.slot*35;
      const selected=marks.filter(m => m>=base && m<base+35).sort((a,b)=>a-b);
      const remaining=food.id === '__orphan' ? 0 : Math.max(0,food.target-count);
      const available=[];
      for (let i=0;i<35 && available.length<remaining;i++) if (!selected.includes(base+i)) available.push(base+i);
      const name=escapeHtml(choice.name);
      return '<div class="choice-row"><span class="choice-name">'+name+'</span><div class="food-checks">'+selected.concat(available).map(mark => '<label class="check-slot"><input class="food-checkbox" type="checkbox" data-food-id="'+escapeHtml(choice.food)+'" data-category-id="'+escapeHtml(food.id)+'" data-mark="'+mark+'"'+(marks.includes(mark)?' checked':'')+' aria-label="'+name+', consumo"><span aria-hidden="true">✓</span></label>').join('')+'</div><button type="button" class="properties-btn food-properties" data-food="'+escapeHtml(choice.food)+'" data-slot="'+choice.slot+'" aria-label="Propiedades de '+name+'">⚙</button></div>';
    }).join('');
  }
  function categoryRow(food) {
    const count=categoryCount(food.id), open=expanded.has(food.id), choices=choicesFor(food.id);
    return '<article class="category-card'+(count?' has-checks':'')+'"><div class="category-head"><button type="button" class="category-toggle" data-category="'+escapeHtml(food.id)+'" aria-expanded="'+open+'"><span class="category-name">'+food.icon+' '+escapeHtml(food.title)+'</span></button><button type="button" class="category-toggle category-count" data-category="'+escapeHtml(food.id)+'">'+count+'/'+food.target+'</button><button type="button" class="add-food category-add" data-add-food="'+escapeHtml(food.id)+'">＋ Agregar</button><button type="button" class="properties-btn category-properties" data-properties="'+escapeHtml(food.id)+'" aria-label="Propiedades">⚙</button></div><div class="category-choices"'+(open?'':' hidden')+'>'+choiceRows(food,choices,count)+'</div></article>';
  }
  $('foodList').innerHTML=sections.map(section => '<section class="health-group"><div class="group-head"><h3>'+escapeHtml(section.title)+'</h3>'+(section.id==='__ungrouped'?'':'<button type="button" class="group-add" data-group="'+escapeHtml(section.id)+'">＋ Agregar</button><button type="button" class="properties-btn group-properties" data-group="'+escapeHtml(section.id)+'" aria-label="Propiedades de '+escapeHtml(section.title)+'">⚙</button>')+'</div>'+section.foods.map(categoryRow).join('')+(section.id==='__ungrouped' && orphanChoices.length ? '<article class="category-card"><div class="category-head"><button type="button" class="category-toggle" data-category="__orphan"><span class="category-name">Sin categoría</span></button><span>'+categoryCount('__orphan')+'</span></div><div class="category-choices"'+(expanded.has('__orphan')?'':' hidden')+'>'+choiceRows({id:'__orphan'},orphanChoices,categoryCount('__orphan'))+'</div></article>':'')+'</section>').join('')+'<button type="button" class="add-category add-group">＋ Agregar agrupación</button>';
  const groupOptions = '<option value="">Sin agrupar</option>'+groupRecords.filter(g=>!g.deleted).map(g=>'<option value="'+escapeHtml(g.id)+'">'+escapeHtml(g.title)+'</option>').join('');
  if (settingsGroup) {
    const group=groupRecords.find(g=>g.id===settingsGroup && !g.deleted);
    if (group) $('foodList').insertAdjacentHTML('beforeend','<div class="modal-backdrop"><section class="properties-panel" role="dialog" aria-modal="true"><div class="properties-head"><h3>'+escapeHtml(group.title)+'</h3><button class="close-modal">×</button></div><div class="properties-actions"><button class="rename-group">Cambiar nombre</button><button class="delete-group delete-category">Eliminar agrupación</button></div></section></div>');
  }
  if (settingsCategory) {
    const food=categories.find(f=>f.id===settingsCategory);
    if(food) $('foodList').insertAdjacentHTML('beforeend','<div class="modal-backdrop"><section class="properties-panel" role="dialog" aria-modal="true"><div class="properties-head"><h3>'+escapeHtml(food.title)+'</h3><button class="close-modal">×</button></div><p>Consumos por semana</p><div class="properties-goal"><button class="target-btn" data-delta="-1"'+(food.target<=checkedCount(food)?' disabled':'')+'>−</button><strong>'+food.target+'</strong><button class="target-btn" data-delta="1"'+(food.target>=35?' disabled':'')+'>+</button></div><p>Agrupación</p><select class="move-category">'+groupOptions+'</select><div class="properties-actions"><button class="rename-category">Cambiar nombre</button><button class="delete-category-action delete-category">Eliminar categoría</button></div></section></div>');
    const select=document.querySelector('.move-category'); if(select) select.value=categoryGroups.find(m=>m.food===food.id)?.group_id || '';
  }
  if (settingsFood) {
    const options=categories.map(f=>'<option value="'+escapeHtml(f.id)+'">'+escapeHtml(f.title)+'</option>').join('');
    $('foodList').insertAdjacentHTML('beforeend','<div class="modal-backdrop"><section class="properties-panel" role="dialog" aria-modal="true"><div class="properties-head"><h3>'+escapeHtml(settingsFood.name)+'</h3><button class="close-modal">×</button></div><p>Mover a categoría</p><select class="move-food"><option value="">Elegir categoría</option>'+options+'</select><div class="properties-actions"><button class="rename-food">Cambiar nombre</button><button class="delete-food delete-category">Eliminar alimento</button></div></section></div>');
  }
  document.querySelectorAll('.category-toggle').forEach(b=>b.onclick=()=>{expanded.has(b.dataset.category)?expanded.delete(b.dataset.category):expanded.add(b.dataset.category);render()});
  document.querySelectorAll('.category-properties').forEach(b=>b.onclick=()=>{settingsCategory=b.dataset.properties;render()});
  document.querySelectorAll('.food-properties').forEach(b=>b.onclick=()=>{settingsFood={food:b.dataset.food,slot:Number(b.dataset.slot),name:b.parentNode.querySelector('.choice-name').textContent};render()});
  document.querySelectorAll('.group-properties').forEach(b=>b.onclick=()=>{settingsGroup=b.dataset.group;render()});
  document.querySelectorAll('.close-modal').forEach(b=>b.onclick=()=>{settingsCategory=null;settingsFood=null;settingsGroup=null;render()});
  document.querySelectorAll('.modal-backdrop').forEach(b=>b.onclick=e=>{if(e.target===b){settingsCategory=null;settingsFood=null;settingsGroup=null;render()}});
  document.querySelectorAll('.group-add').forEach(b=>b.onclick=()=>{const title=prompt('Nombre de la nueva categoría:');if(title?.trim())changeCatalog({type:'add-category',group:b.dataset.group,title:title.trim()})});
  document.querySelectorAll('.add-group').forEach(b=>b.onclick=()=>{const title=prompt('Nombre de la nueva agrupación:');if(title?.trim())changeCatalog({type:'add-group',title:title.trim()})});
  document.querySelectorAll('.add-food').forEach(b=>b.onclick=()=>{const name=prompt('Nombre del nuevo alimento:');if(name?.trim())changeCatalog({type:'add-food',food:b.dataset.addFood,name:name.trim()})});
  const bind=(selector,fn)=>document.querySelectorAll(selector).forEach(b=>b.onclick=fn);
  bind('.rename-group',()=>{const g=groupRecords.find(x=>x.id===settingsGroup),title=prompt('Nuevo nombre:',g.title);if(title?.trim()){settingsGroup=null;changeCatalog({type:'rename-group',group:g.id,title:title.trim()})}});
  bind('.delete-group',()=>{const g=groupRecords.find(x=>x.id===settingsGroup);if(confirm('Eliminar '+g.title+'? Sus categorías pasarán a Sin agrupar.')){settingsGroup=null;changeCatalog({type:'delete-group',group:g.id})}});
  bind('.rename-category',()=>{const f=categories.find(x=>x.id===settingsCategory),title=prompt('Nuevo nombre:',f.title);if(title?.trim())changeCatalog({type:'rename-category',food:f.id,title:title.trim()})});
  bind('.delete-category-action',()=>{const f=categories.find(x=>x.id===settingsCategory);if(confirm('Eliminar '+f.title+'? Sus alimentos y marcas pasarán a Sin categoría.')){settingsCategory=null;changeCatalog({type:'delete-category',food:f.id})}});
  bind('.rename-food',()=>{const item=settingsFood,name=prompt('Nuevo nombre:',item.name);if(name?.trim()){settingsFood=null;changeCatalog({type:'rename-food',food:item.food,slot:item.slot,name:name.trim()})}});
  bind('.delete-food',()=>{const item=settingsFood;if(confirm('Eliminar '+item.name+'? También se eliminarán sus marcas.')){settingsFood=null;changeCatalog({type:'remove-food',food:item.food,slot:item.slot})}});
  document.querySelectorAll('.move-category').forEach(b=>b.onchange=()=>changeCatalog({type:'move-category',food:settingsCategory,group:b.value||null}));
  document.querySelectorAll('.move-food').forEach(b=>b.onchange=()=>{if(b.value){const item=settingsFood;settingsFood=null;changeCatalog({type:'move-food',food:item.food,slot:item.slot,category:b.value})}});
  document.querySelectorAll('.target-btn').forEach(b=>b.onclick=()=>{const food=categories.find(f=>f.id===settingsCategory),delta=Number(b.dataset.delta);if(!food || (delta<0 && food.target+delta<checkedCount(food))||food.target+delta>35)return;food.target+=delta;saveTargets();syncQueue.push({type:'target',food:food.id,delta});persistQueue();render();syncShared()});
  document.querySelectorAll('.food-checkbox').forEach(checkbox=>checkbox.onchange=()=>{const id=checkbox.dataset.foodId,mark=Number(checkbox.dataset.mark),category=categories.find(f=>f.id===checkbox.dataset.categoryId),marks=savedState.checked[id]||[];if(checkbox.checked && (!category || categoryCount(category.id)>=category.target)){render();return}if(checkbox.checked)playCheckSound();savedState.checked[id]=checkbox.checked?Array.from(new Set(marks.concat(mark))):marks.filter(x=>x!==mark);saveState();queueMark(savedState.week,id,mark,checkbox.checked);render()});
}

function renderProgress() {
  const total = activeCategories().reduce(function (sum, food) { return sum + food.target; }, 0);
  const count = activeCategories().reduce(function (sum, food) { return sum + checkedCount(food); }, 0);
  const percent = total ? Math.round(count / total * 100) : 0;
  $('progressValue').textContent = count + ' de ' + total + ' consumos';
  $('progressFill').style.width = percent + '%';
  $('progressTrack').setAttribute('aria-valuemax', String(total));
  $('progressTrack').setAttribute('aria-valuenow', String(count));

  if (total > 0 && count === total) {
    $('progressMessage').textContent = 'Completaste todas las frecuencias de referencia de esta semana.';
  } else if (count === 0) {
    $('progressMessage').textContent = 'Marca una casilla cada vez que incluyas el alimento en una comida.';
  } else {
    $('progressMessage').textContent = 'Cada marca cuenta un consumo. Puedes completar las casillas en cualquier orden.';
  }
}

function render() {
  $('weekRange').textContent = weekLabel(savedState.week);
  renderFoodList();
  renderProgress();
}

function refreshWeekIfNeeded() {
  const week = currentWeekStart();
  if (week !== savedState.week) {
    savedState = { week: week, checked: {} };
    saveState();
    render();
  }
}

window.addEventListener('DOMContentLoaded', function () {
  $('openAll').addEventListener('click', function () {
    FOOD_GROUPS.forEach(function (food) { expanded.add(food.id); });
    render();
  });
  $('closeAll').addEventListener('click', function () {
    expanded.clear();
    render();
  });
  $('openPending').addEventListener('click', function () {
    expanded.clear();
    FOOD_GROUPS.forEach(function (food) { if (checkedCount(food) < food.target) expanded.add(food.id); });
    render();
  });
  render();
  startSync();
  window.setInterval(function () { refreshWeekIfNeeded(); syncShared(); }, 15000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refreshWeekIfNeeded();
  });

  const installButton = $('installBtn');
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.hidden = false;
  });
  installButton.addEventListener('click', async function () {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installButton.hidden = true;
  });
  window.addEventListener('appinstalled', function () {
    installButton.hidden = true;
    deferredInstallPrompt = null;
  });
});

const QUEUE_KEY = 'chez-health-sync-queue-v1';
const MIGRATION_KEY = 'chez-health-sync-migrated-v1';
let syncQueue = [];
try { syncQueue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); if (!Array.isArray(syncQueue)) syncQueue = []; } catch (_) { syncQueue = []; }
syncQueue = syncQueue.filter(function (item) {
  return item.type === 'target' || (item.food !== 'vegetables' && Number.isInteger(item.mark) && item.mark >= 35);
});
function persistQueue() { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(syncQueue)); } catch (_) {} }
function queueMark(week, food, mark, checked) {
  syncQueue.push({week:week, food:food, mark:mark, checked:checked});
  persistQueue();
  syncShared();
}
function startSync() {
  try {
    if (!localStorage.getItem(MIGRATION_KEY)) {
      FOOD_GROUPS.forEach(function (food) {
        (savedState.checked[food.id] || []).forEach(function (mark) {
          syncQueue.push({week:savedState.week, food:food.id, mark:mark, checked:true, migrate:true});
        });
      });
      persistQueue();
      localStorage.setItem(MIGRATION_KEY, '1');
    }
  } catch (_) {}
  syncShared();
  window.addEventListener('online', syncShared);
}
async function syncShared() {
  if (syncBusy) return;
  syncBusy = true;
  try {
    $('storageNote').textContent = 'Sincronizando la lista compartida…';
    while (syncQueue.length) {
      const item = syncQueue[0];
      const response = await fetch('./api/marks', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(item), cache:'no-store'});
      if (!response.ok) throw new Error('No se pudo guardar');
      syncQueue.shift(); persistQueue();
    }
    const week = currentWeekStart();
    const response = await fetch('./api/marks?week=' + encodeURIComponent(week), {cache:'no-store'});
    if (!response.ok) throw new Error('No se pudo cargar');
    const result = await response.json();
    if (week !== currentWeekStart() || syncQueue.length) return;
    if (Array.isArray(result.categories)) {
      if (!FOOD_SECTIONS.some(function (s) { return s.id === 'custom'; })) FOOD_SECTIONS.push({id:'custom', title:'Otras categorías'});
      result.categories.forEach(function (category) {
        if (!FOOD_GROUPS.some(function (food) { return food.id === category.id; })) {
          FOOD_GROUPS.push({id:category.id, section:'custom', icon:'🍽️', title:category.title, target:7});
          FOOD_CHOICES[category.id] = [];
        }
      });
    }
    if (Array.isArray(result.groups)) groupRecords=result.groups;
    if (Array.isArray(result.categoryGroups)) categoryGroups=result.categoryGroups;
    if (Array.isArray(result.assignments)) assignments=result.assignments;
    if (Array.isArray(result.orphans)) orphanCategories=result.orphans.map(x=>x.food);
    FOOD_GROUPS.forEach(f=>f.deleted=false);
    if (Array.isArray(result.categorySettings)) {
      result.categorySettings.forEach(function (setting) {
        const index = FOOD_GROUPS.findIndex(function (food) { return food.id === setting.food; });
        if (index < 0) return;
        if (setting.deleted) {
          FOOD_GROUPS[index].deleted = true;
          if (setting.title) FOOD_GROUPS[index].title = setting.title;
          if (settingsCategory === setting.food) settingsCategory = null;
        } else if (setting.title) FOOD_GROUPS[index].title = setting.title;
      });
    }
    if (Array.isArray(result.customFoods)) customFoods = result.customFoods;
    if (Array.isArray(result.foodNames)) foodNames = result.foodNames;
    if (Array.isArray(result.hiddenFoods)) hiddenFoods = result.hiddenFoods;
    if (result.targets && typeof result.targets === 'object') {
      FOOD_GROUPS.forEach(function (food) {
        const value = result.targets[food.id];
        if (Number.isInteger(value) && value >= 0 && value <= 35) food.target = value;
      });
      saveTargets();
    }
    const checked = {};
    (result.marks || []).forEach(function (item) {
      const food = FOOD_GROUPS.find(function (f) { return f.id === item.food; });
      if (food && Number.isInteger(item.mark) && item.mark >= 35 && item.mark < MAX_MARK && item.checked && !hiddenSlot(item.food, Math.floor(item.mark / 35))) {
        (checked[item.food] ||= []).push(item.mark);
      }
    });
    savedState = {week:week, checked:checked};
    saveState();
    render();
    $('storageNote').textContent = 'Lista compartida sincronizada.';
  } catch (_) {
    $('storageNote').textContent = 'Sin conexión: los cambios se guardan en este dispositivo y se enviarán al reconectar.';
  } finally {
    syncBusy = false;
    if (syncQueue.length && navigator.onLine) setTimeout(syncShared, 15000);
  }
}


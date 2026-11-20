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
  return (savedState.checked[food.id] || []).length;
}

function renderFoodList() {
  $('foodList').innerHTML = FOOD_SECTIONS.map(function (section) {
    const rows = FOOD_GROUPS.filter(function (food) { return food.section === section.id; }).map(function (food) {
      const marks = savedState.checked[food.id] || [];
      const count = marks.length;
      const open = expanded.has(food.id);
      const builtin = (FOOD_CHOICES[food.id] || []).map(function (name, idx) { return {name:name, slot:idx + 1}; });
      const extra = customFoods.filter(function (item) { return item.food === food.id; }).map(function (item) { return {name:item.name, slot:item.slot}; });
      const choices = builtin.concat(extra).filter(function (item) { return !hiddenSlot(food.id, item.slot); });
      const list = choices.map(function (choice) {
        const renamed = foodNames.find(function (n) { return n.food === food.id && n.slot === choice.slot; });
        const name = escapeHtml(renamed ? renamed.name : choice.name);
        const base = choice.slot * 35;
        const selected = marks.filter(function (mark) { return mark >= base && mark < base + 35; }).sort(function (a, b) { return a - b; });
        const remaining = Math.max(0, food.target - count);
        const available = [];
        for (let i = 0; i < 35 && available.length < remaining; i++) {
          const mark = base + i;
          if (!selected.includes(mark)) available.push(mark);
        }
        const slots = selected.concat(available);
        const boxes = slots.map(function (mark) {
          const checked = marks.includes(mark);
          const disabled = !checked && count >= food.target;
          return '<label class="check-slot"><input class="food-checkbox" type="checkbox" data-food-id="' + food.id + '" data-mark="' + mark + '"' +
            (checked ? ' checked' : '') + (disabled ? ' disabled' : '') +
            ' aria-label="' + name + ', consumo ' + (mark - base + 1) + '">' +
            '<span aria-hidden="true">✓</span></label>';
        }).join('');
        return '<div class="choice-row"><span class="choice-name">' + name + '</span><div class="food-checks">' + boxes + '</div><button type="button" class="properties-btn food-properties" data-food="' + food.id + '" data-slot="' + choice.slot + '" aria-label="Propiedades de ' + name + '">⚙</button></div>';
      }).join('');
      return '<article class="category-card' + (count ? ' has-checks' : '') + '">' +
        '<div class="category-head"><button type="button" class="category-toggle" data-category="' + food.id + '" aria-expanded="' + open + '" aria-controls="category-' + food.id + '">' +
        '<span class="category-name">' + food.icon + ' ' + escapeHtml(food.title) + '</span></button>' +
        '<button type="button" class="category-toggle category-count" data-category="' + food.id + '" aria-expanded="' + open + '" aria-controls="category-' + food.id + '" aria-label="Ver alimentos de ' + escapeHtml(food.title) + '">' + count + '/' + food.target + '</button>' +
        '<button type="button" class="add-food category-add" data-add-food="' + food.id + '" aria-label="Agregar alimento a ' + escapeHtml(food.title) + '">＋ Agregar</button>' +
        '<button type="button" class="properties-btn" data-properties="' + food.id + '" aria-label="Propiedades de ' + escapeHtml(food.title) + '">⚙</button></div>' +
        '<div class="category-choices" id="category-' + food.id + '"' + (open ? '' : ' hidden') + '>' + list + '</div></article>';
    }).join('');
    return rows;
  }).join('') + '<button type="button" class="add-category">＋ Agregar Categoría</button>';
  if (settingsCategory) {
    const food = FOOD_GROUPS.find(function (f) { return f.id === settingsCategory; });
    if (food) $('foodList').insertAdjacentHTML('beforeend', '<div class="modal-backdrop"><section class="properties-panel" role="dialog" aria-modal="true" aria-label="Propiedades de ' + escapeHtml(food.title) + '"><div class="properties-head"><h3>' + escapeHtml(food.title) + '</h3><button type="button" class="close-properties" aria-label="Cerrar">×</button></div><p>Consumos por semana</p><div class="properties-goal"><button type="button" class="target-btn" data-target-food="' + food.id + '" data-delta="-1" aria-label="Reducir consumos semanales"' + (food.target <= checkedCount(food) ? ' disabled' : '') + '>−</button><strong>' + food.target + '</strong><button type="button" class="target-btn" data-target-food="' + food.id + '" data-delta="1" aria-label="Aumentar consumos semanales"' + (food.target >= 35 ? ' disabled' : '') + '>+</button></div><div class="properties-actions"><button type="button" class="rename-category" data-food="' + food.id + '">Cambiar nombre</button><button type="button" class="delete-category" data-food="' + food.id + '">Eliminar categoría</button></div></section></div>');
  }
  if (settingsFood) {
    $('foodList').insertAdjacentHTML('beforeend', '<div class="modal-backdrop food-modal"><section class="properties-panel" role="dialog" aria-modal="true" aria-label="Propiedades de ' + escapeHtml(settingsFood.name) + '"><div class="properties-head"><h3>' + escapeHtml(settingsFood.name) + '</h3><button type="button" class="close-food-properties" aria-label="Cerrar">×</button></div><div class="properties-actions"><button type="button" class="rename-food">Cambiar nombre</button><button type="button" class="delete-food delete-category">Eliminar alimento</button></div></section></div>');
  }
  document.querySelectorAll('.food-properties').forEach(function (button) { button.addEventListener('click', function () { settingsFood = {food:button.dataset.food,slot:Number(button.dataset.slot),name:button.parentNode.querySelector('.choice-name').textContent}; render(); }); });
  document.querySelectorAll('.close-food-properties').forEach(function (button) { button.addEventListener('click', function () { settingsFood = null; render(); }); });
  document.querySelectorAll('.food-modal').forEach(function (backdrop) { backdrop.addEventListener('click', function (event) { if (event.target === backdrop) { settingsFood = null; render(); } }); });
  document.querySelectorAll('.rename-food').forEach(function (button) { button.addEventListener('click', function () { const item = settingsFood; const name = prompt('Nuevo nombre del alimento:', item.name); if (name && name.trim() && name.trim() !== item.name) { settingsFood = null; changeCatalog({type:'rename-food',food:item.food,slot:item.slot,name:name.trim()}); } }); });
  document.querySelectorAll('.delete-food').forEach(function (button) { button.addEventListener('click', function () { const item = settingsFood; if (confirm('Eliminar ' + item.name + ' de esta categoría? También se eliminarán sus marcas.')) { settingsFood = null; changeCatalog({type:'remove-food',food:item.food,slot:item.slot}); } }); });
  document.querySelectorAll('.rename-category').forEach(function (button) { button.addEventListener('click', function () {
    const food = FOOD_GROUPS.find(function (f) { return f.id === button.dataset.food; });
    if (!food) return;
    const title = prompt('Nuevo nombre de la categoría:', food.title);
    if (title && title.trim() && title.trim() !== food.title) changeCatalog({type:'rename-category',food:food.id,title:title.trim()});
  }); });
  document.querySelectorAll('.delete-category').forEach(function (button) { button.addEventListener('click', function () {
    const food = FOOD_GROUPS.find(function (f) { return f.id === button.dataset.food; });
    if (food && confirm('Eliminar la categoría ' + food.title + '? Se eliminarán también sus alimentos y sus marcas.')) {
      settingsCategory = null; changeCatalog({type:'delete-category',food:food.id});
    }
  }); });
  document.querySelectorAll('.properties-btn').forEach(function (button) { button.addEventListener('click', function () { settingsCategory = button.dataset.properties; render(); }); });
  document.querySelectorAll('.close-properties').forEach(function (button) { button.addEventListener('click', function () { settingsCategory = null; render(); }); });
  document.querySelectorAll('.modal-backdrop').forEach(function (backdrop) { backdrop.addEventListener('click', function (event) { if (event.target === backdrop) { settingsCategory = null; render(); } }); });
  document.querySelectorAll('.add-food').forEach(function (button) { button.addEventListener('click', function () { const name = prompt('Nombre del nuevo alimento:'); if (name && name.trim()) changeCatalog({type:'add-food', food:button.dataset.addFood, name:name.trim()}); }); });
  document.querySelectorAll('.add-category').forEach(function (button) { button.addEventListener('click', function () { const title = prompt('Nombre de la nueva categoría:'); if (title && title.trim()) changeCatalog({type:'add-category',title:title.trim()}); }); });
  document.querySelectorAll('.category-toggle').forEach(function (button) {
    button.addEventListener('click', function () {
      if (expanded.has(button.dataset.category)) expanded.delete(button.dataset.category); else expanded.add(button.dataset.category);
      render();
    });
  });
  document.querySelectorAll('.target-btn').forEach(function (button) {
    button.addEventListener('click', function () {
      const food = FOOD_GROUPS.find(function (item) { return item.id === button.dataset.targetFood; });
      const delta = Number(button.dataset.delta);
      if (!food || food.target + delta < checkedCount(food) || food.target + delta > 35) return;
      food.target += delta; saveTargets(); syncQueue.push({type:'target', food:food.id, delta:delta}); persistQueue(); render(); syncShared();
    });
  });
  document.querySelectorAll('.food-checkbox').forEach(function (checkbox) {
    checkbox.addEventListener('change', function () {
      const id = checkbox.dataset.foodId, mark = Number(checkbox.dataset.mark);
      const food = FOOD_GROUPS.find(function (f) { return f.id === id; });
      const marks = savedState.checked[id] || [];
      if (checkbox.checked && marks.length >= food.target) { render(); return; }
      savedState.checked[id] = checkbox.checked ? Array.from(new Set(marks.concat(mark))) : marks.filter(function (item) { return item !== mark; });
      saveState(); queueMark(savedState.week, id, mark, checkbox.checked); render();
    });
  });
}

function renderProgress() {
  const total = FOOD_GROUPS.reduce(function (sum, food) { return sum + food.target; }, 0);
  const count = FOOD_GROUPS.reduce(function (sum, food) { return sum + checkedCount(food); }, 0);
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
    if (Array.isArray(result.categorySettings)) {
      result.categorySettings.forEach(function (setting) {
        const index = FOOD_GROUPS.findIndex(function (food) { return food.id === setting.food; });
        if (index < 0) return;
        if (setting.deleted) {
          FOOD_GROUPS.splice(index, 1);
          expanded.delete(setting.food);
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

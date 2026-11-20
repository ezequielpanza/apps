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
const MAX_MARK = 35 * 8;
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
      const choices = FOOD_CHOICES[food.id] || [food.title];
      const list = choices.map(function (name, idx) {
        const base = (idx + 1) * 35;
        const slots = Array.from({length:food.target}, function (_, n) { return base + n; });
        const boxes = slots.map(function (mark) {
          const checked = marks.includes(mark);
          const disabled = !checked && count >= food.target;
          return '<label class="check-slot"><input class="food-checkbox" type="checkbox" data-food-id="' + food.id + '" data-mark="' + mark + '"' +
            (checked ? ' checked' : '') + (disabled ? ' disabled' : '') +
            ' aria-label="' + name + ', consumo ' + (mark - base + 1) + '">' +
            '<span aria-hidden="true">✓</span></label>';
        }).join('');
        return '<div class="choice-row"><span class="choice-name">' + name + '</span><div class="food-checks">' + boxes + '</div></div>';
      }).join('');
      return '<article class="category-card' + (count ? ' has-checks' : '') + '">' +
        '<div class="category-head"><button type="button" class="category-toggle" data-category="' + food.id + '" aria-expanded="' + open + '" aria-controls="category-' + food.id + '">' +
        '<span class="category-name">' + food.icon + ' ' + food.title + '</span><span class="category-count">' + count + '/' + food.target + '</span><span aria-hidden="true">' + (open ? '▴' : '▾') + '</span></button>' +
        '<div class="target-control" aria-label="Meta semanal de ' + food.title + '">' +
        '<button type="button" class="target-btn" data-target-food="' + food.id + '" data-delta="-1" aria-label="Reducir consumos semanales de ' + food.title + '"' + (food.target <= count ? ' disabled' : '') + '>−</button>' +
        '<button type="button" class="target-btn" data-target-food="' + food.id + '" data-delta="1" aria-label="Aumentar consumos semanales de ' + food.title + '"' + (food.target >= 35 ? ' disabled' : '') + '>+</button></div></div>' +
        '<div class="category-choices" id="category-' + food.id + '"' + (open ? '' : ' hidden') + '>' + list + '</div></article>';
    }).join('');
    return '<section class="food-section" aria-labelledby="section-' + section.id + '"><h3 id="section-' + section.id + '" class="food-section-title">' + section.title + '</h3><div class="food-list">' + rows + '</div></section>';
  }).join('');
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
      if (food && Number.isInteger(item.mark) && item.mark >= 35 && item.mark < MAX_MARK && item.checked) {
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

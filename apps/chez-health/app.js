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
    frequency: '1 ingesta por día'
  },
  {
    id: 'vegetables-color',
    section: 'produce',
    icon: '🥕',
    title: 'Vegetales de colores',
    examples: 'Tomate, pimientos, berenjena, zanahoria, remolacha',
    target: 7,
    frequency: '1 ingesta por día'
  },
  {
    id: 'vegetables-carb',
    section: 'produce',
    icon: '🍠',
    title: 'Vegetales con carbohidratos',
    examples: 'Papa, batata, zapallo, yuca',
    target: 7,
    frequency: '1 ingesta por día'
  },
  {
    id: 'fruits',
    section: 'produce',
    icon: '🍊',
    title: 'Frutas variadas',
    examples: 'Cítricos, papaya, uva, frutos rojos',
    target: 7,
    frequency: '1 ingesta por día'
  },
  {
    id: 'whole-grains',
    section: 'everyday',
    icon: '🌾',
    title: 'Cereales integrales',
    examples: 'Avena, arroz integral, maíz, quinoa, cuscús integral, pan integral',
    target: 7,
    frequency: '1 ingesta por día'
  },
  {
    id: 'legumes',
    section: 'everyday',
    icon: '🫘',
    title: 'Legumbres',
    examples: 'Habichuelas, frijoles, lentejas, garbanzos, arvejas',
    target: 3,
    frequency: '3 ingestas por semana'
  },
  {
    id: 'nuts-seeds',
    section: 'everyday',
    icon: '🥜',
    title: 'Frutos secos',
    examples: 'Nueces, almendras, castañas, avellanas',
    target: 7,
    frequency: '1 ingesta por día'
  },
  {
    id: 'seeds',
    section: 'everyday',
    icon: '🌱',
    title: 'Semillas',
    examples: 'Chía, linaza, sésamo, semillas de calabaza',
    target: 7,
    frequency: '1 ingesta por día'
  },
  {
    id: 'calcium',
    section: 'everyday',
    icon: '🥛',
    title: 'Fuentes de calcio',
    examples: 'Yogur, leche o bebida de soya fortificada',
    target: 7,
    frequency: '1 ingesta por día'
  },
  {
    id: 'fish',
    section: 'proteins',
    icon: '🐟',
    title: 'Pescado',
    examples: 'Sardina, salmón, trucha, atún u otros pescados',
    target: 2,
    frequency: '2 ingestas por semana'
  },
  {
    id: 'poultry',
    section: 'proteins',
    icon: '🍗',
    title: 'Pollo o pavo',
    examples: 'Preferiblemente sin piel y poco procesados',
    target: 2,
    frequency: '2 ingestas por semana'
  },
  {
    id: 'beef',
    section: 'proteins',
    icon: '🥩',
    title: 'Carne vacuna magra',
    examples: 'Cortes magros, en porciones moderadas',
    target: 1,
    frequency: '1 ingesta por semana'
  },
  {
    id: 'pork',
    section: 'proteins',
    icon: '🍖',
    title: 'Cerdo magro',
    examples: 'Lomo o cortes magros, poco procesados',
    target: 1,
    frequency: '1 ingesta por semana'
  },
  {
    id: 'eggs',
    section: 'proteins',
    icon: '🥚',
    title: 'Huevos',
    examples: 'Como opción de proteína junto con otros alimentos',
    target: 3,
    frequency: '3 ingestas por semana'
  },
  {
    id: 'olive-oil',
    section: 'extras',
    icon: '🫒',
    title: 'Aceite de oliva',
    examples: 'Para cocinar o condimentar',
    target: 7,
    frequency: '1 ingesta por día'
  },
  {
    id: 'turmeric',
    section: 'extras',
    icon: '🟠',
    title: 'Cúrcuma',
    examples: 'Fresca o en polvo',
    target: 2,
    frequency: '2 ingestas por semana'
  },
  {
    id: 'ginger',
    section: 'extras',
    icon: '🫚',
    title: 'Jengibre',
    examples: 'Fresco o en polvo',
    target: 2,
    frequency: '2 ingestas por semana'
  },
  {
    id: 'lemon',
    section: 'extras',
    icon: '🍋',
    title: 'Limón',
    examples: 'En comidas o bebidas',
    target: 2,
    frequency: '2 ingestas por semana'
  },
  {
    id: 'cinnamon',
    section: 'extras',
    icon: '🤎',
    title: 'Canela',
    examples: 'En preparaciones dulces o saladas',
    target: 2,
    frequency: '2 ingestas por semana'
  }
];

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
      if (Array.isArray(stored.checked.vegetables)) {
        checked['vegetables-green'] = stored.checked.vegetables.filter(m => Number.isInteger(m) && m >= 0 && m < 7);
        checked['vegetables-color'] = stored.checked.vegetables.filter(m => Number.isInteger(m) && m >= 7 && m < 35).map(m => m - 7);
      }
      FOOD_GROUPS.forEach(function (food) {
        const marks = Array.isArray(stored.checked[food.id]) ? stored.checked[food.id] : (checked[food.id] || []);
        checked[food.id] = Array.from(new Set(marks.filter(function (mark) {
          return Number.isInteger(mark) && mark >= 0 && mark < 35;
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
  return (savedState.checked[food.id] || []).filter(function (mark) { return mark < food.target; }).length;
}

function renderFoodList() {
  $('foodList').innerHTML = FOOD_SECTIONS.map(function (section) {
    const rows = FOOD_GROUPS.filter(function (food) {
      return food.section === section.id;
    }).map(function (food) {
      const marks = (savedState.checked[food.id] || []).filter(function (mark) { return mark < food.target; });
      const columns = Math.max(1, Math.min(food.target, 7));
      const checkboxes = Array.from({ length: food.target }, function (_, index) {
        const checked = marks.includes(index);
        return '<label class="check-slot">' +
          '<input class="food-checkbox" type="checkbox" data-food-id="' + food.id + '" data-mark="' + index + '"' +
          (checked ? ' checked' : '') +
          ' aria-label="' + food.title + ', ingesta ' + (index + 1) + ' de ' + food.target + '">' +
          '<span aria-hidden="true">✓</span>' +
        '</label>';
      }).join('');

      return '<article class="food-item' + (marks.length ? ' has-checks' : '') + '">' +
        '<div class="food-content">' +
          '<h3 class="food-title"><span aria-hidden="true">' + food.icon + '</span> ' + food.title + '</h3>' +
          '<p class="food-examples">' + food.examples + '</p>' +
          '<div class="target-control" aria-label="Meta semanal de ' + food.title + '">' +
            '<button type="button" class="target-btn" data-target-food="' + food.id + '" data-delta="-1" aria-label="Reducir ingestas semanales de ' + food.title + '"' + (food.target <= 0 ? ' disabled' : '') + '>−</button>' +
            '<span class="food-frequency">' + food.target + (food.target === 1 ? ' ingesta por semana' : ' ingestas por semana') + '</span>' +
            '<button type="button" class="target-btn" data-target-food="' + food.id + '" data-delta="1" aria-label="Aumentar ingestas semanales de ' + food.title + '"' + (food.target >= 35 ? ' disabled' : '') + '>+</button>' +
          '</div>' +
        '</div>' +
        '<div class="food-tracker">' +
          '<span class="food-count">' + marks.length + '/' + food.target + '</span>' +
          '<div class="food-checks" style="--columns:' + columns + '">' + checkboxes + '</div>' +
        '</div>' +
      '</article>';
    }).join('');

    return '<section class="food-section" aria-labelledby="section-' + section.id + '">' +
      '<h3 id="section-' + section.id + '" class="food-section-title">' + section.title + '</h3>' +
      '<div class="food-list">' + rows + '</div>' +
    '</section>';
  }).join('');

  document.querySelectorAll('.target-btn').forEach(function (button) {
    button.addEventListener('click', function () {
      const food = FOOD_GROUPS.find(function (item) { return item.id === button.dataset.targetFood; });
      const delta = Number(button.dataset.delta);
      if (!food || food.target + delta < 0 || food.target + delta > 35) return;
      food.target += delta;
      saveTargets();
      syncQueue.push({type:'target', food:food.id, delta:delta});
      persistQueue();
      render();
      syncShared();
    });
  });
  document.querySelectorAll('.food-checkbox').forEach(function (checkbox) {
    checkbox.addEventListener('change', function () {
      const id = checkbox.dataset.foodId;
      const mark = Number(checkbox.dataset.mark);
      const marks = savedState.checked[id] || [];
      savedState.checked[id] = checkbox.checked
        ? Array.from(new Set(marks.concat(mark)))
        : marks.filter(function (item) { return item !== mark; });
      saveState();
      queueMark(savedState.week, id, mark, checkbox.checked);
      render();
    });
  });
}

function renderProgress() {
  const total = FOOD_GROUPS.reduce(function (sum, food) { return sum + food.target; }, 0);
  const count = FOOD_GROUPS.reduce(function (sum, food) { return sum + checkedCount(food); }, 0);
  const percent = total ? Math.round(count / total * 100) : 0;
  $('progressValue').textContent = count + ' de ' + total + ' ingestas';
  $('progressFill').style.width = percent + '%';
  $('progressTrack').setAttribute('aria-valuemax', String(total));
  $('progressTrack').setAttribute('aria-valuenow', String(count));

  if (total > 0 && count === total) {
    $('progressMessage').textContent = 'Completaste todas las frecuencias de referencia de esta semana.';
  } else if (count === 0) {
    $('progressMessage').textContent = 'Marca una casilla cada vez que incluyas el alimento en una comida.';
  } else {
    $('progressMessage').textContent = 'Cada marca cuenta una ingesta. Puedes completar las casillas en cualquier orden.';
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
syncQueue.forEach(function (item) {
  if (item.food === 'vegetables' && item.type !== 'target' && Number.isInteger(item.mark)) {
    item.food = item.mark < 7 ? 'vegetables-green' : 'vegetables-color';
    if (item.mark >= 7) item.mark -= 7;
  }
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
      if (food && Number.isInteger(item.mark) && item.mark >= 0 && item.mark < 35 && item.checked) {
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

const TIME_ZONE = 'America/Santo_Domingo';
const STORAGE_KEY = 'chez-health-weekly-checks-v1';

const FOOD_GROUPS = [
  { id: 'leafy-greens', icon: '🥬', title: 'Hojas verdes', examples: 'Espinaca, acelga, kale, rúcula' },
  { id: 'red-orange-vegetables', icon: '🥕', title: 'Vegetales rojos o anaranjados', examples: 'Tomate, zanahoria, calabaza, pimientos' },
  { id: 'other-vegetables', icon: '🥦', title: 'Otras verduras', examples: 'Brócoli, coliflor, repollo, berenjena' },
  { id: 'fruits', icon: '🍊', title: 'Frutas variadas', examples: 'Cítricos, papaya, guayaba, frutos rojos' },
  { id: 'legumes', icon: '🫘', title: 'Legumbres', examples: 'Habichuelas, frijoles, lentejas, garbanzos' },
  { id: 'whole-grains', icon: '🌾', title: 'Cereales integrales', examples: 'Avena, arroz integral, maíz, quinoa' },
  { id: 'nuts-seeds', icon: '🥜', title: 'Frutos secos y semillas', examples: 'Nueces, almendras, chía, linaza' },
  { id: 'omega-3', icon: '🐟', title: 'Pescado o alternativa con omega-3', examples: 'Sardinas, salmón, chía, linaza' },
  { id: 'protein-variety', icon: '🍳', title: 'Proteínas variadas', examples: 'Huevos, tofu, aves, pescado' },
  { id: 'calcium', icon: '🥛', title: 'Fuentes de calcio', examples: 'Yogur, leche o bebida de soya fortificada' }
];

const $ = function (id) { return document.getElementById(id); };
let savedState = loadState();
let deferredInstallPrompt = null;

function datePartsInZone(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(function (part) {
    return part.type !== 'literal';
  }).map(function (part) {
    return [part.type, part.value];
  }));
}

function isoFromUtcDate(date) {
  return date.getUTCFullYear() + '-' +
    String(date.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(date.getUTCDate()).padStart(2, '0');
}

function currentWeekStart() {
  const parts = datePartsInZone(new Date());
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return isoFromUtcDate(date);
}

function loadState() {
  const week = currentWeekStart();
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (stored && stored.week === week && Array.isArray(stored.checked)) {
      return { week: week, checked: stored.checked.filter(function (id) {
        return FOOD_GROUPS.some(function (group) { return group.id === id; });
      }) };
    }
  } catch (error) {
    // Keep the app usable even when storage is unavailable or malformed.
  }
  return { week: week, checked: [] };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
    $('storageNote').textContent = 'Tus marcas quedan guardadas en este dispositivo.';
  } catch (error) {
    $('storageNote').textContent = 'El navegador no permitió guardar las marcas en este dispositivo.';
  }
}

function dateFromIso(iso) {
  const parts = iso.split('-').map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
}

function weekLabel(week) {
  const start = dateFromIso(week);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  if (sameMonth) {
    const month = new Intl.DateTimeFormat('es', { month: 'short', timeZone: 'UTC' }).format(end);
    return start.getUTCDate() + '–' + end.getUTCDate() + ' ' + month;
  }
  return formatShortDate(start) + ' – ' + formatShortDate(end);
}

function renderFoodList() {
  $('foodList').innerHTML = FOOD_GROUPS.map(function (group) {
    const checked = savedState.checked.includes(group.id);
    return '<label class="food-item' + (checked ? ' is-checked' : '') + '">' +
      '<input class="food-checkbox" type="checkbox" data-food-id="' + group.id + '"' + (checked ? ' checked' : '') + '>' +
      '<span class="food-checkmark" aria-hidden="true">✓</span>' +
      '<span class="food-content">' +
        '<span class="food-title">' + group.icon + ' ' + group.title + '</span>' +
        '<span class="food-examples">' + group.examples + '</span>' +
      '</span>' +
    '</label>';
  }).join('');

  document.querySelectorAll('.food-checkbox').forEach(function (checkbox) {
    checkbox.addEventListener('change', function () {
      const id = checkbox.dataset.foodId;
      if (checkbox.checked && !savedState.checked.includes(id)) savedState.checked.push(id);
      if (!checkbox.checked) savedState.checked = savedState.checked.filter(function (item) { return item !== id; });
      saveState();
      render();
    });
  });
}

function renderProgress() {
  const count = savedState.checked.length;
  const total = FOOD_GROUPS.length;
  const percent = Math.round(count / total * 100);
  $('progressValue').textContent = count + ' de ' + total;
  $('progressFill').style.width = percent + '%';
  $('progressTrack').setAttribute('aria-valuemax', String(total));
  $('progressTrack').setAttribute('aria-valuenow', String(count));

  if (count === total) {
    $('progressMessage').textContent = '¡Lista completa! Sumaste todos los grupos de esta guía esta semana.';
  } else if (count === 0) {
    $('progressMessage').textContent = 'Marca un grupo cuando lo hayas incluido esta semana.';
  } else {
    $('progressMessage').textContent = 'Vas sumando variedad. Marca otro grupo cuando lo incluyas en tus comidas.';
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
    savedState = { week: week, checked: [] };
    saveState();
    render();
  }
}

window.addEventListener('DOMContentLoaded', function () {
  render();
  window.setInterval(refreshWeekIfNeeded, 30000);
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

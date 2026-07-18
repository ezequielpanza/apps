(() => {
  if (window.WanderPersonalPOIGPX) return;

  const api = window.WanderPersonalPOIs;
  if (!api?.ready) return;

  const WANDER_NS = 'https://wander.travel/gpx/1';
  const MAX_IMPORT_POINTS = 10000;

  function nativePlugin() {
    if (window.Capacitor?.isNativePlatform?.() !== true) return null;
    return window.Capacitor?.Plugins?.WanderLocation || null;
  }

  function escapeXml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
  }

  function isoTime(value) {
    const date = new Date(Number(value));
    return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
  }

  function pointXml(poi) {
    const extensions = [
      `<wander:id>${escapeXml(poi.id || '')}</wander:id>`,
      `<wander:radiusM>${Math.max(5, Number(poi.radiusM) || 35)}</wander:radiusM>`,
      `<wander:overnight>${poi.overnight === true}</wander:overnight>`,
      `<wander:vehicle>${poi.vehicle === true}</wander:vehicle>`,
      `<wander:vehicleState>${escapeXml(poi.vehicleState || '')}</wander:vehicleState>`,
      `<wander:source>${escapeXml(poi.source || 'user')}</wander:source>`,
    ].join('');
    return [
      `  <wpt lat="${Number(poi.lat).toFixed(7)}" lon="${Number(poi.lng).toFixed(7)}">`,
      `    <time>${isoTime(poi.createdAt)}</time>`,
      `    <name>${escapeXml(poi.name || 'Marcador')}</name>`,
      poi.notes ? `    <desc>${escapeXml(poi.notes)}</desc>` : '',
      `    <type>${escapeXml(poi.type || 'personal')}</type>`,
      `    <extensions>${extensions}</extensions>`,
      '  </wpt>',
    ].filter(Boolean).join('\n');
  }

  function serialize(items) {
    const exportedAt = new Date().toISOString();
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<gpx version="1.1" creator="Wander Travel ${escapeXml(window.WanderWebVersion || '')}" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:wander="${WANDER_NS}" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">`,
      '  <metadata>',
      '    <name>Puntos personales de Wander</name>',
      `    <time>${exportedAt}</time>`,
      '  </metadata>',
      ...items.map(pointXml),
      '</gpx>',
      '',
    ].join('\n');
  }

  function directChild(node, localName) {
    return Array.from(node?.children || []).find((child) => child.localName === localName) || null;
  }

  function descendant(node, localName) {
    return Array.from(node?.getElementsByTagName?.('*') || []).find((child) => child.localName === localName) || null;
  }

  function text(node, localName, fallback = '') {
    return String(directChild(node, localName)?.textContent ?? fallback).trim();
  }

  function extensionText(node, localName, fallback = '') {
    const extensions = directChild(node, 'extensions');
    return String(descendant(extensions, localName)?.textContent ?? fallback).trim();
  }

  function booleanValue(value) {
    return ['true', '1', 'yes', 'si', 'sí'].includes(String(value || '').trim().toLowerCase());
  }

  function parse(content) {
    const documentNode = new DOMParser().parseFromString(String(content || ''), 'application/xml');
    if (documentNode.querySelector('parsererror') || documentNode.documentElement?.localName !== 'gpx') {
      throw new Error('El archivo no es un GPX válido.');
    }
    const nodes = Array.from(documentNode.getElementsByTagNameNS('*', 'wpt'));
    if (nodes.length > MAX_IMPORT_POINTS) throw new Error(`El GPX supera el límite de ${MAX_IMPORT_POINTS} puntos.`);

    let invalid = 0;
    const points = [];
    nodes.forEach((node, index) => {
      const lat = Number(node.getAttribute('lat'));
      const lng = Number(node.getAttribute('lon'));
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        invalid += 1;
        return;
      }
      const name = text(node, 'name', `Marcador ${String(index + 1).padStart(2, '0')}`);
      const radiusM = Number(extensionText(node, 'radiusM', '35'));
      points.push({
        id: extensionText(node, 'id', ''),
        name: name || `Marcador ${String(index + 1).padStart(2, '0')}`,
        notes: text(node, 'desc', ''),
        type: text(node, 'type', 'personal') || 'personal',
        radiusM: Number.isFinite(radiusM) ? radiusM : 35,
        overnight: booleanValue(extensionText(node, 'overnight', 'false')),
        vehicle: booleanValue(extensionText(node, 'vehicle', 'false')),
        vehicleState: extensionText(node, 'vehicleState', ''),
        lat,
        lng,
        source: 'gpx-import',
      });
    });
    return { points, invalid };
  }

  function duplicateKey(poi) {
    return `${String(poi?.name || '').trim().toLocaleLowerCase()}|${Number(poi?.lat).toFixed(6)}|${Number(poi?.lng).toFixed(6)}`;
  }

  async function saveContent(content, filename) {
    const plugin = nativePlugin();
    if (typeof plugin?.saveGpx === 'function') return plugin.saveGpx({ content, filename });
    const blob = new Blob([content], { type: 'application/gpx+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return { cancelled: false, name: filename };
  }

  function browserPick() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.gpx,application/gpx+xml,application/xml,text/xml';
      input.hidden = true;
      document.body.appendChild(input);
      input.addEventListener('change', async () => {
        const file = input.files?.[0] || null;
        input.remove();
        if (!file) return resolve({ cancelled: true });
        try { resolve({ cancelled: false, name: file.name, content: await file.text() }); }
        catch (error) { resolve({ cancelled: false, error }); }
      }, { once: true });
      input.addEventListener('cancel', () => { input.remove(); resolve({ cancelled: true }); }, { once: true });
      input.click();
    });
  }

  async function pickContent() {
    const plugin = nativePlugin();
    if (typeof plugin?.pickGpx === 'function') return plugin.pickGpx();
    return browserPick();
  }

  function exportFilename(selected) {
    const day = new Date().toISOString().slice(0, 10);
    return selected ? `wander-puntos-seleccionados-${day}.gpx` : `wander-puntos-${day}.gpx`;
  }

  async function exportPoints(ids = null) {
    const selected = Array.isArray(ids) && ids.length > 0;
    const wanted = selected ? new Set(ids) : null;
    const items = api.list().filter((poi) => !wanted || wanted.has(poi.id));
    if (!items.length) {
      window.WanderUI?.showToast?.('Exportar GPX', 'No hay puntos para exportar');
      return { exported: 0, cancelled: false };
    }
    try {
      const result = await saveContent(serialize(items), exportFilename(selected));
      if (result?.cancelled) return { exported: 0, cancelled: true };
      window.WanderUI?.showToast?.('GPX guardado', `${items.length} ${items.length === 1 ? 'punto exportado' : 'puntos exportados'}`);
      return { exported: items.length, cancelled: false, result };
    } catch (error) {
      window.WanderUI?.showToast?.('No se pudo exportar', error?.message || 'Error al guardar el GPX');
      return { exported: 0, cancelled: false, error };
    }
  }

  async function importPoints() {
    try {
      const picked = await pickContent();
      if (picked?.cancelled) return { imported: 0, duplicates: 0, invalid: 0, cancelled: true };
      if (picked?.error) throw picked.error;
      const parsed = parse(picked?.content || '');
      const known = new Set(api.list().map(duplicateKey));
      const additions = [];
      let duplicates = 0;
      parsed.points.forEach((point) => {
        const key = duplicateKey(point);
        if (known.has(key)) {
          duplicates += 1;
          return;
        }
        known.add(key);
        additions.push(point);
      });

      const ui = window.WanderUI;
      const originalShowWander = ui?.showWander;
      if (ui && originalShowWander) ui.showWander = () => false;
      try {
        additions.forEach((point) => {
          const created = api.createAt({ lat: point.lat, lng: point.lng }, point);
          if (created && point.vehicle && point.vehicleState) {
            api.update(created.id, { vehicleState: point.vehicleState }, { silent: true });
          }
        });
      } finally {
        if (ui && originalShowWander) ui.showWander = originalShowWander;
      }

      window.dispatchEvent(new CustomEvent('wander:personal-poi-imported', {
        detail: { imported: additions.length, duplicates, invalid: parsed.invalid, filename: picked?.name || null },
      }));
      const details = [
        `${additions.length} importados`,
        duplicates ? `${duplicates} duplicados omitidos` : '',
        parsed.invalid ? `${parsed.invalid} inválidos` : '',
      ].filter(Boolean).join(' · ');
      window.WanderUI?.showToast?.('Importación GPX', details || 'No se encontraron puntos');
      return { imported: additions.length, duplicates, invalid: parsed.invalid, cancelled: false };
    } catch (error) {
      window.WanderUI?.showToast?.('GPX inválido', error?.message || 'No se pudo importar el archivo');
      return { imported: 0, duplicates: 0, invalid: 0, cancelled: false, error };
    }
  }

  window.WanderPersonalPOIGPX = Object.freeze({ serialize, parse, exportPoints, importPoints });
})();

(() => {
  if (window.WanderPointsScreen) return;

  const api = window.WanderPersonalPOIs;
  const list = document.querySelector('#points-list');
  const summary = document.querySelector('#points-summary');
  if (!api?.ready || !list || !summary) return;

  const card = list.closest('.screen-card');
  let toolbar = card?.querySelector('.points-toolbar');
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.className = 'points-toolbar';
    toolbar.innerHTML = `
      <button id="points-new" type="button"><svg class="button-icon"><use href="wander-icons.svg#pin"></use></svg><span>Nuevo</span></button>
      <button id="points-select" type="button" aria-pressed="false"><svg class="button-icon"><use href="wander-icons.svg#target"></use></svg><span>Seleccionar</span></button>
      <button id="points-delete" class="danger" type="button" disabled><svg class="button-icon"><use href="wander-icons.svg#clear"></use></svg><span>Borrar</span></button>`;
    card?.insertBefore(toolbar, list);
  }

  let transferToolbar = card?.querySelector('.points-transfer-toolbar');
  if (!transferToolbar) {
    transferToolbar = document.createElement('div');
    transferToolbar.className = 'points-transfer-toolbar';
    transferToolbar.innerHTML = `
      <button id="points-export-gpx" type="button"><svg class="button-icon"><use href="wander-icons.svg#export"></use></svg><span>Exportar GPX</span></button>
      <button id="points-import-gpx" type="button"><svg class="button-icon is-import"><use href="wander-icons.svg#export"></use></svg><span>Importar GPX</span></button>`;
    card?.insertBefore(transferToolbar, list);
  }

  const newButton = toolbar.querySelector('#points-new');
  const selectButton = toolbar.querySelector('#points-select');
  const deleteButton = toolbar.querySelector('#points-delete');
  const exportButton = transferToolbar.querySelector('#points-export-gpx');
  const importButton = transferToolbar.querySelector('#points-import-gpx');
  if (!newButton || !selectButton || !deleteButton || !exportButton || !importButton) return;

  const selectedIds = new Set();
  let selecting = false;
  let transferring = false;

  function updateToolbar() {
    const itemCount = api.list().length;
    selectButton.setAttribute('aria-pressed', String(selecting));
    selectButton.classList.toggle('is-active', selecting);
    selectButton.querySelector('span').textContent = selecting ? 'Cancelar' : 'Seleccionar';
    deleteButton.disabled = !selecting || selectedIds.size === 0;
    deleteButton.querySelector('span').textContent = selectedIds.size ? `Borrar (${selectedIds.size})` : 'Borrar';
    exportButton.disabled = transferring || itemCount === 0 || (selecting && selectedIds.size === 0);
    importButton.disabled = transferring;
    exportButton.querySelector('span').textContent = selecting && selectedIds.size ? `Exportar (${selectedIds.size})` : 'Exportar GPX';
  }

  function setSelecting(value) {
    selecting = Boolean(value);
    if (!selecting) selectedIds.clear();
    updateToolbar();
    render();
  }

  function openProperties(id) {
    if (window.WanderPersonalPOISheet?.showById?.(id)) return;
    window.dispatchEvent(new CustomEvent('wander:personal-poi-properties', { detail: { id } }));
  }

  function render() {
    const items = api.list();
    const validIds = new Set(items.map((poi) => poi.id));
    selectedIds.forEach((id) => {
      if (!validIds.has(id)) selectedIds.delete(id);
    });

    summary.textContent = `${items.length} ${items.length === 1 ? 'punto guardado' : 'puntos guardados'}`;
    list.innerHTML = '';

    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'panel-note';
      empty.textContent = 'Todavía no guardaste puntos personales.';
      list.appendChild(empty);
      selecting = false;
      selectedIds.clear();
      updateToolbar();
      return;
    }

    items.forEach((poi) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'point-row';
      row.dataset.poiId = poi.id;
      row.classList.toggle('is-selecting', selecting);
      row.classList.toggle('is-selected', selectedIds.has(poi.id));
      row.setAttribute('aria-pressed', selecting ? String(selectedIds.has(poi.id)) : 'false');
      row.innerHTML = '<span class="point-row-select" aria-hidden="true"><span></span></span><span class="point-row-icon"><svg class="ui-icon"><use href="wander-icons.svg#pin"></use></svg></span><span class="point-row-copy"><strong></strong><small></small></span><svg class="ui-icon point-row-open"><use href="wander-icons.svg#settings"></use></svg>';
      row.querySelector('strong').textContent = poi.name || 'Marcador';
      row.querySelector('small').textContent = `${Number(poi.lat).toFixed(6)}, ${Number(poi.lng).toFixed(6)}`;
      row.addEventListener('click', () => {
        if (selecting) {
          if (selectedIds.has(poi.id)) selectedIds.delete(poi.id);
          else selectedIds.add(poi.id);
          row.classList.toggle('is-selected', selectedIds.has(poi.id));
          row.setAttribute('aria-pressed', String(selectedIds.has(poi.id)));
          updateToolbar();
          return;
        }
        openProperties(poi.id);
      });
      list.appendChild(row);
    });
    updateToolbar();
  }

  function openNewPoint(attempt = 0) {
    const selector = window.WanderMapSelectedPoint;
    if (selector?.openAtCenter) {
      selector.openAtCenter();
      return;
    }
    window.dispatchEvent(new CustomEvent('wander:open-waypoint-center'));
    if (attempt < 20) setTimeout(() => openNewPoint(attempt + 1), 100);
  }

  newButton.addEventListener('click', () => {
    setSelecting(false);
    window.WanderScreen?.open?.('map');
    setTimeout(() => openNewPoint(), 100);
  });

  selectButton.addEventListener('click', () => setSelecting(!selecting));

  deleteButton.addEventListener('click', () => {
    if (!selectedIds.size) return;
    const count = selectedIds.size;
    if (!window.confirm(`¿Eliminar ${count} ${count === 1 ? 'punto seleccionado' : 'puntos seleccionados'}?`)) return;
    [...selectedIds].forEach((id) => api.remove(id));
    setSelecting(false);
  });

  exportButton.addEventListener('click', async () => {
    const gpx = window.WanderPersonalPOIGPX;
    if (!gpx) return window.WanderUI?.showToast?.('GPX', 'La función todavía no está disponible');
    transferring = true;
    updateToolbar();
    try { await gpx.exportPoints(selecting ? [...selectedIds] : null); }
    finally { transferring = false; updateToolbar(); }
  });

  importButton.addEventListener('click', async () => {
    const gpx = window.WanderPersonalPOIGPX;
    if (!gpx) return window.WanderUI?.showToast?.('GPX', 'La función todavía no está disponible');
    transferring = true;
    setSelecting(false);
    updateToolbar();
    try { await gpx.importPoints(); render(); }
    finally { transferring = false; updateToolbar(); }
  });

  window.addEventListener('wander:personal-poi-created', render);
  window.addEventListener('wander:personal-poi-removed', render);
  window.addEventListener('wander:personal-poi-updated', render);
  window.addEventListener('wander:personal-poi-imported', render);
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-screen-target="points"]')) setTimeout(render, 0);
  });

  render();
  window.WanderPointsScreen = Object.freeze({ render, setSelecting });
  window.dispatchEvent(new CustomEvent('wander:points-screen-ready'));
})();

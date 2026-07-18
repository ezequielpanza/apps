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
    if (typeof plugin?.saveGpx === 'function') {
      return plugin.saveGpx({ content, filename });
    }
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

  window.WanderPersonalPOIGPX = Object.freeze({
    serialize,
    parse,
    exportPoints,
    importPoints,
  });
})();

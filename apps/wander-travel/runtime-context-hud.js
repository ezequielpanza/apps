(() => {
  if (window.WanderContextHUD) return;

  const STORAGE_KEY = 'wander.contextHud.layout.v1';
  const COORDINATE_FORMAT_KEY = 'wander.coordinates.format.v1';
  const INSTALL_INTERVAL_MS = 120;
  const INSTALL_TIMEOUT_MS = 15000;
  const startedAt = Date.now();
  let installed = false;
  let editing = false;
  let currentOrientation = orientationKey();
  let layouts = loadLayouts();
  let editor = null;
  let editButton = null;
  let pointerState = null;

  function orientationKey() {
    return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  }

  function loadLayouts() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return {
        portrait: raw?.portrait && typeof raw.portrait === 'object' ? raw.portrait : {},
        landscape: raw?.landscape && typeof raw.landscape === 'object' ? raw.landscape : {},
      };
    } catch {
      return { portrait: {}, landscape: {} };
    }
  }

  function saveLayouts(reason = 'layout') {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts)); } catch {}
    const detail = { reason, orientation: currentOrientation, layouts: clone(layouts), rows: exportRows() };
    window.dispatchEvent(new CustomEvent('wander:hud-layout-change', { detail }));
    return detail;
  }

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); }
    catch { return value; }
  }

  function api() {
    return window.WanderContextDashboard || null;
  }

  function dashboard() {
    return document.querySelector('#context-dashboard');
  }

  function fields() {
    return Array.isArray(api()?.fields) ? api().fields : [];
  }

  function visibleFields() {
    return api()?.getVisibleFields?.() || fields().slice(0, 3).map((field) => field.id);
  }

  function fieldById(id) {
    return fields().find((field) => field.id === id) || null;
  }

  function viewport() {
    return { width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) };
  }

  function defaultRect(fieldId, orientation = currentOrientation) {
    const allVisible = visibleFields();
    const visibleIndex = Math.max(0, allVisible.indexOf(fieldId));
    const allIndex = Math.max(0, fields().findIndex((field) => field.id === fieldId));
    const index = allVisible.includes(fieldId) ? visibleIndex : allIndex;
    const size = viewport();
    const startX = 64;
    const startY = orientation === 'landscape' ? 8 : 10;
    const gap = orientation === 'landscape' ? 5 : 6;
    const columns = orientation === 'landscape'
      ? Math.max(2, Math.min(4, Math.floor((size.width - startX - 64) / 116)))
      : Math.max(1, Math.min(3, Math.floor((size.width - startX - 12) / 108)));
    const available = Math.max(90, size.width - startX - 12 - gap * Math.max(0, columns - 1));
    const width = Math.max(86, Math.min(148, Math.floor(available / columns)));
    const height = orientation === 'landscape' ? 42 : 48;
    return {
      x: startX + (index % columns) * (width + gap),
      y: startY + Math.floor(index / columns) * (height + gap),
      width,
      height,
    };
  }

  function clampRect(rect) {
    const size = viewport();
    const width = Math.max(72, Math.min(Math.min(340, size.width - 8), Number(rect.width) || 116));
    const height = Math.max(38, Math.min(Math.min(180, size.height - 8), Number(rect.height) || 48));
    const x = Math.max(4, Math.min(size.width - width - 4, Number(rect.x) || 4));
    const y = Math.max(4, Math.min(size.height - height - 4, Number(rect.y) || 4));
    return { x, y, width, height };
  }

  function rectFor(fieldId, orientation = currentOrientation) {
    const layout = layouts[orientation] || (layouts[orientation] = {});
    if (!layout[fieldId]) layout[fieldId] = defaultRect(fieldId, orientation);
    layout[fieldId] = clampRect(layout[fieldId]);
    return layout[fieldId];
  }

  function setRect(fieldId, rect, { persist = false, reason = 'field-layout' } = {}) {
    const layout = layouts[currentOrientation] || (layouts[currentOrientation] = {});
    layout[fieldId] = clampRect({ ...rectFor(fieldId), ...rect });
    applyCardRect(fieldId);
    if (persist) saveLayouts(reason);
    return clone(layout[fieldId]);
  }

  function ensureStyle() {
    if (document.querySelector('link[data-wander-context-hud]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './wander-context-hud.css?v=20260816-01';
    link.dataset.wanderContextHud = 'true';
    document.head.appendChild(link);
  }

  function decorateCard(item) {
    if (!item || item.dataset.hudDecorated === 'true') return;
    const id = item.dataset.dashboardField;
    const field = fieldById(id);
    item.dataset.hudDecorated = 'true';
    item.dataset.hudField = id || '';
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', field?.label || id || 'Campo de contexto');

    if (!item.querySelector('.wander-hud-field-label')) {
      const label = document.createElement('span');
      label.className = 'wander-hud-field-label';
      label.textContent = field?.label || id || 'Contexto';
      const strong = item.querySelector('strong');
      if (strong) item.insertBefore(label, strong);
      else item.appendChild(label);
    }

    if (!item.querySelector('.wander-hud-resize-handle')) {
      const handle = document.createElement('span');
      handle.className = 'wander-hud-resize-handle';
      handle.setAttribute('aria-hidden', 'true');
      item.appendChild(handle);
    }
  }

  function ensureCards() {
    api()?.render?.();
    const root = dashboard();
    if (!root) return;
    root.querySelectorAll('[data-dashboard-field]').forEach(decorateCard);
  }

  function applyCardRect(fieldId) {
    const item = dashboard()?.querySelector(`[data-dashboard-field="${CSS.escape(fieldId)}"]`);
    if (!item) return;
    const rect = rectFor(fieldId);
    item.style.setProperty('--hud-x', `${Math.round(rect.x)}px`);
    item.style.setProperty('--hud-y', `${Math.round(rect.y)}px`);
    item.style.setProperty('--hud-w', `${Math.round(rect.width)}px`);
    item.style.setProperty('--hud-h', `${Math.round(rect.height)}px`);
  }

  function applyLayout() {
    currentOrientation = orientationKey();
    ensureCards();
    visibleFields().forEach((fieldId) => applyCardRect(fieldId));
    syncEditorChecks();
    window.dispatchEvent(new CustomEvent('wander:hud-layout-applied', {
      detail: { orientation: currentOrientation, rows: exportRows() },
    }));
  }

  function cycleCoordinateFormat() {
    const order = ['dd', 'dm', 'dms'];
    let current = 'dd';
    try { current = localStorage.getItem(COORDINATE_FORMAT_KEY) || 'dd'; } catch {}
    const next = order[(Math.max(0, order.indexOf(current)) + 1) % order.length];
    try { localStorage.setItem(COORDINATE_FORMAT_KEY, next); } catch {}
    window.dispatchEvent(new CustomEvent('wander:coordinate-format-change', { detail: { format: next, source: 'hud' } }));
    api()?.render?.();
    return next;
  }

  function openContextField(fieldId) {
    window.WanderContext?.set?.('ui.contextFieldSelection', fieldId, {
      source: 'hud', kind: 'selected', confidence: 1, ttlMs: 30000,
    });
    window.dispatchEvent(new CustomEvent('wander:hud-field-click', { detail: { fieldId } }));
    window.WanderScreen?.open?.('context');
    setTimeout(() => {
      const toggle = document.querySelector(`[data-dashboard-inline-toggle="${CSS.escape(fieldId)}"]`);
      const row = toggle?.closest?.('.context-row');
      row?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }, 60);
  }

  function activateField(fieldId) {
    if (!fieldId || editing) return;
    if (fieldId === 'coordinates') {
      cycleCoordinateFormat();
      return;
    }
    if (fieldId === 'currentPOI') {
      const poi = window.WanderPersonalPOIs?.getCurrent?.();
      if (poi?.id && window.WanderPersonalPOIs?.select?.(poi.id)) return;
    }
    openContextField(fieldId);
  }

  function beginPointer(event, mode) {
    if (!editing || event.button > 0) return;
    const item = event.target.closest?.('[data-dashboard-field]');
    if (!item) return;
    const fieldId = item.dataset.dashboardField;
    const rect = rectFor(fieldId);
    pointerState = {
      pointerId: event.pointerId,
      mode,
      item,
      fieldId,
      startX: event.clientX,
      startY: event.clientY,
      rect: { ...rect },
    };
    item.classList.add('is-hud-dragging');
    try { item.setPointerCapture?.(event.pointerId); } catch {}
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function pointerMove(event) {
    if (!pointerState || event.pointerId !== pointerState.pointerId) return;
    const dx = event.clientX - pointerState.startX;
    const dy = event.clientY - pointerState.startY;
    if (pointerState.mode === 'resize') {
      setRect(pointerState.fieldId, {
        width: pointerState.rect.width + dx,
        height: pointerState.rect.height + dy,
      });
    } else {
      setRect(pointerState.fieldId, {
        x: pointerState.rect.x + dx,
        y: pointerState.rect.y + dy,
      });
    }
    event.preventDefault();
  }

  function endPointer(event) {
    if (!pointerState || (event.pointerId != null && event.pointerId !== pointerState.pointerId)) return;
    const ended = pointerState;
    pointerState = null;
    ended.item?.classList?.remove('is-hud-dragging');
    try { ended.item?.releasePointerCapture?.(ended.pointerId); } catch {}
    saveLayouts(ended.mode === 'resize' ? 'resize' : 'move');
  }

  function createEditor() {
    if (editor?.isConnected) return editor;
    editor = document.createElement('section');
    editor.className = 'wander-hud-editor';
    editor.hidden = true;
    editor.setAttribute('aria-label', 'Editar campos del mapa');
    editor.innerHTML = `
      <div class="wander-hud-editor-head"><strong>Editar campos</strong><button type="button" data-hud-editor-close>Cerrar</button></div>
      <div class="wander-hud-editor-fields"></div>
      <div class="wander-hud-editor-actions"><button type="button" data-hud-reset-layout>Restablecer posiciones</button><button type="button" data-hud-reset-all>Predeterminados</button></div>`;
    document.body.appendChild(editor);

    const list = editor.querySelector('.wander-hud-editor-fields');
    fields().forEach((field) => {
      const label = document.createElement('label');
      label.className = 'wander-hud-editor-field';
      label.innerHTML = `<span>${field.label}</span><input type="checkbox" data-hud-field-toggle="${field.id}">`;
      list.appendChild(label);
    });

    editor.addEventListener('change', (event) => {
      const input = event.target.closest?.('[data-hud-field-toggle]');
      if (!input) return;
      const fieldId = input.dataset.hudFieldToggle;
      api()?.setFieldVisible?.(fieldId, input.checked);
      if (input.checked) rectFor(fieldId);
      requestAnimationFrame(() => {
        ensureCards();
        applyLayout();
        saveLayouts('visibility');
      });
    });
    editor.querySelector('[data-hud-editor-close]')?.addEventListener('click', () => setEditing(false));
    editor.querySelector('[data-hud-reset-layout]')?.addEventListener('click', () => {
      layouts[currentOrientation] = {};
      applyLayout();
      saveLayouts('reset-orientation');
    });
    editor.querySelector('[data-hud-reset-all]')?.addEventListener('click', () => {
      layouts = { portrait: {}, landscape: {} };
      api()?.reset?.();
      applyLayout();
      saveLayouts('reset-all');
    });
    return editor;
  }

  function syncEditorChecks() {
    if (!editor) return;
    const visible = new Set(visibleFields());
    editor.querySelectorAll('[data-hud-field-toggle]').forEach((input) => {
      input.checked = visible.has(input.dataset.hudFieldToggle);
    });
  }

  function installEditButton() {
    if (editButton?.isConnected) return true;
    const wrap = document.querySelector('.wander-standard-map-actions');
    if (!wrap) return false;
    editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'wander-map-action wander-hud-edit-action';
    editButton.setAttribute('aria-label', 'Editar campos del mapa');
    editButton.setAttribute('aria-pressed', 'false');
    editButton.title = 'Editar campos del mapa';
    editButton.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="wander-icons.svg#settings"></use></svg>';
    editButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setEditing(!editing);
    });
    wrap.prepend(editButton);
    return true;
  }

  function setEditing(next) {
    editing = Boolean(next);
    document.body.classList.toggle('wander-hud-editing', editing);
    createEditor().hidden = !editing;
    if (editButton) editButton.setAttribute('aria-pressed', String(editing));
    if (editing) {
      window.WanderMapPosition?.setFollowMode?.(false, { centerNow: false });
      syncEditorChecks();
    }
    window.dispatchEvent(new CustomEvent('wander:hud-edit-mode', { detail: { editing } }));
    return editing;
  }

  function exportRows() {
    const visible = new Set(visibleFields());
    const rows = [];
    for (const orientation of ['portrait', 'landscape']) {
      for (const field of fields()) {
        const rect = rectFor(field.id, orientation);
        rows.push({
          fieldId: field.id,
          enabled: visible.has(field.id),
          orientation,
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          order: fields().findIndex((candidate) => candidate.id === field.id),
          configJson: '{}',
          updatedAt: new Date().toISOString(),
        });
      }
    }
    return rows;
  }

  function install() {
    if (installed) return true;
    const root = dashboard();
    if (!root || !api()?.fields?.length) return false;
    installed = true;
    ensureStyle();
    root.dataset.hudModular = 'true';
    root.removeAttribute('aria-controls');
    root.setAttribute('aria-label', 'Campos de contexto sobre el mapa');
    createEditor();
    ensureCards();
    applyLayout();
    installEditButton();

    root.addEventListener('pointerdown', (event) => {
      if (!editing) return;
      const resize = event.target.closest?.('.wander-hud-resize-handle');
      const item = event.target.closest?.('[data-dashboard-field]');
      if (!item) return;
      beginPointer(event, resize ? 'resize' : 'move');
    }, true);
    root.addEventListener('click', (event) => {
      const item = event.target.closest?.('[data-dashboard-field]');
      if (!item) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      activateField(item.dataset.dashboardField);
    }, true);
    root.addEventListener('keydown', (event) => {
      if (!['Enter', ' '].includes(event.key)) return;
      const item = event.target.closest?.('[data-dashboard-field]');
      if (!item) return;
      event.preventDefault();
      activateField(item.dataset.dashboardField);
    }, true);

    window.addEventListener('pointermove', pointerMove, { passive: false });
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);
    window.addEventListener('resize', () => {
      const next = orientationKey();
      if (next !== currentOrientation) currentOrientation = next;
      applyLayout();
    });
    window.addEventListener('orientationchange', () => setTimeout(applyLayout, 60));
    window.addEventListener('wander:dashboard-layout-change', () => requestAnimationFrame(applyLayout));
    window.addEventListener('wander:dashboard-values-change', ensureCards);
    window.addEventListener('wander:screen-change', () => {
      if (window.WanderScreen?.current?.() !== 'map' && editing) setEditing(false);
    });

    const buttonTimer = setInterval(() => {
      if (installEditButton()) clearInterval(buttonTimer);
    }, 200);
    setTimeout(() => clearInterval(buttonTimer), 15000);

    window.WanderContextHUD = Object.freeze({
      storageKey: STORAGE_KEY,
      getLayouts: () => clone(layouts),
      getOrientation: () => currentOrientation,
      getRect: (fieldId, orientation = currentOrientation) => clone(rectFor(fieldId, orientation)),
      setRect,
      applyLayout,
      exportRows,
      isEditing: () => editing,
      setEditing,
      toggleEditing: () => setEditing(!editing),
      resetOrientation() {
        layouts[currentOrientation] = {};
        applyLayout();
        return saveLayouts('reset-orientation');
      },
      resetAll() {
        layouts = { portrait: {}, landscape: {} };
        applyLayout();
        return saveLayouts('reset-all');
      },
    });
    window.dispatchEvent(new CustomEvent('wander:context-hud-ready', {
      detail: { orientation: currentOrientation, rows: exportRows() },
    }));
    return true;
  }

  if (install()) return;
  const timer = setInterval(() => {
    if (install() || Date.now() - startedAt >= INSTALL_TIMEOUT_MS) clearInterval(timer);
  }, INSTALL_INTERVAL_MS);
})();

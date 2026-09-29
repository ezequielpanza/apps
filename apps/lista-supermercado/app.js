(() => {
  'use strict';
  const KEY = 'chez-lista-supermercado-v1';
  const HISTORY = 'chez-lista-supermercado-history-v1';
  const CATEGORIES = ['Frutas y verduras','Carnes y pescados','Lácteos y huevos','Panadería','Almacén','Bebidas','Limpieza y hogar','Otros'];
  const WORDS = {
    'Frutas y verduras': ['tomate','papa','cebolla','ajo','lechuga','zanahoria','banana','manzana','naranja','limón','palta','pepino','pimiento','fruta','verdura'],
    'Carnes y pescados': ['pollo','carne','pescado','atún','jamón','salchicha','milanesa','salmón'],
    'Lácteos y huevos': ['leche','queso','yogur','yogurt','manteca','mantequilla','huevo','crema'],
    'Panadería': ['pan','medialuna','factura','tostada','baguette'],
    'Almacén': ['arroz','pasta','fideo','aceite','sal','azúcar','harina','café','te','té','galleta','yerba','cereal','conserva'],
    'Bebidas': ['agua','jugo','cerveza','vino','gaseosa','soda'],
    'Limpieza y hogar': ['papel','jabón','detergente','lavandina','esponja','servilleta','shampoo','champú','bolsa']
  };
  const $ = s => document.querySelector(s);
  const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const read = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v : fallback; } catch { return fallback; } };
  let items = read(KEY, []).filter(x => x && typeof x.id === 'string' && typeof x.name === 'string');
  let history = read(HISTORY, []).filter(x => typeof x === 'string');
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(items)); localStorage.setItem(HISTORY, JSON.stringify(history)); } catch { alert('No se pudo guardar la lista en este dispositivo. Revisá el espacio disponible.'); } };
  const category = name => { const n = normalize(name); return Object.entries(WORDS).find(([,words]) => words.some(w => n === normalize(w) || n.startsWith(normalize(w) + ' ')))?.[0] || 'Otros'; };
  function node(tag, cls, content) { const el = document.createElement(tag); if(cls) el.className = cls; if(content != null) el.textContent = content; return el; }
  function render() {
    const pending = items.filter(x => !x.done), done = items.filter(x => x.done);
    $('#remaining-count').textContent = pending.length;
    $('#done-count').textContent = done.length;
    $('#done-section').hidden = done.length === 0;
    $('#clear-done').hidden = done.length === 0;
    const list = $('#list'); list.replaceChildren();
    if (!pending.length) { const empty = node('div','empty'); empty.append(node('strong','',done.length ? '¡Todo comprado!' : 'La lista está vacía'),node('span','',done.length ? 'Podés agregar algo más o empezar una nueva compra.' : 'Escribí arriba el primer producto que necesitás.')); list.append(empty); }
    for (const cat of CATEGORIES) {
      const group = pending.filter(x => category(x.name) === cat);
      if (group.length) { list.append(node('div','category',cat)); group.forEach(x => list.append(row(x))); }
    }
    const doneList = $('#done-list'); doneList.replaceChildren(...done.map(row));
    renderSuggestions();
  }
  function row(item) {
    const el = node('div','item' + (item.done ? ' done' : ''));
    const check = node('button','check',item.done ? '✓' : ''); check.type = 'button'; check.setAttribute('aria-label',(item.done ? 'Devolver a pendientes: ' : 'Marcar como comprado: ') + item.name);
    check.addEventListener('click',() => { item.done = !item.done; save(); render(); });
    const name = node('span','item-name',item.name);
    el.append(check,name);
    if(item.quantity) el.append(node('span','qty',item.quantity));
    const del = node('button','delete','×'); del.type = 'button'; del.setAttribute('aria-label','Eliminar ' + item.name);
    del.addEventListener('click',() => { items = items.filter(x => x.id !== item.id); save(); render(); });
    el.append(del); return el;
  }
  function add(name, quantity = '') {
    name = name.trim().replace(/\s+/g,' '); quantity = quantity.trim(); if (!name) return;
    const existing = items.find(x => normalize(x.name) === normalize(name));
    if (existing) { existing.done = false; if (quantity) existing.quantity = quantity; }
    else items.push({id: crypto.randomUUID(), name, quantity, done:false});
    history = [name,...history.filter(x => normalize(x) !== normalize(name))].slice(0,40);
    save(); $('#product').value = ''; $('#quantity').value = ''; render(); $('#product').focus();
  }
  function renderSuggestions() {
    const q = normalize($('#product').value);
    const existing = new Set(items.map(x => normalize(x.name)));
    const matches = history.filter(x => !existing.has(normalize(x)) && (!q || normalize(x).includes(q))).slice(0,5);
    const container = $('#suggestions'); container.hidden = !matches.length; container.replaceChildren();
    matches.forEach(name => { const b = node('button','', '+ ' + name); b.type = 'button'; b.addEventListener('click',() => add(name)); container.append(b); });
  }
  $('#add-form').addEventListener('submit',e => { e.preventDefault(); add($('#product').value, $('#quantity').value); });
  $('#product').addEventListener('input',renderSuggestions);
  $('#clear-done').addEventListener('click',() => { items = items.filter(x => !x.done); save(); render(); });
  window.addEventListener('storage', e => { if (e.key === KEY || e.key === HISTORY) { items = read(KEY,[]); history = read(HISTORY,[]); render(); } });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  render();
})();

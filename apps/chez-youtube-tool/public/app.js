const app = document.querySelector('#app');
const tabs = [...document.querySelectorAll('[data-view]')];
const syncButton = document.querySelector('#syncButton');
const toast = document.querySelector('#toast');
let activeView = 'dashboard';

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `Error ${response.status}`);
  return data;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 3200);
}

function number(value) { return Number(value || 0).toLocaleString('es-AR'); }
function date(value) { return value ? new Date(value).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }

async function dashboard() {
  const data = await api('/api/dashboard');
  const s = data.stats || {};
  app.innerHTML = `
    <section class="hero"><div><h2>Comentarios bajo control</h2><p>Resumen del funcionamiento de Chez YouTube Tool.</p></div>
    <span class="badge ${data.connection ? 'ok' : 'warn'}">${data.connection ? 'YouTube conectado' : 'YouTube pendiente'}</span></section>
    <section class="grid">
      <article class="stat"><strong>${number(s.pending)}</strong><span>Pendientes</span></article>
      <article class="stat"><strong>${number(s.proposed)}</strong><span>Con propuesta</span></article>
      <article class="stat"><strong>${number(s.published)}</strong><span>Publicadas</span></article>
      <article class="stat"><strong>${number(s.comments)}</strong><span>Comentarios totales</span></article>
    </section>
    <section class="panel"><h3>Aprendizaje</h3>
      <div class="grid">
        <article class="stat"><strong>${number(s.accepted)}</strong><span>Aceptadas</span></article>
        <article class="stat"><strong>${number(s.edited)}</strong><span>Editadas</span></article>
        <article class="stat"><strong>${number(s.rejected)}</strong><span>Rechazadas</span></article>
        <article class="stat"><strong>${number(s.skipped)}</strong><span>Sin responder</span></article>
      </div>
    </section>
    <section class="panel"><h3>Episodios recientes</h3>${renderVideos(data.videos || [])}</section>`;
}

function renderVideos(items) {
  if (!items.length) return '<div class="empty">Todavía no hay episodios sincronizados.</div>';
  return `<div class="cards">${items.map(v => `<article class="card"><div class="card-head"><div><h4>${escapeHtml(v.title)}</h4><p class="meta">${date(v.published_at)}</p></div><span class="badge">${number(v.pending_count)} pendientes</span></div><p class="muted">${number(v.comment_count)} comentarios</p></article>`).join('')}</div>`;
}

async function comments() {
  const data = await api('/api/comments?status=all');
  app.innerHTML = `<section class="hero"><div><h2>Comentarios</h2><p>Revisá propuestas, editá y registrá cada decisión.</p></div></section>${renderComments(data.items || [])}`;
  bindCommentActions();
}

function renderComments(items) {
  if (!items.length) return '<div class="empty">No hay comentarios todavía.</div>';
  return `<div class="cards">${items.map(c => `<article class="card" data-comment="${c.id}" data-proposal="${c.proposal_id || ''}">
    <div class="card-head"><div><h3>${escapeHtml(c.author_name)}</h3><p class="meta">${escapeHtml(c.video_title)} · ${date(c.published_at)}</p></div><span class="badge">${escapeHtml(c.status)}</span></div>
    <p class="comment">${escapeHtml(c.text_original)}</p>
    ${c.proposed_text ? `<div class="proposal"><strong>Propuesta</strong><p>${escapeHtml(c.final_text || c.proposed_text)}</p></div>` : `<textarea placeholder="Escribí una propuesta de respuesta"></textarea>`}
    <div class="actions">
      ${c.proposed_text ? `<button class="secondary" data-action="accept">Aceptar</button><button class="ghost" data-action="edit">Editar</button><button class="danger" data-action="reject">Rechazar</button><button class="ghost" data-action="skip">No responder</button>` : `<button class="primary" data-action="create">Guardar propuesta</button>`}
    </div></article>`).join('')}</div>`;
}

function bindCommentActions() {
  app.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', async event => {
    const card = event.target.closest('.card');
    const action = event.target.dataset.action;
    const commentId = card.dataset.comment;
    const proposalId = card.dataset.proposal;
    try {
      if (action === 'create') {
        const proposed_text = card.querySelector('textarea').value.trim();
        await api(`/api/comments/${commentId}/proposals`, { method: 'POST', body: JSON.stringify({ proposed_text }) });
      } else if (action === 'edit') {
        const original = card.querySelector('.proposal p').textContent;
        const final_text = prompt('Editar respuesta', original);
        if (final_text === null) return;
        await api(`/api/proposals/${proposalId}/review`, { method: 'POST', body: JSON.stringify({ action: 'edited', final_text }) });
      } else {
        const map = { accept: 'accepted', reject: 'rejected', skip: 'skipped' };
        await api(`/api/proposals/${proposalId}/review`, { method: 'POST', body: JSON.stringify({ action: map[action] }) });
      }
      showToast('Decisión guardada');
      await comments();
    } catch (error) { showToast(error.message); }
  }));
}

async function videosView() {
  const data = await api('/api/videos');
  app.innerHTML = `<section class="hero"><div><h2>Episodios</h2><p>Comentarios y pendientes organizados por video.</p></div></section>${renderVideos(data.items || [])}`;
}

async function styleView() {
  const data = await api('/api/style');
  const m = data.metrics || {};
  app.innerHTML = `<section class="hero"><div><h2>Estilo aprendido</h2><p>Qué propuestas aceptan, editan, rechazan o deciden no responder.</p></div></section>
    <section class="grid"><article class="stat"><strong>${number(m.accepted)}</strong><span>Aceptadas</span></article><article class="stat"><strong>${number(m.edited)}</strong><span>Editadas</span></article><article class="stat"><strong>${number(m.rejected)}</strong><span>Rechazadas</span></article><article class="stat"><strong>${number(m.avg_length)}</strong><span>Longitud promedio</span></article></section>
    <section class="panel"><h3>Reglas</h3>${data.rules?.length ? `<div class="cards">${data.rules.map(r => `<article class="card"><span class="badge">${escapeHtml(r.status)}</span><h4>${escapeHtml(r.title)}</h4><p>${escapeHtml(r.description)}</p><p class="meta">${number(r.evidence_count)} evidencias</p></article>`).join('')}</div>` : '<div class="empty">Las reglas aparecerán a medida que revisen respuestas.</div>'}</section>`;
}

async function setupView() {
  const data = await api('/api/setup');
  app.innerHTML = `<section class="hero"><div><h2>Ajustes</h2><p>Estado de las integraciones necesarias.</p></div></section>
    <section class="panel setup-list">
      <div class="setup-row"><div><strong>Autenticación</strong><p class="meta">Protección de la PWA</p></div><span class="badge ok">${escapeHtml(data.authMode)}</span></div>
      <div class="setup-row"><div><strong>YouTube OAuth</strong><p class="meta">Lectura y publicación de comentarios</p></div><span class="badge ${data.youtubeConfigured ? 'ok' : 'warn'}">${data.youtubeConfigured ? 'Configurado' : 'Pendiente'}</span></div>
      <div class="setup-row"><div><strong>GPT privado</strong><p class="meta">Actions para traer pendientes y guardar propuestas</p></div><span class="badge ${data.gptConfigured ? 'ok' : 'warn'}">${data.gptConfigured ? 'Configurado' : 'Pendiente'}</span></div>
    </section>`;
}

async function render() {
  app.innerHTML = '<section class="loading">Cargando…</section>';
  try {
    if (activeView === 'dashboard') await dashboard();
    if (activeView === 'comments') await comments();
    if (activeView === 'videos') await videosView();
    if (activeView === 'style') await styleView();
    if (activeView === 'setup') await setupView();
  } catch (error) {
    app.innerHTML = `<section class="empty"><h2>No se pudo cargar</h2><p>${escapeHtml(error.message)}</p></section>`;
  }
}

tabs.forEach(tab => tab.addEventListener('click', () => {
  tabs.forEach(item => item.classList.toggle('active', item === tab));
  activeView = tab.dataset.view;
  render();
}));

syncButton.addEventListener('click', async () => {
  try {
    const result = await api('/api/sync', { method: 'POST', body: '{}' });
    showToast(result.message || 'Sincronización solicitada');
  } catch (error) { showToast(error.message); }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
render();

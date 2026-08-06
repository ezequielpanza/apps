(() => {
  if (window.WanderTrackTreeBitacoraBridge) return;
  function todayLabel() {
    return new Date().toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' });
  }
  function findAnchor() {
    const nodes = [...document.querySelectorAll('h1,h2,h3,strong,p,span')];
    return nodes.find((node) => /Lo que pasó hoy/i.test(node.textContent || ''))
      || nodes.find((node) => /Mostrar en el mapa/i.test(node.textContent || ''));
  }
  function ensureEmptyDay(root) {
    if (root.querySelector('.track-folder-tree,.track-tree-heading,[data-wander-empty-day]')) return;
    const box = document.createElement('div');
    box.dataset.wanderEmptyDay = 'true';
    box.className = 'track-folder-tree';
    box.innerHTML = `<div class="track-tree-heading"><strong>Tracks y actividades</strong><small>Día → Episodio → Actividad → Track</small></div><details open><summary><span class="track-tree-icon">📁</span><span class="track-tree-title">Hoy · ${todayLabel()}</span><span class="track-tree-meta">0 episodios · 0 tracks</span></summary><div class="track-tree-empty">Todavía no hay episodios ni tracks finalizados para hoy.</div></details>`;
    root.prepend(box);
  }
  function mount() {
    const trackList = document.querySelector('#track-list');
    const anchor = findAnchor();
    if (!trackList || !anchor) return;
    const target = anchor.parentElement;
    if (!target) return;
    if (!target.contains(trackList)) target.insertBefore(trackList, anchor);
    ensureEmptyDay(trackList);
    window.WanderTrackTreeUI?.render?.();
  }
  new MutationObserver(mount).observe(document.body, { childList:true, subtree:true });
  window.addEventListener('wander:track-finalized', mount);
  window.addEventListener('wander:sessions-changed', mount);
  setInterval(mount, 3000);
  window.WanderTrackTreeBitacoraBridge = { mount };
  setTimeout(mount, 700);
})();
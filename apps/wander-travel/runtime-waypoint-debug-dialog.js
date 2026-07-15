(() => {
  if (document.querySelector('#waypoint-debug-dialog')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'waypoint-debug-dialog';
  dialog.setAttribute('aria-label', 'Punto seleccionado');
  dialog.innerHTML = '<div style="width:42px;height:5px;border-radius:999px;background:#d9e2e0;margin:0 auto 12px"></div><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><div style="font-size:12px;font-weight:900;letter-spacing:.08em;color:#00bfae">PUNTO SELECCIONADO · DEBUG</div><div style="font-size:22px;font-weight:900;margin-top:4px">Punto seleccionado</div></div><button id="waypoint-debug-close" type="button" style="width:44px;height:44px;border:0;border-radius:14px;background:#eef3f2;font-size:24px">×</button></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px"><div style="padding:12px;border-radius:14px;background:#f4f7f6"><small>Distancia</small><strong style="display:block;margin-top:4px">—</strong></div><div style="padding:12px;border-radius:14px;background:#f4f7f6"><small>Rumbo</small><strong style="display:block;margin-top:4px">—</strong></div><div style="grid-column:1/-1;padding:12px;border-radius:14px;background:#f4f7f6"><small>Coordenadas</small><strong style="display:block;margin-top:4px">Centro del mapa</strong></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px"><button type="button" style="min-height:46px;border:0;border-radius:14px;background:#124e49;color:white;font-weight:800">Ruta hasta</button><button type="button" style="min-height:46px;border:0;border-radius:14px;background:#01e0cb;color:#073f3a;font-weight:800">Guardar</button></div>';
  Object.assign(dialog.style, {
    width: 'calc(100vw - 36px)',
    maxWidth: '520px',
    margin: 'auto auto 24px',
    padding: '18px',
    border: '0',
    borderRadius: '24px',
    background: '#ffffff',
    color: '#102f2d',
    boxShadow: '0 20px 60px rgba(0,0,0,.4)',
  });
  document.documentElement.appendChild(dialog);
  dialog.querySelector('#waypoint-debug-close')?.addEventListener('click', () => dialog.close());
  setTimeout(() => {
    try {
      if (!dialog.open) dialog.showModal();
    } catch {
      dialog.setAttribute('open', '');
      Object.assign(dialog.style, { position: 'fixed', left: '18px', right: '18px', bottom: '24px', zIndex: '2147483647' });
    }
  }, 400);
  window.WanderWaypointDebugDialog = dialog;
})();
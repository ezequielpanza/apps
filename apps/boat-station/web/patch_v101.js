(function(){
  function q(s,r){return (r||document).querySelector(s)}
  function qa(s,r){return Array.from((r||document).querySelectorAll(s))}

  var st=document.createElement('style');st.id='bs-v105-style';st.textContent=`
    :root{--accent:#25d6e6;--panel:#0b2639;--panel2:#0d2c42;--line:#1d4057;--muted:#8ea5b6;--danger:#ff6672}
    .sheet-inner{background:linear-gradient(180deg,#0c2940 0%,#092236 100%)!important;border-color:#20455c!important;border-radius:28px 28px 0 0!important;padding:18px 18px 30px!important}
    .sheet-inner h3{font-size:21px!important;letter-spacing:-.2px!important;margin:6px 0 22px!important}.handle{width:48px!important;height:5px!important;background:#3b6077!important}
    .option{padding:15px 2px!important;border-bottom:1px solid #173a50!important;gap:12px!important}.field,.select{background:#071a29!important;border:1px solid #2a5972!important;border-radius:14px!important;padding:11px 13px!important}
    .btn{background:#0b2639!important;border:1px solid #2f6682!important;border-radius:14px!important;color:#e8f4f9!important;padding:11px 15px!important;font-weight:600!important;min-height:44px!important}
    .btn:active{background:#10344a!important;border-color:var(--accent)!important}.btn.action-accent{border-color:#35b9cc!important;color:#91e5ef!important}.btn.action-add{border-color:#35b9cc!important;color:#91e5ef!important}.btn.action-save{border-color:#35b9cc!important;color:#a9deea!important}.btn.action-danger{border-color:#ef5b6a!important;color:#ff7781!important;background:#122735!important}
    .battery-card{background:#081c2b!important;border:1px solid #1b4058!important;border-radius:18px!important;padding:16px!important;margin:12px 0!important}.battery-top{gap:10px!important}.battery-top .name{font-size:18px!important;font-weight:800!important}.battery-card .status.ok{color:#b4df67!important}.battery-card .bankline{font-size:13px!important;margin-top:7px!important;color:#8ea5b6!important}
    .card{position:relative!important}.card.edit-selected{outline:2px solid var(--accent)!important;box-shadow:0 0 0 3px #25d6e625!important}.card.edit-selected .card-head{background:#10354b!important}
    .card-body{transition:none!important}.resize-grip{position:absolute!important;left:0!important;right:0!important;bottom:0!important;height:30px!important;margin:0!important;border:0!important;opacity:0!important;z-index:20!important}.card.edit-selected .resize-grip{opacity:1!important}.card.edit-selected .resize-grip:after{content:'↕';display:block;text-align:center;font-size:22px;font-weight:800;color:var(--accent)}
    .danger{color:var(--danger)!important}.backup-status{border-color:#1b4058!important;background:#081c2b!important;border-radius:16px!important}
  `;document.head.appendChild(st);

  function decorateButtons(){qa('.btn').forEach(function(b){var t=(b.textContent||'').trim().toLowerCase();b.classList.remove('action-accent','action-add','action-save','action-danger');if(t==='configurar')b.classList.add('action-accent');else if(t.indexOf('batería')>=0&&t.indexOf('guardar')<0)b.classList.add('action-add');else if(t.indexOf('guardar')===0)b.classList.add('action-save');else if(t.indexOf('eliminar')===0)b.classList.add('action-danger')})}

  function ensureBluetoothSheet(){if(q('#bluetoothSheet'))return;var s=document.createElement('div');s.className='sheet';s.id='bluetoothSheet';s.innerHTML='<div class="sheet-inner"><div class="handle"></div><div class="subsheet-head"><button class="btn" id="bluetoothBack">‹</button><h3 style="margin:0">Seleccionar batería Bluetooth</h3></div><div class="sub">Baterías y dispositivos BLE detectados</div><div id="bluetoothList"></div></div>';document.body.appendChild(s);q('#bluetoothBack').onclick=function(){s.classList.remove('open');q('#batterySheet').classList.add('open')};s.onclick=function(e){if(e.target===s){s.classList.remove('open');q('#batterySheet').classList.add('open')}}}
  function hookBattery(){ensureBluetoothSheet();var bs=q('#batterySheet'),origArea=q('#batteryScanArea'),list=q('#bluetoothList');if(!bs||!origArea||!list)return;var b=q('#scanBattery');if(b&&!b.dataset.simpleHook){b.dataset.simpleHook='1';var original=b.onclick;b.onclick=function(e){if(original)original.call(this,e);setTimeout(function(){bs.classList.remove('open');q('#bluetoothSheet').classList.add('open');mirror()},20)}}function mirror(){list.innerHTML=origArea.innerHTML||'<div class="sub">Buscando dispositivos BLE…</div>';qa('[data-pick]',list).forEach(function(btn){btn.textContent='Seleccionar';btn.onclick=function(){var a=btn.getAttribute('data-pick');var src=q('#batteryScanArea [data-pick="'+CSS.escape(a)+'"]');if(src)src.click();q('#bluetoothSheet').classList.remove('open');bs.classList.add('open')}});decorateButtons()}if(!origArea.dataset.simpleObserve){origArea.dataset.simpleObserve='1';new MutationObserver(mirror).observe(origArea,{childList:true,subtree:true})}}

  function backupMenu(){var ch=q('#changeFolder');if(ch){var row=ch.closest('.option');if(row)row.remove()}var r=q('#restoreBackup');if(r)r.textContent='Restaurar';var container=q('#backupNow')&&q('#backupNow').closest('.option');if(!container||q('#exportZip'))return;var row=document.createElement('div');row.className='option';row.innerHTML='<button class="btn" id="exportZip">Exportar ZIP</button><button class="btn" id="importZip">Importar ZIP</button>';container.after(row);q('#exportZip').onclick=function(){if(!window.StorageBridge)return;var raw=StorageBridge.loadBackup();StorageBridge.exportZip(raw||'')};q('#importZip').onclick=function(){if(window.StorageBridge)StorageBridge.importZip()}}

  function loadStationsRuntime(){
    if(window.__bsStationsLoading)return;window.__bsStationsLoading=true;
    function load(src,next){var s=document.createElement('script');s.src=src;s.onload=function(){if(next)next()};s.onerror=function(){if(next)next()};document.body.appendChild(s)}
    load('backend_url.js',function(){load('remote_gate.js',function(){load('remote_sync.js')})});
  }

  ensureBluetoothSheet();backupMenu();decorateButtons();hookBattery();loadStationsRuntime();
  window.addEventListener('boatstation-ui-refresh',function(){decorateButtons();hookBattery()});
})();

(function(){
  const q=(s,r)=> (r||document).querySelector(s);
  const qa=(s,r)=>Array.from((r||document).querySelectorAll(s));

  function fixRemoteLabels(){
    const btn=q('#showQrBtn');
    if(btn){
      btn.textContent='Mostrar QR para supervisar remotamente';
      const row=btn.closest('.option')||btn.parentElement;
      if(row){
        const label=Array.from(row.children).find(el=>el!==btn);
        if(label) label.textContent='Supervisión remota';
      }
    }
    const title=q('#pairingSheet h3');
    if(title) title.textContent='Supervisión remota';
    const help=q('#pairingSheet .qr-wrap .sub');
    if(help) help.textContent='Escaneá este código desde Boat Station Web para supervisar esta Station.';
    const manual=q('#pairingManualCode');
    if(manual){
      const texts=manual.querySelectorAll('div');
      if(texts.length>2) texts[2].textContent='También podés ingresarlo manualmente en Boat Station Web.';
    }
  }

  function fixBatteryPicker(){
    const batterySheet=q('#batterySheet');
    const scanArea=q('#batteryScanArea');
    const bluetoothSheet=q('#bluetoothSheet');
    const list=q('#bluetoothList');
    const scanBtn=q('#scanBattery');
    if(!batterySheet||!scanArea||!bluetoothSheet||!list||!scanBtn)return;

    // The discovery result is an implementation detail. Never show it below the battery form.
    scanArea.style.display='none';

    if(scanBtn.dataset.v106==='1') return;
    scanBtn.dataset.v106='1';

    scanBtn.addEventListener('click',function(){
      batterySheet.classList.remove('open');
      bluetoothSheet.classList.add('open');
      list.innerHTML='<div class="sub" style="padding:14px 2px">Buscando dispositivos Bluetooth…</div>';
      setTimeout(syncList,60);
    },true);

    function syncList(){
      if(!bluetoothSheet.classList.contains('open')) return;
      const html=scanArea.innerHTML.trim();
      if(!html) return;
      list.innerHTML=html;
      qa('[data-pick]',list).forEach(function(btn){
        btn.textContent='Vincular';
        btn.onclick=function(e){
          e.preventDefault();e.stopPropagation();
          const addr=btn.getAttribute('data-pick');
          const src=q('#batteryScanArea [data-pick="'+CSS.escape(addr)+'"]');
          if(src) src.click();
          bluetoothSheet.classList.remove('open');
          batterySheet.classList.add('open');
          list.innerHTML='';
          scanArea.innerHTML='';
        };
      });
    }

    new MutationObserver(syncList).observe(scanArea,{childList:true,subtree:true});
  }

  function tick(){fixRemoteLabels();fixBatteryPicker()}
  tick();
  setInterval(tick,1500);
  new MutationObserver(()=>setTimeout(tick,0)).observe(document.body,{childList:true,subtree:true});
})();

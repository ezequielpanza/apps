(function(){
  const p=new URLSearchParams(location.search);if(p.get('mode')!=='station')return;
  const box=document.createElement('div');box.id='bsUiProbe';box.style.cssText='position:fixed;right:6px;bottom:48px;z-index:99999;background:#061522dd;border:1px solid #25d6e6;border-radius:9px;padding:5px 7px;color:#bff8ff;font:11px monospace;pointer-events:none';
  let taps=0,moves=0,swipes=0,lastBeat=performance.now(),lag=0,lastX=0,lastY=0,down=false;
  function render(){box.textContent='UI TEST · tap '+taps+' · swipe '+swipes+' · lag '+Math.round(lag)+'ms'}
  document.body.appendChild(box);render();
  document.addEventListener('pointerdown',e=>{down=true;lastX=e.clientX;lastY=e.clientY;taps++;render()},{capture:true,passive:true});
  document.addEventListener('pointermove',e=>{if(down)moves++},{capture:true,passive:true});
  document.addEventListener('pointerup',e=>{if(down){const dx=e.clientX-lastX,dy=e.clientY-lastY;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy))swipes++;down=false;render()}},{capture:true,passive:true});
  setInterval(()=>{const now=performance.now();lag=Math.max(0,now-lastBeat-500);lastBeat=now;render()},500);
  setTimeout(()=>{box.remove()},90000);
})();

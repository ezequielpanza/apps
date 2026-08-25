(function(){
  const observed=new WeakSet();
  let ro=null;

  function axisHeight(canvas){return canvas.getBoundingClientRect().width<520?42:30}

  function position(grid,canvas){
    if(!grid?.isConnected||!canvas?.isConnected)return;
    const r=canvas.getBoundingClientRect(),axisH=axisHeight(canvas),plotH=Math.max(20,r.height-axisH);
    grid.style.width=`${r.width}px`;
    grid.style.height=`${r.height}px`;
    for(const row of grid.querySelectorAll('[data-soc-ref]')){
      const pct=Number(row.dataset.socRef)||0;
      const y=(100-pct)/100*plotH;
      row.style.top=`${Math.round(y)}px`;
    }
  }

  function gridFor(canvas){
    const parent=canvas.parentElement;if(!parent)return null;
    let grid=parent.querySelector(':scope > .battery-soc-reference-grid');
    if(!grid){
      grid=document.createElement('div');
      grid.className='battery-soc-reference-grid';
      grid.setAttribute('aria-hidden','true');
      grid.innerHTML=[100,75,50,25].map(p=>`<div class="battery-soc-reference" data-soc-ref="${p}"><span>${p}%</span></div>`).join('');
      parent.style.position='relative';
      canvas.insertAdjacentElement('afterend',grid);
    }
    return grid;
  }

  function attach(canvas){
    if(!canvas||canvas.dataset.chartOwner!=='battery-history')return;
    const grid=gridFor(canvas);position(grid,canvas);
    if(observed.has(canvas)||typeof ResizeObserver==='undefined')return;
    observed.add(canvas);ro||(ro=new ResizeObserver(entries=>entries.forEach(entry=>{const c=entry.target;position(gridFor(c),c)})));ro.observe(canvas)
  }

  function scan(){document.querySelectorAll('canvas[data-battery-chart][data-chart-owner="battery-history"]').forEach(attach)}

  const observer=new MutationObserver(records=>{
    for(const record of records){for(const node of record.addedNodes){if(!(node instanceof Element))continue;if(node.matches?.('canvas[data-battery-chart]')||node.querySelector?.('canvas[data-battery-chart]')){scan();return}}}
  });
  observer.observe(document.getElementById('cards')||document.body,{childList:true,subtree:true});
  window.addEventListener('resize',scan);
  window.addEventListener('boatstation-page-resize-end',e=>{if(e.detail?.id==='batteries')scan()});
  setTimeout(scan,300);
})();

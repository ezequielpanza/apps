export function createSeaStateModule(requestRender){
  const state={motion:0,samples:[],average:0,peak:0,wave:0,factor:Number(localStorage.getItem('bs.seaFactor')||1)};
  function recalc(){const now=Date.now();state.samples=state.samples.filter(x=>now-x.t<=30000);if(!state.samples.length){state.average=state.peak=state.wave=0;return}state.average=state.samples.reduce((s,x)=>s+x.v,0)/state.samples.length;state.peak=state.samples.reduce((m,x)=>Math.max(m,x.v),0);state.wave=state.average*Math.max(0,Number(state.factor)||0)}
  function summary(){return `${state.wave.toFixed(2)} m · mov ${state.average.toFixed(2)}`}
  function page(){return `<div class="battery-hero"><div class="battery-bank-name" style="font-size:34px">${state.wave.toFixed(2)} m</div><div class="battery-ah">Altura de ola estimada · promedio móvil 30 s</div></div><div class="metric-grid"><div class="metric"><div class="value">${state.average.toFixed(2)}</div><div class="label">Movimiento promedio</div></div><div class="metric"><div class="value">${state.peak.toFixed(2)}</div><div class="label">Pico</div></div></div>`}
  function afterRender(){}
  function update(value){const v=Number(value);if(!Number.isFinite(v))return;state.motion=v;state.samples.push({t:Date.now(),v:Math.max(0,v)});recalc();requestRender('seastate')}
  return{id:'seastate',name:'Sea State',pages:1,summary,page,afterRender,update,state};
}

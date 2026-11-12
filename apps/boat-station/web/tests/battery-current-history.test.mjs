import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createBatteriesModule} from '../modules/batteries-clean.js';

function setup(now,history=[],batteries=[]){
  const values=new Map([
    ['bs.batteries.current.v1',JSON.stringify({bankName:'Banco principal',batteries})],
    ['bs.batteries.history.v1',JSON.stringify(history)],
    ['bs.batteries.historyZoom.v2','0']
  ]);
  globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  globalThis.window={addEventListener(){},BoatStationPageLayout:{currentPage:()=>1}};
  globalThis.requestAnimationFrame=callback=>callback();
  globalThis.devicePixelRatio=1;
  Date.now=()=>now();
  return createBatteriesModule(()=>{},()=>{});
}

const originalNow=Date.now;
try{
  let clock=1_000_000;
  const module=setup(()=>clock);
  const update=current=>module.updateBattery({id:'battery-a',name:'Batería A',capacityAh:100,soc:50,remainingAh:50,voltage:13,current,connected:true});
  update(10);
  clock+=30_000;update(10);
  let sample=module.state.history.at(-1);
  assert.ok(Math.abs(sample.chargeAh-(10*30/3600))<1e-9,'records measured input Ah');
  assert.ok(Math.abs(sample.storedAh-(10*30/3600*.99))<1e-9,'applies 99% charge efficiency');
  assert.ok(Math.abs(sample.batteries[0].storedAh-sample.storedAh)<1e-9,'stores interval Ah per battery');

  clock+=30_000;update(-10);sample=module.state.history.at(-1);
  assert.ok(sample.chargeAh>0&&sample.dischargeAh>0,'splits a current reversal into charge and discharge');
  assert.ok(sample.storedAh<0,'the discharge side plots below zero after efficiency');
  clock+=30_000;update(-10);sample=module.state.history.at(-1);
  assert.equal(sample.chargeAh,0);
  assert.ok(sample.dischargeAh>0&&sample.storedAh<0,'integrates sustained discharge as negative stored Ah');
  assert.match(module.page(1),/data-ah-label="zero">0 Ah/,'history page places zero Ah on the chart');

  clock=2_000_000;
  const varying=setup(()=>clock);
  const varyingUpdate=current=>varying.updateBattery({id:'battery-v',name:'Batería variable',capacityAh:100,soc:50,remainingAh:50,voltage:13,current,connected:true});
  varyingUpdate(10);
  clock+=5_000;varyingUpdate(0);
  clock+=5_000;varyingUpdate(10);
  clock+=20_000;varyingUpdate(10);
  sample=varying.state.history.at(-1);
  assert.ok(Math.abs(sample.chargeAh-(10*25/3600))<1e-9,'integrates every reported current change between history samples');
  assert.ok(Math.abs(sample.storedAh-(10*25/3600*.99))<1e-9,'the interval curve uses integrated net Ah after efficiency');

  clock=5_000_000;
  const calibrated=setup(()=>clock);
  const updateVoltage=(current,voltage)=>calibrated.updateBattery({id:'battery-b',name:'Batería B',capacityAh:100,soc:50,remainingAh:50,voltage,current,connected:true});
  updateVoltage(0,12.00);
  calibrated.setChargeCalculation('battery-b',{mode:'agm',cells:6});
  for(let step=1;step<=3;step++){clock+=6000;updateVoltage(step*10,12+step*.02)}
  const correction=calibrated.state.batteries[0].currentCorrection;
  assert.equal(correction.samples,3,'learns after three useful current steps');
  assert.ok(Math.abs(correction.resistanceOhm-.002)<1e-9,'learns ΔV/ΔI per battery');
  assert.ok(Math.abs(calibrated.stats().soc-8)<1e-9,'uses corrected resting voltage in the selected voltage curve');

  const now=10_000_000;
  const graph=setup(()=>now,[
    {time:now-600_000,soc:52,current:5,storedAh:.05,batteries:[{id:'battery-a',name:'Batería A',contribution:52,current:5,storedAh:.05}]},
    {time:now-300_000,soc:50,current:-5,storedAh:-.05,batteries:[{id:'battery-a',name:'Batería A',contribution:50,current:-5,storedAh:-.05}]}
  ],[{id:'battery-a',name:'Batería A',capacityAh:100}]);
  const lineCalls=[];
  const context={setTransform(){},clearRect(){},beginPath(){},moveTo(x,y){lineCalls.push(['move',x,y])},lineTo(x,y){lineCalls.push(['line',x,y])},stroke(){},fillRect(){},save(){},restore(){},translate(){},rotate(){},fillText(){},arc(){},fill(){}};
  const canvas={width:0,height:0,getBoundingClientRect:()=>({width:300,height:230}),getContext:()=>context};
  const labels=new Map(['top','upper','zero','lower','bottom'].map(pos=>[pos,{textContent:''}]));
  const legend={innerHTML:''},leftAxis={style:{}},rightAxis={style:{}};
  const root={querySelector(selector){if(selector.startsWith('.page[data-page='))return canvas;if(selector==='.battery-history-y:not(.battery-history-y-ah)')return leftAxis;if(selector==='.battery-history-y-ah')return rightAxis;const match=selector.match(/data-ah-label="([^"]+)"/);if(match)return labels.get(match[1]);if(selector==='[data-battery-history-legend]')return legend;return null},querySelectorAll(){return[]}};
  graph.afterRender(root);
  assert.equal(labels.get('zero').textContent,'0 Ah');
  assert.equal(leftAxis.style.height,rightAxis.style.height,'both axes align to the plotted region');
  assert.match(legend.innerHTML,/Batería A · Ah/);
  assert.ok(lineCalls.some(([kind,x])=>kind==='line'&&x>0&&x<300),'draws Ah as a curve on the right axis');
  assert.equal(graph.setCurrentHistoryColor('battery-a','#abcdef'),true);
  assert.equal(graph.setBankHistoryColor('#123456'),true);
  assert.equal(graph.state.batteries[0].historyCurrentColor,'#abcdef');
  assert.equal(graph.state.bankHistoryColor,'#123456');
  graph.afterRender(root);
  assert.match(legend.innerHTML,/#abcdef/,'the battery current curve uses its selected color');
  const bankGraph=setup(()=>now,[{time:now-600_000,soc:50,current:5,storedAh:.05},{time:now-300_000,soc:51,current:5,storedAh:.05}]);
  bankGraph.setBankHistoryColor('#123456');
  legend.innerHTML='';bankGraph.afterRender(root);
  assert.match(legend.innerHTML,/#123456/,'the bank current curve uses its selected color');
  const appSource=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
  assert.match(appSource,/data-bank-history-color/,'the bank current color is configurable');
  assert.match(appSource,/data-battery-history-color/,'each battery current color is configurable');

  const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const addStart=app.indexOf("bluetoothScanner.addEventListener('click',async");
  const addEnd=app.indexOf('});\n[menu,add,moduleMenu]',addStart);
  assert.ok(addEnd>addStart,'scanner listener ends before the remaining menu listeners are bound');
  const addFlow=app.slice(addStart,addEnd);
  const addCompletion=addFlow.slice(addFlow.indexOf('const added=selected.filter'));
  assert.match(addFlow,/Podés seleccionar más o volver atrás/,'scanner remains open after adding a batch');
  assert.doesNotMatch(addCompletion,/closeSheet\(bluetoothScanner\)|stopBluetoothScanner/,'successful add does not close or stop scanning');
  assert.match(addFlow,/catch\{failed\.push\(device\)\}/,'a failed device add does not lock the scanner');
  console.log('Battery current correction, 99% Ah integration, centered Ah curves, selectable series colors and batch scanner: passed');
}finally{
  Date.now=originalNow;
}

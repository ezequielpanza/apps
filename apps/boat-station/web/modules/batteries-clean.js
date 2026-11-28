import {estimatedRows} from '../battery-history-estimates.mjs';
import {estimatedSoc,profiles} from '../charge-calculation.mjs';
const CURRENT_KEY='bs.batteries.current.v1',HISTORY_KEY='bs.batteries.history.v1',LEGACY_KEY='bs.batteries.state',ZOOM_KEY='bs.batteries.historyZoom.v3',OLD_ZOOM_KEY='bs.batteries.historyZoom.v2',VISIBILITY_KEY='bs.batteries.historyVisibility.v1',COLORS_KEY='bs.batteries.historyColors.v1',AVERAGE_BARS_KEY='bs.batteries.currentAverageBars.v1',SOC_CURVE_KEY='bs.batteries.historySocCurve.v1',BANK_AH_ADJUST_KEY='bs.batteries.historyBankAhAdjustment.v1',FACTOR_CURVE_KEY='bs.batteries.historyFactorCurve.v1',VOLTAGE_ESTIMATE_FACTOR_KEY='bs.batteries.historyVoltageEstimateFactor.v1';
const DEFAULT_SOC_CURVE=[{voltage:10,soc:0},{voltage:12,soc:5},{voltage:12.8,soc:10},{voltage:13,soc:20},{voltage:13.12,soc:40},{voltage:13.2,soc:60},{voltage:13.28,soc:80},{voltage:13.4,soc:90},{voltage:13.6,soc:100}];
const SAMPLE_MS=30000,SAVE_MS=2000,MAX_AGE=840*86400000,BARS=30,MAX_AH_GAP_MS=120000,CHARGE_EFFICIENCY=.99;
const CORRECTION_WINDOW_MIN_MS=5000,CORRECTION_WINDOW_MAX_MS=12000;
const ZOOMS=[['1 min',60000],['5 min',5*60000],['10 min',10*60000],['15 min',15*60000],['30 min',30*60000],['1 h',3600000],['3 h',3*3600000],['6 h',6*3600000],['12 h',12*3600000],['1 día',86400000],['7 días',7*86400000],['28 días',28*86400000]];
export const CURRENT_HISTORY_SCALE_AMPS=40;
const CURRENT_FILL_TRANSPARENCY_KEY='bs.batteries.currentFillTransparency.v1';
const CURRENT_LINE_COLORS=['#20d7e5','#ffc857','#c5a1ff','#ff8294','#65dda5','#ff9d54','#76a9ff'];
const num=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const validColor=(value,fallback='')=>/^#[0-9a-f]{6}$/i.test(String(value??''))?String(value):fallback;
const read=(k,f)=>{try{const v=JSON.parse(localStorage.getItem(k)||'null');return v??f}catch{return f}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
const clone=v=>{try{return JSON.parse(JSON.stringify(v))}catch{return v}};

function stripLegacyVoltageCorrection(value){if(!value||typeof value!=='object')return false;let changed=false;if(Object.prototype.hasOwnProperty.call(value,'voltageCorrectionPoints')){delete value.voltageCorrectionPoints;changed=true}for(const item of Object.values(value))if(stripLegacyVoltageCorrection(item))changed=true;return changed}
function purgeLegacyVoltageCorrection(){for(const key of [CURRENT_KEY,LEGACY_KEY,HISTORY_KEY])try{const raw=localStorage.getItem(key);if(!raw||!raw.includes('"voltageCorrectionPoints"'))continue;const value=JSON.parse(raw);if(stripLegacyVoltageCorrection(value))write(key,value)}catch{}}

function migrate(){if(read(CURRENT_KEY,null))return;const old=read(LEGACY_KEY,null);if(!old||typeof old!=='object')return;write(CURRENT_KEY,{bankName:old.bankName||'Banco principal',batteries:Array.isArray(old.batteries)?old.batteries:[]});if(Array.isArray(old.history)&&old.history.length)write(HISTORY_KEY,old.history)}

export function drawCurrentArea(c,bars,{width,plotH,slot,currentScale,transparency}){
  if(transparency>=100)return;
  const zeroY=plotH/2;
      c.save();c.beginPath();c.rect(0,0,width,plotH);c.clip();c.globalAlpha=(100-transparency)/100;
      let previous=null;
      const fillSegment=(a,b,color)=>{c.beginPath();c.moveTo(a.x,zeroY);c.lineTo(a.x,a.y);c.lineTo(b.x,b.y);c.lineTo(b.x,zeroY);c.closePath();c.fillStyle=color;c.fill()};
      bars.forEach((bar,index)=>{const value=bar.currents.find(item=>item.id==='bank')?.value;if(!Number.isFinite(value)){previous=null;return}const point={x:(index+.5)*slot,y:Math.max(2,Math.min(plotH-2,zeroY-value/currentScale*zeroY)),value};
        if(previous){if(previous.value*value<0){const ratio=Math.abs(previous.value)/(Math.abs(previous.value)+Math.abs(value)),cross={x:previous.x+(point.x-previous.x)*ratio,y:zeroY};fillSegment(previous,cross,previous.value>0?'#26c768':'#ef4f59');fillSegment(cross,point,value>0?'#26c768':'#ef4f59')}else fillSegment(previous,point,(previous.value||value)>=0?'#26c768':'#ef4f59')}previous=point});c.restore()
}

export function createBatteriesModule(requestRender,openManager){
  migrate();
  const localSaved=read(CURRENT_KEY,{}),isClient=()=>window.BoatStationRuntime?.isClient?.()===true;
  function readNativeBatteryConfig(){if(isClient())return null;try{const raw=window.StorageBridge?.getBatteryConfigSnapshot?.();if(!raw)return null;const data=JSON.parse(raw);if(data&&data.version===1&&Number.isFinite(data.revision)&&Array.isArray(data.batteries)&&data.batteries.every(b=>b&&typeof b==='object'&&b.id!==undefined))return data}catch(error){console.warn('Boat Station: no se pudo leer el respaldo de configuración',error)}return null}
  const nativeSaved=readNativeBatteryConfig();
  function mergeSavedBatteryConfig(local,native){if(!native||native.revision<=Number(local?._configRevision||0))return local||{};const previous=new Map((Array.isArray(local?.batteries)?local.batteries:[]).map(b=>[String(b.id),b]));return {...(local||{}),bankName:native.bankName,bankHistoryColor:native.bankHistoryColor,_configRevision:native.revision,batteries:native.batteries.map(b=>({...previous.get(String(b.id)),...b}))}}
  const saved=mergeSavedBatteryConfig(localSaved,nativeSaved),state={bankName:String(saved.bankName||'Banco principal'),bankHistoryColor:validColor(saved.bankHistoryColor,'#20d7e5'),batteries:Array.isArray(saved.batteries)?saved.batteries:[],history:Array.isArray(read(HISTORY_KEY,[]))?read(HISTORY_KEY,[]):[],remoteAuthoritative:false,remoteStats:null,root:null,lastSample:0};
  let currentFillTransparency=Math.max(0,Math.min(100,num(read(CURRENT_FILL_TRANSPARENCY_KEY,50))??50));
  let solarState=String(window.BoatStationSolarStatus?.state||'unknown');
  window.addEventListener('boatstation-solar-status',event=>{const next=String(event.detail?.state||'unknown');if(next===solarState)return;solarState=next;requestRender('batteries')});
  let historyColors=read(COLORS_KEY,{});if(!historyColors||typeof historyColors!=='object'||Array.isArray(historyColors))historyColors={};
  function loadHistoryVisibility(){try{const raw=window.StorageBridge?.getHistoryVisibility?.();if(raw){const value=JSON.parse(raw);if(value&&typeof value==='object'&&!Array.isArray(value))return value}}catch(error){console.warn('Boat Station: no se pudieron leer las preferencias nativas',error)}const value=read(VISIBILITY_KEY,{});return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
  let hiddenSeries=loadHistoryVisibility(),visibilityStorageWarning=false;
  function saveHistoryVisibility(){const data=JSON.stringify(hiddenSeries);let saved=false;try{if(typeof window.StorageBridge?.setHistoryVisibility==='function')saved=window.StorageBridge.setHistoryVisibility(data)===true}catch(error){console.warn('Boat Station: no se pudieron guardar las preferencias nativas',error)}try{localStorage.setItem(VISIBILITY_KEY,data);saved=true}catch(error){console.warn('Boat Station: no se pudieron guardar las preferencias web',error)}if(!saved&&!visibilityStorageWarning){visibilityStorageWarning=true;window.alert('No se pudieron guardar los indicadores del histórico en este dispositivo.')}return saved}
  const SOC_TRIAL_KEY='bs.batteries.historySocTrialCurve.v1';
  function validSocTrial(value){return value&&value.version===1&&Array.isArray(value.points)&&normalizeSocCurve(value.points).length>=2}
  function loadSocTrial(){let native=null;try{const raw=window.StorageBridge?.getSocTrialCurve?.();if(raw){const value=JSON.parse(raw);if(validSocTrial(value))native=value}}catch(error){console.warn('Boat Station: no se pudo leer la curva SOC nativa',error)}const web=read(SOC_TRIAL_KEY,null),local=validSocTrial(web)?web:null;return native&&(!local||(Number(native.revision)||0)>=(Number(local.revision)||0))?native:local}
  const savedSocTrial=loadSocTrial();let socTrialWarning=false,socTrialRevision=Number(savedSocTrial?.revision)||0;
  function saveSocTrial(){socTrialRevision=Math.max(Date.now(),socTrialRevision+1);const data=JSON.stringify({version:1,revision:socTrialRevision,points:socCurvePoints,preset:socCurvePreset,cells:socCurveCells});let saved=false;try{if(typeof window.StorageBridge?.setSocTrialCurve==='function')saved=window.StorageBridge.setSocTrialCurve(data)===true}catch(error){console.warn('Boat Station: no se pudo guardar la curva SOC nativa',error)}try{localStorage.setItem(SOC_TRIAL_KEY,data);saved=true}catch(error){console.warn('Boat Station: no se pudo guardar la curva SOC web',error)}if(!saved&&!socTrialWarning){socTrialWarning=true;window.alert('No se pudo guardar la curva de cálculo de SOC en este dispositivo.')}return saved}
  const oldZoomIndices=[1,3,5,6,7,8,9,10,11],oldZoom=Math.max(0,Math.min(oldZoomIndices.length-1,Number(read(OLD_ZOOM_KEY,0))||0)),storedZoom=read(ZOOM_KEY,null);
  let saveTimer=0,historyDirty=false,zoom=storedZoom===null?oldZoomIndices[oldZoom]:Math.max(0,Math.min(ZOOMS.length-1,Number(storedZoom)||0)),drawPending=false,historyResizeObserver=null,historyObservedChart=null,historyOffset=0,historyActivePointers=new Set(),historyControlPointers=new Set(),historyControlProtectionBound=false,historyCurrentAverageBars=Math.max(1,Math.min(BARS,Math.round(Number(read(AVERAGE_BARS_KEY,3))||3))),voltageEstimateFactor=Math.round((num(read('bs.batteries.historyConstantFactor.v1',0.0006))??0.0006)*100000)/100000,socCurvePoints=normalizeSocCurve(savedSocTrial?.points??read(SOC_CURVE_KEY,DEFAULT_SOC_CURVE));
  const batteryTransientFields=new Set(['connected','voltage','current','power','soc','soh','remainingAh','totalAh','cycles','temperature','temperatures','cellVoltages','cellVoltage','cellVoltageMin','cellVoltageMax','lastSeen','lastSeenAt','rssi','alarms','flags','time','lastDataTime','historyCurrent','historyCurrentAt','historyAh','lastKnownCharge']);
  function batteryConfigSnapshot(){return{bankName:state.bankName,bankHistoryColor:state.bankHistoryColor,batteries:state.batteries.map(b=>{const config={};for(const [key,value] of Object.entries(b)){if(batteryTransientFields.has(key))continue;if(key==='currentCorrection'&&value&&typeof value==='object'){const copy={...value};delete copy.lastSample;config[key]=copy}else config[key]=value}return config})}}
  let configRevision=Number(saved._configRevision)||0,lastConfigSignature=JSON.stringify(batteryConfigSnapshot()),nativeConfigSignature=nativeSaved?JSON.stringify({bankName:nativeSaved.bankName,bankHistoryColor:nativeSaved.bankHistoryColor,batteries:nativeSaved.batteries}):null,batterySaveWarning=false;
  const saveCurrent=(immediate=false)=>{const save=()=>{saveTimer=0;const client=isClient()||state.remoteAuthoritative,config=batteryConfigSnapshot(),signature=JSON.stringify(config),changed=signature!==lastConfigSignature,nextRevision=changed?Math.max(Date.now(),configRevision+1):configRevision;let nativeOk=false,webOk=false;
    if(!client&&typeof window.StorageBridge?.setBatteryConfigSnapshot==='function'){if(signature===nativeConfigSignature)nativeOk=true;else try{nativeOk=window.StorageBridge.setBatteryConfigSnapshot(JSON.stringify({version:1,revision:nextRevision,...config}))===true;if(nativeOk)nativeConfigSignature=signature}catch(error){console.warn('Boat Station: no se pudo guardar el respaldo de batería',error)}}
    try{localStorage.setItem(CURRENT_KEY,JSON.stringify({bankName:state.bankName,bankHistoryColor:state.bankHistoryColor,batteries:state.batteries,_configRevision:nextRevision}));webOk=true}catch(error){console.warn('Boat Station: no se pudo guardar la configuración web de batería',error)}
    const savedOk=nativeOk||webOk;if(savedOk){configRevision=nextRevision;lastConfigSignature=signature;batterySaveWarning=false}else if(!batterySaveWarning){batterySaveWarning=true;window.alert?.('No se pudo guardar la configuración de las baterías en este dispositivo.')}return savedOk};
    if(immediate){clearTimeout(saveTimer);saveTimer=0;return save()}if(!saveTimer)saveTimer=setTimeout(save,SAVE_MS);return true};
  if(!isClient()&&state.batteries.length&&!nativeSaved)saveCurrent(true);
  function integrateCurrentPair(before,after,elapsedMs){
    if(!Number.isFinite(before)||!Number.isFinite(after)||elapsedMs<=0||elapsedMs>MAX_AH_GAP_MS)return null;
    const hours=elapsedMs/3600000;let chargeAh=0,dischargeAh=0;
    if(before>=0&&after>=0)chargeAh=(before+after)*.5*hours;
    else if(before<=0&&after<=0)dischargeAh=-(before+after)*.5*hours;
    else if(before>0){const fraction=before/(before-after);chargeAh=.5*before*hours*fraction;dischargeAh=.5*-after*hours*(1-fraction)}
    else{const fraction=-before/(after-before);dischargeAh=.5*-before*hours*fraction;chargeAh=.5*after*hours*(1-fraction)}
    return{chargeAh,dischargeAh,storedAh:chargeAh*CHARGE_EFFICIENCY-dischargeAh};
  }
  function ensureHistoryAh(points=state.history){
    const ordered=points.slice().sort((a,b)=>Number(a.time)-Number(b.time));
    for(let i=1;i<ordered.length;i++){
      const before=ordered[i-1],after=ordered[i],dt=Number(after.time)-Number(before.time);if(dt<=0||dt>MAX_AH_GAP_MS)continue;
      if(num(after.storedAh)===null){const integrated=integrateCurrentPair(num(before.currentLast??before.current),num(after.currentLast??after.current),dt);if(integrated)Object.assign(after,integrated)}
      const previous=new Map((before.batteries||[]).map(p=>[String(p.id||p.name||'battery'),p]));
      for(const part of after.batteries||[]){if(num(part.storedAh)!==null)continue;const prior=previous.get(String(part.id||part.name||'battery')),integrated=prior&&integrateCurrentPair(num(prior.currentLast??prior.current),num(part.currentLast??part.current),dt);if(integrated)Object.assign(part,integrated)}
    }
  }
  function compactHistory(){
    const now=Date.now(),bins=new Map();ensureHistoryAh();
    for(const p of state.history.filter(p=>Number(p?.time)>=now-MAX_AGE&&(num(p?.soc)!==null||num(p?.current)!==null))){
      const age=now-Number(p.time),unit=age>365*86400000?7*86400000:age>90*86400000?86400000:age>30*86400000?21600000:age>7*86400000?7200000:age>48*3600000?1800000:age>6*3600000?300000:30000,key=Math.floor(Number(p.time)/unit)*unit+'|'+(p.estimated?String(p.estimateBatchId||'estimated'):'measured');
      let b=bins.get(key);if(!b){b={time:Number(p.time),lastSampleTime:-Infinity,soc:0,socN:0,current:0,currentN:0,currentLast:null,voltage:0,voltageN:0,chargeAh:0,dischargeAh:0,storedAh:0,ahN:0,parts:new Map()};bins.set(key,b)}
      const soc=num(p.soc),c=num(p.current),v=num(p.voltage),charge=num(p.chargeAh),discharge=num(p.dischargeAh),stored=num(p.storedAh);
      if(soc!==null){b.soc+=soc;b.socN++}if(c!==null){b.current+=c;b.currentN++;if(Number(p.time)>=b.lastSampleTime){b.currentLast=num(p.currentLast??p.current);b.lastSampleTime=Number(p.time)}}if(v!==null){b.voltage+=v;b.voltageN++}
      if(charge!==null&&discharge!==null&&stored!==null){b.chargeAh+=charge;b.dischargeAh+=discharge;b.storedAh+=stored;b.ahN++}
      b.time=Math.max(b.time,Number(p.time));if(p.estimated){b.estimated=true;b.estimateBatchId=p.estimateBatchId;b.estimateDescription=p.estimateDescription}
      for(const part of p.batteries||[]){const id=String(part.id||part.name||'battery'),entry=b.parts.get(id)||{id,name:String(part.name||'Batería'),contribution:0,contributionN:0,current:0,currentN:0,currentLast:null,lastSampleTime:-Infinity,voltage:0,voltageN:0,chargeAh:0,dischargeAh:0,storedAh:0,ahN:0};const contribution=num(part.contribution),current=num(part.current),partVoltage=num(part.voltage),partCharge=num(part.chargeAh),partDischarge=num(part.dischargeAh),partStored=num(part.storedAh);if(contribution!==null){entry.contribution+=contribution;entry.contributionN++}if(current!==null){entry.current+=current;entry.currentN++;if(Number(p.time)>=entry.lastSampleTime){entry.currentLast=num(part.currentLast??part.current);entry.lastSampleTime=Number(p.time)}}if(partVoltage!==null){entry.voltage+=partVoltage;entry.voltageN++}if(partCharge!==null&&partDischarge!==null&&partStored!==null){entry.chargeAh+=partCharge;entry.dischargeAh+=partDischarge;entry.storedAh+=partStored;entry.ahN++}entry.name=String(part.name||entry.name);b.parts.set(id,entry)}
    }
    state.history=[...bins.values()].map(b=>({time:b.time,...(b.estimated?{estimated:true,estimateBatchId:b.estimateBatchId,estimateDescription:b.estimateDescription}:{}),soc:b.socN?b.soc/b.socN:null,current:b.currentN?b.current/b.currentN:null,currentLast:b.currentLast,voltage:b.voltageN?b.voltage/b.voltageN:null,...(b.ahN?{chargeAh:b.chargeAh,dischargeAh:b.dischargeAh,storedAh:b.storedAh}:{}),batteries:[...b.parts.values()].map(x=>({id:x.id,name:x.name,...(x.contributionN?{contribution:x.contribution/x.contributionN}:{}),current:x.currentN?x.current/x.currentN:null,currentLast:x.currentLast,voltage:x.voltageN?x.voltage/x.voltageN:null,...(x.ahN?{chargeAh:x.chargeAh,dischargeAh:x.dischargeAh,storedAh:x.storedAh}:{})}))})).sort((a,b)=>a.time-b.time);
  }
  function saveHistory(){if(!historyDirty)return;historyDirty=false;compactHistory();write(HISTORY_KEY,state.history)}
  window.addEventListener('pagehide',()=>{saveCurrent(true);saveHistory()});
  function correctedVoltage(b){const voltage=num(b.voltage),current=num(b.current),correction=b.currentCorrection;if(voltage===null)return null;if(!correction||Number(correction.samples)<3||current===null)return voltage;const resistance=num(correction.resistanceOhm);if(resistance===null||resistance<=0)return voltage;const offset=Math.max(-.4,Math.min(.4,resistance*current));return voltage-offset}
  function accumulateCurrent(b,current,now){
    const previous=num(b.historyCurrent),previousAt=num(b.historyCurrentAt);
    if(current!==null&&b.connected!==false&&previous!==null&&previousAt!==null){
      const integrated=integrateCurrentPair(previous,current,now-previousAt);
      if(integrated){const ah=b.historyAh&&typeof b.historyAh==='object'?b.historyAh:{chargeAh:0,dischargeAh:0,storedAh:0,coveredMs:0};ah.chargeAh+=integrated.chargeAh;ah.dischargeAh+=integrated.dischargeAh;ah.storedAh+=integrated.storedAh;ah.coveredMs+=now-previousAt;b.historyAh=ah}
    }
    b.historyCurrent=current!==null&&b.connected!==false?current:null;
    b.historyCurrentAt=now;
  }
  function learnVoltageCorrection(b,now){
    const current=num(b.current),voltage=num(b.voltage);if(current===null||voltage===null||b.connected===false)return;
    const correction=b.currentCorrection&&typeof b.currentCorrection==='object'?b.currentCorrection:{resistanceOhm:0,samples:0,lastSample:null},last=correction.lastSample;
    if(!last||!Number.isFinite(Number(last.time))){correction.lastSample={time:now,current,voltage,soc:num(b.soc)};b.currentCorrection=correction;return}
    const elapsed=now-Number(last.time);if(elapsed<CORRECTION_WINDOW_MIN_MS)return;
    if(elapsed<=CORRECTION_WINDOW_MAX_MS){
      const oldCurrent=num(last.current),oldVoltage=num(last.voltage),oldSoc=num(last.soc),soc=num(b.soc),deltaCurrent=current-oldCurrent,deltaVoltage=voltage-oldVoltage,socStable=oldSoc===null||soc===null||Math.abs(soc-oldSoc)<=1;
      if(oldCurrent!==null&&oldVoltage!==null&&socStable&&Math.abs(deltaCurrent)>=2&&Math.abs(deltaVoltage)>=.003&&deltaCurrent*deltaVoltage>0){
        const estimate=deltaVoltage/deltaCurrent;if(Number.isFinite(estimate)&&estimate>=.00005&&estimate<=.05){const count=Math.max(0,Number(correction.samples)||0),prior=num(correction.resistanceOhm);correction.resistanceOhm=count&&prior!==null?prior*.8+estimate*.2:estimate;correction.samples=count+1}
      }
    }
    correction.lastSample={time:now,current,voltage,soc:num(b.soc)};b.currentCorrection=correction;
  }
  function validVoltageCalibrationPoints(points){if(!Array.isArray(points))return false;const keys=new Set();for(const p of points){if(!Array.isArray(p)||p.length!==3||!p.every(v=>typeof v==='number'&&Number.isFinite(v))||p[1]<=0||p[2]<=0||(p[0]===0&&Math.abs(p[1]-p[2])>1e-9))return false;const key=JSON.stringify([p[0],p[1]]);if(keys.has(key))return false;keys.add(key)}return true}
  function estimatedVoltage(b){
    const voltage=num(b.voltage),current=num(b.current);if(b.connected===false||voltage===null||current===null)return null;if(current===0)return voltage;
    if(!Array.isArray(b.voltageCalibrationPoints))return null;
    const points=b.voltageCalibrationPoints;if(!validVoltageCalibrationPoints(points))return null;
    const byVoltage=new Map();for(const [amps,observed,estimated] of points){if(amps===0||Math.sign(amps)!==Math.sign(current))continue;const group=byVoltage.get(observed)||[];group.push([amps,estimated-observed]);byVoltage.set(observed,group)}
    if(!byVoltage.size)return null;const levels=[...byVoltage.entries()].sort((x,y)=>x[0]-y[0]).map(([observed,group])=>{group.push([0,0]);group.sort((x,y)=>x[0]-y[0]);let correction;if(current<=group[0][0])correction=group[0][1];else if(current>=group[group.length-1][0])correction=group[group.length-1][1];else{let i=1;while(current>group[i][0])i++;const left=group[i-1],right=group[i],t=(current-left[0])/(right[0]-left[0]);correction=left[1]+t*(right[1]-left[1])}return [observed,correction]});
    let correction;if(voltage<=levels[0][0])correction=levels[0][1];else if(voltage>=levels[levels.length-1][0])correction=levels[levels.length-1][1];else{let i=1;while(voltage>levels[i][0])i++;const left=levels[i-1],right=levels[i],t=(voltage-left[0])/(right[0]-left[0]);correction=left[1]+t*(right[1]-left[1])}return voltage+correction
  }
  function setVoltageCalibrationPoints(id,points){if(!validVoltageCalibrationPoints(points))return false;if(state.remoteAuthoritative){const send=window.BoatStationRemoteCommand?.send;if(typeof send!=='function')return Promise.resolve(false);const target=JSON.stringify(points),batteryId=String(id);return Promise.resolve(send('battery.edit',{id:batteryId,voltageCalibrationPoints:clone(points)})).then(ok=>{if(!ok)return false;return new Promise(resolve=>{const started=Date.now(),check=()=>{const battery=state.batteries.find(x=>String(x.id)===batteryId);if(battery&&Array.isArray(battery.voltageCalibrationPoints)&&JSON.stringify(battery.voltageCalibrationPoints)===target){resolve(true);return}if(Date.now()-started>=25000){resolve(false);return}setTimeout(check,250)};check()})}).catch(()=>false)}const b=state.batteries.find(x=>String(x.id)===String(id));if(!b)return false;const previous=b.voltageCalibrationPoints;b.voltageCalibrationPoints=clone(points);if(!saveCurrent(true)){if(previous===undefined)delete b.voltageCalibrationPoints;else b.voltageCalibrationPoints=previous;return false}requestRender('batteries');return true}
  const voltageAutoWindows=new Map();
  function autoLog(auto,time,message){auto.log=Array.isArray(auto.log)?auto.log:[];auto.log.push({time,message});if(auto.log.length>160)auto.log.splice(0,auto.log.length-160)}
  function setVoltageAutoCalibration(id,active,requestId=null){
    id=String(id);active=!!active;const actionId=String(requestId||('vauto-'+Date.now()+'-'+Math.random().toString(36).slice(2)));
    if(state.remoteAuthoritative){const send=window.BoatStationRemoteCommand?.send;if(typeof send!=='function')return Promise.resolve(false);return Promise.resolve(send('battery.edit',{id,voltageAutoAction:{active,actionId}})).then(ok=>{if(!ok)return false;return new Promise(resolve=>{const start=Date.now(),check=()=>{const b=state.batteries.find(x=>String(x.id)===id);if(b?.voltageAuto?.actionId===actionId){resolve(true);return}if(Date.now()-start>=25000){resolve(false);return}setTimeout(check,250)};check()})}).catch(()=>false)}
    const b=state.batteries.find(x=>String(x.id)===id);if(!b)return false;const auto=b.voltageAuto&&typeof b.voltageAuto==='object'?b.voltageAuto:{log:[],generated:[]};auto.active=active;auto.actionId=actionId;auto.generated=Array.isArray(auto.generated)?auto.generated:[];autoLog(auto,Date.now(),active?'Autocalibración iniciada. Esperando cambios de corriente.':'Autocalibración detenida.');b.voltageAuto=auto;voltageAutoWindows.delete(id);saveCurrent(true);requestRender('batteries');return true
  }
  function observeVoltageAuto(b,data,now){
    const auto=b.voltageAuto;if(!auto?.active||state.remoteAuthoritative||b.connected===false)return;const current=num(data.current),voltage=num(data.voltage);if(current===null||voltage===null||voltage<=0)return;
    const id=String(b.id),record=voltageAutoWindows.get(id)||{samples:[],lastAccepted:0,lastReject:0};let samples=record.samples;if(samples.length&&now-samples[samples.length-1].time>15000)samples=[];if(samples.length&&now-samples[samples.length-1].time<800)return;samples.push({time:now,current,voltage,soc:num(b.soc)});samples=samples.filter(s=>now-s.time<=45000).slice(-8);record.samples=samples;voltageAutoWindows.set(id,record);
    if(now-record.lastAccepted<30000||samples.length<3)return;
    const distinct=new Set(samples.map(s=>Math.round(s.current*10)));if(distinct.size<3)return;
    const minI=Math.min(...samples.map(s=>s.current)),maxI=Math.max(...samples.map(s=>s.current)),range=maxI-minI,socs=samples.map(s=>s.soc).filter(s=>s!==null);
    if(range<3||(socs.length>1&&Math.max(...socs)-Math.min(...socs)>1)||(minI>0&&minI>range)||(maxI<0&&-maxI>range))return;
    const meanI=samples.reduce((s,x)=>s+x.current,0)/samples.length,meanV=samples.reduce((s,x)=>s+x.voltage,0)/samples.length,den=samples.reduce((s,x)=>s+(x.current-meanI)**2,0);if(!den)return;
    const slope=samples.reduce((s,x)=>s+(x.current-meanI)*(x.voltage-meanV),0)/den,zero=meanV-slope*meanI,residual=Math.max(...samples.map(x=>Math.abs(x.voltage-(zero+slope*x.current))));
    if(!Number.isFinite(zero)||zero<=0||slope<.00005||slope>.05||residual>.015||Math.abs(slope*range)<.005){if(now-record.lastReject>=30000){autoLog(auto,now,'Cambio descartado: las mediciones no fueron suficientemente consistentes.');record.lastReject=now;saveCurrent();requestRender('batteries')}return}
    const table=Array.isArray(b.voltageCalibrationPoints)?b.voltageCalibrationPoints.slice():[],key=p=>JSON.stringify(p),generated=(Array.isArray(auto.generated)?auto.generated:[]).filter(g=>Array.isArray(g?.point)&&table.some(p=>key(p)===key(g.point))),quality=Math.min(range,50)/(1+residual*1000),round=(n,d)=>Number(n.toFixed(d)),changes=[];
    for(const sample of samples){const point=[round(sample.current,2),round(sample.voltage,3),round(zero,3)];if(point[0]===0||point[1]<=0||point[2]<=0||table.some(p=>p[0]===point[0]&&p[1]===point[1]))continue;const cell=(point[0]>0?'+':'-')+Math.floor(Math.abs(point[0])/5)+':'+Math.floor(point[1]*10);let victim=generated.find(x=>x.cell===cell);
      if(victim&&victim.quality>=quality)continue;if(!victim&&generated.length>=50){victim=generated.reduce((x,y)=>x.quality<=y.quality?x:y);if(victim.quality>=quality)continue}
      if(victim){const idx=table.findIndex(p=>key(p)===key(victim.point));if(idx<0)continue;table.splice(idx,1);generated.splice(generated.indexOf(victim),1)}
      table.push(point);generated.push({point,cell,quality});changes.push({point,replaced:!!victim})
    }
    if(!changes.length){record.lastAccepted=now;record.samples=[];return}
    table.sort((x,y)=>x[0]-y[0]||x[1]-y[1]);if(!validVoltageCalibrationPoints(table))return;b.voltageCalibrationPoints=table;auto.generated=generated;
    samples.forEach((s,i)=>autoLog(auto,s.time,'Lectura '+(i+1)+': '+(s.current>=0?'+':'')+s.current.toFixed(2)+' A · '+s.voltage.toFixed(3)+' V'));
    autoLog(auto,now,'Voltaje estimado a 0 A: '+zero.toFixed(3)+' V.');for(const entry of changes){const p=entry.point;autoLog(auto,now,(entry.replaced?'Punto automático actualizado: ':'Entrada agregada: ')+(p[0]>=0?'+':'')+p[0].toFixed(2)+' A · '+p[1].toFixed(3)+' V · '+p[2].toFixed(3)+' V')}
    record.lastAccepted=now;record.samples=[];saveCurrent(true);requestRender('batteries')
  }
  function batteryVe(b){const v=num(b.voltage),i=num(b.current),f=num(b.chargeCalculation?.veFactor)??0;if(b.connected===false||v===null||(i===null&&f!==0))return null;return v-(i??0)*f}
  function charge(b){if(b.connected===false&&b.lastKnownCharge){return {soc:num(b.lastKnownCharge.soc),rem:num(b.lastKnownCharge.rem)}}if(!b.chargeCalculation||b.chargeCalculation.mode==='bms')return {soc:num(b.soc),rem:num(b.remainingAh)};const soc=estimatedSoc({...b,voltage:batteryVe(b)}),cap=num(b.capacityAh);return {soc,rem:soc!==null&&cap!==null?soc*cap/100:null}}
  function rememberCharge(b,now){const value=charge(b);if(value.soc!==null||value.rem!==null)b.lastKnownCharge={...value,time:now}}
  function stats(){let cap=0,rem=0,currentSum=0,currentN=0,vs=0,vn=0,connected=0,missing=false;for(const b of state.batteries){const c=num(b.capacityAh)||0,s=charge(b).soc,r=charge(b).rem,online=b.connected!==false,a=online?num(b.current):null,v=online?num(b.voltage):null;cap+=c;if(c>0&&r===null&&s===null)missing=true;rem+=r!==null?r:(s!==null?s*c/100:0);if(a!==null){currentSum+=a;currentN++}if(v!==null){vs+=v;vn++}if(online)connected++}const voltage=vn?vs/vn:null,current=currentN?currentSum:null,soc=cap&&!missing?Math.max(0,Math.min(100,rem/cap*100)):null;return{cap,rem:missing?null:rem,current,voltage,soc,power:voltage===null||current===null?null:voltage*current,connected,total:state.batteries.length}}
  const SOC_SOURCE_KEY='bs.batteries.indicatorSocSource.v1';
  let indicatorSocSource=read(SOC_SOURCE_KEY,'soce');if(!['soce','socc','socb'].includes(indicatorSocSource))indicatorSocSource='soce';
  function getIndicatorSocSource(){return indicatorSocSource}
  function setIndicatorSocSource(value){if(!['soce','socc','socb'].includes(value))return false;indicatorSocSource=value;write(SOC_SOURCE_KEY,value);requestRender('batteries');return true}
  function indicatorStats(){
    const base=stats();if(indicatorSocSource==='soce')return base;
    if(indicatorSocSource==='socb'){let ah=0;for(const b of state.batteries){const cap=num(b.capacityAh),soc=num(b.soc);if(b.connected===false||cap===null||cap<=0||soc===null||soc<0||soc>100)return {...base,soc:null,rem:null};ah+=cap*soc/100}if(!state.batteries.length||base.cap<=0)return {...base,soc:null,rem:null};return {...base,soc:100*ah/base.cap,rem:ah}}
    const anchor=1795342459141,ordered=state.history.filter(p=>Number.isFinite(Number(p.time))).slice().sort((a,b)=>Number(a.time)-Number(b.time));
    if(!isChezReference()||base.cap<=0||!ordered.length||Number(ordered[0].time)>anchor)return {...base,soc:null,rem:null};
    let ah=0,count=0;for(const p of ordered){if(Number(p.time)<=anchor)continue;const charge=num(p.chargeAh),discharge=num(p.dischargeAh);if(charge===null||discharge===null)continue;ah+=charge-discharge;count++}
    if(!count)return {...base,soc:null,rem:null};
    return {...base,soc:Math.max(0,Math.min(100,100*ah/base.cap)),rem:Math.max(0,Math.min(base.cap,ah))};
  }
  function autonomyLabel(s){if(s.connected<s.total)return '—';const drain=Number(s.current);if(!Number.isFinite(drain)||drain>=-0.05||!Number.isFinite(s.rem)||s.rem<=0)return '—';const hours=s.rem/Math.abs(drain);if(hours>=48)return `${(hours/24).toFixed(hours>=240?0:1)} días`;return `${Math.max(1,Math.round(hours))} h`}
  function chargeEtaLabel(s){const ready=state.batteries.length>0&&state.batteries.every(b=>{const cap=num(b.capacityAh),hasCharge=charge(b).rem!==null||(charge(b).soc!==null&&cap!==null&&cap>0);return b.connected!==false&&cap!==null&&cap>0&&hasCharge&&num(b.current)!==null});if(!ready||!Number.isFinite(s.current)||s.current<=0.15)return '—';const remaining=Math.max(0,s.cap-s.rem);if(remaining<=0.01)return 'Completa';const hours=remaining/s.current;if(hours<1)return `${Math.max(1,Math.round(hours*60))} min`;if(hours>=48)return `${(hours/24).toFixed(hours>=240?0:1)} días`;const h=Math.floor(hours),m=Math.round((hours-h)*60);return m?`${h} h ${m} min`:`${h} h`}
  const summary=()=>{const s=indicatorStats();return s.soc===null?(s.cap?`${Math.round(s.cap)} Ah`:'Sin datos'):`${Math.round(s.soc)}% · ${Math.round(s.rem)}/${Math.round(s.cap)} Ah`};
  const metric=(v,l)=>`<div class="metric"><div class="value">${v}</div><div class="label">${l}</div></div>`;
  function solarIndicatorMarkup(){
    const labels={unknown:'Sin carga solar detectada',charging:'Paneles solares cargando',cloudy:'Paneles solares sin carga durante el día',daylight:'De día, sin detección de carga solar',night:'Es de noche, paneles solares sin carga'},label=labels[solarState]||labels.unknown;
    let icon;
    if(solarState==='night')icon=`<svg viewBox="0 0 32 32" aria-hidden="true"><path class="solar-moon-shape" d="M23.8 20.1A11 11 0 0 1 11.9 7.2 11.7 11.7 0 1 0 23.8 20.1Z"/><path class="solar-star" d="M23.7 5.8v3.4M22 7.5h3.4M27.1 12.6v2.2M26 13.7h2.2"/></svg>`;
    else if(solarState==='charging')icon=`<svg viewBox="0 0 36 36" aria-hidden="true"><circle class="solar-sun" cx="27" cy="8" r="3.2"/><path class="solar-sun-rays" d="M27 1.5v2M27 12.5v2M20.5 8h2M31.5 8h2M22.4 3.4l1.4 1.4M30.2 11.2l1.4 1.4M31.6 3.4l-1.4 1.4M23.8 11.2l-1.4-1.4"/><path class="solar-panel" d="M4.5 13.5h22l-2.4 13H7zM8.7 16.5h13.6M8 20.5h14.5M12.3 14l-1.3 11M19 14l1.4 11M12 26.5v4M20 26.5v4M10 30.5h12"/><path class="solar-charge-flow" d="m17 17-3 4h3l-1 3 4-5h-3l1-2"/></svg>`;
    else icon=`<svg viewBox="0 0 36 36" aria-hidden="true"><path class="solar-idle-line" d="M6 18h24"/></svg>`;
    return`<span class="battery-solar-indicator ${solarState}" role="img" aria-label="${label}" title="${label}">${icon}</span>`;
  }
  function mini(b,i){
    const batteryName=String(b.name||b.deviceName||`Batería ${i+1}`),name=esc(batteryName),soc=charge(b).soc,voltage=num(b.voltage),estimated=batteryVe(b),amps=num(b.current),capacity=num(b.capacityAh)||0,remaining=charge(b).rem,shown=remaining!==null?remaining:(soc!==null?soc*capacity/100:null),online=b.connected!==false,roundedAmps=amps===null?null:Math.round(amps),currentText=roundedAmps===null?"—":roundedAmps===0?"0 A":(roundedAmps>0?"+":"−")+Math.abs(roundedAmps)+" A",chargeSource=!online?"Último dato":b.chargeCalculation&&b.chargeCalculation.mode!=="bms"?"Estim.":"BMS",chargeLabel=!online?"Última carga registrada":b.chargeCalculation&&b.chargeCalculation.mode!=="bms"?"Carga estimada":"Carga del BMS",estimateTitle=estimated===null?"Voltaje estimado no disponible":"Voltaje estimado "+estimated.toFixed(2)+" V";
    return `<div class="battery-mini ${online?"online":"offline"}"><div class="battery-mini-head"><strong>${name}</strong><span class="battery-mini-link" role="img" aria-label="${online?"Conectada":"Desconectada"}" title="${online?"Conectada":"Desconectada"}">${online?"⌁":"×"}</span></div><div class="battery-mini-body"><div class="battery-mini-ring" style="--soc:${soc??0}" role="meter" aria-label="Estado de carga de ${name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${soc===null?0:Math.round(soc)}" aria-valuetext="${soc===null?"Sin datos":Math.round(soc)+"%"}"><span>${soc===null?"—":Math.round(soc)+"%"}</span></div><div class="battery-mini-right"><div class="battery-mini-top"><div aria-label="Voltaje ${voltage===null?"sin datos":voltage.toFixed(2)+" V"}; estimado ${estimated===null?"sin datos":estimated.toFixed(2)+" V"}" title="${esc(estimateTitle)}"><b>${estimated===null?"—":estimated.toFixed(2)+" V"}</b></div><div aria-label="Corriente"><b>${currentText}</b></div></div><div class="battery-mini-charge" aria-label="${chargeLabel}"><span>${shown===null?"—":`${Math.round(shown)} / ${Math.round(capacity)} Ah`}</span><small>${chargeSource}</small></div></div></div></div>`;
  }
  function batteryDialPoint(radius,degrees){const angle=degrees*Math.PI/180;return[100+radius*Math.sin(angle),100-radius*Math.cos(angle)]}
  function batteryDialArc(radius,startDegrees,endDegrees){const start=batteryDialPoint(radius,startDegrees),end=batteryDialPoint(radius,endDegrees),large=endDegrees-startDegrees>180?1:0;return"M "+start[0].toFixed(2)+" "+start[1].toFixed(2)+" A "+radius+" "+radius+" 0 "+large+" 1 "+end[0].toFixed(2)+" "+end[1].toFixed(2)}
  function batteryMilestones(s,now=Date.now()){
    const current=num(s.current),cap=num(s.cap),remaining=num(s.rem);
    const ready=state.batteries.length>0&&state.batteries.every(b=>b.connected!==false&&num(b.current)!==null&&num(b.capacityAh)>0&&charge(b).rem!==null)&&current!==null&&Math.abs(current)>.05&&cap!==null&&cap>0&&remaining!==null;
    if(!ready)return [];
    const soc=Math.max(0,Math.min(100,remaining/cap*100)),charging=current>0,items=[];
    for(let i=0;i<8;i++){
      const target=i===0?(charging?100:0):i*12.5,delta=target-soc;
      if((charging&&delta<=0)||(!charging&&delta>=0))continue;
      const minutes=Math.round(Math.abs(delta)*cap/100/Math.abs(current)*60);
      if(!Number.isFinite(minutes)||minutes<0)continue;
      const end=new Date(now+minutes*60000),today=new Date(now);
      if(!Number.isFinite(end.getTime()))continue;
      const days=Math.round((Date.UTC(end.getFullYear(),end.getMonth(),end.getDate())-Date.UTC(today.getFullYear(),today.getMonth(),today.getDate()))/86400000);
      const duration=minutes<60?minutes+' min':Math.floor(minutes/60)+' h'+(minutes%60?' '+minutes%60+' min':'');
      const clock=String(end.getHours()).padStart(2,'0')+':'+String(end.getMinutes()).padStart(2,'0')+(days>0?' (+'+days+'d)':'');
      items.push({angle:i*45,target,duration,clock});
    }
    return items
  }
  function batteryMilestonesMarkup(s){
    return batteryMilestones(s).map(item=>{
      const point=batteryDialPoint(118,item.angle),rotation=item.angle>90&&item.angle<270?item.angle+180:item.angle;
      return `<g class="battery-milestone" transform="translate(${point[0].toFixed(2)} ${point[1].toFixed(2)}) rotate(${rotation})"><title>${item.target}%: faltan ${esc(item.duration)}, hora estimada ${esc(item.clock)}</title><text class="battery-milestone-duration" text-anchor="middle" y="-3">${esc(item.duration)}</text><text class="battery-milestone-clock" text-anchor="middle" y="10">${esc(item.clock)}</text></g>`
    }).join('')
  }
  function batteryDial(s){
    const soc=num(s.soc),current=num(s.current),roundedCurrent=current===null?null:Math.round(current),voltageText=s.voltage===null?"—":Number(s.voltage).toFixed(2)+" V",currentText=roundedCurrent===null?"— A":roundedCurrent===0?"0 A":(roundedCurrent>0?"+":"−")+Math.abs(roundedCurrent)+" A",powerText=s.power===null?"—":Math.round(s.power)+" W",segments=[];
    for(let i=0;i<20;i++){const start=i*18+1.5,span=15,portion=soc===null?0:Math.max(0,Math.min(1,(soc-i*5)/5));segments.push(`<path class="battery-dial-soc-track" d="${batteryDialArc(93,start,start+span)}"/>`);if(portion>0)segments.push(`<path class="battery-dial-soc-fill" d="${batteryDialArc(93,start,start+span*portion)}"/>`)}
    const ticks=[];
    for(let amps=-40;amps<=40;amps+=5){const angle=amps/40*145,inner=batteryDialPoint(65,angle),outer=batteryDialPoint(71,angle),labelPoint=batteryDialPoint(54,angle),label=amps>0?"+"+amps:amps<0?"−"+Math.abs(amps):"0";ticks.push(`<line class="battery-dial-tick" x1="${inner[0].toFixed(2)}" y1="${inner[1].toFixed(2)}" x2="${outer[0].toFixed(2)}" y2="${outer[1].toFixed(2)}"/><text class="battery-dial-scale" x="${labelPoint[0].toFixed(2)}" y="${labelPoint[1].toFixed(2)}" text-anchor="middle" dominant-baseline="central">${label}</text>`)}
    let marker="";if(current!==null){const point=batteryDialPoint(69,Math.max(-40,Math.min(40,current))/40*145);marker=`<circle class="battery-dial-current-marker" cx="${point[0].toFixed(2)}" cy="${point[1].toFixed(2)}" r="5"/>`}
    const ariaLabel=`Carga ${soc===null?"sin datos":Math.round(soc)+" por ciento"}, voltaje ${voltageText}, corriente ${currentText}, potencia ${powerText}`;
    return `<svg class="battery-combined-dial" viewBox="-38 -38 276 276" role="img" aria-label="${esc(ariaLabel)}"><title>Estado instantáneo del banco de baterías</title><g aria-hidden="true">${segments.join("")}<path class="battery-dial-current-discharge" d="${batteryDialArc(69,-145,0)}"/><path class="battery-dial-current-charge" d="${batteryDialArc(69,0,145)}"/>${ticks.join("")}${marker}<text class="battery-dial-soc-value" x="100" y="88" text-anchor="middle">${soc===null?"—":Math.round(soc)+"%"}</text><text class="battery-dial-voltage" x="100" y="109" text-anchor="middle">${voltageText}</text><text class="battery-dial-current-value" x="100" y="133" text-anchor="middle">${currentText}</text><text class="battery-dial-power" x="100" y="151" text-anchor="middle">${powerText}</text></g>${batteryMilestonesMarkup(s)}</svg>`;
  }
  function bankEstimate(s){
    const current=num(s.current),charging=current!==null&&current>.05,discharging=current!==null&&current<-.05,label=charging?"Carga completa en":discharging?"Autonomía estimada":"En reposo",value=charging?chargeEtaLabel(s):discharging?autonomyLabel(s):current===null?"—":"Sin carga neta";
    let finish='';
    const finishHours=discharging&&s.connected>=s.total&&Number.isFinite(s.rem)&&s.rem>0?s.rem/Math.abs(current):charging&&value!=='—'&&value!=='Completa'&&Number.isFinite(s.cap)&&Number.isFinite(s.rem)?Math.max(0,s.cap-s.rem)/current:null;
    if(finishHours!==null&&Number.isFinite(finishHours)){
      const end=new Date(Date.now()+finishHours*3600000);
      if(Number.isFinite(end.getTime())){const now=new Date(),days=Math.round((Date.UTC(end.getFullYear(),end.getMonth(),end.getDate())-Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()))/86400000),time=end.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});finish=time+(days>0?' (+'+days+' '+(days===1?'día':'días')+')':'')}
    }
    return `<div class="battery-bank-estimate"><span>${label}</span><strong>${esc(value)}${finish?' · '+esc(finish):''}</strong></div>`;
  }
  function overview(){
    const s=indicatorStats(),batteryCount=state.batteries.length,minis=batteryCount?state.batteries.map(mini).join(""):'<div class="battery-mini-empty">Sin baterías vinculadas</div>',single=batteryCount===1?" single":"",cardRows=Math.max(1,Math.ceil(batteryCount/2));
    return '<div class="battery-overview" data-layout="dial-cards"><div class="battery-indicators-panel">'+batteryDial(s)+(s.rem===null&&indicatorSocSource!=='soce'?'<div class="battery-bank-estimate"><span>'+indicatorSocSource.toUpperCase()+' sin datos suficientes</span></div>':bankEstimate(s))+'</div><div class="battery-bank-panel"><div class="battery-bank-heading"><div class="battery-bank-name">'+esc(state.bankName)+solarIndicatorMarkup()+'</div><div class="battery-ah">'+(s.rem===null?"—":Math.round(s.rem))+' / '+Math.round(s.cap)+' Ah</div></div><div class="battery-mini-column'+single+'" style="--battery-card-rows:'+cardRows+'">'+minis+'</div></div></div>';
  }


  function historyOffsetRange(ms){
    let oldest=Infinity;
    for(const point of state.history){const time=Number(point?.time);if(Number.isFinite(time))oldest=Math.min(oldest,time)}
    if(!Number.isFinite(oldest))return 0;
    const alignedEnd=Math.floor(Date.now()/ms)*ms+ms;
    return Math.max(0,Math.floor((alignedEnd-oldest)/ms)-BARS);
  }
  function clampHistoryOffset(value,ms){return Math.max(0,Math.min(historyOffsetRange(ms),Math.round(Number(value)||0)))}
  function changeHistoryZoom(next,anchorTime=null,anchorFraction=.5){
    next=Math.max(0,Math.min(ZOOMS.length-1,Number(next)||0));if(next===zoom)return;
    const now=Date.now(),oldMs=ZOOMS[zoom][1],oldEnd=Math.floor(now/oldMs)*oldMs+oldMs-historyOffset*oldMs,oldStart=oldEnd-BARS*oldMs;
    anchorFraction=Math.max(0,Math.min(1,Number(anchorFraction)||0));
    if(!Number.isFinite(anchorTime))anchorTime=oldStart+anchorFraction*BARS*oldMs;
    zoom=next;const ms=ZOOMS[zoom][1],alignedEnd=Math.floor(now/ms)*ms+ms,desiredEnd=anchorTime+(1-anchorFraction)*BARS*ms;
    historyOffset=clampHistoryOffset(Math.round((alignedEnd-desiredEnd)/ms),ms);write(ZOOM_KEY,zoom);requestRender('batteries');
  }
  function historyExtremePair(){return{max:null,min:null}}
  function addHistoryExtreme(pair,value,index,time){
    if(!Number.isFinite(value))return;
    const point={value,index,time};
    if(!pair.max||value>pair.max.value)pair.max=point;
    if(!pair.min||value<pair.min.value)pair.min=point;
  }
  function historyExtremeData(data){
    const bankSoc=historyExtremePair(),bankCurrent=historyExtremePair();
    data.bars.forEach((bar,index)=>{
      const time=data.start+index*data.ms,summed=bar.parts.reduce((sum,part)=>sum+(num(part.value)||0),0);
      addHistoryExtreme(bankSoc,num(bar.soc)??(bar.parts.length?summed:null),index,time);
      const bank=bar.currents.find(item=>String(item.id)==='bank');
      addHistoryExtreme(bankCurrent,num(bank?.value??bar.current),index,time);
    });
    return{bankSoc,bankCurrent};
  }
  function historyExtremeTitle(point){
    return point?esc(new Date(point.time).toLocaleString('es',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})):'';
  }
  function historyExtremeValue(point,unit){
    if(!point)return'—';
    if(unit==='%')return Math.round(point.value)+'%';
    const value=Number(point.value),sign=value>0?'+':value<0?'−':'';
    return sign+Math.abs(value).toFixed(1)+' A';
  }
  function historyExtremeField(label,point,unit,kind){
    return'<div class="battery-history-extreme-field is-'+kind+'"><strong>'+label+'</strong><b title="'+historyExtremeTitle(point)+'">'+historyExtremeValue(point,unit)+'</b></div>';
  }
  function renderHistoryExtremes(root=state.historyRoot||state.root){
    const host=root?.querySelector('[data-battery-history-extremes]');if(!host)return;
    const extremes=historyExtremeData(chartData());
    host.innerHTML='<h4>Máximos y mínimos del banco en el período visible</h4><div class="battery-history-extreme-grid">'+
      historyExtremeField('SOC máx.',extremes.bankSoc.max,'%','max')+
      historyExtremeField('SOC mín.',extremes.bankSoc.min,'%','min')+
      historyExtremeField('A máx.',extremes.bankCurrent.max,'A','max')+
      historyExtremeField('A mín.',extremes.bankCurrent.min,'A','min')+'</div>';
  }
  function syncHistoryControls(){const ms=ZOOMS[zoom][1],max=historyOffsetRange(ms);historyOffset=Math.max(0,Math.min(max,historyOffset))}
  function refreshHistoryView(root=state.historyRoot||state.root){syncHistoryControls(root);queueDraw(root)}
  function historyNavigationActive(){return historyActivePointers.size>0||historyControlPointers.size>0}
  function bindHistoryControlProtection(){if(historyControlProtectionBound||typeof document==='undefined')return;historyControlProtectionBound=true;document.addEventListener('pointerdown',event=>{if(event.target?.closest?.('.battery-history-current-fill-control,.battery-history-average-control,.battery-history-voltage-estimate-control,.battery-history-soc-curve,.battery-history-factor-curve,.battery-history-ah-adjust'))historyControlPointers.add(event.pointerId)},true);const finish=event=>{if(!historyControlPointers.delete(event.pointerId))return;notifyHistoryInteractionEnd()};document.addEventListener('pointerup',finish,true);document.addEventListener('pointercancel',finish,true);document.addEventListener('lostpointercapture',finish,true)}
  function notifyHistoryInteractionEnd(){if(!historyNavigationActive())window.dispatchEvent(new Event('boatstation-battery-history-interaction-end'))}
  function isHistoryInteracting(){return historyNavigationActive()||!!document.activeElement?.matches?.('[data-ah-end]')}
  function bindHistoryNavigation(root){
    const chart=root.querySelector('.battery-history-chart');if(!chart||chart.dataset.historyGesturesBound==='1')return;
    chart.dataset.historyGesturesBound='1';const points=new Map();let gesture=null;
    const pointList=()=>[...points.values()];
    chart.addEventListener('pointerdown',event=>{
      if(event.pointerType==='mouse'&&event.button!==0)return;
      points.set(event.pointerId,{x:event.clientX,y:event.clientY});historyActivePointers.add(event.pointerId);
      try{chart.setPointerCapture(event.pointerId)}catch{}
      if(points.size===1)gesture={type:'pan',startX:event.clientX,startY:event.clientY,startOffset:historyOffset,width:root.querySelector('[data-battery-history-chart]')?.getBoundingClientRect().width||chart.clientWidth,horizontal:false};
      else if(points.size===2){
        const pair=pointList(),rect=root.querySelector('[data-battery-history-chart]')?.getBoundingClientRect()||chart.getBoundingClientRect(),data=chartData();
        const distance=Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y),center=(pair[0].x+pair[1].x)/2,fraction=Math.max(0,Math.min(1,(center-rect.left)/Math.max(1,rect.width)));
        gesture={type:'pinch',distance,zoom,anchorFraction:fraction,anchorTime:data.start+fraction*BARS*data.ms};
      }
    });
    chart.addEventListener('pointermove',event=>{
      if(!points.has(event.pointerId))return;
      points.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(points.size===2&&gesture?.type==='pinch'){if(event.cancelable)event.preventDefault();return}
      if(points.size!==1||gesture?.type!=='pan')return;
      const dx=event.clientX-gesture.startX,dy=event.clientY-gesture.startY;
      if(!gesture.horizontal){
        if(Math.abs(dx)<8&&Math.abs(dy)<8)return;
        if(Math.abs(dy)>Math.abs(dx)*1.15){gesture.type='vertical';return}
        if(Math.abs(dx)<=Math.abs(dy)*1.15)return;
        gesture.horizontal=true;
      }
      if(event.cancelable)event.preventDefault();
      const barWidth=Math.max(1,gesture.width/BARS),barsMoved=Math.trunc(dx/barWidth),ms=ZOOMS[zoom][1];
      const next=clampHistoryOffset(gesture.startOffset+barsMoved,ms);
      if(next!==historyOffset){historyOffset=next;refreshHistoryView(root)}
    });
    const finish=event=>{
      if(!points.has(event.pointerId))return;
      const pinch=points.size===2&&gesture?.type==='pinch';
      if(pinch){
        const pair=pointList(),distance=Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y),ratio=distance/Math.max(1,gesture.distance),steps=Math.round(Math.log(ratio)/Math.log(1.35));
        const next=Math.max(0,Math.min(ZOOMS.length-1,gesture.zoom-steps)),anchorTime=gesture.anchorTime,anchorFraction=gesture.anchorFraction;
        points.delete(event.pointerId);historyActivePointers.delete(event.pointerId);gesture=null;
        if(next!==zoom)changeHistoryZoom(next,anchorTime,anchorFraction);else renderHistoryExtremes(root);
        notifyHistoryInteractionEnd();return;
      }
      points.delete(event.pointerId);historyActivePointers.delete(event.pointerId);
      if(points.size===0){gesture=null;renderHistoryExtremes(root)}
      notifyHistoryInteractionEnd();
    };
    chart.addEventListener('pointerup',finish);chart.addEventListener('pointercancel',finish);chart.addEventListener('lostpointercapture',finish);

  }
  function historyPeriodKey(time,ms){
    const date=new Date(time),year=date.getFullYear(),month=date.getMonth()+1,day=date.getDate();
    if(ms<86400000)return'D:'+year+'-'+month+'-'+day;
    if(ms<7*86400000){const monday=new Date(year,date.getMonth(),day);monday.setDate(monday.getDate()-((monday.getDay()+6)%7));return'W:'+monday.getFullYear()+'-'+(monday.getMonth()+1)+'-'+monday.getDate()}
    if(ms<28*86400000)return'M:'+year+'-'+month;
    return'Q:'+year+'-'+(Math.floor(date.getMonth()/3)+1);
  }
  function historyPeriodLabel(time,ms){
    const date=new Date(time),compact=value=>value.replace(/\.$/,'');
    if(ms<86400000)return compact(date.toLocaleDateString('es',{day:'2-digit',month:'short'}));
    if(ms<7*86400000){const monday=new Date(date.getFullYear(),date.getMonth(),date.getDate());monday.setDate(monday.getDate()-((monday.getDay()+6)%7));return compact(monday.toLocaleDateString('es',{day:'2-digit',month:'short'}))}
    if(ms<28*86400000)return compact(date.toLocaleDateString('es',{month:'short',year:'numeric'}));
    return'T'+(Math.floor(date.getMonth()/3)+1)+' '+date.getFullYear();
  }
  function historyPeriodGroups(start,ms,count){
    const groups=[];let current=null;
    for(let index=0;index<count;index++){const time=start+index*ms,key=historyPeriodKey(time,ms);if(!current||current.key!==key){if(current)current.endIndex=index;current={key,startIndex:index,endIndex:count,time};groups.push(current)}}
    return groups;
  }
  function historyPage(){
    const [label,ms]=ZOOMS[zoom],total=ms*BARS,span=total>=86400000?Math.round(total/86400000)+' días':total<3600000?Math.round(total/60000)+' min':Number((total/3600000).toFixed(1)).toLocaleString('es')+' h',exportLabel='Descargar histórico de carga (CSV)';
    const maxOffset=historyOffsetRange(ms);historyOffset=Math.max(0,Math.min(maxOffset,historyOffset));
    return'<div class="battery-history-page"><div class="battery-history-head"><div><strong>Histórico de carga</strong><small>30 intervalos · '+label+' por intervalo · '+span+'</small></div><div class="battery-history-zoom"><button type="button" data-battery-history-zoom="out" '+(zoom===ZOOMS.length-1?'disabled':'')+'>−</button><b>'+label+'</b><button type="button" data-battery-history-zoom="in" '+(zoom===0?'disabled':'')+'>+</button></div><button type="button" class="battery-history-export" data-battery-history-export aria-label="'+exportLabel+'" title="'+exportLabel+'" '+(!state.history.length?'disabled':'')+'>CSV ↓</button></div>'+
      '<div class="battery-history-chart"><div class="battery-history-y"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div><canvas data-battery-history-chart aria-label="Histórico de carga, desliza para recorrer y pellizca para cambiar el intervalo"></canvas><div class="battery-history-y battery-history-y-ah"><span data-ah-label="top">+— Ah</span><span data-ah-label="upper">+— Ah</span><span data-ah-label="zero">0 Ah</span><span data-ah-label="lower">−— Ah</span><span data-ah-label="bottom">−— Ah</span></div><div class="battery-history-y battery-history-y-current"><span data-current-label="top">+— A</span><span data-current-label="upper">+— A</span><span data-current-label="zero">0 A</span><span data-current-label="lower">−— A</span><span data-current-label="bottom">−— A</span></div><div class="battery-history-y battery-history-y-voltage"><span data-voltage-label="top">— V</span><span data-voltage-label="upper">— V</span><span data-voltage-label="zero">— V</span><span data-voltage-label="lower">— V</span><span data-voltage-label="bottom">— V</span></div></div>'+

      '<label class="battery-history-current-fill-control">Transparencia de corriente <input type="range" min="0" max="100" step="1" data-current-fill-transparency value="'+currentFillTransparency+'" aria-label="Transparencia del área de corriente"><output data-current-fill-value>'+currentFillTransparency+'%</output></label>'+
      socCurveEditorMarkup()+'<div class="battery-history-legend" data-battery-history-legend></div>'+
      '</div>';
  }
  function historyCsvCell(value){return'"'+String(value??'').replace(/"/g,'""')+'"'}
  function downloadHistoryCsv(){
    const date=new Date().toISOString().slice(0,10);
    if(!state.history.length)return;
    ensureHistoryAh();
    const batteries=new Map();
    for(const battery of state.batteries)batteries.set(String(battery.id||battery.name),String(battery.name||battery.deviceName||'Batería'));
    for(const sample of state.history)for(const part of sample.batteries||[]){const id=String(part.id||part.name||'battery');if(!batteries.has(id))batteries.set(id,String(part.name||'Batería'))}
    const batteryList=[...batteries.entries()];
    const header=['Fecha y hora (UTC)','SOC banco (%)','Corriente banco promedio (A)','Corriente banco última (A)','Voltaje banco (V)','Carga banco (Ah)','Descarga banco (Ah)','Balance banco (Ah)'];
    header.push('Origen','Descripción de estimación');
    for(const [,name] of batteryList)header.push(name+' · aporte al banco (%)',name+' · voltaje (V)',name+' · corriente promedio (A)',name+' · corriente última (A)',name+' · carga (Ah)',name+' · descarga (Ah)',name+' · balance (Ah)');
    const value=entry=>{const n=num(entry);return n===null?'':String(n)};
    const rows=[header,...state.history.slice().sort((a,b)=>Number(a.time)-Number(b.time)).filter(sample=>Number.isFinite(Number(sample.time))).map(sample=>{
      const row=[new Date(Number(sample.time)).toISOString(),value(sample.soc),value(sample.current),value(sample.currentLast??sample.current),value(sample.voltage),value(sample.chargeAh),value(sample.dischargeAh),value(sample.storedAh),sample.estimated?'Estimado':'Medido',sample.estimateDescription||''];
      const parts=new Map((sample.batteries||[]).map(part=>[String(part.id||part.name||'battery'),part]));
      for(const [id] of batteryList){const part=parts.get(id)||{};row.push(value(part.contribution),value(part.voltage),value(part.current),value(part.currentLast??part.current),value(part.chargeAh),value(part.dischargeAh),value(part.storedAh))}
      return row;
    })];
    const csv='\uFEFF'+rows.map(row=>row.map(historyCsvCell).join(';')).join('\r\n');
    const filename='BoatStation-historico-baterias-'+date+'.csv';
    if(window.BoatStationTools?.exportCsvText){window.BoatStationTools.exportCsvText(filename,csv);return}
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function statPage(){const s=stats();return `<div class="battery-list battery-stats-list">${row('Carga actual',s.soc===null?'—':Math.round(s.soc)+'%',`${s.rem===null?'—':Math.round(s.rem)} / ${Math.round(s.cap)} Ah`)}${row('Potencia actual',s.power===null?'—':Math.round(s.power)+' W',s.current===null?'Sin datos de corriente':s.current>=0?'Cargando':'Descargando')}</div>`}
  const row=(name,value,detail)=>`<div class="battery-item"><div class="battery-item-top"><span class="battery-name">${name}</span><span class="battery-soc">${value}</span></div><div class="battery-item-sub"><span>${detail}</span></div></div>`;
  function listPage(){if(!state.batteries.length)return `<div class="battery-empty"><div>No hay baterías vinculadas</div><button class="gps-action primary" type="button" data-battery-manage>Administrar Banco de Baterías</button></div>`;return `<div class="battery-list">${state.batteries.map(b=>row(esc(b.name||b.deviceName||'Batería'),charge(b).soc===null?'—':Math.round(charge(b).soc)+'%',`${num(b.capacityAh)||0} Ah · ${b.connected===false?'Offline':'Conectada'}`)).join('')}</div>`}
  const page=i=>i===0?overview():i===1?historyPage():i===2?statPage():listPage();
  function partsSnapshot(){const cap=state.batteries.reduce((n,b)=>n+(num(b.capacityAh)||0),0);return state.batteries.map((b,i)=>{const c=num(b.capacityAh)||0,rem=charge(b).rem,soc=charge(b).soc,value=rem!==null&&cap?rem/cap*100:(soc===null||!cap?0:soc*c/cap),part={id:String(b.id||b.address||i),name:String(b.name||b.deviceName||`Batería ${i+1}`),contribution:Math.max(0,Math.min(100,value)),current:b.connected===false?null:num(b.current),voltage:b.connected===false?null:num(b.voltage)};if(num(b.historyAh?.coveredMs)>0){part.chargeAh=b.historyAh.chargeAh;part.dischargeAh=b.historyAh.dischargeAh;part.storedAh=b.historyAh.storedAh}return part})}
  function intervalAh(before,after,now){if(!before||!Number.isFinite(Number(before.time)))return null;const elapsed=now-Number(before.time),integrated=integrateCurrentPair(num(before.current),num(after.current),elapsed);return integrated}
  function appendHistory(s){
    const now=Date.now();if(now-state.lastSample<SAMPLE_MS)return;state.lastSample=now;
    const previous=state.history[state.history.length-1],batteries=partsSnapshot();
    const integratedParts=batteries.filter(part=>num(part.storedAh)!==null),bankAh=integratedParts.length?integratedParts.reduce((sum,part)=>({chargeAh:sum.chargeAh+part.chargeAh,dischargeAh:sum.dischargeAh+part.dischargeAh,storedAh:sum.storedAh+part.storedAh}),{chargeAh:0,dischargeAh:0,storedAh:0}):intervalAh(previous?{time:previous.time,current:previous.currentLast??previous.current}:null,{current:s.current},now);
    state.history.push({time:now,soc:s.soc,current:s.current,currentLast:s.current,voltage:s.voltage,...(bankAh||{}),batteries});
    for(const b of state.batteries)b.historyAh={chargeAh:0,dischargeAh:0,storedAh:0,coveredMs:0};
    historyDirty=true;saveHistory();
  }

  let socViewport=null,factorViewport=null;
  let bankAhAdjustment=0,trialSocEnd=null,retrospectiveFactor=1,socSmoothingPoints=1,hasCalculatedSocCurve=false;const trialVisible={'voltage:bank-estimated':!hiddenSeries['voltage:bank-estimated'],'soc:bank-estimated':!hiddenSeries['soc:bank-estimated'],'ah:bank-remaining':!hiddenSeries['ah:bank-remaining'],'soc:bank-coulomb':!hiddenSeries['soc:bank-coulomb']};
  let factorCurveOpen=false,factorCurveExpansion=0,factorPointer=null,factorCurve=read(FACTOR_CURVE_KEY,null);if(!Array.isArray(factorCurve)||factorCurve.length<2)factorCurve=[{voltage:10,factor:voltageEstimateFactor},{voltage:15,factor:voltageEstimateFactor}];
  let socCurveEditorOpen=false,socCurveExpansion=0,socCurvePointer=null,socCurvePreset=savedSocTrial?.preset??read('bs.batteries.historySocCurvePreset.v1','manual'),socCurveCells=Math.max(1,Math.min(48,Math.round(Number(savedSocTrial?.cells??read('bs.batteries.historySocCurveCells.v1',4))||4)));
  if(!Object.prototype.hasOwnProperty.call(profiles,socCurvePreset))socCurvePreset='manual';
  if(socCurvePoints.length<2)socCurvePoints=DEFAULT_SOC_CURVE.map(point=>({...point}));
  function normalizeSocCurve(points){
    if(!Array.isArray(points))return [];
    const sorted=points.map(point=>({voltage:num(point?.voltage),soc:num(point?.soc)})).filter(point=>point.voltage!==null&&point.soc!==null).map(point=>({voltage:point.voltage,soc:Math.max(0,Math.min(100,point.soc))})).sort((a,b)=>a.voltage-b.voltage);
    const unique=[];for(const point of sorted){if(unique.length&&Math.abs(unique[unique.length-1].voltage-point.voltage)<.000001)unique[unique.length-1]=point;else unique.push(point)}
    return unique.length>=2?unique:[]
  }
  function interpolateSoc(points,voltage){
    if(!Number.isFinite(voltage)||points.length<2)return null;
    if(voltage<=points[0].voltage)return points[0].soc;
    if(voltage>=points[points.length-1].voltage)return points[points.length-1].soc;
    for(let index=1;index<points.length;index++){
      const right=points[index],left=points[index-1];if(voltage>right.voltage)continue;
      const fraction=(voltage-left.voltage)/(right.voltage-left.voltage);
      return left.soc+(right.soc-left.soc)*fraction
    }
    return null
  }
  function estimateSocFromVoltage(voltage){return interpolateSoc(socCurvePoints,voltage)}
  function socCurveEditorMarkup(){
    return '<details class="battery-history-soc-curve" data-battery-soc-curve-details '+(socCurveEditorOpen?'open':'')+'><summary>Cálculo de SOC</summary><div class="battery-history-soc-curve-content"><div class="battery-soc-control-row battery-history-voltage-estimate-control"><label class="battery-soc-control-label"><input type="checkbox" data-trial-visible="voltage:bank-estimated" '+(trialVisible["voltage:bank-estimated"]?"checked":"")+'> Ve</label><div class="battery-history-voltage-estimate-stepper"><span title="Factor de voltaje">Fv</span><button type="button" data-factor-step="-1">−</button><input type="number" min="0" step="0.00001" inputmode="decimal" data-factor-value value="'+voltageEstimateFactor.toFixed(5)+'" aria-label="Fv, factor de voltaje del banco"><button type="button" data-factor-step="1">+</button></div><button type="button" class="gps-action battery-soc-copy" data-copy-factor>Copiar a baterías</button></div><div class="battery-soc-control-row battery-soc-retrospective battery-history-ah-adjust"><label class="battery-soc-control-label" title="SOC retrospectivo por Ah"><input type="checkbox" data-trial-visible="ah:bank-remaining" '+(trialVisible["ah:bank-remaining"]?"checked":"")+' aria-label="SOCr retrospectivo por Ah"> SOCr</label><div class="battery-history-voltage-estimate-stepper"><button type="button" data-ah-end-step="-1">−</button><input type="number" min="0" max="100" step="0.1" inputmode="decimal" data-ah-end value="'+(trialSocEnd??stats().soc??0).toFixed(1)+'" aria-label="SOCr final"><button type="button" data-ah-end-step="1">+</button><span>%</span></div><span class="battery-soc-fr-label" title="Factor retrospectivo por Ah">Fr</span><div class="battery-history-voltage-estimate-stepper"><button type="button" data-fr-step="-1" aria-label="Reducir factor retrospectivo">−</button><input type="number" min="0" step="0.01" inputmode="decimal" data-fr-value value="'+retrospectiveFactor.toFixed(2)+'" aria-label="Fr, factor retrospectivo"><button type="button" data-fr-step="1" aria-label="Aumentar factor retrospectivo">+</button></div><button type="button" class="gps-action battery-soc-copy" data-load-current-soc title="Usar el SOC actual del banco" '+(Number.isFinite(stats().soc)?"":"disabled")+'>Cargar</button></div><div class="battery-soc-control-row battery-soc-estimated-row"><label class="battery-soc-control-label"><input type="checkbox" data-trial-visible="soc:bank-estimated" '+(trialVisible["soc:bank-estimated"]?"checked":"")+'> SOCe</label><button type="button" class="gps-action battery-soc-copy" data-calculate-soc title="Calcular curva con Ve y SOCr visibles">Calcular</button><div class="battery-soc-smoothing" role="group" aria-label="Suavizado de curva"><span>Suavizado</span><button type="button" data-soc-smooth-step="-1" aria-label="Reducir suavizado">−</button><input type="number" min="1" max="30" step="1" inputmode="numeric" data-soc-smooth value="'+socSmoothingPoints+'" aria-label="Puntos para suavizar"><button type="button" data-soc-smooth-step="1" aria-label="Aumentar suavizado">+</button></div><button type="button" class="gps-action battery-soc-copy" data-copy-curve>Aplicar</button></div><p>Curva de correlación Voltaje estimado → SOC estimado</p><label>Tipo <select data-soc-preset aria-label="Tipo de curva"><option value="manual" '+(socCurvePreset==='manual'?'selected':'')+'>Manual</option><option value="lifepo4" '+(socCurvePreset==='lifepo4'?'selected':'')+'>LiFePO₄</option><option value="agm" '+(socCurvePreset==='agm'?'selected':'')+'>AGM</option><option value="gel" '+(socCurvePreset==='gel'?'selected':'')+'>Gel</option><option value="flooded" '+(socCurvePreset==='flooded'?'selected':'')+'>Plomo ácido</option></select></label> <label>Celdas en serie <input type="number" min="1" max="48" step="1" value="'+socCurveCells+'" data-soc-cells aria-label="Cantidad de celdas en serie"></label><canvas data-battery-soc-curve-chart aria-label="Curva editable de Voltaje estimado y SOC estimado"></canvas><p>Arrastrá un punto para moverlo · Tocá un punto para eliminarlo · Tocá una línea para agregar un punto</p><div data-copy-status role="status"></div></div></details>'
  }
  function socCurveDomain(){
    const first=socCurvePoints[0]?.voltage??10,last=socCurvePoints[socCurvePoints.length-1]?.voltage??13.6,span=Math.max(.1,last-first),padding=Math.max(.2,span*.1);
    return socViewport||{min:first-padding,max:last+padding,minY:0,maxY:100}
  }
  function socCurveMetrics(canvas,domain=socCurveDomain()){
    const rect=canvas.getBoundingClientRect(),left=44,right=10,top=10,bottom=25,plotW=Math.max(10,rect.width-left-right),plotH=Math.max(10,rect.height-top-bottom),span=domain.max-domain.min||1;
    return{rect,left,right,top,bottom,plotW,plotH,domain,xForVoltage:value=>left+(value-domain.min)/span*plotW,voltageForX:value=>domain.min+(value-left)/plotW*span,yForSoc:value=>top+(domain.maxY-value)/(domain.maxY-domain.minY)*plotH,socForY:value=>domain.maxY-(value-top)/plotH*(domain.maxY-domain.minY)}
  }
  function drawSocCurve(root,domainOverride=null,activeIndex=-1){
    if(activeIndex<0&&socCurvePointer?.type==='point'&&socCurvePointer.moved)activeIndex=socCurvePointer.index;
    const details=root?.querySelector('[data-battery-soc-curve-details]'),canvas=root?.querySelector('[data-battery-soc-curve-chart]');
    if(!details?.open||!canvas||socCurvePoints.length<2)return false;
    const metrics=socCurveMetrics(canvas,domainOverride||socCurveDomain()),{rect,left,top,plotW,plotH,xForVoltage,yForSoc}=metrics;
    if(rect.width<10||rect.height<30)return false;
    const dpr=devicePixelRatio||1,width=Math.round(rect.width*dpr),height=Math.round(rect.height*dpr);
    if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
    const context=canvas.getContext('2d');if(!context)return false;
    context.setTransform(dpr,0,0,dpr,0,0);context.clearRect(0,0,rect.width,rect.height);
    context.font='10px system-ui,sans-serif';context.textAlign='right';context.textBaseline='middle';context.lineWidth=1;context.strokeStyle='#284b60';context.fillStyle='#a9bdc8';
    for(let i=0;i<=4;i++){const soc=metrics.domain.maxY-(metrics.domain.maxY-metrics.domain.minY)*i/4,py=yForSoc(soc);context.beginPath();context.moveTo(left,py);context.lineTo(left+plotW,py);context.stroke();context.fillText(Math.round(soc)+'%',left-7,py)}
    context.strokeStyle='#7895a5';context.beginPath();context.moveTo(left,top);context.lineTo(left,top+plotH);context.lineTo(left+plotW,top+plotH);context.stroke();
    context.textAlign='left';context.textBaseline='top';context.fillStyle='#a9bdc8';context.fillText(metrics.domain.min.toFixed(2)+' V',left,top+plotH+5);context.textAlign='right';context.fillText(metrics.domain.max.toFixed(2)+' V',left+plotW,top+plotH+5);
    context.save();context.beginPath();context.rect(left,top,plotW,plotH);context.clip();context.beginPath();
    socCurvePoints.forEach((point,index)=>{const px=xForVoltage(point.voltage),py=yForSoc(point.soc);if(index===0)context.moveTo(px,py);else context.lineTo(px,py)});
    context.strokeStyle='#6cc6d3';context.lineWidth=3;context.lineJoin='round';context.stroke();
    for(let index=0;index<socCurvePoints.length;index++){const point=socCurvePoints[index];context.beginPath();context.arc(xForVoltage(point.voltage),yForSoc(point.soc),index===activeIndex?7:5,0,Math.PI*2);context.fillStyle=index===activeIndex?'#f2cf5b':'#6cc6d3';context.fill();context.strokeStyle='#071a27';context.lineWidth=2;context.stroke();if(index===activeIndex){context.beginPath();context.arc(xForVoltage(point.voltage),yForSoc(point.soc),9,0,Math.PI*2);context.strokeStyle='#f2cf5b';context.lineWidth=1.5;context.stroke()}}
    context.restore();if(activeIndex>=0&&socCurvePoints[activeIndex]){const point=socCurvePoints[activeIndex],x=xForVoltage(point.voltage),y=yForSoc(point.soc);if(x>=left&&x<=left+plotW&&y>=top&&y<=top+plotH)drawCurvePointLabels(context,[{x,y,label:point.voltage.toFixed(2)+' V · '+point.soc.toFixed(1)+'%'}],rect.width,rect.height,0)}return true
  }
  function drawCurvePointLabels(context,points,width,height,active=-1){
    context.save();context.font='bold 9px system-ui,sans-serif';context.textBaseline='middle';context.textAlign='left';
    const placed=[];const ordered=points.map((point,index)=>({...point,index})).sort((a,b)=>(a.index===active?-1:0)-(b.index===active?-1:0));
    for(const point of ordered){
      const text=point.label,boxWidth=Math.ceil(context.measureText(text).width)+8,boxHeight=15;
      const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
      const candidates=[[point.x+7,point.y-20],[point.x+7,point.y+7],[point.x-boxWidth-7,point.y-20],[point.x-boxWidth-7,point.y+7]];
      let best=null,bestScore=Infinity;
      for(const [cx,cy] of candidates){const x=clamp(cx,1,Math.max(1,width-boxWidth-1)),y=clamp(cy,1,Math.max(1,height-boxHeight-1));let score=0;for(const b of placed){const overlapX=Math.max(0,Math.min(x+boxWidth,b.x+b.w)-Math.max(x,b.x)),overlapY=Math.max(0,Math.min(y+boxHeight,b.y+b.h)-Math.max(y,b.y));score+=overlapX*overlapY}if(score<bestScore){bestScore=score;best={x,y,w:boxWidth,h:boxHeight}}}
      placed.push(best);context.fillStyle='rgba(5,22,34,.90)';context.fillRect(best.x,best.y,best.w,best.h);context.fillStyle=point.index===active?'#ffe17a':'#e5f4f8';context.fillText(text,best.x+4,best.y+boxHeight/2)
    }
    context.restore()
  }
  function curveSegmentDistance(px,py,x1,y1,x2,y2){
    const dx=x2-x1,dy=y2-y1,length=dx*dx+dy*dy,fraction=length?Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/length)):0;
    return Math.hypot(px-(x1+fraction*dx),py-(y1+fraction*dy))
  }
  function bindSocCurveEditor(root){
    const details=root.querySelector('[data-battery-soc-curve-details]'),canvas=root.querySelector('[data-battery-soc-curve-chart]');
    if(!details||!canvas||details.dataset.socCurveBound==='1')return;
    details.dataset.socCurveBound='1';
    const preset=details.querySelector('[data-soc-preset]'),cells=details.querySelector('[data-soc-cells]');
    const markManual=()=>{socCurvePreset='manual';if(preset)preset.value='manual'};
    const applyPreset=()=>{if(!profiles[socCurvePreset])return;socCurvePoints=profiles[socCurvePreset].map(([voltage,soc])=>({voltage:voltage*socCurveCells,soc}));drawSocCurve(root);queueDraw(root)};
    preset?.addEventListener('change',()=>{socCurvePreset=preset.value;if(socCurvePreset==='manual'){markManual();saveSocTrial();return}socCurveCells=socCurvePreset==='lifepo4'?4:6;cells.value=String(socCurveCells);applyPreset();saveSocTrial()});
    cells?.addEventListener('change',()=>{socCurveCells=Math.max(1,Math.min(48,Math.round(Number(cells.value)||1)));cells.value=String(socCurveCells);applyPreset();saveSocTrial()});
    details.addEventListener('toggle',()=>{
      const opened=details.open;if(opened===socCurveEditorOpen){if(opened)drawSocCurve(root);return}
      socCurveEditorOpen=opened;const card=details.closest('.card'),layout=window.BoatStationPageLayout;
      if(opened){const body=details.querySelector('.battery-history-soc-curve-content');socCurveExpansion=Math.ceil(body?.scrollHeight||0);if(card&&socCurveExpansion)layout?.adjustPageHeight?.(card,socCurveExpansion);drawSocCurve(root)}
      else if(card&&socCurveExpansion){layout?.adjustPageHeight?.(card,-socCurveExpansion);socCurveExpansion=0}
      queueDraw(root)
    });
    const pointAt=(x,y,metrics)=>{let index=-1,distance=13;for(let i=0;i<socCurvePoints.length;i++){const point=socCurvePoints[i],d=Math.hypot(x-metrics.xForVoltage(point.voltage),y-metrics.yForSoc(point.soc));if(d<distance){distance=d;index=i}}return index};
    const segmentAt=(x,y,metrics)=>{let index=-1,distance=12;for(let i=1;i<socCurvePoints.length;i++){const previous=socCurvePoints[i-1],next=socCurvePoints[i],d=curveSegmentDistance(x,y,metrics.xForVoltage(previous.voltage),metrics.yForSoc(previous.soc),metrics.xForVoltage(next.voltage),metrics.yForSoc(next.soc));if(d<distance){distance=d;index=i-1}}return index};
    const canvasPoint=event=>{const rect=canvas.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top}};
    const onDown=event=>{
      if(event.button!==undefined&&event.button!==0)return;
      const domain=socCurveDomain(),metrics=socCurveMetrics(canvas,domain),point=canvasPoint(event),pointIndex=pointAt(point.x,point.y,metrics);
      const type=pointIndex>=0?'point':'line',index=pointIndex>=0?pointIndex:segmentAt(point.x,point.y,metrics);if(index<0)return;
      event.preventDefault();try{canvas.setPointerCapture(event.pointerId)}catch{}
      socCurvePointer={pointerId:event.pointerId,type,index,domain,startX:point.x,startY:point.y,moved:false};canvas.classList.add('is-dragging')
    };
    const onMove=event=>{
      const gesture=socCurvePointer;if(!gesture||gesture.pointerId!==event.pointerId||gesture.type!=='point')return;
      const point=canvasPoint(event);if(Math.hypot(point.x-gesture.startX,point.y-gesture.startY)>4)gesture.moved=true;if(!gesture.moved)return;
      const metrics=socCurveMetrics(canvas,gesture.domain),previous=socCurvePoints[gesture.index-1],next=socCurvePoints[gesture.index+1],minGap=Math.max(.005,(gesture.domain.max-gesture.domain.min)*.001);
      let voltage=Math.max(gesture.domain.min,Math.min(gesture.domain.max,metrics.voltageForX(point.x)));
      if(previous)voltage=Math.max(voltage,previous.voltage+minGap);if(next)voltage=Math.min(voltage,next.voltage-minGap);
      let soc=Math.max(0,Math.min(100,metrics.socForY(point.y)));
      if(previous&&next&&previous.soc<=next.soc)soc=Math.max(previous.soc,Math.min(next.soc,soc));else if(previous&&!next)soc=Math.max(previous.soc,soc);else if(next&&!previous)soc=Math.min(next.soc,soc);
      socCurvePoints=socCurvePoints.map((item,index)=>index===gesture.index?{voltage,soc}:item);
      drawSocCurve(root,gesture.domain,gesture.index);queueDraw(root);event.preventDefault()
    };
    const finish=(event,cancelled=false)=>{
      const gesture=socCurvePointer;if(!gesture||gesture.pointerId!==event.pointerId)return;socCurvePointer=null;canvas.classList.remove('is-dragging');
      if(!cancelled){
        if(gesture.type==='point'&&gesture.moved){}
        else if(gesture.type==='point'&&socCurvePoints.length>2){socCurvePoints=socCurvePoints.filter((_,index)=>index!==gesture.index);}
        else if(gesture.type==='line'&&!gesture.moved){
          const metrics=socCurveMetrics(canvas,gesture.domain),point=canvasPoint(event),left=socCurvePoints[gesture.index],right=socCurvePoints[gesture.index+1],gap=Math.max(.005,(gesture.domain.max-gesture.domain.min)*.001);
          let voltage=metrics.voltageForX(point.x);voltage=Math.max(left.voltage+gap,Math.min(right.voltage-gap,voltage));
          if(right.voltage-left.voltage>gap*2){const soc=interpolateSoc(socCurvePoints,voltage);socCurvePoints=normalizeSocCurve([...socCurvePoints,{voltage,soc}]);}
        }
      }
      if((gesture.type==='point'&&(gesture.moved||(!cancelled&&socCurvePoints.length>=2)))||(gesture.type==='line'&&!cancelled&&!gesture.moved)){markManual();saveSocTrial()}
      try{if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId)}catch{}
      drawSocCurve(root);queueDraw(root)
    };
    bindCurveViewport(canvas,root,'soc');canvas.addEventListener('pointerdown',onDown);canvas.addEventListener('pointermove',onMove);canvas.addEventListener('pointerup',event=>finish(event,false));canvas.addEventListener('pointercancel',event=>finish(event,true));canvas.addEventListener('lostpointercapture',event=>finish(event,true))
  }

  function bindCurveViewport(canvas,root,kind){
    if(canvas.dataset.viewportBound)return;canvas.dataset.viewportBound='1';let pan=null,pinch=null,pinchSuppressed=false;const touchPointers=new Map();canvas.style.touchAction='none';
    const current=()=>kind==='soc'?socCurveDomain():factorMetrics(canvas).domain;
    const set=d=>{if(kind==='soc')socViewport=d;else factorViewport=d};
    const redraw=()=>kind==='soc'?drawSocCurve(root):drawFactorCurve(root);
    const position=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
    const geometry=d=>{if(kind==='soc'){const m=socCurveMetrics(canvas,d);return{left:m.left,top:m.top,w:m.plotW,h:m.plotH,x:p=>m.xForVoltage(p.voltage),y:p=>m.yForSoc(p.soc)}}const m=factorMetrics(canvas,d);return{left:m.left,top:m.top,w:m.w,h:m.h,x:p=>m.x(p.voltage),y:p=>m.y(p.factor)}};
    const hit=(p,d)=>{const m=geometry(d),points=kind==='soc'?socCurvePoints:factorCurve;for(const point of points)if(Math.hypot(p.x-m.x(point),p.y-m.y(point))<14)return true;for(let i=1;i<points.length;i++)if(curveSegmentDistance(p.x,p.y,m.x(points[i-1]),m.y(points[i-1]),m.x(points[i]),m.y(points[i]))<12)return true;return false};
    const zoomAround=(domain,center,scale)=>{const d={...domain},m=geometry(d),tx=Math.max(0,Math.min(1,(center.x-m.left)/m.w)),ty=Math.max(0,Math.min(1,(center.y-m.top)/m.h));const x0=kind==='soc'?'min':'minV',x1=kind==='soc'?'max':'maxV',y0=kind==='soc'?'minY':'minF',y1=kind==='soc'?'maxY':'maxF',x=d[x0]+(d[x1]-d[x0])*tx,y=d[y1]-(d[y1]-d[y0])*ty;const sx=Math.max(.02,Math.min(100,(d[x1]-d[x0])*scale)),sy=Math.max(kind==='soc'?.5:.0001,Math.min(kind==='soc'?500:10,(d[y1]-d[y0])*scale));d[x0]=x-tx*sx;d[x1]=d[x0]+sx;d[y1]=y+ty*sy;d[y0]=d[y1]-sy;set(d);redraw()};
    canvas.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;touchPointers.set(e.pointerId,position(e));if(touchPointers.size===2){const [a,b]=[...touchPointers.values()];pinch={domain:{...current()},distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};pinchSuppressed=true;pan=null;if(kind==='soc')socCurvePointer=null;else factorPointer=null;canvas.classList.remove('is-dragging');try{canvas.setPointerCapture(e.pointerId)}catch{}e.preventDefault();e.stopImmediatePropagation()}else if(pinchSuppressed){e.preventDefault();e.stopImmediatePropagation()}},{capture:true});
    canvas.addEventListener('pointermove',e=>{if(e.pointerType!=='touch'||!touchPointers.has(e.pointerId))return;touchPointers.set(e.pointerId,position(e));if(!pinchSuppressed)return;e.preventDefault();e.stopImmediatePropagation();if(pinch&&touchPointers.size>=2){const [a,b]=[...touchPointers.values()],distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));zoomAround(pinch.domain,pinch.center,pinch.distance/distance)}},{capture:true});
    const finishTouch=e=>{if(e.pointerType!=='touch')return;touchPointers.delete(e.pointerId);if(!pinchSuppressed)return;e.preventDefault();e.stopImmediatePropagation();pinch=null;if(!touchPointers.size)pinchSuppressed=false};canvas.addEventListener('pointerup',finishTouch,{capture:true});canvas.addEventListener('pointercancel',finishTouch,{capture:true});canvas.addEventListener('lostpointercapture',finishTouch,{capture:true});
    canvas.addEventListener('wheel',e=>{e.preventDefault();e.stopPropagation();const d={...current()},m=geometry(d),p=position(e),scale=Math.exp(Math.max(-2,Math.min(2,e.deltaY*.0015))),tx=Math.max(0,Math.min(1,(p.x-m.left)/m.w)),ty=Math.max(0,Math.min(1,(p.y-m.top)/m.h));
      const x0=kind==='soc'?'min':'minV',x1=kind==='soc'?'max':'maxV',y0=kind==='soc'?'minY':'minF',y1=kind==='soc'?'maxY':'maxF',x=d[x0]+(d[x1]-d[x0])*tx,y=d[y1]-(d[y1]-d[y0])*ty;
      const sx=Math.max(.02,Math.min(100,(d[x1]-d[x0])*scale)),sy=Math.max(kind==='soc'?.5:.0001,Math.min(kind==='soc'?500:10,(d[y1]-d[y0])*scale));d[x0]=x-tx*sx;d[x1]=d[x0]+sx;d[y1]=y+ty*sy;d[y0]=d[y1]-sy;set(d);redraw()
    },{passive:false});
    canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;const d={...current()},p=position(e);if(hit(p,d))return;e.preventDefault();e.stopImmediatePropagation();pan={id:e.pointerId,start:p,domain:d};canvas.classList.add('is-dragging');try{canvas.setPointerCapture(e.pointerId)}catch{}},{capture:true});
    canvas.addEventListener('pointermove',e=>{const p=position(e);if(!pan){canvas.style.cursor=hit(p,current())?'crosshair':'grab';return}if(pan.id!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();const d={...pan.domain},m=geometry(d),x0=kind==='soc'?'min':'minV',x1=kind==='soc'?'max':'maxV',y0=kind==='soc'?'minY':'minF',y1=kind==='soc'?'maxY':'maxF',dx=-(p.x-pan.start.x)/m.w*(d[x1]-d[x0]),dy=(p.y-pan.start.y)/m.h*(d[y1]-d[y0]);d[x0]+=dx;d[x1]+=dx;d[y0]+=dy;d[y1]+=dy;set(d);redraw()},{capture:true});
    const finish=e=>{if(!pan||pan.id!==e.pointerId)return;pan=null;canvas.classList.remove('is-dragging');e.stopImmediatePropagation()};canvas.addEventListener('pointerup',finish,{capture:true});canvas.addEventListener('pointercancel',finish,{capture:true});canvas.addEventListener('lostpointercapture',finish,{capture:true})
  }
  function factorAtVoltage(voltage){
    const pts=factorCurve.filter(p=>Number.isFinite(p.voltage)&&Number.isFinite(p.factor)).slice().sort((a,b)=>a.voltage-b.voltage);if(!pts.length)return voltageEstimateFactor;
    if(voltage<=pts[0].voltage)return pts[0].factor;if(voltage>=pts[pts.length-1].voltage)return pts[pts.length-1].factor;
    for(let i=1;i<pts.length;i++)if(voltage<=pts[i].voltage){const a=pts[i-1],b=pts[i];return a.factor+(b.factor-a.factor)*(voltage-a.voltage)/(b.voltage-a.voltage)}
    return voltageEstimateFactor
  }
  function factorCurveMarkup(){return '<details class="battery-history-soc-curve battery-history-factor-curve" data-factor-details '+(factorCurveOpen?'open':'')+'><summary>Curva de correlación Voltaje observado → Factor</summary><div class="battery-history-soc-curve-content"><canvas data-factor-chart aria-label="Curva editable del factor por voltaje observado"></canvas><p>Arrastrá un punto para moverlo · Tocá un punto para eliminarlo · Tocá una línea para agregar un punto</p></div></details>'}
  function factorMetrics(canvas,domain){
    const rect=canvas.getBoundingClientRect(),left=48,top=12,w=Math.max(1,rect.width-60),h=Math.max(1,rect.height-42),xs=domain||factorViewport||{minV:Math.min(10,...factorCurve.map(p=>p.voltage))-.2,maxV:Math.max(15,...factorCurve.map(p=>p.voltage))+.2,minF:Math.min(-.01,...factorCurve.map(p=>p.factor))-.005,maxF:Math.max(.03,...factorCurve.map(p=>p.factor))+.005};
    return{rect,left,top,w,h,domain:xs,x:v=>left+(v-xs.minV)/(xs.maxV-xs.minV)*w,y:v=>top+(xs.maxF-v)/(xs.maxF-xs.minF)*h,v:x=>xs.minV+(x-left)/w*(xs.maxV-xs.minV),f:y=>xs.maxF-(y-top)/h*(xs.maxF-xs.minF)}
  }
  function drawFactorCurve(root,domain=null,active=-1){
    const details=root?.querySelector('[data-factor-details]'),canvas=details?.querySelector('[data-factor-chart]');if(!details?.open||!canvas)return;
    const m=factorMetrics(canvas,domain),r=m.rect;if(r.width<10||r.height<10)return;const dpr=devicePixelRatio||1,w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
    const c=canvas.getContext('2d');if(!c)return;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,r.width,r.height);c.font='10px system-ui';c.fillStyle='#a9bdc8';c.strokeStyle='#284b60';c.textAlign='right';c.textBaseline='middle';
    for(let i=0;i<=4;i++){const y=m.top+i*m.h/4,value=m.domain.maxF-(m.domain.maxF-m.domain.minF)*i/4;c.beginPath();c.moveTo(m.left,y);c.lineTo(m.left+m.w,y);c.stroke();c.fillText(value.toFixed(4),m.left-5,y)}
    c.textBaseline='top';c.textAlign='left';c.fillText(m.domain.minV.toFixed(1)+' V',m.left,m.top+m.h+6);c.textAlign='right';c.fillText(m.domain.maxV.toFixed(1)+' V',m.left+m.w,m.top+m.h+6);
    c.save();c.beginPath();c.rect(m.left,m.top,m.w,m.h);c.clip();c.beginPath();factorCurve.forEach((p,i)=>{if(i)c.lineTo(m.x(p.voltage),m.y(p.factor));else c.moveTo(m.x(p.voltage),m.y(p.factor))});c.strokeStyle='#6cc6d3';c.lineWidth=3;c.stroke();factorCurve.forEach((p,i)=>{c.beginPath();c.arc(m.x(p.voltage),m.y(p.factor),i===active?7:5,0,2*Math.PI);c.fillStyle=i===active?'#f2cf5b':'#6cc6d3';c.fill()});c.restore();drawCurvePointLabels(c,factorCurve.map(point=>({x:m.x(point.voltage),y:m.y(point.factor),label:point.voltage.toFixed(2)+' V · '+point.factor.toFixed(4)+' Ω'})).filter(point=>point.x>=m.left&&point.x<=m.left+m.w&&point.y>=m.top&&point.y<=m.top+m.h),r.width,r.height)
  }
  function bindFactorCurve(root){
    const details=root.querySelector('[data-factor-details]'),canvas=details?.querySelector('[data-factor-chart]');if(!details||!canvas||details.dataset.bound)return;details.dataset.bound='1';
    details.addEventListener('toggle',()=>{if(details.open===factorCurveOpen){if(details.open)drawFactorCurve(root);return}factorCurveOpen=details.open;const card=details.closest('.card');if(details.open){factorCurveExpansion=Math.ceil(details.querySelector('.battery-history-soc-curve-content')?.scrollHeight||0);if(card&&factorCurveExpansion)window.BoatStationPageLayout?.adjustPageHeight?.(card,factorCurveExpansion);drawFactorCurve(root)}else if(card&&factorCurveExpansion){window.BoatStationPageLayout?.adjustPageHeight?.(card,-factorCurveExpansion);factorCurveExpansion=0}});
    const pos=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
    bindCurveViewport(canvas,root,'factor');canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;const m=factorMetrics(canvas),p=pos(e);let index=-1,dist=14;factorCurve.forEach((v,i)=>{const d=Math.hypot(p.x-m.x(v.voltage),p.y-m.y(v.factor));if(d<dist){dist=d;index=i}});let segment=-1;if(index<0){let best=12;for(let i=1;i<factorCurve.length;i++){const a=factorCurve[i-1],b=factorCurve[i],d=curveSegmentDistance(p.x,p.y,m.x(a.voltage),m.y(a.factor),m.x(b.voltage),m.y(b.factor));if(d<best){best=d;segment=i-1}}}if(index<0&&segment<0)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);factorPointer={id:e.pointerId,index,segment,domain:m.domain,start:p,moved:false}});
    canvas.addEventListener('pointermove',e=>{const g=factorPointer;if(!g||g.id!==e.pointerId)return;const p=pos(e);if(Math.hypot(p.x-g.start.x,p.y-g.start.y)>4)g.moved=true;if(g.index<0||!g.moved)return;e.preventDefault();const m=factorMetrics(canvas,g.domain),prev=factorCurve[g.index-1],next=factorCurve[g.index+1];let v=Math.max(m.domain.minV,Math.min(m.domain.maxV,m.v(p.x)));if(prev)v=Math.max(v,prev.voltage+.001);if(next)v=Math.min(v,next.voltage-.001);factorCurve[g.index]={voltage:v,factor:Math.max(m.domain.minF,Math.min(m.domain.maxF,m.f(p.y)))};drawFactorCurve(root,g.domain,g.index);queueDraw(root)});
    const finish=(e,cancel=false)=>{const g=factorPointer;if(!g||g.id!==e.pointerId)return;factorPointer=null;const p=pos(e),m=factorMetrics(canvas,g.domain);if(!cancel&&!g.moved&&g.index>=0&&factorCurve.length>2)factorCurve.splice(g.index,1);else if(!cancel&&!g.moved&&g.segment>=0){const a=factorCurve[g.segment],b=factorCurve[g.segment+1],v=Math.max(a.voltage+.001,Math.min(b.voltage-.001,m.v(p.x)));if(v>a.voltage&&v<b.voltage)factorCurve.splice(g.segment+1,0,{voltage:v,factor:factorAtVoltage(v)})}write(FACTOR_CURVE_KEY,factorCurve);drawFactorCurve(root);queueDraw(root)};
    canvas.addEventListener('pointerup',e=>finish(e));canvas.addEventListener('pointercancel',e=>finish(e,true));canvas.addEventListener('lostpointercapture',e=>finish(e,true));drawFactorCurve(root)
  }
  function chartData(){
    ensureHistoryAh();
    const now=Date.now(),[_,ms]=ZOOMS[zoom],alignedEnd=Math.floor(now/ms)*ms+ms;historyOffset=clampHistoryOffset(historyOffset,ms);const end=alignedEnd-historyOffset*ms,start=end-ms*BARS,openIndex=historyOffset===0?BARS-1:-1,openStart=openIndex>=0?start+openIndex*ms:Infinity;
    const bars=Array.from({length:BARS},()=>({parts:new Map(),current:0,currentN:0,currentLast:null,currentLastTime:-Infinity,soc:0,socN:0,socLast:null,socLastTime:-Infinity,ah:new Map(),currents:new Map(),voltages:new Map()}));
    let previousTime=null,latestBeforeOpen=null;
    for(const p of state.history){
      const time=Number(p?.time);
      if(!Number.isFinite(time)||time>now)continue;
      const i=Math.floor((time-start)/ms),coverage=previousTime!==null&&time>previousTime&&time-previousTime<=MAX_AH_GAP_MS?time-previousTime:0;
      if(openIndex>=0&&time<openStart)latestBeforeOpen=p;
      if(i>=0&&i<BARS){
        const b=bars[i],current=num(p.current),soc=num(p.soc);
        if(current!==null){b.current+=current;b.currentN++}
        if(time>=b.currentLastTime){b.currentLast=num(p.currentLast??p.current);b.currentLastTime=time}
        if(soc!==null){b.soc+=soc;b.socN++}
        if(time>=b.socLastTime){b.socLast=soc;b.socLastTime=time}
        const bankCurrent=b.currents.get('bank')||{id:'bank',name:'Banco',sum:0,n:0,last:null,lastTime:-Infinity};
        if(current!==null){bankCurrent.sum+=current;bankCurrent.n++}
        if(time>=bankCurrent.lastTime){bankCurrent.last=num(p.currentLast??p.current);bankCurrent.lastTime=time}
        b.currents.set('bank',bankCurrent);
        const bankVoltage=b.voltages.get('bank')||{id:'bank',name:'Banco',sum:0,n:0,last:null,lastTime:-Infinity},sampleBankVoltage=num(p.voltage);
        if(sampleBankVoltage!==null){bankVoltage.sum+=sampleBankVoltage;bankVoltage.n++}
        if(time>=bankVoltage.lastTime){bankVoltage.last=sampleBankVoltage;bankVoltage.lastTime=time}
        b.voltages.set('bank',bankVoltage);
        for(const part of p.batteries||[]){
          const id=String(part.id||part.name||'battery'),name=String(part.name||'Batería'),battery=state.batteries.find(x=>String(x.id)===id),capacity=num(battery?.capacityAh),bankCapacity=state.batteries.reduce((total,x)=>total+(num(x.capacityAh)||0),0),sampleVe=batteryVe({...battery,connected:true,voltage:part.voltage,current:part.current}),sampleSoc=battery&&battery.chargeCalculation?.mode!=='bms'?estimatedSoc({...battery,voltage:sampleVe}):null,contribution=sampleSoc!==null&&capacity!==null&&bankCapacity>0?sampleSoc*capacity/bankCapacity:num(part.contribution),usedRecorded=sampleSoc===null||capacity===null||bankCapacity<=0;
          const item=b.parts.get(id)||{id,name,sum:0,n:0,last:null,lastTime:-Infinity};
          if(contribution!==null){item.sum+=contribution;item.n++;item.usedRecorded=!!item.usedRecorded||usedRecorded}
          if(time>=item.lastTime){item.last=contribution;item.lastTime=time}
          item.name=name;b.parts.set(id,item);
          const currentLine=b.currents.get(id)||{id,name,sum:0,n:0,last:null,lastTime:-Infinity},batteryCurrent=num(part.current);
          if(batteryCurrent!==null){currentLine.sum+=batteryCurrent;currentLine.n++}
          if(time>=currentLine.lastTime){currentLine.last=num(part.currentLast??part.current);currentLine.lastTime=time}
          currentLine.name=name;b.currents.set(id,currentLine);
          const voltageLine=b.voltages.get(id)||{id,name,sum:0,n:0,last:null,lastTime:-Infinity},batteryVoltage=num(part.voltage);
          if(batteryVoltage!==null){voltageLine.sum+=batteryVoltage;voltageLine.n++}
          if(time>=voltageLine.lastTime){voltageLine.last=batteryVoltage;voltageLine.lastTime=time}
          voltageLine.name=name;b.voltages.set(id,voltageLine);
          const ah=num(part.storedAh);
          if(ah!==null){const line=b.ah.get(id)||{id,name,value:0,n:0,coveredMs:0};line.value+=ah;line.n++;line.coveredMs+=coverage;line.name=name;b.ah.set(id,line)}
        }
        const batteryAh=(p.batteries||[]).map(part=>num(part.storedAh)).filter(value=>value!==null),bankAh=batteryAh.length?batteryAh.reduce((sum,value)=>sum+value,0):num(p.storedAh);
        if(bankAh!==null){const line=b.ah.get('bank')||{id:'bank',name:'Banco',value:0,n:0,coveredMs:0};line.value+=bankAh;line.n++;line.coveredMs+=coverage;b.ah.set('bank',line)}
      }
      previousTime=time;
    }
    const open=openIndex>=0?bars[openIndex]:null;
    if(openIndex>=0&&latestBeforeOpen&&now-Number(latestBeforeOpen.time)>=0&&now-Number(latestBeforeOpen.time)<=MAX_AH_GAP_MS){
      const time=Number(latestBeforeOpen.time);
      if(open.socLastTime===-Infinity)open.socLast=num(latestBeforeOpen.soc);
      for(const part of latestBeforeOpen.batteries||[]){
        const id=String(part.id||part.name||'battery'),name=String(part.name||'Batería'),battery=state.batteries.find(x=>String(x.id)===id),capacity=num(battery?.capacityAh),bankCapacity=state.batteries.reduce((total,x)=>total+(num(x.capacityAh)||0),0),sampleVe=batteryVe({...battery,connected:true,voltage:part.voltage,current:part.current}),sampleSoc=battery&&battery.chargeCalculation?.mode!=='bms'?estimatedSoc({...battery,voltage:sampleVe}):null,contribution=sampleSoc!==null&&capacity!==null&&bankCapacity>0?sampleSoc*capacity/bankCapacity:num(part.contribution),usedRecorded=sampleSoc===null||capacity===null||bankCapacity<=0;
        if(contribution!==null){
          const item=open.parts.get(id)||{id,name,sum:0,n:0,last:null,lastTime:-Infinity};
          if(item.lastTime===-Infinity){item.sum=contribution;item.n=1;item.last=contribution;item.lastTime=time;item.usedRecorded=usedRecorded}
          item.name=name;open.parts.set(id,item);
        }
        const currentLine=open.currents.get(id)||{id,name,sum:0,n:0,last:null,lastTime:-Infinity},current=num(part.currentLast??part.current);
        if(current!==null&&currentLine.lastTime===-Infinity){currentLine.sum=current;currentLine.n=1;currentLine.last=current;currentLine.lastTime=time}
        currentLine.name=name;open.currents.set(id,currentLine);
      }
      const currentLine=open.currents.get('bank')||{id:'bank',name:'Banco',sum:0,n:0,last:null,lastTime:-Infinity},current=num(latestBeforeOpen.currentLast??latestBeforeOpen.current);
      if(current!==null&&currentLine.lastTime===-Infinity){open.current=current;open.currentN=1;open.currentLast=current;open.currentLastTime=time;currentLine.sum=current;currentLine.n=1;currentLine.last=current;currentLine.lastTime=time}
      open.currents.set('bank',currentLine);
      const bankVoltage=open.voltages.get('bank')||{id:'bank',name:'Banco',sum:0,n:0,last:null,lastTime:-Infinity},bankV=num(latestBeforeOpen.voltage);
      if(bankV!==null&&bankVoltage.lastTime===-Infinity){bankVoltage.sum=bankV;bankVoltage.n=1;bankVoltage.last=bankV;bankVoltage.lastTime=time}
      open.voltages.set('bank',bankVoltage);
      for(const part of latestBeforeOpen.batteries||[]){const id=String(part.id||part.name||'battery'),name=String(part.name||'Batería'),line=open.voltages.get(id)||{id,name,sum:0,n:0,last:null,lastTime:-Infinity},value=num(part.voltage);if(value!==null&&line.lastTime===-Infinity){line.sum=value;line.n=1;line.last=value;line.lastTime=time}line.name=name;open.voltages.set(id,line)}
    }
    const projectAh=current=>{const value=current*ms/3600000;return value>=0?value*CHARGE_EFFICIENCY:value};
    return{
      bars:bars.map((b,index)=>{
        const isOpen=index===openIndex,averageCurrents=new Map([...b.currents.values()].filter(line=>line.n).map(line=>[line.id,line.sum/line.n]));
        const currents=[...b.currents.values()].filter(line=>line.n).map(line=>({id:line.id,name:line.name,value:isOpen?line.last:line.sum/line.n})),voltages=[...b.voltages.values()].filter(line=>line.n).map(line=>({id:line.id,name:line.name,value:isOpen?line.last:line.sum/line.n})),ah=new Map();
        for(const line of b.ah.values()){
          if(line.id==='bank')continue;
          const currentLine=b.currents.get(line.id),average=averageCurrents.get(line.id);
          const value=isOpen?(currentLine&&currentLine.last===null?line.value:average!==undefined?projectAh(average):line.coveredMs>0?line.value/line.coveredMs*ms:line.value):line.value;
          ah.set(line.id,{id:line.id,name:line.name,value});
        }
        if(isOpen)for(const line of b.currents.values())if(line.id!=='bank'&&line.n&&line.last!==null&&!ah.has(line.id))ah.set(line.id,{id:line.id,name:line.name,value:projectAh(line.sum/line.n)});
        if(isOpen){
          if(ah.size)ah.set('bank',{id:'bank',name:'Banco',value:[...ah.values()].reduce((sum,line)=>sum+line.value,0)});
          else{
            const currentLine=b.currents.get('bank'),average=averageCurrents.get('bank'),bankRaw=b.ah.get('bank');
            if(currentLine&&currentLine.last!==null&&average!==undefined)ah.set('bank',{id:'bank',name:'Banco',value:projectAh(average)});
            else if(bankRaw?.n){const value=currentLine?.last===null?bankRaw.value:bankRaw.coveredMs>0?bankRaw.value/bankRaw.coveredMs*ms:bankRaw.value;ah.set('bank',{id:'bank',name:'Banco',value})}
          }
        }else{
          const bank=b.ah.get('bank');
          if(bank?.n)ah.set('bank',{id:'bank',name:'Banco',value:bank.value});
        }
        const bankVoltageValue=voltages.find(item=>item.id==='bank')?.value,bankCurrentValue=currents.find(item=>item.id==='bank')?.value;
        const estimatedVoltage=Number.isFinite(bankVoltageValue)&&Number.isFinite(bankCurrentValue)?bankVoltageValue-bankCurrentValue*voltageEstimateFactor:null;
        if(Number.isFinite(estimatedVoltage))voltages.push({id:'bank-estimated',name:'Voltaje estimado (Ve)',value:estimatedVoltage});
        return{
          parts:[...b.parts.values()].filter(item=>item.n&&(!isOpen||item.last!==null)).map(item=>({id:item.id,name:item.name,value:isOpen?item.last:item.sum/item.n,usedRecorded:!!item.usedRecorded})),
          current:isOpen?b.currentLast:(b.currentN?b.current/b.currentN:null),
          soc:b.socLast,estimatedSoc:estimateSocFromVoltage(estimatedVoltage),
          ah:[...ah.values()],currents,voltages,isOpen
        };
      }),
      start,ms,openIndex
    };
  }
  function accumulatedBankAh(data){
    const bank=stats(),values=Array(BARS).fill(null);if((trialSocEnd===null&&!Number.isFinite(bank.rem))||!Number.isFinite(bank.cap)||bank.cap<=0||!state.history.length)return{values,capacity:bank.cap};
    const now=Date.now(),currentStart=Math.floor(now/data.ms)*data.ms,visibleStart=data.start,byInterval=new Map();
    for(const sample of state.history){const time=Number(sample.time);if(!Number.isFinite(time)||time>now||time<visibleStart||time>=currentStart)continue;const index=Math.floor(time/data.ms),parts=(sample.batteries||[]).map(part=>num(part.storedAh)).filter(value=>value!==null),amount=parts.length?parts.reduce((sum,value)=>sum+value,0):num(sample.storedAh);if(amount!==null)byInterval.set(index,(byInterval.get(index)||0)+amount)}
    const savedOffset=historyOffset;let currentData=data;if(savedOffset!==0){historyOffset=0;try{currentData=chartData()}finally{historyOffset=savedOffset}}
    let amount=currentData.bars[currentData.openIndex]?.ah.find(item=>item.id==='bank')?.value,remaining=trialSocEnd===null?bank.rem:trialSocEnd*bank.cap/100;
    const startIndex=Math.floor(visibleStart/data.ms),currentIndex=Math.floor(currentStart/data.ms);
    for(let index=currentIndex;index>=startIndex;index--){
      const position=index-startIndex;if(position>=0&&position<BARS)values[position]=remaining;
      if(index===startIndex)break;
      const change=index===currentIndex?amount:byInterval.get(index);if(!Number.isFinite(change))break;remaining-=change*retrospectiveFactor
    }
    return{values,capacity:bank.cap}
  }
  function calculateSocCurveFromVisible(root,{silent=false}={}){
    const status=root.querySelector('[data-copy-status]'),show=message=>{if(status&&!silent)status.textContent=message},data=chartData(),retro=accumulatedBankAh(data),capacity=retro.capacity;
    if(!Number.isFinite(capacity)||capacity<=0){show('No hay capacidad del banco para calcular SOCr.');return false}
    const pairs=[];
    data.bars.forEach((bar,index)=>{const voltage=bar.voltages.find(v=>v.id==='bank-estimated')?.value,ah=retro.values[index],soc=ah/capacity*100;if(Number.isFinite(voltage)&&voltage>0&&Number.isFinite(ah)&&soc>=0&&soc<=100)pairs.push({voltage,soc})});
    pairs.sort((a,b)=>a.voltage-b.voltage);const groups=[];
    for(const pair of pairs){const last=groups[groups.length-1];if(last&&Math.abs(pair.voltage-last.voltage)<.000001){last.sum+=pair.soc;last.count++}else groups.push({voltage:pair.voltage,sum:pair.soc,count:1})}
    if(groups.length<2){show('Se necesitan al menos dos intervalos visibles con Ve y SOCr válidos y voltajes distintos.');return false}
    // The same voltage can occur at different SOC values. Fit the closest nondecreasing curve.
    const blocks=[];
    groups.forEach((group,index)=>{blocks.push({first:index,last:index,sum:group.sum,count:group.count});while(blocks.length>1){const right=blocks[blocks.length-1],left=blocks[blocks.length-2];if(left.sum/left.count<=right.sum/right.count)break;blocks.splice(-2,2,{first:left.first,last:right.last,sum:left.sum+right.sum,count:left.count+right.count})}});
    const fitted=groups.map(group=>({voltage:group.voltage,soc:0}));
    for(const block of blocks)for(let i=block.first;i<=block.last;i++)fitted[i].soc=block.sum/block.count;
    if(socSmoothingPoints>1){const base=fitted.map(p=>p.soc),left=Math.floor((socSmoothingPoints-1)/2),right=socSmoothingPoints-1-left;fitted.forEach((point,index)=>{const values=base.slice(Math.max(0,index-left),Math.min(base.length,index+right+1));point.soc=values.reduce((sum,value)=>sum+value,0)/values.length})}
    const low=fitted[0],high=fitted[fitted.length-1],outside=socCurvePoints.filter(p=>p.voltage<low.voltage-.000001||p.voltage>high.voltage+.000001);
    const left=[],right=[];let lastSoc=-Infinity;
    for(const point of outside.filter(p=>p.voltage<low.voltage)){if(point.soc>=lastSoc&&point.soc<=low.soc){left.push({...point});lastSoc=point.soc}}
    lastSoc=high.soc;for(const point of outside.filter(p=>p.voltage>high.voltage)){if(point.soc>=lastSoc){right.push({...point});lastSoc=point.soc}}
    socCurvePoints=[...left,...fitted,...right];hasCalculatedSocCurve=true;socCurvePreset='manual';socViewport=null;saveSocTrial();const preset=root.querySelector('[data-soc-preset]');if(preset)preset.value='manual';
    drawSocCurve(root);queueDraw(root);const omitted=outside.length-left.length-right.length;
    if(!silent&&status)status.textContent='';
    return true
  }
  function getCurrentHistoryColor(id,lineIds=null){if(String(id)==='bank')return validColor(state.bankHistoryColor,'#20d7e5');const battery=state.batteries.find(item=>String(item.id)===String(id)),configured=validColor(battery?.historyCurrentColor,'');if(configured)return configured;const ids=lineIds||[...new Set(chartData().bars.flatMap(bar=>bar.ah.map(x=>x.id)))].sort();if(!ids.includes(String(id)))ids.push(String(id)),ids.sort();return CURRENT_LINE_COLORS[Math.max(0,ids.indexOf(String(id)))%CURRENT_LINE_COLORS.length]}
  function fillHistoryGaps(bars){const previous=Array(bars.length).fill(-1),next=Array(bars.length).fill(-1);let last=-1;for(let i=0;i<bars.length;i++){previous[i]=last;if(bars[i].parts.length)last=i}last=-1;for(let i=bars.length-1;i>=0;i--){next[i]=last;if(bars[i].parts.length)last=i}for(let i=0;i<bars.length;i++){if(bars[i].parts.length||previous[i]<0||next[i]<0)continue;const leftIndex=previous[i],rightIndex=next[i],left=bars[leftIndex],right=bars[rightIndex],fraction=(i-leftIndex)/(rightIndex-leftIndex),leftParts=new Map(left.parts.map(p=>[p.id,p])),rightParts=new Map(right.parts.map(p=>[p.id,p])),ids=new Set([...leftParts.keys(),...rightParts.keys()]);bars[i].parts=[...ids].map(id=>{const a=leftParts.get(id),b=rightParts.get(id),start=a?.value||0,end=b?.value||0;return{id,name:a?.name||b?.name||'Batería',value:start+(end-start)*fraction}}).filter(p=>p.value>0);const a=num(left.soc),b=num(right.soc);if(bars[i].soc===null&&a!==null&&b!==null)bars[i].soc=a+(b-a)*fraction}return bars}
  function historyDirections(bars){let last=null;const dirs=bars.map((b,i)=>{let dir=null;if(b.current!==null&&b.current!==0)dir=b.current>0?1:-1;else if(i>0&&b.soc!==null&&bars[i-1].soc!==null){const delta=b.soc-bars[i-1].soc;if(delta>0)dir=1;else if(delta<0)dir=-1}if(dir!==null)last=dir;return dir??last});let next=null;for(let i=dirs.length-1;i>=0;i--){if(dirs[i]!==null)next=dirs[i];else if(next!==null)dirs[i]=next}return dirs}
  function axisLabel(time,ms){
    const date=new Date(time),hh=String(date.getHours()).padStart(2,'0'),mm=String(date.getMinutes()).padStart(2,'0'),day=String(date.getDate()).padStart(2,'0'),month=String(date.getMonth()+1).padStart(2,'0');
    if(ms<86400000)return hh+':'+mm;
    if(ms<7*86400000)return day+'/'+month;
    if(ms<28*86400000)return date.toLocaleDateString('es',{day:'2-digit',month:'short'}).replace(/\.$/,'');
    return date.toLocaleDateString('es',{month:'short',year:'2-digit'}).replace(/\.$/,'');
  }
  function niceAhScale(values){const maximum=Math.max(0,...values.map(Math.abs));if(!maximum)return 1;if(maximum<.1)return .1;const power=10**Math.floor(Math.log10(maximum)),fraction=maximum/power,nice=fraction<=1?1:fraction<=2?2:fraction<=5?5:10;return nice*power}
  function niceVoltageScale(values){const finite=values.filter(Number.isFinite);if(!finite.length)return{min:0,max:1};let low=Math.min(...finite),high=Math.max(...finite),span=high-low;if(span<.05){const center=(low+high)/2;span=Math.max(.2,Math.abs(center)*.012);low=center-span/2;high=center+span/2}const raw=span/4,power=10**Math.floor(Math.log10(raw)),fraction=raw/power,step=(fraction<=1?1:fraction<=2?2:fraction<=2.5?2.5:fraction<=5?5:10)*power;return{min:Math.floor(low/step)*step,max:Math.ceil(high/step)*step}}

  function draw(root){
    const canvas=root?.querySelector('[data-battery-history-chart]');if(!canvas)return false;
    const r=canvas.getBoundingClientRect();if(r.width<10||r.height<10)return false;
    const dpr=devicePixelRatio||1,w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);
    if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
    const c=canvas.getContext('2d');if(!c)return false;
    const data=chartData(),bars=data.bars,directions=historyDirections(bars),extremes=historyExtremeData(data);
    const slot=r.width/BARS,bw=Math.max(2,slot*.72),legend=new Map(),axisH=Math.min(r.height*.35,Math.min(68,Math.max(24,r.height<245?58:66))),plotH=Math.max(1,r.height-axisH);
    const ahValues=bars.flatMap(b=>b.ah.filter(x=>!hiddenSeries['ah:'+x.id]).map(x=>x.value)),ahScale=niceAhScale(ahValues);
    const currentValues=bars.flatMap(b=>b.currents.filter(x=>!hiddenSeries['current:'+x.id]).map(x=>x.value)),currentScale=CURRENT_HISTORY_SCALE_AMPS,voltageValues=bars.flatMap(b=>b.voltages.filter(x=>x.id!=='bank-estimated'&&!hiddenSeries['voltage:'+x.id]).map(x=>x.value)),estimatedVoltageVisible=trialVisible['voltage:bank-estimated']&&bars.some(b=>b.voltages.some(x=>x.id==='bank-estimated')),voltageScaleValues=bars.flatMap(b=>b.voltages.filter(x=>x.id!=='bank-estimated'&&(!hiddenSeries['voltage:'+x.id]||(estimatedVoltageVisible&&x.id==='bank'))).map(x=>x.value)),voltageScale=niceVoltageScale(voltageScaleValues);
    for(const axis of root.querySelectorAll('.battery-history-y')){axis.style.removeProperty('height');axis.style.paddingBottom=axisH+'px'}
    const ahLabels={top:'+'+formatAhTick(ahScale)+' Ah',upper:'+'+formatAhTick(ahScale/2)+' Ah',zero:'0 Ah',lower:'−'+formatAhTick(ahScale/2)+' Ah',bottom:'−'+formatAhTick(ahScale)+' Ah'};
    for(const [position,label] of Object.entries(ahLabels)){const node=root.querySelector('[data-ah-label="'+position+'"]');if(node)node.textContent=label}
    const currentLabels={top:'+'+formatAhTick(currentScale)+' A',upper:'+'+formatAhTick(currentScale/2)+' A',zero:'0 A',lower:'−'+formatAhTick(currentScale/2)+' A',bottom:'−'+formatAhTick(currentScale)+' A'};
    for(const [position,label] of Object.entries(currentLabels)){const node=root.querySelector('[data-current-label="'+position+'"]');if(node)node.textContent=label}
    const voltageSpan=voltageScale.max-voltageScale.min||1,voltageLabels={top:(voltageScale.max).toFixed(2)+' V',upper:(voltageScale.max-voltageSpan*.25).toFixed(2)+' V',zero:(voltageScale.min+voltageSpan*.5).toFixed(2)+' V',lower:(voltageScale.min+voltageSpan*.25).toFixed(2)+' V',bottom:(voltageScale.min).toFixed(2)+' V'};
    for(const [position,label] of Object.entries(voltageLabels)){const node=root.querySelector('[data-voltage-label="'+position+'"]');if(node)node.textContent=label}
    for(const [selector,shown] of [['.battery-history-y-ah',ahValues.length],['.battery-history-y-current',currentValues.length],['.battery-history-y-voltage',voltageValues.length||estimatedVoltageVisible]]){
      const axis=root.querySelector(selector);if(axis)axis.hidden=!shown
    }
    const chart=root.querySelector('.battery-history-chart');
    if(chart){
      const changed=chart.classList.contains('hide-ah')===!!ahValues.length||chart.classList.contains('hide-current')===!!currentValues.length||chart.classList.contains('hide-voltage')===!!voltageValues.length;
      chart.classList.toggle('hide-ah',!ahValues.length);chart.classList.toggle('hide-current',!currentValues.length);chart.classList.toggle('hide-voltage',!voltageValues.length);
      if(changed)queueDraw(root)
    }
    c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,r.width,r.height);
    c.strokeStyle='#28516a';c.lineWidth=1;
    for(let i=0;i<=4;i++){const y=Math.round(i*plotH/4)+.5;c.beginPath();c.moveTo(0,y);c.lineTo(r.width,y);c.stroke()}
    const groups=historyPeriodGroups(data.start,data.ms,BARS);
    c.save();c.beginPath();c.rect(0,0,r.width,plotH);c.clip();c.strokeStyle='#1b435a';c.lineWidth=1;
    for(const group of groups){if(group.startIndex===0)continue;const x=Math.round(group.startIndex*slot)+.5;c.beginPath();c.moveTo(x,0);c.lineTo(x,plotH);c.stroke()}
    c.restore();
    const paletteIds=historyBatteries().map(b=>b.id).sort();
    bars.forEach((bar,index)=>{
      if(!bar.parts.length||directions[index]===null)return;
      const direction=directions[index]>0?'charge':'discharge',isOpen=index===data.openIndex;
      if(isOpen){c.save();c.globalAlpha=.72}
      let y=plotH;
      bar.parts.slice().sort((a,b)=>a.id.localeCompare(b.id)).forEach(part=>{
        const height=Math.max(0,Math.min(100,part.value))/100*plotH;if(!height)return;y-=height;
        const key='soc:'+part.id,color=getHistorySeriesColor('soc-'+direction+':'+part.id,paletteIds);
        c.fillStyle=color;if(!hiddenSeries[key])c.fillRect(index*slot+(slot-bw)/2,y,bw,Math.max(1,height));
        legend.set(key,{name:part.name,color,kind:'bar'})
      });
      if(isOpen)c.restore()
    });
    const zeroY=plotH/2;
    if(!hiddenSeries['current:bank'])drawCurrentArea(c,bars,{width:r.width,plotH,slot,currentScale,transparency:currentFillTransparency});
    c.strokeStyle='#7c9bad';c.lineWidth=1.5;c.beginPath();c.moveTo(0,zeroY+.5);c.lineTo(r.width,zeroY+.5);c.stroke();
    const lineIds=[...new Set(bars.flatMap(bar=>[...bar.ah,...bar.currents].map(item=>item.id)))].sort();
    for(const [field,prefix,scale,kind,unit] of [['ah','ah',ahScale,'line','Ah'],['currents','current',currentScale,'current','A'],['voltages','voltage',voltageScale,'line','V']]){
      const ids=[...new Set(bars.flatMap(bar=>bar[field].map(item=>item.id)))].sort();
      for(const id of ids){
        const key=prefix+':'+id,color=getHistorySeriesColor(key,paletteIds),sample=bars.flatMap(bar=>bar[field]).find(item=>item.id===id);
        if(sample)legend.set(key,{name:field==='currents'&&id==='bank'?'Corriente':field==='voltages'?(id==='bank'?'Voltaje del banco':id==='bank-estimated'?'Voltaje estimado (Ve)':sample.name+' · Voltaje'):sample.name+' · '+unit,color,kind:field==='voltages'&&id==='bank-estimated'?'line ve':kind});if(id==='bank-estimated'&&field==='voltages'?!trialVisible['voltage:bank-estimated']:hiddenSeries[key])continue;
        let open=false;c.save();c.setLineDash(field==='currents'?[5,4]:field==='voltages'&&id==='bank-estimated'?[6,4]:[]);c.beginPath();
        bars.forEach((bar,index)=>{
          const value=bar[field].find(item=>item.id===id)?.value;if(!Number.isFinite(value)){open=false;return}
          const x=(index+.5)*slot,y=field==='voltages'?Math.max(2,Math.min(plotH-2,plotH-((value-voltageScale.min)/(voltageScale.max-voltageScale.min||1))*plotH)):Math.max(2,Math.min(plotH-2,zeroY-(value/scale)*zeroY));
          if(!open){c.moveTo(x,y);open=true}else c.lineTo(x,y)
        });
        c.strokeStyle=color;c.lineWidth=2;c.lineJoin='round';c.stroke();c.setLineDash([]);
        bars.forEach((bar,index)=>{
          const value=bar[field].find(item=>item.id===id)?.value;if(!Number.isFinite(value))return;
          const x=(index+.5)*slot,y=field==='voltages'?Math.max(2,Math.min(plotH-2,plotH-((value-voltageScale.min)/(voltageScale.max-voltageScale.min||1))*plotH)):Math.max(2,Math.min(plotH-2,zeroY-(value/scale)*zeroY)),radius=Math.max(1.5,Math.min(2.5,slot*.1));
          c.globalAlpha=index===data.openIndex ? .72 : 1;c.fillStyle=color;c.beginPath();c.arc(x,y,radius,0,Math.PI*2);c.fill();
          if(index===data.openIndex){c.globalAlpha=1;c.strokeStyle=color;c.lineWidth=1;c.beginPath();c.arc(x,y,radius+1,0,Math.PI*2);c.stroke()}
        });
        c.restore()
      }
    }
    const accumulatedKey='ah:bank-remaining',accumulated=accumulatedBankAh(data),accumulatedColor=getHistorySeriesColor(accumulatedKey,paletteIds);
    if(accumulated.values.some(Number.isFinite)){
      legend.set(accumulatedKey,{name:'SOCr retrospectivo por Ah',color:accumulatedColor,kind:'line'});
      if(trialVisible[accumulatedKey]){
        c.save();c.beginPath();c.rect(0,0,r.width,plotH);c.clip();c.strokeStyle=accumulatedColor;c.lineWidth=2.5;c.lineJoin='round';c.beginPath();let open=false;
        accumulated.values.forEach((value,index)=>{if(!Number.isFinite(value)){open=false;return}const x=(index+.5)*slot,y=plotH-value/accumulated.capacity*plotH;if(!open){c.moveTo(x,y);open=true}else c.lineTo(x,y)});c.stroke();
        accumulated.values.forEach((value,index)=>{if(!Number.isFinite(value))return;const x=(index+.5)*slot,y=plotH-value/accumulated.capacity*plotH;c.beginPath();c.arc(x,y,2,0,2*Math.PI);c.fillStyle=accumulatedColor;c.fill()});c.restore()
      }
    }
    if(isChezReference()){
      const key='soc:bank-coulomb',color='#f391d8',capacity=stats().cap,anchor=1795342459141;
      let ah=0;const points=[];
      if(capacity>0)for(const p of state.history.slice().sort((a,b)=>Number(a.time)-Number(b.time))){const t=Number(p.time),charge=num(p.chargeAh),discharge=num(p.dischargeAh);if(!(t>anchor)||charge===null||discharge===null)continue;ah+=charge-discharge;points.push({time:t,soc:100*ah/capacity})}
      if(points.length){legend.set(key,{name:'SOCc por Ah · aproximado',color,kind:'line'});if(trialVisible[key]){c.save();c.beginPath();c.rect(0,0,r.width,plotH);c.clip();c.strokeStyle=color;c.lineWidth=2.5;c.beginPath();let open=false;for(const p of points){const x=(p.time-data.start)/data.ms*slot;if(x<0||x>r.width)continue;const y=plotH-p.soc/100*plotH;if(!open){c.moveTo(x,y);open=true}else c.lineTo(x,y)}c.stroke();c.restore()}}
    }
    const estimatedSocKey='soc:bank-estimated',estimatedSocColor=getHistorySeriesColor(estimatedSocKey,paletteIds),estimatedSocValues=bars.map(bar=>bar.estimatedSoc);
    if(estimatedSocValues.some(Number.isFinite)){
      legend.set(estimatedSocKey,{name:'SOC estimado (Ve)',color:estimatedSocColor,kind:'line soc-estimate'});
      if(trialVisible[estimatedSocKey]){
        c.save();c.strokeStyle=estimatedSocColor;c.lineWidth=2.6;c.lineJoin='round';c.setLineDash([3,4]);c.beginPath();let open=false;
        estimatedSocValues.forEach((value,index)=>{if(!Number.isFinite(value)){open=false;return}const x=(index+.5)*slot,y=plotH-Math.max(0,Math.min(100,value))/100*plotH;if(!open){c.moveTo(x,y);open=true}else c.lineTo(x,y)});
        c.stroke();c.setLineDash([]);estimatedSocValues.forEach((value,index)=>{if(!Number.isFinite(value))return;const x=(index+.5)*slot,y=plotH-Math.max(0,Math.min(100,value))/100*plotH;c.globalAlpha=index===data.openIndex ? .72 : 1;c.fillStyle=estimatedSocColor;c.beginPath();c.arc(x,y,Math.max(1.6,Math.min(2.6,slot*.11)),0,Math.PI*2);c.fill()});c.restore()
      }
    }
    const mark=(x,y,color)=>{
      c.save();c.globalAlpha=.78;c.fillStyle='#071b29';c.strokeStyle=color;c.lineWidth=1.2;c.beginPath();c.arc(x,y,2.5,0,Math.PI*2);c.fill();c.stroke();c.restore()
    };
    for(const kind of ['max','min']){
      const point=extremes.bankSoc[kind],bar=point?bars[point.index]:null;
      if(point&&bar?.parts.length){const total=bar.parts.reduce((sum,part)=>sum+(num(part.value)||0),0),y=plotH-Math.max(0,Math.min(100,total))/100*plotH;mark((point.index+.5)*slot,y,kind==='max'?'#20d7e5':'#f5a35b')}
    }
    if(!hiddenSeries['current:bank']){
      for(const kind of ['max','min']){
        const point=extremes.bankCurrent[kind];if(!point)continue;
        const y=Math.max(2,Math.min(plotH-2,zeroY-(point.value/currentScale)*zeroY));mark((point.index+.5)*slot,y,kind==='max'?'#ffe500':'#ff8b6f')
      }
    }
    c.save();c.strokeStyle='#17394f';c.lineWidth=1;c.beginPath();c.moveTo(0,plotH+.5);c.lineTo(r.width,plotH+.5);c.stroke();
    c.fillStyle='#7890a1';c.font=(r.width<520?8:9)+'px system-ui, sans-serif';c.textAlign='center';c.textBaseline='middle';
    const tickCount=Math.max(2,Math.floor(r.width/58)),step=Math.max(1,Math.ceil(BARS/tickCount));
    for(let index=0;index<BARS;index+=step){const label=axisLabel(data.start+index*data.ms,data.ms);c.fillText(label,(index+.5)*slot,plotH+11)}
    if(data.ms<86400000){
      c.font=(r.width<520?8:9)+'px system-ui, sans-serif';
      for(const group of groups){
        const width=(group.endIndex-group.startIndex)*slot;if(width<48)continue;
        const center=(group.startIndex+group.endIndex)*slot/2;c.fillStyle='#a8bfcb';c.fillText(historyPeriodLabel(group.time,data.ms),center,plotH+axisH-8)
      }
    }
    c.restore();
    const host=root.querySelector('[data-battery-history-legend]');
    if(host)host.innerHTML=[...legend.entries()].filter(([key])=>Object.prototype.hasOwnProperty.call(trialVisible,key)?trialVisible[key]:!hiddenSeries[key]).map(([,item])=>'<span><i class="'+item.kind+'" style="--series-color:'+item.color+'"></i>'+esc(item.name)+'</span>').join('')||(legend.size?'':'<span class="muted">Se necesitan muestras históricas para mostrar aportes.</span>');
    if(host&&bars.some(bar=>bar.parts.some(part=>part.usedRecorded)))host.insertAdjacentHTML('beforeend','<span class="muted">Algunos valores muestran el SOC registrado.</span>');
    return true
  }
  function formatAhTick(value){const n=Number(value),a=Math.abs(n);return a>=10?String(Math.round(n)):a>=1?n.toFixed(1):a>=.1?n.toFixed(2):n.toFixed(3)}
  function queueDraw(root=state.historyRoot||state.root,retries=0){if(drawPending||!root)return;drawPending=true;requestAnimationFrame(()=>{drawPending=false;if(!draw(root)&&root.querySelector?.('[data-battery-history-chart]')&&retries<6)setTimeout(()=>queueDraw(root,retries+1),80)})}
  window.addEventListener('boatstation-page-change',event=>{if(event.detail?.id==='batteryHistory')queueDraw()});
  function historyBatteries(){const items=new Map();for(const b of state.batteries){const id=String(b.id||b.address||'');if(id)items.set(id,{id,name:String(b.name||b.deviceName||'Batería')})}for(const point of state.history)for(const part of point.batteries||[]){const id=String(part.id||part.name||'');if(id&&!items.has(id))items.set(id,{id,name:String(part.name||'Batería')})}return [...items.values()]}
  function getHistorySeriesColor(key,knownIds=null){key=String(key);const configured=validColor(historyColors[key],'');if(configured)return configured;const split=key.indexOf(':'),kind=key.slice(0,split),id=key.slice(split+1),ids=knownIds||historyBatteries().map(b=>b.id).sort();if(kind==='soc-charge'||kind==='soc-discharge'){const palette=kind==='soc-charge'?['#3fae54','#69c95b','#91db70','#b7ea8b']:['#b94149','#d65b5d','#e57a70','#f09c8b'];return palette[Math.max(0,ids.indexOf(id))%palette.length]}if(kind==='ah'&&id==='bank-remaining')return '#fff0a0';if(kind==='voltage'&&id==='bank-estimated')return '#ff9d54';if(kind==='soc'&&id==='bank-estimated')return '#c5a1ff';if(kind==='voltage'){const palette=['#f1c75b','#53c8ef','#ad8cff','#ff9878','#74d69b'];return palette[Math.max(0,ids.indexOf(id))%palette.length]}if(kind==='ah'||kind==='current'){const lineIds=[...new Set([...ids,'bank'])].sort();return getCurrentHistoryColor(id,lineIds)}return '#20d7e5'}
  function setHistorySeriesColor(key,value){key=String(key);const color=validColor(value,'');if(!color||!/^(soc-charge|soc-discharge|ah|current|voltage):.+/.test(key))return false;historyColors[key]=color;write(COLORS_KEY,historyColors);queueDraw();return true}
  function isHistorySeriesVisible(key){return !hiddenSeries[String(key)]}
  function setHistorySeriesVisible(key,visible){key=String(key);if(!/^(soc|ah|current|voltage):.+/.test(key))return;hiddenSeries[key]=!visible;if(Object.prototype.hasOwnProperty.call(trialVisible,key))trialVisible[key]=!!visible;saveHistoryVisibility();queueDraw()}

  function afterRender(root){
    state.root=root;const canvas=root.querySelector('[data-battery-history-chart]'),chart=root.querySelector('.battery-history-chart');
    if(canvas){
      state.historyRoot=root;
      if(typeof ResizeObserver==='function'&&chart&&chart!==historyObservedChart){
        historyResizeObserver?.disconnect();historyObservedChart=chart;
        historyResizeObserver=new ResizeObserver(entries=>{if(entries.some(entry=>entry.contentRect.width>=10&&entry.contentRect.height>=10)){queueDraw(root);drawSocCurve(root)}});
        historyResizeObserver.observe(chart);const curveCanvas=root.querySelector('[data-battery-soc-curve-chart]');if(curveCanvas)historyResizeObserver.observe(curveCanvas)
      }
      bindHistoryNavigation(root);bindHistoryControlProtection();bindSocCurveEditor(root);syncHistoryControls(root);renderHistoryExtremes(root);queueDraw(root);drawSocCurve(root)
    }
    root.querySelectorAll('[data-battery-manage]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();openManager?.()}));
    root.querySelector('[data-battery-history-export]')?.addEventListener('click',downloadHistoryCsv);
    const fillTransparency=root.querySelector('[data-current-fill-transparency]');fillTransparency?.addEventListener('input',()=>{currentFillTransparency=Math.max(0,Math.min(100,Number(fillTransparency.value)||0));write(CURRENT_FILL_TRANSPARENCY_KEY,currentFillTransparency);const label=root.querySelector('[data-current-fill-value]');if(label)label.textContent=currentFillTransparency+'%';queueDraw(root)});
    const socControls=root.querySelector('[data-battery-soc-curve-details] .battery-history-soc-curve-content');
    if(socControls&&isChezReference()&&!socControls.querySelector('[data-socc-control]')){
      const label=document.createElement('label');label.dataset.soccControl='1';label.className='battery-soc-control-row';
      label.innerHTML='<input type="checkbox" data-socc-toggle> SOCc <small>0 % el 22/11 a las 6:14 · aproximado</small>';
      const toggle=label.querySelector('[data-socc-toggle]');toggle.checked=trialVisible['soc:bank-coulomb'];toggle.addEventListener('change',()=>{trialVisible['soc:bank-coulomb']=toggle.checked;hiddenSeries['soc:bank-coulomb']=!toggle.checked;saveHistoryVisibility();queueDraw(root)});socControls.prepend(label);
    }
    root.querySelectorAll('[data-trial-visible]').forEach(input=>input.addEventListener('change',()=>{const key=input.dataset.trialVisible;if(!Object.prototype.hasOwnProperty.call(trialVisible,key))return;trialVisible[key]=input.checked;hiddenSeries[key]=!input.checked;saveHistoryVisibility();queueDraw(root)}));
    const smoothingInput=root.querySelector('[data-soc-smooth]');
    const setSmoothing=(value,updateField=true)=>{const amount=num(value);if(amount===null||!Number.isInteger(amount)||amount<1||amount>BARS)return false;socSmoothingPoints=amount;if(updateField&&smoothingInput)smoothingInput.value=String(amount);if(hasCalculatedSocCurve)calculateSocCurveFromVisible(root,{silent:true});return true};
    root.querySelectorAll('[data-soc-smooth-step]').forEach(button=>button.addEventListener('click',()=>{const current=num(smoothingInput?.value)??socSmoothingPoints;setSmoothing(Math.max(1,Math.min(BARS,current+Number(button.dataset.socSmoothStep))))}));
    smoothingInput?.addEventListener('input',()=>setSmoothing(smoothingInput.value,false));smoothingInput?.addEventListener('change',()=>{if(!setSmoothing(smoothingInput.value))smoothingInput.value=String(socSmoothingPoints)});smoothingInput?.addEventListener('blur',()=>{smoothingInput.value=String(socSmoothingPoints);notifyHistoryInteractionEnd()});
    root.querySelector('[data-calculate-soc]')?.addEventListener('click',()=>calculateSocCurveFromVisible(root));
    root.querySelector('[data-copy-factor]')?.addEventListener('click',()=>copyTrialSettings('factor',root));
    root.querySelector('[data-copy-curve]')?.addEventListener('click',()=>copyTrialSettings('curve',root));
    const factorInput=root.querySelector('[data-factor-value]');
    const setFactor=(value,updateField=true)=>{const n=num(value);if(n===null||n<0)return false;voltageEstimateFactor=Math.round(n*100000)/100000;if(updateField&&factorInput)factorInput.value=voltageEstimateFactor.toFixed(5);queueDraw(root);return true};
    root.querySelectorAll('[data-factor-step]').forEach(button=>button.addEventListener('click',()=>{const current=num(factorInput?.value)??voltageEstimateFactor;setFactor(Math.max(0,current+Number(button.dataset.factorStep)*0.0001))}));
    factorInput?.addEventListener('input',()=>setFactor(factorInput.value,false));factorInput?.addEventListener('change',()=>{if(!setFactor(factorInput.value))factorInput.value=voltageEstimateFactor.toFixed(5)});factorInput?.addEventListener('blur',()=>{factorInput.value=voltageEstimateFactor.toFixed(5);notifyHistoryInteractionEnd()});
    const frInput=root.querySelector('[data-fr-value]');
    const setFr=(value,updateField=true)=>{const n=num(value);if(n===null||n<0)return false;retrospectiveFactor=Math.round(n*100)/100;if(updateField&&frInput)frInput.value=retrospectiveFactor.toFixed(2);queueDraw(root);return true};
    root.querySelectorAll('[data-fr-step]').forEach(button=>button.addEventListener('click',()=>{const current=num(frInput?.value)??retrospectiveFactor;setFr(Math.max(0,current+Number(button.dataset.frStep)*.01))}));
    frInput?.addEventListener('input',()=>setFr(frInput.value,false));frInput?.addEventListener('change',()=>{if(!setFr(frInput.value))frInput.value=retrospectiveFactor.toFixed(2)});frInput?.addEventListener('blur',()=>{frInput.value=retrospectiveFactor.toFixed(2);notifyHistoryInteractionEnd()});
    const ahEndInput=root.querySelector('[data-ah-end]');
    const setAhEnd=(value,updateField=true)=>{const amount=num(value);if(amount===null||amount<0||amount>100)return false;trialSocEnd=amount;if(updateField&&ahEndInput)ahEndInput.value=trialSocEnd.toFixed(1);queueDraw(root);return true};
    root.querySelectorAll('[data-ah-end-step]').forEach(button=>button.addEventListener('click',()=>{const current=num(ahEndInput?.value)??trialSocEnd??stats().soc??0;setAhEnd(Math.max(0,Math.min(100,current+Number(button.dataset.ahEndStep)*0.1)))}));
    root.querySelector('[data-load-current-soc]')?.addEventListener('click',()=>{const current=stats().soc;if(Number.isFinite(current))setAhEnd(current)});
    ahEndInput?.addEventListener('blur',()=>notifyHistoryInteractionEnd());
    ahEndInput?.addEventListener('input',()=>{if(num(ahEndInput.value)!==null)setAhEnd(ahEndInput.value,false)});ahEndInput?.addEventListener('change',()=>{if(!setAhEnd(ahEndInput.value))ahEndInput.value=(trialSocEnd??stats().soc??0).toFixed(1)});
    root.querySelectorAll('[data-battery-history-zoom]').forEach(button=>button.addEventListener('click',()=>{
      const delta=button.dataset.batteryHistoryZoom==='in'?-1:1;changeHistoryZoom(zoom+delta)
    }))
  }
  function updateBattery(data){if(!data)return;data=clone(data);const now=Date.now(),id=String(data.id||data.address||data.deviceId||data.mac||data.name||'battery');let b=state.batteries.find(x=>String(x.id)===id);if(!b){b={id,name:data.name||data.deviceName||'Batería',capacityAh:num(data.capacityAh)||0,connected:true};state.batteries.push(b)}if(b.connected!==false)rememberCharge(b,now);Object.assign(b,data,{id,connected:data.connected!==false});if(data.connected===false){voltageAutoWindows.delete(id);b.current=null;b.voltage=null;if(b.currentCorrection)b.currentCorrection.lastSample=null}else{learnVoltageCorrection(b,now);rememberCharge(b,now);observeVoltageAuto(b,data,now)}accumulateCurrent(b,num(b.current),now);const s=stats();if(!state.remoteAuthoritative&&(s.soc!==null||s.current!==null))appendHistory(s);saveCurrent();requestRender('batteries');window.dispatchEvent(new CustomEvent('boatstation-battery-state',{detail:s}))}
  function addBattery(device){const id=String(device.id||device.address||device.deviceId||device.mac||device.name||Date.now());if(state.batteries.some(b=>String(b.id)===id))return;state.batteries.push({id,name:device.name||device.deviceName||'Batería',deviceName:device.name||device.deviceName||'',address:device.address||device.mac||'',capacityAh:num(device.capacityAh)||0,connected:false});saveCurrent(true);requestRender('batteries')}
  async function copyTrialSettings(kind,root){const status=root.querySelector('[data-copy-status]');if(!state.batteries.length){if(status)status.textContent='No hay baterías vinculadas.';return}if(kind==='curve'&&!socCurvePoints.every((p,i)=>i===0||p.soc>=socCurvePoints[i-1].soc)){if(status)status.textContent='La curva debe ser creciente para copiarla.';return}let ok=true;for(const b of state.batteries){const c=clone(b.chargeCalculation||{mode:'bms'});if(kind==='curve'){c.mode='manual';c.points=socCurvePoints.map(p=>[p.voltage,p.soc])}else c.veFactor=voltageEstimateFactor;const result=await setChargeCalculation(b.id,c);if(result===false)ok=false}if(status)status.textContent=ok?'Configuración enviada a las baterías.':'No se pudo actualizar alguna batería.'}
  function setChargeCalculation(id,config){if(state.remoteAuthoritative){const send=window.BoatStationRemoteCommand?.send;if(typeof send!=='function')return false;const target=JSON.stringify(config),batteryId=String(id);return Promise.resolve(send('battery.chargeCalculation',{id,config})).then(ok=>{if(!ok)return false;return new Promise(resolve=>{const start=Date.now(),check=()=>{const b=state.batteries.find(x=>String(x.id)===batteryId);if(b&&JSON.stringify(b.chargeCalculation)===target){resolve(true);return}if(Date.now()-start>=25000){resolve(false);return}setTimeout(check,250)};check()})}).catch(()=>false)}const b=state.batteries.find(x=>String(x.id)===String(id));if(!b)return false;const previous=b.chargeCalculation;b.chargeCalculation=clone(config);if(!saveCurrent(true)){if(previous===undefined)delete b.chargeCalculation;else b.chargeCalculation=previous;return false}requestRender('batteries');return true}
  function setBankHistoryColor(value){const color=validColor(value,'');if(!color)return false;state.bankHistoryColor=color;if(state.remoteAuthoritative){window.BoatStationRemoteCommand?.send?.('battery.bankHistoryColor',{color});requestRender('batteries');return true}saveCurrent(true);requestRender('batteries');return true}
  function setCurrentHistoryColor(id,value){const color=validColor(value,'');if(!color)return false;const battery=state.batteries.find(b=>String(b.id)===String(id));if(!battery)return false;battery.historyCurrentColor=color;if(state.remoteAuthoritative){window.BoatStationRemoteCommand?.send?.('battery.currentHistoryColor',{id:String(id),color});requestRender('batteries');return true}saveCurrent(true);requestRender('batteries');return true}
  function removeBattery(id){if(state.remoteAuthoritative)return window.BoatStationRemoteCommand?.send?.('battery.remove',{id});state.batteries=state.batteries.filter(b=>String(b.id)!==String(id));saveCurrent(true);requestRender('batteries')}
  function renameBank(name){const n=String(name||'').trim();if(!n)return;if(state.remoteAuthoritative)return window.BoatStationRemoteCommand?.send?.('battery.renameBank',{name:n});state.bankName=n;saveCurrent(true);requestRender('batteries')}
  function isChezReference(){const names=new Set(state.batteries.map(b=>String(b.name||'').toUpperCase()));return names.has('HSF5D0')&&names.has('HSFB46')}
  let historyWriteResult=null;
  function insertEstimatedHistory(payload){
    const batchId=String(payload?.batchId||'');
    try{
      if(state.remoteAuthoritative)throw Error('La escritura debe realizarse en el servidor');
      const rows=estimatedRows(state.history,batchId,String(payload?.description||''),payload?.intervals);
      if(!rows.length){historyWriteResult={batchId,status:'already_present',inserted:0};return true}
      const next=state.history.concat(rows).sort((a,b)=>Number(a.time)-Number(b.time));
      localStorage.setItem(HISTORY_KEY,JSON.stringify(next));
      state.history=next;historyWriteResult={batchId,status:'saved',inserted:rows.length};
      requestRender('batteryHistory');return true;
    }catch(error){historyWriteResult={batchId,status:'error',message:String(error?.message||error)};return false}
  }
  // Remote needs the compacted Core history to render the same battery chart.
  function exportRemoteState(){return{historyWriteResult:clone(historyWriteResult),bankName:state.bankName,bankHistoryColor:state.bankHistoryColor,batteries:clone(state.batteries),history:clone(state.history),statsSummary:clone(stats())}}
  function applyRemoteState(remote){if(!remote||typeof remote!=='object')return;state.remoteAuthoritative=true;if(typeof remote.bankName==='string')state.bankName=remote.bankName;if(remote.bankHistoryColor!==undefined)state.bankHistoryColor=validColor(remote.bankHistoryColor,state.bankHistoryColor);if(Array.isArray(remote.batteries)){state.batteries=clone(remote.batteries)}if(Array.isArray(remote.history)){state.history=clone(remote.history)}requestRender('batteries');window.dispatchEvent(new CustomEvent('boatstation-battery-state',{detail:stats()}))}
  function setScanDevices(list){state.scanDevices=Array.isArray(list)?clone(list):[]}
  function executeRemoteCommand(command,payload){if(command==='battery.history.insertEstimated')return insertEstimatedHistory(payload);if(command==='battery.edit'&&payload?.voltageAutoAction&&typeof payload.voltageAutoAction.active==='boolean')setVoltageAutoCalibration(payload?.id,payload.voltageAutoAction.active,payload.voltageAutoAction.actionId);else if(command==='battery.edit'&&Array.isArray(payload?.voltageCalibrationPoints))setVoltageCalibrationPoints(payload?.id,payload.voltageCalibrationPoints);else if(command==='battery.chargeCalculation')setChargeCalculation(payload?.id,payload?.config);else if(command==='battery.currentHistoryColor')setCurrentHistoryColor(payload?.id,payload?.color);else if(command==='battery.bankHistoryColor')setBankHistoryColor(payload?.color);else if(command==='battery.add')addBattery(payload?.device||payload);else if(command==='battery.remove')removeBattery(payload?.id);else if(command==='battery.renameBank')renameBank(payload?.name);else if(command==='battery.scan')try{window.BoatStationCore?.openBluetoothScanner?.()||window.NativeBridge?.startBatteryScan?.()}catch{}}
  window.addEventListener('resize',()=>queueDraw());
  window.BoatStationBatteryState={exportRemoteState,applyRemoteState,executeRemoteCommand,setScanDevices,isRemote:()=>state.remoteAuthoritative};
  return{id:'batteries',name:'Baterías',pages:4,summary,page,afterRender,state,getIndicatorSocSource,setIndicatorSocSource,isHistoryInteracting,updateBattery,addBattery,removeBattery,renameBank,setChargeCalculation,setVoltageCalibrationPoints,setVoltageAutoCalibration,estimatedVoltage,setBankHistoryColor,setCurrentHistoryColor,getCurrentHistoryColor,historyBatteries,getHistorySeriesColor,setHistorySeriesColor,isHistorySeriesVisible,setHistorySeriesVisible,stats,exportHistoryCsv:downloadHistoryCsv,exportRemoteState,applyRemoteState};
}



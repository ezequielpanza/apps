const STORAGE_KEY='bs.notifications.v1';
const DEFAULTS={
  battery:{moduleEnabled:true,critical:{enabled:false,threshold:10,repeatMinutes:0},solarStart:{enabled:false,minCurrent:3,riseCurrent:2,lastAlarmDay:'',lastDetectedDay:'',peakCurrent:0},solarLoss:{enabled:false,minCurrent:1.5,dropPercent:70,holdMinutes:5}},
  general:{connectionLost:true,connectionEstablished:true,connectionAlarmDefaultsVersion:1,ttsVoice:'',ttsRate:1},
  messages:{
    batteryCritical:'Batería crítica, llegamos al {porcentaje} por ciento.',
    solarStart:'Paneles solares cargando.',
    solarLoss:'Paneles solares no están cargando.',
    connectionLost:'Conexión con {barco} perdida.',
    connectionEstablished:'Conexión con {barco} establecida.',
    anchorLost:'Atención, Chez se está alejando del ancla.'
  }
};

function clamp(value,min,max,fallback){return Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback}
function cleanMessage(value,fallback){const message=String(value??'').trim().slice(0,180);return message||fallback}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]))}
function readSettings(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')||{},battery=saved.battery||{},critical=battery.critical||{},solarStart=battery.solarStart||{},solarLoss=battery.solarLoss||{},messages=saved.messages||{};
    return{
      battery:{
        moduleEnabled:battery.moduleEnabled!==false,
        critical:{enabled:!!critical.enabled,threshold:clamp(Number(critical.threshold),1,100,10),repeatMinutes:[0,1,5,10,30].includes(Number(critical.repeatMinutes))?Number(critical.repeatMinutes):0},
        solarStart:{enabled:!!solarStart.enabled,minCurrent:clamp(Number(solarStart.minCurrent),0.5,100,3),riseCurrent:clamp(Number(solarStart.riseCurrent),0.5,50,2),lastAlarmDay:String(solarStart.lastAlarmDay||''),lastDetectedDay:String(solarStart.lastDetectedDay||''),peakCurrent:clamp(Number(solarStart.peakCurrent),0,100,0)},
        solarLoss:{enabled:!!solarLoss.enabled,minCurrent:clamp(Number(solarLoss.minCurrent),0.1,100,1.5),dropPercent:clamp(Number(solarLoss.dropPercent),10,95,70),holdMinutes:[1,3,5,10,15].includes(Number(solarLoss.holdMinutes))?Number(solarLoss.holdMinutes):5}
      },
      general:{connectionLost:Number(saved.general?.connectionAlarmDefaultsVersion)===1?saved.general?.connectionLost!==false:true,connectionEstablished:Number(saved.general?.connectionAlarmDefaultsVersion)===1?saved.general?.connectionEstablished!==false:true,connectionAlarmDefaultsVersion:1,ttsVoice:String(saved.general?.ttsVoice||''),ttsRate:[0.75,0.9,1,1.15,1.3,1.5].includes(Number(saved.general?.ttsRate))?Number(saved.general.ttsRate):1},
      messages:{
        batteryCritical:cleanMessage(messages.batteryCritical,DEFAULTS.messages.batteryCritical),
        solarStart:cleanMessage(messages.solarStart,DEFAULTS.messages.solarStart),
        solarLoss:cleanMessage(messages.solarLoss,DEFAULTS.messages.solarLoss),
        connectionLost:cleanMessage(messages.connectionLost,DEFAULTS.messages.connectionLost),
        connectionEstablished:cleanMessage(messages.connectionEstablished,DEFAULTS.messages.connectionEstablished),
        anchorLost:cleanMessage(messages.anchorLost,DEFAULTS.messages.anchorLost)
      }
    };
  }catch{return JSON.parse(JSON.stringify(DEFAULTS))}
}
function writeSettings(settings){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(settings))}catch{}}
function dayKey(date=new Date()){return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}

export function createNotificationsMenu({sheet,batterySheet,moduleMenu,openSheet,closeSheet,getBatteryStats,getLocation,getLocationAlarmEnabled,setLocationAlarmEnabled,onBatteryBack}){
  const settings=readSettings();
  let lastStats=null,lastSoc=null,lastCurrent=null,batteryCritical=false,lastSpokenAt=0;
  let remoteConnection=null,remoteEverConnected=false,remoteLossAnnounced=false,remoteStationName='Chez';
  let solarDay='',solarSamples=[],solarPeak=0,solarSession=false,solarLowSince=0,solarRecoverySince=0,solarPeakSavedAt=0,solarState='unknown';
  window.BoatStationSolarStatus={state:solarState};

  function ttsVoices(){
    let hasNativeVoiceList=false;
    try{
      for(const bridge of [window.CoreBridge,window.NativeBridge])if(typeof bridge?.getTtsVoices==='function'){
        hasNativeVoiceList=true;
        const list=JSON.parse(bridge.getTtsVoices()||'[]');
        if(Array.isArray(list)&&list.length)return list.map(voice=>({id:String(voice.id||voice.name||''),name:String(voice.name||voice.id||'Voz'),lang:String(voice.language||voice.lang||'')})).filter(voice=>voice.id);
      }
    }catch{}
    if(hasNativeVoiceList)return[];
    try{return(window.speechSynthesis?.getVoices?.()||[]).filter(voice=>String(voice.lang||'').toLowerCase().startsWith('es')).map(voice=>({id:String(voice.voiceURI||voice.name),name:String(voice.name||voice.voiceURI),lang:String(voice.lang||'')}))}catch{return[]}
  }
  function applyTtsSettings(){
    const voice=settings.general.ttsVoice,rate=settings.general.ttsRate;
    for(const bridge of [window.CoreBridge,window.NativeBridge])try{if(typeof bridge?.setTtsSettings==='function'){bridge.setTtsSettings(voice,rate);return}}catch{}
  }
  function renderTtsVoiceOptions(select){
    if(!select)return;
    const selected=settings.general.ttsVoice,voices=ttsVoices();
    select.innerHTML=`<option value="" ${selected?'':'selected'}>Automática (español)</option>${voices.map(voice=>`<option value="${escapeHtml(voice.id)}" ${voice.id===selected?'selected':''}>${escapeHtml(voice.name)}${voice.lang?` (${escapeHtml(voice.lang)})`:''}</option>`).join('')}`;
  }
  function refreshTtsVoiceOptions(){renderTtsVoiceOptions(sheet.querySelector('[data-tts-voice]'))}

  function say(text){
    try{
      applyTtsSettings();
      const core=window.CoreBridge;
      if(typeof core?.isTtsReady==='function'&&core.isTtsReady()&&typeof core.alarm==='function'){core.alarm(text);return true}
      const native=window.NativeBridge;
      if(typeof native?.isTtsReady==='function'&&native.isTtsReady()&&typeof native.alarm==='function'){native.alarm(text);return true}
      if(window.speechSynthesis&&typeof SpeechSynthesisUtterance==='function'){
        window.speechSynthesis.cancel();
        applyTtsSettings();
        const utterance=new SpeechSynthesisUtterance(text);
        utterance.lang='es-AR';utterance.rate=settings.general.ttsRate;
        const voice=ttsVoices().find(item=>item.id===settings.general.ttsVoice);
        if(voice)utterance.voice=(window.speechSynthesis.getVoices()||[]).find(item=>(item.voiceURI||item.name)===voice.id)||null;
        window.speechSynthesis.speak(utterance);
        return true;
      }
    }catch{}
    return false;
  }

  function formatNotificationMessage(template,values={}){
    return String(template||'').replace(/\{(porcentaje|barco)\}/gi,(match,key)=>String(values[key.toLowerCase()]??match));
  }
  function batteryMessage(soc=null){
    const value=soc===null?settings.battery.critical.threshold:Math.round(Number(soc));
    return formatNotificationMessage(settings.messages.batteryCritical,{porcentaje:value});
  }
  function connectionLostMessage(){return formatNotificationMessage(settings.messages.connectionLost,{barco:remoteStationName||'Chez'})}
  function connectionEstablishedMessage(){return formatNotificationMessage(settings.messages.connectionEstablished,{barco:remoteStationName||'Chez'})}
  function notificationMessagePreview(id){
    if(id==='batteryCritical')return batteryMessage();
    if(id==='connectionLost')return connectionLostMessage();
    if(id==='connectionEstablished')return connectionEstablishedMessage();
    return String(settings.messages[id]||'');
  }
  function messageEditorMarkup(id,label,preview,hint=''){
    const inputId='notificationMessage-'+id,extra=id==='batteryCritical'?' data-battery-alarm-preview':'';
    return '<div class="notification-message-editor">'+
      '<div class="notification-message-view" data-notification-message-view="'+id+'">'+
        '<span class="notification-message-copy" data-notification-message-preview="'+id+'"'+extra+'>'+escapeHtml(preview)+'</span>'+
        '<button type="button" class="notification-edit-button" data-notification-message-edit="'+id+'" aria-label="Editar mensaje de '+escapeHtml(label)+'" title="Editar mensaje">'+
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg>'+
        '</button>'+
      '</div>'+
      '<div class="notification-message-form" data-notification-message-form="'+id+'" hidden>'+
        '<textarea rows="2" maxlength="180" id="'+inputId+'" data-notification-message-input="'+id+'" aria-label="Texto del mensaje de '+escapeHtml(label)+'">'+escapeHtml(settings.messages[id])+'</textarea>'+
        (hint?'<small class="notification-message-hint">'+escapeHtml(hint)+'</small>':'')+
        '<div class="notification-message-actions"><button type="button" class="btn" data-notification-message-save="'+id+'">Guardar</button><button type="button" class="btn notification-message-cancel" data-notification-message-cancel="'+id+'">Cancelar</button></div>'+
        '<small class="notification-message-error" data-notification-message-error="'+id+'" role="alert"></small>'+
      '</div>'+
    '</div>';
  }
  function updateNotificationMessagePreview(id){
    const preview=notificationMessagePreview(id);
    for(const node of document.querySelectorAll('[data-notification-message-preview="'+id+'"]'))node.textContent=preview;
  }
  function handleMessageEditorClick(root,event){
    const button=event.target.closest('[data-notification-message-edit],[data-notification-message-save],[data-notification-message-cancel]');
    if(!button||!root.contains(button))return false;
    const id=button.getAttribute('data-notification-message-edit')||button.getAttribute('data-notification-message-save')||button.getAttribute('data-notification-message-cancel');
    const editor=button.closest('.notification-message-editor');
    const view=editor?.querySelector('[data-notification-message-view]');
    const form=editor?.querySelector('[data-notification-message-form]');
    const input=editor?.querySelector('[data-notification-message-input]');
    const error=editor?.querySelector('[data-notification-message-error]');
    if(!id||!editor||!view||!form||!input)return true;
    if(button.hasAttribute('data-notification-message-edit')){
      input.value=settings.messages[id]||'';
      if(error)error.textContent='';
      view.hidden=true;form.hidden=false;input.focus();
      return true;
    }
    if(button.hasAttribute('data-notification-message-cancel')){
      input.value=settings.messages[id]||'';
      if(error)error.textContent='';
      view.hidden=false;form.hidden=true;
      return true;
    }
    const value=String(input.value||'').trim();
    if(!value){if(error)error.textContent='Escribí un mensaje antes de guardarlo.';input.focus();return true}
    settings.messages[id]=value.slice(0,180);
    writeSettings(settings);
    updateNotificationMessagePreview(id);
    if(error)error.textContent='';
    view.hidden=false;form.hidden=true;
    return true;
  }
  function speakConnectionLost(){
    if(remoteConnection!==false||!remoteEverConnected||remoteLossAnnounced||!settings.general.connectionLost)return false;
    const spoken=say(connectionLostMessage());
    if(spoken)remoteLossAnnounced=true;
    return spoken;
  }
  function solarNight(date){
    const position=getLocation?.(),lat=Number(position?.lat),lon=Number(position?.lon);
    if(!Number.isFinite(lat)||!Number.isFinite(lon))return date.getHours()<6||date.getHours()>=18;
    const year=date.getFullYear(),yearStart=new Date(year,0,0),day=Math.floor((date-yearStart)/86400000),hour=date.getHours()+date.getMinutes()/60+date.getSeconds()/3600;
    const gamma=2*Math.PI/365*(day-1+(hour-12)/24),c=Math.cos,s=Math.sin;
    const equation=229.18*(0.000075+0.001868*c(gamma)-0.032077*s(gamma)-0.014615*c(2*gamma)-0.040849*s(2*gamma));
    const declination=0.006918-0.399912*c(gamma)+0.070257*s(gamma)-0.006758*c(2*gamma)+0.000907*s(2*gamma)-0.002697*c(3*gamma)+0.00148*s(3*gamma);
    const zone=-date.getTimezoneOffset()/60,trueSolarMinutes=(hour*60+equation+4*lon-60*zone+14400)%1440,hourAngle=(trueSolarMinutes/4-180)*Math.PI/180,latitude=lat*Math.PI/180;
    const cosZenith=Math.max(-1,Math.min(1,Math.sin(latitude)*Math.sin(declination)+Math.cos(latitude)*Math.cos(declination)*Math.cos(hourAngle)));
    return 90-Math.acos(cosZenith)*180/Math.PI < -6;
  }
  function setSolarState(next,silent=false){
    if(next===solarState)return;
    const previous=solarState;solarState=next;window.BoatStationSolarStatus={state:next};
    window.dispatchEvent(new CustomEvent('boatstation-solar-status',{detail:{state:next,current:lastCurrent,peakCurrent:solarPeak}}));
    if(silent||!settings.battery.moduleEnabled)return;
    if(next==='charging'&&previous!=='unknown'&&settings.battery.solarStart.enabled)say(settings.messages.solarStart);
    else if((next==='cloudy'||next==='night')&&previous==='charging'&&settings.battery.solarLoss.enabled)say(settings.messages.solarLoss);
  }
  function updateSolar(current){
    const solarStart=settings.battery.solarStart,solarLoss=settings.battery.solarLoss,now=new Date(),today=dayKey(now),hour=now.getHours(),timestamp=Date.now(),night=solarNight(now);
    if(today!==solarDay){solarDay=today;solarSamples=[];solarSession=solarStart.lastDetectedDay===today;solarPeak=solarSession?solarStart.peakCurrent:0;solarPeakSavedAt=timestamp;solarLowSince=0;solarRecoverySince=0}
    if(!Number.isFinite(current))return;
    if(solarState==='unknown')setSolarState(night?'night':solarSession&&current>=solarStart.minCurrent?'charging':'daylight',true);
    if(current>0&&(solarSession||hour>=5&&hour<12)){const nextPeak=Math.max(solarPeak,current);if(nextPeak>solarPeak){solarPeak=nextPeak;if(solarSession&&(solarPeak>=solarStart.peakCurrent+1||timestamp-solarPeakSavedAt>=60000)){solarStart.peakCurrent=solarPeak;solarPeakSavedAt=timestamp;writeSettings(settings)}}}

    if(!night&&hour>=5&&hour<12&&current>0){
      const last=solarSamples[solarSamples.length-1];
      if(!last||timestamp-last.time>=30000)solarSamples.push({time:timestamp,current});
      else last.current=current;
      solarSamples=solarSamples.filter(sample=>timestamp-sample.time<=5*60*1000).slice(-8);
      const first=solarSamples[0],latest=solarSamples[solarSamples.length-1];
      if(!solarSession&&solarSamples.length>=4&&first&&latest&&latest.time-first.time>=120000&&latest.current>=solarStart.minCurrent&&latest.current-first.current>=solarStart.riseCurrent){
        const risingSteps=solarSamples.slice(1).filter((sample,index)=>sample.current>=solarSamples[index].current-0.2).length;
        if(risingSteps>=Math.ceil((solarSamples.length-1)*0.7)){
          solarSession=true;solarStart.lastDetectedDay=today;solarStart.peakCurrent=solarPeak;solarPeakSavedAt=timestamp;writeSettings(settings);setSolarState('charging');
        }
      }
    }else solarSamples=[];

    if(solarState==='charging'){
      const lowThreshold=Math.max(solarLoss.minCurrent,solarPeak*(1-solarLoss.dropPercent/100));
      if(night||current<=lowThreshold){if(!solarLowSince)solarLowSince=timestamp;if(timestamp-solarLowSince>=solarLoss.holdMinutes*60000)setSolarState(night?'night':'cloudy')}
      else solarLowSince=0;
    }else if(solarState==='cloudy'&&solarSession&&!night){
      const recoverThreshold=Math.max(solarStart.minCurrent,solarPeak*(1-solarLoss.dropPercent/100)+Math.max(0.5,solarPeak*0.1));
      if(current>=recoverThreshold){if(!solarRecoverySince)solarRecoverySince=timestamp;if(timestamp-solarRecoverySince>=60000){solarRecoverySince=0;solarLowSince=0;setSolarState('charging')}}else solarRecoverySince=0;
    }else if(night&&solarState!=='night')setSolarState('night',solarState==='daylight'||solarState==='unknown');
    else if(!night&&solarState==='night')setSolarState('daylight',true);
  }
  function updateBatteryState(value){
    const stats=value&&typeof value==='object'?value:{soc:value};
    lastStats=stats;
    const current=Number(stats.current);
    const total=Number(stats.total),connected=Number(stats.connected),hasCompleteCurrent=stats.current!==null&&stats.current!==undefined&&stats.current!==''&&Number.isFinite(current)&&total>0&&connected>=total;
    if(hasCompleteCurrent){lastCurrent=current;updateSolar(current)}
    else{lastCurrent=null;solarSamples=[];solarLowSince=0;solarRecoverySince=0;if(solarState!=='unknown')setSolarState('unknown',true)}
    const rawSoc=stats.soc;
    if(rawSoc===null||rawSoc===undefined||rawSoc==='')return;
    const soc=Number(rawSoc);
    if(!Number.isFinite(soc))return;
    lastSoc=Math.max(0,Math.min(100,soc));
    const alarm=settings.battery.critical;
    if(!settings.battery.moduleEnabled||!alarm.enabled){batteryCritical=false;return}
    if(lastSoc>=alarm.threshold+2){batteryCritical=false;return}
    if(lastSoc>alarm.threshold)return;
    const now=Date.now();
    if(!batteryCritical){if(say(batteryMessage(lastSoc))){batteryCritical=true;lastSpokenAt=now}return}
    const repeatMs=alarm.repeatMinutes*60*1000;
    if(repeatMs&&now-lastSpokenAt>=repeatMs&&say(batteryMessage(lastSoc)))lastSpokenAt=now;
  }
  function syncBatteryControls(){
    for(const input of document.querySelectorAll('[data-module-alarm="batteries"]'))input.checked=settings.battery.moduleEnabled;
    for(const input of document.querySelectorAll('[data-battery-alarm-enabled]'))input.checked=settings.battery.critical.enabled;
    for(const input of document.querySelectorAll('[data-solar-start-enabled]'))input.checked=settings.battery.solarStart.enabled;
    for(const input of document.querySelectorAll('[data-solar-loss-enabled]'))input.checked=settings.battery.solarLoss.enabled;
  }
  function setBatteryModuleEnabled(enabled){settings.battery.moduleEnabled=!!enabled;writeSettings(settings);syncBatteryControls();if(lastStats)updateBatteryState(lastStats)}
  function renderGeneral(){
    const batteryOn=settings.battery.moduleEnabled,locationOn=!!getLocationAlarmEnabled?.(),connectionOn=settings.general.connectionLost,connectionEstablishedOn=settings.general.connectionEstablished;
    sheet.innerHTML=`<div class="sheet-inner fullscreen-inner">
      <div class="fullscreen-head"><button class="fullscreen-back" type="button" data-notifications-back>‹</button><h3>Notificaciones</h3><span></span></div>
      <p class="subtle">Activá o desactivá las alarmas desde acá. Los ajustes propios se configuran en cada módulo.</p>
      <section class="full-section notification-module">
        <div class="full-section-title">Alarmas por módulo</div>
        <label class="gps-menu-toggle"><span><strong>Baterías</strong><small>Alarmas del módulo de baterías</small></span><input type="checkbox" data-module-alarm="batteries" ${batteryOn?'checked':''}></label>
        <label class="gps-menu-toggle"><span><strong>Ubicación</strong><small>Alarma de fondeo</small></span><input type="checkbox" data-module-alarm="location" ${locationOn?'checked':''}></label>
      </section>
      <section class="full-section notification-module">
        <div class="full-section-title">Alarmas generales</div>
        <label class="gps-menu-toggle"><span><strong>Conexión perdida</strong><small>Avisa cuando deja de llegar información de la estación.</small></span><input type="checkbox" data-general-alarm="connection-lost" ${connectionOn?'checked':''}></label>
        <div class="notification-message-caption">Mensaje hablado</div>
        ${messageEditorMarkup('connectionLost','conexión perdida',connectionLostMessage(),'Podés usar {barco} para insertar el nombre de la estación.')}
        <label class="gps-menu-toggle"><span><strong>Conexión con el barco establecida</strong><small>Anuncia cada vez que se conecta a la estación.</small></span><input type="checkbox" data-general-alarm="connection-established" ${connectionEstablishedOn?'checked':''}></label>
        <div class="notification-message-caption">Mensaje hablado</div>
        ${messageEditorMarkup('connectionEstablished','conexión establecida',connectionEstablishedMessage(),'Podés usar {barco} para insertar el nombre de la estación.')}
      </section>
      <section class="full-section notification-module">
        <div class="full-section-title">Voz</div>
        <p class="subtle">Las alarmas habladas usan el motor de voz del dispositivo.</p>
        <label class="full-label" for="notificationTtsVoice">Voz en español</label>
        <select class="full-input" id="notificationTtsVoice" data-tts-voice><option value="">Automática (español)</option></select>
        <label class="full-label" for="notificationTtsRate">Velocidad de voz</label>
        <select class="full-input" id="notificationTtsRate" data-tts-rate>
          <option value="0.75" ${settings.general.ttsRate===0.75?'selected':''}>Muy lenta</option>
          <option value="0.9" ${settings.general.ttsRate===0.9?'selected':''}>Lenta</option>
          <option value="1" ${settings.general.ttsRate===1?'selected':''}>Normal</option>
          <option value="1.15" ${settings.general.ttsRate===1.15?'selected':''}>Un poco rápida</option>
          <option value="1.3" ${settings.general.ttsRate===1.3?'selected':''}>Rápida</option>
          <option value="1.5" ${settings.general.ttsRate===1.5?'selected':''}>Muy rápida</option>
        </select>
        <button class="gps-action notification-test" type="button" data-notification-test>Probar voz</button>
        <div class="subtle" data-notification-status role="status" aria-live="polite"></div>
      </section>
    </div>`;
    renderTtsVoiceOptions(sheet.querySelector('[data-tts-voice]'));
    applyTtsSettings();
  }
  function renderBattery(){
    const battery=settings.battery,critical=battery.critical,solarStart=battery.solarStart,solarLoss=battery.solarLoss;
    batterySheet.innerHTML=`<div class="sheet-inner fullscreen-inner">
      <div class="fullscreen-head"><button class="fullscreen-back" type="button" data-battery-notification-back>‹</button><h3>Alarmas de baterías</h3><span></span></div>
      <section class="full-section notification-module">
        <div class="full-section-title">Batería crítica</div>
        <label class="gps-menu-toggle"><span><strong>Activar alarma hablada</strong><small>Se activa cuando el banco llega al umbral.</small></span><input type="checkbox" data-battery-alarm-enabled ${critical.enabled?'checked':''}></label>
        <label class="full-label" for="notificationBatteryThreshold">Umbral crítico del banco (%)</label>
        <input class="full-input" id="notificationBatteryThreshold" type="number" min="1" max="100" step="1" inputmode="numeric" data-battery-alarm-threshold value="${critical.threshold}">
        <label class="full-label" for="notificationBatteryRepeat">Repetición del aviso</label>
        <select class="full-input" id="notificationBatteryRepeat" data-battery-alarm-repeat>
          <option value="0" ${critical.repeatMinutes===0?'selected':''}>Solo al llegar al umbral</option>
          <option value="1" ${critical.repeatMinutes===1?'selected':''}>Cada minuto</option>
          <option value="5" ${critical.repeatMinutes===5?'selected':''}>Cada 5 minutos</option>
          <option value="10" ${critical.repeatMinutes===10?'selected':''}>Cada 10 minutos</option>
          <option value="30" ${critical.repeatMinutes===30?'selected':''}>Cada 30 minutos</option>
        </select>
        <div class="full-readonly notification-preview"><small>Mensaje hablado al llegar al umbral</small>${messageEditorMarkup('batteryCritical','batería crítica',batteryMessage(),'Usá {porcentaje} para insertar el nivel de carga.')}</div>
        <button class="gps-action notification-test" type="button" data-battery-alarm-test>Probar esta alarma</button>
        <p class="subtle">Se anuncia una vez al cruzar el umbral y vuelve a habilitarse cuando la carga se recupera 2 puntos.</p>
      </section>
      <section class="full-section notification-module">
        <div class="full-section-title">Inicio de carga solar</div>
        <label class="gps-menu-toggle"><span><strong>Avisar cuando comienza</strong><small>Se activa al detectar una subida progresiva de la corriente.</small></span><input type="checkbox" data-solar-start-enabled ${solarStart.enabled?'checked':''}></label>
        <div class="notification-preview"><small>Mensaje hablado</small>${messageEditorMarkup('solarStart','inicio de carga solar',settings.messages.solarStart)}</div>
        <label class="full-label" for="solarStartMinCurrent">Corriente mínima de carga (A)</label>
        <input class="full-input" id="solarStartMinCurrent" type="number" min="0.5" max="100" step="0.5" inputmode="decimal" data-solar-start-min value="${solarStart.minCurrent}">
        <label class="full-label" for="solarStartRiseCurrent">Aumento progresivo necesario (A)</label>
        <input class="full-input" id="solarStartRiseCurrent" type="number" min="0.5" max="50" step="0.5" inputmode="decimal" data-solar-start-rise value="${solarStart.riseCurrent}">
        <p class="subtle">Se detecta entre las 5:00 y las 12:00 cuando la corriente sube de forma sostenida. Se basa en la corriente neta del banco y estima el aporte solar; no lee directamente el regulador.</p>
        <button class="gps-action notification-test" type="button" data-solar-start-test>Probar esta alarma</button>
      </section>
      <section class="full-section notification-module">
        <div class="full-section-title">Paneles solares sin carga</div>
        <label class="gps-menu-toggle"><span><strong>Avisar cuando dejan de cargar</strong><small>Detecta una caída sostenida, por nubes o al llegar la noche.</small></span><input type="checkbox" data-solar-loss-enabled ${solarLoss.enabled?'checked':''}></label>
        <label class="full-label" for="solarLossCurrent">Corriente mínima observada (A)</label>
        <input class="full-input" id="solarLossCurrent" type="number" min="0.1" max="100" step="0.1" inputmode="decimal" data-solar-loss-min value="${solarLoss.minCurrent}">
        <label class="full-label" for="solarLossDrop">Caída desde el pico del día (%)</label>
        <input class="full-input" id="solarLossDrop" type="number" min="10" max="95" step="5" inputmode="numeric" data-solar-loss-drop value="${solarLoss.dropPercent}">
        <label class="full-label" for="solarLossHold">Tiempo de caída antes del aviso</label>
        <select class="full-input" id="solarLossHold" data-solar-loss-hold>
          <option value="1" ${solarLoss.holdMinutes===1?'selected':''}>1 minuto</option><option value="3" ${solarLoss.holdMinutes===3?'selected':''}>3 minutos</option><option value="5" ${solarLoss.holdMinutes===5?'selected':''}>5 minutos</option><option value="10" ${solarLoss.holdMinutes===10?'selected':''}>10 minutos</option><option value="15" ${solarLoss.holdMinutes===15?'selected':''}>15 minutos</option>
        </select>
        <div class="full-readonly notification-preview"><small>Mensaje hablado</small>${messageEditorMarkup('solarLoss','paneles solares sin carga',settings.messages.solarLoss)}</div>
        <p class="subtle">Se activa cuando la corriente cae por debajo del umbral configurado y permanece baja. El aviso se rearma cuando la carga se recupera.</p>
        <button class="gps-action notification-test" type="button" data-solar-loss-test>Probar esta alarma</button>
      </section>
      <div class="subtle" data-notification-status role="status" aria-live="polite"></div>
    </div>`;
  }
  function saveBattery(){writeSettings(settings);syncBatteryControls();updateNotificationMessagePreview('batteryCritical')}
  function updateBatterySetting(target){
    const battery=settings.battery;
    if(target.matches('[data-battery-alarm-enabled]'))battery.critical.enabled=target.checked;
    else if(target.matches('[data-battery-alarm-threshold]')){battery.critical.threshold=Math.round(clamp(Number(target.value),1,100,10));target.value=String(battery.critical.threshold)}
    else if(target.matches('[data-battery-alarm-repeat]'))battery.critical.repeatMinutes=[0,1,5,10,30].includes(Number(target.value))?Number(target.value):0;
    else if(target.matches('[data-solar-start-enabled]'))battery.solarStart.enabled=target.checked;
    else if(target.matches('[data-solar-start-min]')){battery.solarStart.minCurrent=clamp(Number(target.value),0.5,100,3);target.value=String(battery.solarStart.minCurrent)}
    else if(target.matches('[data-solar-start-rise]')){battery.solarStart.riseCurrent=clamp(Number(target.value),0.5,50,2);target.value=String(battery.solarStart.riseCurrent)}
    else if(target.matches('[data-solar-loss-enabled]'))battery.solarLoss.enabled=target.checked;
    else if(target.matches('[data-solar-loss-min]')){battery.solarLoss.minCurrent=clamp(Number(target.value),0.1,100,1.5);target.value=String(battery.solarLoss.minCurrent)}
    else if(target.matches('[data-solar-loss-drop]')){battery.solarLoss.dropPercent=Math.round(clamp(Number(target.value),10,95,70));target.value=String(battery.solarLoss.dropPercent)}
    else if(target.matches('[data-solar-loss-hold]'))battery.solarLoss.holdMinutes=[1,3,5,10,15].includes(Number(target.value))?Number(target.value):5;
    else return;
    saveBattery();
    if(lastStats)updateBatteryState(lastStats);
  }
  function testVoice(text,root){const ready=say(text),status=root.querySelector('[data-notification-status]');if(status)status.textContent=ready?'':'No hay un motor de voz disponible en este dispositivo.'}

  sheet.addEventListener('click',event=>{
    if(handleMessageEditorClick(sheet,event))return;
    if(event.target.closest('[data-notifications-back]')){closeSheet(sheet);return}
    if(event.target.closest('[data-notification-test]'))testVoice('Prueba de alarma hablada de Boat Station.',sheet);
  });
  sheet.addEventListener('change',event=>{
    const target=event.target;
    if(target.matches('[data-module-alarm="batteries"]'))setBatteryModuleEnabled(target.checked);
    else if(target.matches('[data-module-alarm="location"]')){
      const result=setLocationAlarmEnabled?.(target.checked),ok=typeof result==='object'?!!result.ready:result!==false;
      if(!ok){target.checked=!!getLocationAlarmEnabled?.();const status=sheet.querySelector('[data-notification-status]');if(status)status.textContent=result?.hasPoint?'Concedé los permisos de ubicación y notificaciones para activar la alarma.':'Primero definí el punto de fondeo en el módulo Ubicación.'}
      else{const status=sheet.querySelector('[data-notification-status]');if(status)status.textContent=''}
    }else if(target.matches('[data-general-alarm="connection-lost"]')){settings.general.connectionLost=target.checked;writeSettings(settings);if(target.checked)speakConnectionLost()}
    else if(target.matches('[data-general-alarm="connection-established"]')){settings.general.connectionEstablished=target.checked;writeSettings(settings)}
    else if(target.matches('[data-tts-voice]')){settings.general.ttsVoice=String(target.value||'');writeSettings(settings);applyTtsSettings()}
    else if(target.matches('[data-tts-rate]')){settings.general.ttsRate=[0.75,0.9,1,1.15,1.3,1.5].includes(Number(target.value))?Number(target.value):1;writeSettings(settings);applyTtsSettings()}
  });
  batterySheet.addEventListener('click',event=>{
    if(handleMessageEditorClick(batterySheet,event))return;
    if(event.target.closest('[data-battery-notification-back]')){closeSheet(batterySheet);onBatteryBack?.();return}
    if(event.target.closest('[data-battery-alarm-test]'))testVoice(batteryMessage(),batterySheet);
    else if(event.target.closest('[data-solar-start-test]'))testVoice(settings.messages.solarStart,batterySheet);
    else if(event.target.closest('[data-solar-loss-test]'))testVoice(settings.messages.solarLoss,batterySheet);
  });
  moduleMenu?.addEventListener('click',event=>{if(handleMessageEditorClick(moduleMenu,event)){event.preventDefault();event.stopImmediatePropagation()}});
  batterySheet.addEventListener('change',event=>updateBatterySetting(event.target));
  batterySheet.addEventListener('input',event=>{
    const target=event.target;
    if(!target.matches('[data-battery-alarm-threshold]'))return;
    const value=Math.round(clamp(Number(target.value),1,100,10)),preview=batterySheet.querySelector('[data-battery-alarm-preview]');
    if(preview)preview.textContent=batteryMessage(value);
  });
  window.addEventListener('boatstation-battery-state',event=>updateBatteryState(event.detail));
  try{window.speechSynthesis?.addEventListener?.('voiceschanged',refreshTtsVoiceOptions)}catch{}
  window.addEventListener('boatstation-tts-voices',refreshTtsVoiceOptions);
  window.addEventListener('boatstation-anchor-alarm',()=>{if(getLocationAlarmEnabled?.())say(settings.messages.anchorLost)});
  window.addEventListener('boatstation-remote-connection',event=>{
    const detail=event.detail||{},previousConnection=remoteConnection;
    remoteConnection=detail.connected===true;
    if(detail.stationName)remoteStationName=String(detail.stationName).trim()||'Chez';
    if(remoteConnection){
      const established=!remoteEverConnected||previousConnection===false;
      remoteEverConnected=true;remoteLossAnnounced=false;
      if(established&&settings.general.connectionEstablished)say(connectionEstablishedMessage());
    }else speakConnectionLost();
    updateNotificationMessagePreview('connectionLost');
    updateNotificationMessagePreview('connectionEstablished');
  });

  return{
    open(){renderGeneral();openSheet(sheet);if(lastStats===null){const stats=getBatteryStats?.();if(stats)updateBatteryState(stats)}},
    openBatterySettings(){renderBattery();openSheet(batterySheet);if(lastStats===null){const stats=getBatteryStats?.();if(stats)updateBatteryState(stats)}},
    refreshBattery(){const stats=getBatteryStats?.();if(stats)updateBatteryState(stats)},
    getSettings:()=>JSON.parse(JSON.stringify(settings)),
    getMessageEditorMarkup(id){const labels={anchorLost:'alarma de fondeo'};return messageEditorMarkup(id,labels[id]||'notificación',notificationMessagePreview(id))}
  };
}

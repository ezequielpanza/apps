const STORAGE_KEY='bs.notifications.v1';
const DEFAULTS={battery:{critical:{enabled:false,threshold:10,repeatMinutes:0}}};

function readSettings(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    const alarm=saved?.battery?.critical||{};
    return{battery:{critical:{
      enabled:!!alarm.enabled,
      threshold:clamp(Number(alarm.threshold),1,100,DEFAULTS.battery.critical.threshold),
      repeatMinutes:[0,1,5,10,30].includes(Number(alarm.repeatMinutes))?Number(alarm.repeatMinutes):0
    }}};
  }catch{return JSON.parse(JSON.stringify(DEFAULTS))}
}
function clamp(value,min,max,fallback){return Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback}
function writeSettings(settings){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(settings))}catch{}}

export function createNotificationsMenu({sheet,openSheet,closeSheet,getBatteryStats,openLocationSettings}){
  const settings=readSettings();
  let lastSoc=null,batteryCritical=false,lastSpokenAt=0;

  function say(text){
    try{
      const core=window.CoreBridge;
      if(typeof core?.isTtsReady==='function'&&core.isTtsReady()&&typeof core.alarm==='function'){core.alarm(text);return true}
      const native=window.NativeBridge;
      if(typeof native?.isTtsReady==='function'&&native.isTtsReady()&&typeof native.alarm==='function'){native.alarm(text);return true}
      if(window.speechSynthesis&&typeof SpeechSynthesisUtterance==='function'){
        window.speechSynthesis.cancel();
        const utterance=new SpeechSynthesisUtterance(text);
        utterance.lang='es-AR';
        window.speechSynthesis.speak(utterance);
        return true;
      }
    }catch{}
    return false;
  }

  function batteryMessage(soc=null){const value=soc===null?settings.battery.critical.threshold:Math.round(Number(soc));return`Batería crítica, llegamos al ${value} por ciento.`}
  function updateBatteryState(value){
    if(value===null||value===undefined||value==='')return;
    const soc=Number(value);
    if(!Number.isFinite(soc))return;
    lastSoc=Math.max(0,Math.min(100,soc));
    const alarm=settings.battery.critical;
    if(!alarm.enabled){batteryCritical=false;return}
    if(lastSoc>=alarm.threshold+2){batteryCritical=false;return}
    if(lastSoc>alarm.threshold)return;
    const now=Date.now();
    if(!batteryCritical){if(say(batteryMessage(lastSoc))){batteryCritical=true;lastSpokenAt=now}return}
    const repeatMs=alarm.repeatMinutes*60*1000;
    if(repeatMs&&now-lastSpokenAt>=repeatMs&&say(batteryMessage(lastSoc)))lastSpokenAt=now;
  }

  function render(){
    const alarm=settings.battery.critical;
    sheet.innerHTML=`<div class="sheet-inner fullscreen-inner">
      <div class="fullscreen-head"><button class="fullscreen-back" type="button" data-notifications-back>‹</button><h3>Notificaciones</h3><span></span></div>
      <p class="subtle">Configurá las alarmas de cada módulo por separado.</p>
      <section class="full-section notification-module">
        <div class="full-section-title">Baterías</div>
        <label class="gps-menu-toggle"><span><strong>Alarma hablada de batería crítica</strong><small>Se activa cuando el banco llega al umbral.</small></span><input type="checkbox" data-battery-alarm-enabled ${alarm.enabled?'checked':''}></label>
        <label class="full-label" for="notificationBatteryThreshold">Umbral crítico del banco (%)</label>
        <input class="full-input" id="notificationBatteryThreshold" type="number" min="1" max="100" step="1" inputmode="numeric" data-battery-alarm-threshold value="${alarm.threshold}">
        <label class="full-label" for="notificationBatteryRepeat">Repetición del aviso</label>
        <select class="full-input" id="notificationBatteryRepeat" data-battery-alarm-repeat>
          <option value="0" ${alarm.repeatMinutes===0?'selected':''}>Solo al llegar al umbral</option>
          <option value="1" ${alarm.repeatMinutes===1?'selected':''}>Cada minuto</option>
          <option value="5" ${alarm.repeatMinutes===5?'selected':''}>Cada 5 minutos</option>
          <option value="10" ${alarm.repeatMinutes===10?'selected':''}>Cada 10 minutos</option>
          <option value="30" ${alarm.repeatMinutes===30?'selected':''}>Cada 30 minutos</option>
        </select>
        <div class="full-readonly notification-preview"><small>Frase al llegar al umbral</small><strong data-battery-alarm-preview>${batteryMessage()}</strong></div>
        <p class="subtle">Se anuncia una vez al cruzar el umbral y vuelve a habilitarse cuando la carga se recupera 2 puntos.</p>
        <button class="gps-action notification-test" type="button" data-notification-test>Probar voz</button>
        <div class="subtle" data-notification-status role="status" aria-live="polite"></div>
      </section>
      <section class="full-section notification-module">
        <div class="full-section-title">Ubicación</div>
        <p class="subtle">La alarma de fondeo mantiene su configuración independiente.</p>
        <button class="gps-action notification-test" type="button" data-notification-location>Configurar alarma de fondeo</button>
      </section>
    </div>`;
  }

  function save(){writeSettings(settings);const preview=sheet.querySelector('[data-battery-alarm-preview]');if(preview)preview.textContent=batteryMessage()}
  sheet.addEventListener('click',event=>{
    if(event.target.closest('[data-notifications-back]')){closeSheet(sheet);return}
    if(event.target.closest('[data-notification-test]')){
      const ready=say('Prueba de alarma hablada de Boat Station.');
      const status=sheet.querySelector('[data-notification-status]');
      if(status)status.textContent=ready?'':'No hay un motor de voz disponible en este dispositivo.';
      return;
    }
    if(event.target.closest('[data-notification-location]')){closeSheet(sheet);openLocationSettings?.()}
  });
  sheet.addEventListener('change',event=>{
    const target=event.target;
    if(target.matches('[data-battery-alarm-enabled]'))settings.battery.critical.enabled=target.checked;
    else if(target.matches('[data-battery-alarm-threshold]')){
      settings.battery.critical.threshold=Math.round(clamp(Number(target.value),1,100,10));
      target.value=String(settings.battery.critical.threshold);
    }else if(target.matches('[data-battery-alarm-repeat]'))settings.battery.critical.repeatMinutes=[0,1,5,10,30].includes(Number(target.value))?Number(target.value):0;
    else return;
    save();
    if(lastSoc!==null)updateBatteryState(lastSoc);
  });
  sheet.addEventListener('input',event=>{
    const target=event.target;
    if(!target.matches('[data-battery-alarm-threshold]'))return;
    const value=Math.round(clamp(Number(target.value),1,100,10));
    const preview=sheet.querySelector('[data-battery-alarm-preview]');
    if(preview)preview.textContent=`Batería crítica, llegamos al ${value} por ciento.`;
  });
  window.addEventListener('boatstation-battery-state',event=>updateBatteryState(event.detail?.soc));

  return{
    open(){render();openSheet(sheet);if(lastSoc===null){const stats=getBatteryStats?.();updateBatteryState(stats?.soc)}},
    refreshBattery(){const stats=getBatteryStats?.();updateBatteryState(stats?.soc)},
    getSettings:()=>JSON.parse(JSON.stringify(settings))
  };
}

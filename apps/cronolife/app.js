const DEFAULTS = { date: '1981-07-18', time: '18:55', offset: '-03:00', expectancy: 78 };
const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat('es-AR');
const oneDecimal = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat('es-AR', { day:'numeric', month:'long', year:'numeric' });

function loadConfig(){
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('lifeClockConfig') || '{}') }; }
  catch { return DEFAULTS; }
}
function birthInstant(c){ return new Date(`${c.date}T${c.time}:00${c.offset}`); }
function anniversary(year,c){
  const [m,d] = c.date.split('-').slice(1).map(Number);
  return new Date(`${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T${c.time}:00${c.offset}`);
}
function expectancyHorizon(birth,c){
  const expectancy = Number(c.expectancy);
  const wholeYears = Math.floor(expectancy);
  const fractional = expectancy - wholeYears;
  const horizon = anniversary(birth.getUTCFullYear() + wholeYears, c);
  if (fractional > 0) horizon.setTime(horizon.getTime() + fractional * 365.2425 * 86400000);
  return horizon;
}
function fullYears(now,birth,c){
  let years = now.getUTCFullYear() - birth.getUTCFullYear();
  if (now < anniversary(birth.getUTCFullYear()+years,c)) years--;
  return years;
}
function update(){
  const c=loadConfig(), birth=birthInstant(c), now=new Date();
  if (Number.isNaN(birth.getTime()) || now<birth) return;
  const years=fullYears(now,birth,c);
  const last=anniversary(birth.getUTCFullYear()+years,c);
  const next=anniversary(birth.getUTCFullYear()+years+1,c);
  let remainder=now-last;
  const day=86400000, hour=3600000, minute=60000;
  const days=Math.floor(remainder/day); remainder%=day;
  const hours=Math.floor(remainder/hour); remainder%=hour;
  const minutes=Math.floor(remainder/minute); remainder%=minute;
  const seconds=Math.floor(remainder/1000);
  const elapsed=now-birth;
  const totalDays=Math.floor(elapsed/day);

  $('ageText').textContent=`${years} años`;
  $('years').textContent=String(years).padStart(2,'0');
  $('days').textContent=String(days).padStart(3,'0');
  $('hours').textContent=String(hours).padStart(2,'0');
  $('minutes').textContent=String(minutes).padStart(2,'0');
  $('seconds').textContent=String(seconds).padStart(2,'0');
  $('totalDays').textContent=nf.format(totalDays);
  $('totalHours').textContent=nf.format(Math.floor(elapsed/hour));
  $('heartbeats').textContent=nf.format(Math.floor(elapsed/60000*72));

  $('nextBirthday').textContent=dateFmt.format(next);
  const until=next-now, untilDays=Math.ceil(until/day);
  $('birthdayCountdown').textContent=untilDays===1?'Falta 1 día':`Faltan ${nf.format(untilDays)} días`;
  $('birthdayProgress').style.width=`${Math.max(0,Math.min(100,((now-last)/(next-last))*100))}%`;

  const horizon = expectancyHorizon(birth,c);
  const totalExpected = horizon - birth;
  const remaining = Math.max(0,horizon-now);
  const percent = Math.max(0,Math.min(100,(elapsed/totalExpected)*100));
  const remainingDays = Math.floor(remaining/day);
  const remainingYears = remaining/(365.2425*day);
  $('lifePercent').textContent=oneDecimal.format(percent);
  $('lifeProgress').style.width=`${percent}%`;
  $('remainingYears').textContent=oneDecimal.format(remainingYears);
  $('remainingDays').textContent=nf.format(remainingDays);
  $('estimatedDate').textContent=dateFmt.format(horizon);
  $('remainingText').textContent=remaining>0
    ? `Quedaría aproximadamente el ${oneDecimal.format(100-percent)}% · ${nf.format(remainingDays)} días`
    : 'La referencia estadística ya fue superada';
}

const dialog=$('settingsDialog');
$('settingsBtn').addEventListener('click',()=>{
  const c=loadConfig();
  $('birthDate').value=c.date;
  $('birthTime').value=c.time;
  $('birthOffset').value=c.offset;
  $('lifeExpectancy').value=c.expectancy;
  dialog.showModal();
});
$('settingsForm').addEventListener('submit',(e)=>{
  e.preventDefault();
  localStorage.setItem('lifeClockConfig',JSON.stringify({
    date:$('birthDate').value,
    time:$('birthTime').value,
    offset:$('birthOffset').value,
    expectancy:Number($('lifeExpectancy').value)
  }));
  dialog.close();
  update();
});
update(); setInterval(update,250);

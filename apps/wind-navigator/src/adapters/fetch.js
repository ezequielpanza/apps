// Never substitute a different model under the original model's label.
const models = {gfs:'gfs_global', ecmwf:'ecmwf_ifs', icon:'icon_global'};
const waveModels = {gfsWaves:'ncep_gfswave025',ecmwfWaves:'ecmwf_wam'};
const times = a => a.map(v=>Date.parse(v.endsWith('Z')?v:v+'Z'));
async function waveForecast(model, options) {
  const params = new URLSearchParams({latitude:String(options.lat),longitude:String(options.lon),
    models:waveModels[model],timezone:'GMT',forecast_days:String(Math.min(15,options.days)),
    hourly:'wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,secondary_swell_wave_height,secondary_swell_wave_direction,secondary_swell_wave_period,wind_wave_height,wind_wave_direction,wind_wave_period'});
  const response = await fetch('https://marine-api.open-meteo.com/v1/marine?'+params);
  if (!response.ok) throw new Error(`Open-Meteo olas: HTTP ${response.status}`);
  const {hourly:h} = await response.json();
  if (!h?.time) throw new Error('Open-Meteo no devolvió datos de olas.');
  return {data:{data:{ts:times(h.time),waves:h.wave_height,wavesDir:h.wave_direction,wavesPeriod:h.wave_period,
    swell1:h.swell_wave_height,swell1Dir:h.swell_wave_direction,swell1Period:h.swell_wave_period,
    swell2:h.secondary_swell_wave_height,swell2Dir:h.secondary_swell_wave_direction,swell2Period:h.secondary_swell_wave_period,
    windWaves:h.wind_wave_height,windWavesDir:h.wind_wave_direction,windWavesPeriod:h.wind_wave_period}}};
}
export async function getPointForecastData(model, options) {
  if (waveModels[model]) return waveForecast(model,options);
  if (!models[model]) throw new Error(`Modelo ${model} aún no disponible en Wind Navigator.`);
  const params = new URLSearchParams({
    latitude:String(options.lat), longitude:String(options.lon), models:models[model],
    hourly:'temperature_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,dew_point_2m',
    wind_speed_unit:'ms', timezone:'GMT', forecast_days:String(Math.min(15,options.days)),
    cell_selection:'sea'
  });
  const response=await fetch('https://api.open-meteo.com/v1/forecast?'+params);
  if (!response.ok) throw new Error(`Open-Meteo: HTTP ${response.status}`);
  const {hourly:h}=await response.json();
  if (!h?.time) throw new Error('Open-Meteo no devolvió datos horarios.');
  const kelvin=a=>a?.map(v=>v==null?null:v+273.15);
  const ts=times(h.time);
  return {data:{data:{ts,temperature:kelvin(h.temperature_2m),feelTemperature:kelvin(h.apparent_temperature),
    precipAmount:h.precipitation,wind:h.wind_speed_10m,windDir:h.wind_direction_10m,windGust:h.wind_gusts_10m,
    clouds:h.cloud_cover},meteogram:{ts,dewPoint:kelvin(h.dew_point_2m)}}};
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getPointForecastData} from '../src/adapters/fetch.js';
test('model data preserve units, missing values and time', async () => {
  let requested;
  globalThis.fetch=async url=>{ requested=new URL(url); return {ok:true,json:async()=>({hourly:{
    time:['2026-11-09T12:00'],temperature_2m:[20],apparent_temperature:[null],precipitation:[2.54],
    wind_speed_10m:[10],wind_direction_10m:[90],wind_gusts_10m:[12],cloud_cover:[50],dew_point_2m:[10]}})}; };
  const result=await getPointForecastData('gfs',{lat:18,lon:-67,days:2});
  assert.equal(requested.searchParams.get('models'),'gfs_seamless');
  assert.equal(requested.searchParams.get('wind_speed_unit'),'ms');
  assert.equal(result.data.data.temperature[0],293.15);
  assert.equal(result.data.data.feelTemperature[0],null);
  assert.equal(result.data.data.precipAmount[0],2.54);
  assert.equal(result.data.data.ts[0],Date.parse('2026-11-09T12:00Z'));
});
test('unavailable models are not relabeled',async()=>{
  await assert.rejects(getPointForecastData('mblue',{lat:18,lon:-67,days:1}),/aún no disponible/);
});
test('wave adapter preserves height, period, and direction',async()=>{
  let requested;
  globalThis.fetch=async url=>{requested=new URL(url);return {ok:true,json:async()=>({hourly:{
    time:['2026-11-09T12:00'],wave_height:[2],wave_period:[9],wave_direction:[70]}})};};
  const result=await getPointForecastData('ecmwfWaves',{lat:18,lon:-67,days:1});
  assert.equal(requested.searchParams.get('models'),'ecmwf_wam');
  assert.equal(result.data.data.waves[0],2);
  assert.equal(result.data.data.wavesPeriod[0],9);
  assert.equal(result.data.data.wavesDir[0],70);
});

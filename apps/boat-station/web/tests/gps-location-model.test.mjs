import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  LOCATION_RETENTION_HOURS,
  LOCATION_FREQUENCY_SECONDS,
  normalizeLocationFrequency,
  normalizeAnchorSettings,
  normalizeVesselConfig,
  distanceMeters,
  evaluateAnchorBoundary,
  anchorRadiusToMeters,
  anchorRadiusValue
} from '../gps-location-model.mjs';
import { boatFootprint, vesselPosition } from '../dashboard-model.mjs';
import { createGpsModule } from '../modules/gps-stable.js';

test('retention choices include disabled and one hour', () => {
  assert.deepEqual(LOCATION_RETENTION_HOURS, [0, 1, 3, 6, 12, 24]);
});

test('location recording offers only the five requested intervals', () => {
  assert.deepEqual(LOCATION_FREQUENCY_SECONDS, [30, 60, 150, 300, 600]);
  assert.equal(normalizeLocationFrequency(150), 150);
  assert.equal(normalizeLocationFrequency(2), 60, 'legacy intervals fall back to one minute');
});

test('an unset anchor cannot become a point at zero coordinates', () => {
  const anchor = normalizeAnchorSettings({ enabled: true, lat: null, lon: null, radius: 30 });
  assert.equal(anchor.hasPoint, false);
  assert.equal(anchor.enabled, false);
  assert.equal(anchor.lat, null);
});

test('anchor distance uses meters and rejects uncertain boundary fixes', () => {
  const anchor = { enabled: true, lat: 0, lon: 0, radius: 30 };
  assert.ok(Math.abs(distanceMeters(anchor, { lat: 0, lon: 0.001 }) - 111.2) < 1);
  assert.equal(evaluateAnchorBoundary(anchor, { lat: 0, lon: 0.00036, accuracy: 15 }).alarm, false);
  const outside = evaluateAnchorBoundary(anchor, { lat: 0, lon: 0.001, accuracy: 5 });
  assert.equal(outside.alarm, true);
  assert.equal(evaluateAnchorBoundary(anchor, { lat: 0, lon: 0.001, accuracy: 5 }, true).alarm, false);
  const rearmed = evaluateAnchorBoundary(anchor, { lat: 0, lon: 0, accuracy: 5 }, true);
  assert.equal(rearmed.rearmed, true);
  assert.equal(rearmed.tripped, false);
});

test('vessel geometry uses configured dimensions and orientation', () => {
  const config = normalizeVesselConfig({ type: 'mono', length: 12.5, beam: 4.2 });
  const center = vesselPosition({ lat: 18, lon: -66, speedKts: 3, bearing: 90 }, null, config);
  assert.equal(center.heading, 90);
  const outline = boatFootprint(center, center.heading, config);
  assert.equal(outline.length, 1);
  assert.ok(outline[0].length >= 6);
});

test('Ubicación exposes the requested map and recording controls without a route toggle', () => {
  const gps = fs.readFileSync(new URL('../modules/gps-stable.js', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(gps, /name:'Ubicación'/);
  assert.match(gps, /data-gps-action='map-type'/);
  assert.doesNotMatch(gps, /gps-map-record|gps-route-new/);
  assert.match(app, /data-gps-retention/);
  assert.match(gps, /2 minutos 30 segundos/);
  assert.match(gps, /remote\.routePointCount/);
  assert.match(gps, /remote\.anchor/);
  assert.match(gps, /gps\.anchor\.settings/);
  assert.match(app, /\[0,'Desactivado'\]/);
  assert.match(app, /data-gps-anchor-pick/);
  assert.match(app, /data-gps-vessel-setting='length'/);
});

test('remote location state synchronizes point counts, history and anchor settings', () => {
  const previousWindow=globalThis.window,previousStorage=globalThis.localStorage,sent=[];
  globalThis.localStorage={getItem:()=>null,setItem(){}};
  globalThis.window={addEventListener(){},BoatStationRemoteCommand:{send:(command,payload)=>{sent.push({command,payload});return Promise.resolve(true)}}};
  try{
    const server=createGpsModule(()=>{});
    server.state.recording=true;
    server.state.route=Array.from({length:3001},(_,i)=>({lat:18+i/100000,lon:-66,time:1000+i}));
    server.state.alwaysRecord=true;server.state.historyHours=3;
    server.state.historyRoute=Array.from({length:1200},(_,i)=>({lat:18,lon:-66+i/100000,time:2000+i}));
    server.state.anchor=normalizeAnchorSettings({lat:18,lon:-66,radius:40});
    const serverRemote=globalThis.window.BoatStationGpsState,snapshot=serverRemote.exportRemoteState();
    assert.equal(snapshot.routePointCount,3001);
    assert.equal(snapshot.route.length,2000,'route geometry stays sampled for remote transfer');
    assert.equal(snapshot.historyPointCount,1200);
    assert.equal(snapshot.historyRoute.length,1000,'continuous history is sampled for remote transfer');
    const client=createGpsModule(()=>{}),clientRemote=globalThis.window.BoatStationGpsState;
    clientRemote.applyRemoteState(snapshot);
    assert.equal(client.state.remoteRoutePointCount,3001);
    assert.equal(client.state.remoteHistoryPointCount,1200);
    assert.equal(client.state.historyRoute.length,1000);
    server.state.historyRoute.push({lat:18,lon:-66,time:Date.now()});
    const compactSnapshot=serverRemote.exportRemoteState();
    assert.equal(Object.hasOwn(compactSnapshot,'historyRoute'),false,'history geometry is not resent every sync');
    assert.equal(compactSnapshot.historyPointCount,1201,'the exact point count is still refreshed every sync');
    clientRemote.applyRemoteState(compactSnapshot);
    assert.equal(client.state.historyRoute.length,1000,'the client keeps its sampled line between full history refreshes');
    assert.equal(client.state.remoteHistoryPointCount,1201);
    assert.equal(client.getAnchorSettings().hasPoint,true);
    assert.equal(client.setAnchorEnabled(true),true);
    assert.equal(sent.at(-1)?.command,'gps.anchor.settings','client sends anchor changes to the authoritative server');
    assert.equal(sent.at(-1)?.payload.enabled,true);
  }finally{globalThis.window=previousWindow;globalThis.localStorage=previousStorage}
});

test('anchor radius can be configured in meters or feet while calculations stay metric', () => {
  assert.equal(anchorRadiusToMeters(100, 'ft'), 30.48);
  assert.equal(anchorRadiusValue(30.48, 'ft'), 100);
  assert.equal(anchorRadiusToMeters(30, 'm'), 30);
  const anchor = normalizeAnchorSettings({ enabled: true, lat: 18, lon: -66, radius: 30.48, radiusUnit: 'ft' });
  assert.equal(anchor.radius, 30.48);
  assert.equal(anchor.radiusUnit, 'ft');
});

test('map anchor center is draggable and map telemetry is compact', () => {
  const gps = fs.readFileSync(new URL('../modules/gps-stable.js', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(gps, /draggable:true/);
  assert.match(gps, /gpsAnchorMarker\.on\('dragend',event=>\{const point=event\.target\.getLatLng\(\);setAnchorPoint\(point\.lat,point\.lng\)\}\)/);
  assert.match(app, /data-gps-anchor-unit/);
  assert.match(app, /Pies \(ft\)/);
  assert.match(gps, /gps-map-speed-icon/);
  assert.match(gps, /data-gps-heading-icon/);
  assert.doesNotMatch(gps, /data-gps-accuracy|>Precisi[oó]n</);
});

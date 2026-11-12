import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

test('remote GPS client only displays and retains server location history',async()=>{
  const previousWindow=globalThis.window,previousStorage=globalThis.localStorage;
  const calls={history:[],anchor:[],readLocalHistory:false};
  globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
  globalThis.window={
    BoatStationRuntime:{isClient:()=>true},
    NativeBridge:{
      setGpsHistorySettings:(...args)=>{calls.history.push(args);return true},
      setGpsAnchorSettings:(...args)=>{calls.anchor.push(args);return true},
      getGpsHistory:()=>{calls.readLocalHistory=true;return '[{"lat":1,"lon":2,"time":3}]'}
    },
    addEventListener:()=>{}
  };
  try{
    const sourceUrl=new URL('../modules/gps-stable.js',import.meta.url);
    let source=await readFile(sourceUrl,'utf8');
    source=source.replace("from '../dashboard-model.mjs'", "from '"+new URL('../dashboard-model.mjs',sourceUrl).href+"'");
    source=source.replace("from '../gps-location-model.mjs'", "from '"+new URL('../gps-location-model.mjs',sourceUrl).href+"'");
    const moduleUrl='data:text/javascript;base64,'+Buffer.from(source).toString('base64');
    const {createGpsModule}=await import(moduleUrl);
    const gps=createGpsModule(()=>{});
    assert.equal(gps.state.remoteAuthoritative,true);
    assert.equal(gps.state.historyHours,0);
    assert.equal(gps.state.historyRoute.length,0);
    assert.equal(calls.readLocalHistory,false);
    assert.ok(calls.history.some(([enabled,hours])=>enabled===false&&hours===0));
    assert.ok(calls.anchor.some(([enabled])=>enabled===false));

    gps.state.recording=true;
    gps.state.alwaysRecord=true;
    gps.state.historyHours=6;
    gps.update({lat:18,lon:-66,time:1000});
    assert.equal(gps.state.fix,null);
    assert.equal(gps.state.route.length,0);
    assert.equal(gps.state.historyRoute.length,0);

    const serverFix={lat:18.25,lon:-66.4,time:2000,speedKts:4,bearing:120};
    assert.equal(window.BoatStationGpsState.applyRemoteFix(serverFix),true);
    assert.deepEqual(gps.state.fix,serverFix);
    window.BoatStationGpsState.applyRemoteState({
      recording:true,route:[serverFix],routePointCount:1,
      alwaysRecord:true,historyHours:6,frequencySeconds:30,
      historyRoute:[serverFix],historyPointCount:1
    });
    assert.equal(gps.state.route.length,1);
    assert.equal(gps.state.historyRoute.length,1);
    assert.equal(gps.state.route[0].lat,serverFix.lat);
  }finally{
    if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;
    if(previousStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previousStorage;
  }
});

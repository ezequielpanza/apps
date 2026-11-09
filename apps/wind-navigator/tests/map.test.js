import { test } from 'node:test';
import assert from 'node:assert/strict';

test('switching base maps preserves nautical marks and the saved choice', async () => {
  const layers = new Set(); const values = new Map();
  const map = {setView(){return this}, removeLayer(layer){layers.delete(layer)}};
  globalThis.localStorage = {getItem:key => values.get(key), setItem:(key,value) => values.set(key,value)};
  globalThis.L = {map:()=>map, tileLayer:(url,options)=>({url,options, addTo(){layers.add(this);return this}, bringToBack(){return this}})};
  const {getBaseMap,setBaseMap,seamarks} = await import('../src/adapters/map.js');
  assert.equal(getBaseMap(), 'standard');
  assert.ok(layers.has(seamarks));
  setBaseMap('satellite');
  assert.equal(getBaseMap(), 'satellite');
  assert.equal(values.get('wind-navigator-base-map'), 'satellite');
  assert.ok(layers.has(seamarks));
  assert.equal(layers.size, 2);
  setBaseMap('topographic');
  assert.equal(getBaseMap(), 'topographic');
  assert.ok(layers.has(seamarks));
  setBaseMap('unknown');
  assert.equal(getBaseMap(), 'topographic');
});

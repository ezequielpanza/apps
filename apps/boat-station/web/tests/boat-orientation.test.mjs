import assert from 'node:assert/strict';import {boatOrientation} from '../modules/boat-orientation.mjs';
const I=[1,0,0,0,1,0,0,0,1];
for(const [dir,heading] of [[0,0],[90,90],[180,180],[270,270]]){const r=boatOrientation(I,'horizontal',dir);assert.ok(Math.abs(r.heading-heading)<1e-9);assert.ok(Math.abs(r.roll)<1e-9);assert.ok(Math.abs(r.pitch)<1e-9)}
// Screen top is up, screen back is north, and phone right is east.
const upright=[1,0,0,0,0,-1,0,1,0];
for(const [dir,heading] of [[0,0],[90,90],[180,180],[270,270]]){const r=boatOrientation(upright,'vertical',dir);assert.ok(Math.abs(r.heading-heading)<1e-9);assert.ok(Math.abs(r.roll)<1e-9);assert.ok(Math.abs(r.pitch)<1e-9)}
assert.equal(boatOrientation(I,'vertical',0),null);assert.equal(boatOrientation([], 'horizontal',0),null);console.log('8 mounting frames and invalid orientations passed');
const a=10*Math.PI/180,c=Math.cos(a),s=Math.sin(a);const rollEast=[c,0,s,0,1,0,-s,0,c];let tilted=boatOrientation(rollEast,'horizontal',0);assert.ok(Math.abs(tilted.roll-10)<1e-8);assert.ok(Math.abs(tilted.pitch)<1e-8);assert.ok(Math.abs(tilted.heading)<1e-8);
const pitchDown=[1,0,0,0,c,s,0,-s,c];tilted=boatOrientation(pitchDown,'horizontal',0);assert.ok(Math.abs(tilted.pitch-10)<1e-8);assert.ok(Math.abs(tilted.roll)<1e-8);console.log('Tilt direction and heading: passed');

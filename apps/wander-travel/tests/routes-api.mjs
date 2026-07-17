import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'functions/api/routes/walking.js'), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const routesApi = await import(moduleUrl);

let upstreamRequest = null;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  upstreamRequest = { url, options, body: JSON.parse(options.body) };
  return new Response(JSON.stringify({
    routes: [{
      distanceMeters: 720,
      duration: '540s',
      polyline: { encodedPolyline: 'encoded-overview' },
      legs: [{
        steps: [{
          distanceMeters: 80,
          staticDuration: '65s',
          navigationInstruction: { maneuver: 'TURN_LEFT', instructions: 'Gira a la izquierda' },
          polyline: { encodedPolyline: 'encoded-step' },
        }],
      }],
    }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};

try {
  const request = new Request('https://wander.example/api/routes/walking', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      origin: { lat: 18.47, lng: -69.88 },
      destination: { lat: 18.48, lng: -69.87 },
    }),
  });
  const response = await routesApi.onRequestPost({ request, env: { GOOGLE_MAPS_API_KEY: 'server-secret' } });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.route.durationSeconds, 540);
  assert.equal(payload.route.steps[0].maneuver, 'TURN_LEFT');
  assert.equal(upstreamRequest.url, 'https://routes.googleapis.com/directions/v2:computeRoutes');
  assert.equal(upstreamRequest.options.headers['x-goog-api-key'], 'server-secret');
  assert.equal(upstreamRequest.body.travelMode, 'WALK');
  assert.equal(JSON.stringify(payload).includes('server-secret'), false);
  console.log('PASS walking route API validates, proxies, and normalizes Google Routes server-side');

  const invalid = await routesApi.onRequestPost({
    request: new Request('https://wander.example/api/routes/walking', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ origin: { lat: 200, lng: 0 }, destination: { lat: 0, lng: 0 } }),
    }),
    env: { GOOGLE_MAPS_API_KEY: 'server-secret' },
  });
  assert.equal(invalid.status, 400);
  console.log('PASS walking route API rejects invalid coordinates before contacting Google');
} finally {
  globalThis.fetch = originalFetch;
}

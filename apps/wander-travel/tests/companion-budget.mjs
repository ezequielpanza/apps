import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'runtime-companion-policy.js'), 'utf8');
const sandbox = { window: {}, Date };
vm.runInNewContext(source, sandbox, { filename: 'runtime-companion-policy.js' });
const policy = sandbox.window.WanderCompanionPolicy;
const now = Date.parse('2026-07-17T16:00:00Z');

function discovery() {
  return {
    type: 'discover_poi',
    reason: 'relevant_poi_nearby',
    poi: {
      id: 'poi:test',
      name: 'Museo cercano',
      location: { lat: 18.47, lng: -69.88 },
      distanceM: 100,
      contentId: 'poi-discovery:poi:test',
    },
    situation: { locationAvailable: true, speedKmh: 0, motion: { status: 'stationary' } },
  };
}

const recentInterventions = [5, 15, 25].map((minutesAgo, index) => ({
  type: 'companion_intervention',
  kind: 'poi_discovery',
  interventionId: `discovery:${index}`,
  at: new Date(now - minutesAgo * 60 * 1000).toISOString(),
}));

{
  const result = policy.decide({ evaluation: discovery(), at: now, recentInterventions });
  assert.equal(result.disposition, 'defer');
  assert.equal(result.reason, 'discovery_budget_exhausted');
  console.log('PASS discovery budget limits unsolicited POI interruptions');
}

{
  const result = policy.decide({ evaluation: discovery(), at: now, navigationActive: true });
  assert.equal(result.disposition, 'defer');
  assert.equal(result.reason, 'navigation_active');
  console.log('PASS POI discoveries stay silent during active navigation');
}

{
  const arrival = {
    type: 'introduce_place',
    semanticPlace: { level: 'city', id: 'city:test', name: 'Ciudad nueva' },
    situation: { speedKmh: 0, motion: { status: 'stationary' } },
  };
  const result = policy.decide({ evaluation: arrival, at: now, recentInterventions });
  assert.equal(result.disposition, 'present');
  console.log('PASS discovery budget does not suppress a new-city welcome');
}

{
  const result = policy.decide({ evaluation: discovery(), at: now, lastInterventionAt: now - 30000 });
  assert.equal(result.disposition, 'defer');
  assert.equal(result.reason, 'intervention_cooldown');
  console.log('PASS global cooldown separates consecutive interventions');
}

console.log('\n4/4 companion budget tests passed');

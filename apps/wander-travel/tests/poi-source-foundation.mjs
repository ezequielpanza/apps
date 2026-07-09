import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(TEST_DIR, '..');

class MemoryStorage {
  constructor(shared = new Map()) {
    this.shared = shared;
  }

  getItem(key) {
    return this.shared.has(String(key)) ? this.shared.get(String(key)) : null;
  }

  setItem(key, value) {
    this.shared.set(String(key), String(value));
  }

  removeItem(key) {
    this.shared.delete(String(key));
  }

  clear() {
    this.shared.clear();
  }
}

function loadRuntimeFile(context, filename) {
  const source = fs.readFileSync(path.join(APP_ROOT, filename), 'utf8');
  new vm.Script(source, { filename }).runInContext(context);
}

function createRuntime(storage = new MemoryStorage()) {
  let timerId = 0;
  const sandbox = {
    console,
    Date,
    Math,
    URL,
    localStorage: storage,
    setTimeout: () => ++timerId,
    clearTimeout: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  [
    'runtime-source-policy.js',
    'runtime-poi-candidate.js',
    'runtime-poi-evidence.js',
    'runtime-poi-store.js',
    'runtime-poi-connectors.js',
    'runtime-external-source-google-maps.js',
    'runtime-external-source-tripadvisor.js',
  ].forEach((filename) => loadRuntimeFile(context, filename));

  return {
    storage,
    policy: context.WanderSourcePolicy,
    candidate: context.WanderPOICandidate,
    evidence: context.WanderPOIEvidence,
    store: context.WanderPOIStore,
    connectors: context.WanderPOIConnectors,
    googleMaps: context.WanderExternalSourceGoogleMaps,
    tripadvisor: context.WanderExternalSourceTripadvisor,
  };
}

const observedAt = '2026-07-09T12:00:00.000Z';
const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

test('Google Maps and Tripadvisor are external-only and cannot enter the POI registry', () => {
  const runtime = createRuntime();

  for (const sourceId of ['google-maps', 'tripadvisor']) {
    const policy = runtime.policy.get(sourceId);
    assert.equal(policy.mode, 'external_only');
    assert.equal(policy.externalDiscovery, true);
    assert.equal(policy.automatedAcquisition, false);
    assert.equal(policy.storeCandidates, false);
    assert.equal(policy.storeEvidence, false);
  }

  assert.deepEqual(runtime.connectors.list(), []);
});

test('External source helpers create outbound intents but expose no POI discovery method', () => {
  const runtime = createRuntime();

  const mapsIntent = runtime.googleMaps.buildExternalIntent('attractions', 'Luperón');
  assert.equal(mapsIntent.query, 'Luperón que hacer');
  assert.equal(mapsIntent.mode, 'external_only');
  assert.equal(mapsIntent.storeAllowed, false);
  assert.equal(typeof runtime.googleMaps.discover, 'undefined');

  const taIntent = runtime.tripadvisor.buildExternalIntent('Luperón');
  assert.equal(taIntent.mode, 'external_only');
  assert.equal(taIntent.storeAllowed, false);
  assert.equal(typeof runtime.tripadvisor.discover, 'undefined');
});

test('POI Store v2 blocks direct candidate insertion from restricted sources', () => {
  const runtime = createRuntime();
  const candidate = runtime.candidate.create({
    name: 'Restricted candidate',
    source: {
      connector: 'google-maps',
      connectorVersion: '0.2.0',
      strategy: 'external-search',
    },
    discoveredAt: observedAt,
  }, observedAt);

  assert.throws(
    () => runtime.store.upsertCandidate(candidate),
    (error) => error?.code === 'SOURCE_POLICY_BLOCKED',
  );
  assert.equal(runtime.store.listCandidates().length, 0);
});

test('Unknown sources are denied by default', () => {
  const runtime = createRuntime();
  const policy = runtime.policy.getOrDefault('unreviewed-source');
  assert.equal(policy.mode, 'deny_by_default');
  assert.equal(runtime.policy.canAutomate('unreviewed-source'), false);
  assert.equal(runtime.policy.canStoreCandidates('unreviewed-source'), false);
});

test('Restricted source cannot register a POI connector even when it exposes discover()', () => {
  const runtime = createRuntime();

  assert.throws(
    () => runtime.connectors.register({
      id: 'tripadvisor',
      version: 'test',
      async discover() {
        return { candidates: [], evidence: [] };
      },
    }),
    (error) => error?.code === 'SOURCE_POLICY_BLOCKED',
  );

  assert.equal(runtime.connectors.get('tripadvisor'), null);
});

test('Explicitly reviewed store-allowed source can register, discover, and persist', async () => {
  const shared = new Map();
  const runtime = createRuntime(new MemoryStorage(shared));

  runtime.policy.register({
    id: 'test-permitted-source',
    mode: 'store_allowed',
    automatedAcquisition: true,
    storeCandidates: true,
    storeEvidence: true,
    reviewedAt: '2026-07-09',
  });

  runtime.connectors.register({
    id: 'test-permitted-source',
    version: '1.0.0',
    async discover() {
      const candidate = runtime.candidate.create({
        name: 'Permitted candidate',
        source: {
          connector: 'test-permitted-source',
          connectorVersion: '1.0.0',
          strategy: 'test',
        },
        discoveredAt: observedAt,
      }, observedAt);

      const evidence = runtime.evidence.create({
        candidateId: candidate.id,
        type: 'test_evidence',
        value: 'observed',
        source: {
          connector: 'test-permitted-source',
          connectorVersion: '1.0.0',
          strategy: 'test',
        },
        confidence: 1,
        observedAt,
      }, observedAt);

      return { candidates: [candidate], evidence: [evidence] };
    },
  });

  await runtime.connectors.discoverAndStore('test-permitted-source', {});
  runtime.store.flush();

  assert.equal(runtime.store.storageKey, 'wander.poi.store.v2');
  assert.equal(runtime.store.listCandidates().length, 1);
  assert.equal(runtime.store.listEvidence().length, 1);
  assert.deepEqual(Object.keys(runtime.store.snapshot().consolidated), []);
  assert.equal('canonical' in runtime.store.snapshot(), false);

  const reopened = createRuntime(new MemoryStorage(shared));
  reopened.policy.register({
    id: 'test-permitted-source',
    mode: 'store_allowed',
    automatedAcquisition: true,
    storeCandidates: true,
    storeEvidence: true,
  });
  assert.equal(reopened.store.listCandidates().length, 1);
});

test('Legacy POI Store v1 data is not migrated into policy-enforced Store v2', () => {
  const shared = new Map();
  shared.set('wander.poi.store.v1', JSON.stringify({
    schemaVersion: 1,
    candidates: {
      legacy: {
        id: 'legacy',
        name: 'Legacy restricted data',
        source: { connector: 'google-maps' },
      },
    },
    evidence: {},
    consolidated: {},
  }));

  const runtime = createRuntime(new MemoryStorage(shared));
  assert.equal(runtime.store.storageKey, 'wander.poi.store.v2');
  assert.equal(runtime.store.listCandidates().length, 0);
  assert.equal(runtime.store.listEvidence().length, 0);
});

let passed = 0;
const failures = [];

for (const current of tests) {
  try {
    await current.run();
    passed += 1;
    console.log('PASS', current.name);
  } catch (error) {
    failures.push({ name: current.name, error });
    console.error('FAIL', current.name);
    console.error(error?.stack || error);
  }
}

console.log(`\n${passed}/${tests.length} POI source foundation tests passed`);
if (failures.length) process.exitCode = 1;

# Wander Travel deterministic tests

Run from the repository root:

```bash
node apps/wander-travel/tests/wander-scenarios.mjs
node apps/wander-travel/tests/poi-source-foundation.mjs
node apps/wander-travel/tests/wikidata-connector.mjs
```

The runners have no external dependencies. They load the real production runtime modules in isolated Node `vm` contexts with controlled storage and no live network access.

## Engine scenarios

`wander-scenarios.mjs` covers:

1. New city without memory → `introduce_place`
2. User correction (`ya conozco`) → `known`, persisted across reopen
3. Previous-day presence → `recent_presence`
4. Explicit negative correction (`es mi primera vez`) → `new_confirmed`
5. Brief geocoder noise does not switch city; stable change does
6. Multimodal Journey remains one continuous session
7. Content Memory persists what Wander already told

## POI source foundation

`poi-source-foundation.mjs` covers:

1. Google Maps and Tripadvisor are `external_only`
2. External helpers create outbound intents but expose no POI `discover()` method
3. POI Store v2 blocks direct insertion from restricted sources
4. Unknown sources are denied by default
5. An explicitly reviewed `store_allowed` source can register, discover, store, and persist
6. The store uses `consolidated`, never `canonical`
7. Policy-gated web acquisition blocks restricted sources before any network call

The production store key is:

```text
wander.poi.store.v2
```

No legacy Tripadvisor or Google Maps POI research fixtures are retained in the repository.

## Wikidata connector

`wikidata-connector.mjs` covers:

1. Wikidata is explicitly `store_allowed`
2. Nearby SPARQL query generation preserves center, radius, language, and bounded limit
3. QID aggregation deduplicates repeated rows while preserving multiple P31 types
4. Discovery creates unresolved candidates with provenance
5. QID (`source_entity_id`) evidence is retained
6. P625 coordinate evidence is retained with `wikidata_p625` method
7. P31 type evidence is retained separately
8. The official Wikidata Query Service endpoint and JSON result format are used

The tests use simulated SPARQL bindings so CI remains deterministic.

A failing assertion exits with a non-zero status so all runners can execute in CI and before Cloudflare Pages deployment.

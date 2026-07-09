# Wander Travel deterministic tests

Run from the repository root:

```bash
node apps/wander-travel/tests/wander-scenarios.mjs
node apps/wander-travel/tests/poi-source-foundation.mjs
node apps/wander-travel/tests/wikidata-connector.mjs
node apps/wander-travel/tests/openstreetmap-connector.mjs
```

The runners have no external dependencies. They load the real production runtime modules in isolated Node `vm` contexts with controlled storage and simulated source responses.

## Engine scenarios

`wander-scenarios.mjs` covers:

1. New city without memory → `introduce_place`
2. User correction (`ya conozco`) → `known`, persisted across reopen
3. Previous-day presence → `recent_presence`
4. Explicit negative correction (`es mi primera vez`) → `new_confirmed`
5. Brief geocoder noise does not switch city; stable change does
6. Multimodal Journey remains one continuous session
7. Content Memory persists what Wander already told

## Unified POI engine

`poi-source-foundation.mjs` covers:

1. One source-independent `NormalizedPOI` contract
2. External-only sources remain outside the POI connector registry
3. Connectors returning raw non-normalized records are rejected
4. Different connectors are processed through the same `POIEngine` path
5. `searchMany()` combines normalized POIs without source-specific branches
6. `POIStore v3` persists normalized POIs with embedded evidence
7. Legacy candidate/evidence stores are not migrated into Store v3

The production store key is:

```text
wander.poi.store.v3
```

The production contract is:

```text
connector.search(request)
        ↓
{ pois: NormalizedPOI[], diagnostics }
        ↓
WanderPOIEngine
        ↓
WanderPOIStore
        ↓
consolidated
```

## Wikidata connector

`wikidata-connector.mjs` covers:

1. Wikidata registers as a normalized POI connector
2. Nearby SPARQL query generation preserves center, radius, language, and bounded limit
3. QID aggregation deduplicates repeated rows while preserving multiple P31 types
4. `search()` returns only `NormalizedPOI` objects
5. QID is retained as source identity and evidence
6. P625 becomes normalized location with `wikidata_p625`
7. P31 becomes normalized categories plus evidence
8. The common POI Engine stores Wikidata output without Wikidata-specific storage logic
9. The query endpoint and JSON result format are preserved

The tests use simulated SPARQL bindings so CI remains deterministic.

## OpenStreetMap connector

`openstreetmap-connector.mjs` covers:

1. OpenStreetMap registers as a normalized POI connector
2. Source-specific Overpass query profiles are preserved
3. `node` coordinates normalize as `osm_node`
4. `way` and `relation` centers normalize as `osm_geometry_center`
5. Original OSM tags are retained
6. OSM object type/id and source URLs are retained
7. OSM tag pairs become normalized categories
8. Address tags become the common address structure
9. The common POI Engine stores OSM output without OSM-specific storage logic
10. The connector posts Overpass QL to its configured endpoint

The tests use simulated Overpass elements so CI remains deterministic.

A failing assertion exits with a non-zero status so all runners can execute in CI and before Cloudflare Pages deployment.

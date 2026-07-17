# Wander Travel deterministic tests

Run from the repository root:

```bash
node apps/wander-travel/tests/wander-scenarios.mjs
node apps/wander-travel/tests/poi-source-foundation.mjs
node apps/wander-travel/tests/wikidata-connector.mjs
node apps/wander-travel/tests/openstreetmap-connector.mjs
node apps/wander-travel/tests/poi-consolidation.mjs
node apps/wander-travel/tests/nearby-provider.mjs
node apps/wander-travel/tests/context-dashboard.mjs
node apps/wander-travel/tests/context-dashboard-config.mjs
node apps/wander-travel/tests/movement-method.mjs
node apps/wander-travel/tests/app-shell.mjs
node apps/wander-travel/tests/companion-arrival.mjs
node apps/wander-travel/tests/companion-discovery.mjs
node apps/wander-travel/tests/navigation.mjs
node apps/wander-travel/tests/routes-api.mjs
node apps/wander-travel/tests/companion-budget.mjs
```

The runners have no external dependencies. They load the real production runtime modules in isolated Node `vm` contexts with controlled storage and simulated source responses.

## Engine scenarios

`wander-scenarios.mjs` covers:

1. New city without memory → `introduce_place`
2. New country and new city → city introduction takes priority
3. User correction (`ya conozco`) → `known`, persisted across reopen
4. Previous-day presence → `recent_presence`
5. Explicit negative correction (`es mi primera vez`) → `new_confirmed`
6. Brief geocoder noise does not switch city; stable change does
7. Multimodal Journey remains one continuous session
8. Content Memory persists what Wander already told

## Unified POI engine

`poi-source-foundation.mjs` covers:

1. One source-independent `NormalizedPOI` contract
2. Stable identity when a source provides `source.ref`
3. Generic source-attributed `notes[]`
4. External-only sources remain outside the POI connector registry
5. Connectors returning raw non-normalized records are rejected
6. Different connectors are processed through the same `POIEngine` path
7. `POIStore v4` persists normalized POIs
8. Consolidation remains explicit
9. Legacy Store v3 data is not migrated into Store v4

The production store key is:

```text
wander.poi.store.v4
```

The production flow is:

```text
connector.search(request)
        ↓
{ pois: NormalizedPOI[], diagnostics }
        ↓
WanderPOIEngine
        ↓
WanderPOIStore.normalized
        ↓
POIEngine.consolidate()
        ↓
WanderPOIStore.consolidated
```

## Wikidata connector

`wikidata-connector.mjs` covers:

1. Wikidata registers as a normalized POI connector
2. Nearby SPARQL query generation preserves center, radius, language, and bounded limit
3. QID aggregation deduplicates repeated rows while preserving multiple P31 types
4. `search()` returns only `NormalizedPOI` objects
5. QID is retained as a normalized `wikidata` identifier
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
7. OSM and cross-source identifiers are normalized
8. OSM `description` and `inscription` can become generic notes
9. OSM tag pairs become normalized categories
10. Address tags become the common address structure
11. The common POI Engine stores OSM output without OSM-specific storage logic
12. The connector posts Overpass QL to its configured endpoint

The tests use simulated Overpass elements so CI remains deterministic.

## POI consolidation

`poi-consolidation.mjs` covers:

1. Shared cross-source identifiers produce a strong match
2. Exact names plus nearby coordinates can match without a shared identifier
3. Same names far apart do not merge
4. Partial signals remain ambiguous rather than forcing a merge
5. Generic `notes[]` from multiple sources are preserved in the consolidated POI
6. Formal `ConsolidatedPOI` objects persist in Store v4

The matcher is deterministic and does not require AI. AI can be added later for interpretation, summarization, or user interaction without becoming a dependency of POI discovery or basic consolidation.

A failing assertion exits with a non-zero status so all runners can execute in CI and before Cloudflare Pages deployment.

## Companion arrival

`companion-arrival.mjs` verifies the first complete companion scene: a new city produces a contextual introduction, fast movement defers it, remembered content is not repeated, irrelevant evaluations remain silent, and a user correction is handled and recorded.

`companion-discovery.mjs` verifies that a nearby landmark can become a grounded intervention with human distance and direction, while repeated content, fast movement, passed POIs, and generic utilities remain silent.

`navigation.mjs` verifies polyline decoding, human maneuver language, route drawing, route state, and the required walking-route warning.

`routes-api.mjs` verifies coordinate validation, the server-side Google Routes request, response normalization, and that the API key is never exposed to the client.

`companion-budget.mjs` verifies the global cooldown, the rolling discovery limit, new-city priority, and silence during active navigation.

## App shell

`app-shell.mjs` verifies that every active script and stylesheet is declared in `index.html`, exists on disk, is present in the offline shell, and that retired staging directories do not regain source fragments. It also enforces `runtime-version.js` as the single app-version source.

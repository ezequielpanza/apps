# Wander Travel deterministic tests

Run from the repository root:

```bash
node apps/wander-travel/tests/wander-scenarios.mjs
node apps/wander-travel/tests/poi-source-foundation.mjs
node apps/wander-travel/tests/wikidata-connector.mjs
node apps/wander-travel/tests/openstreetmap-connector.mjs
node apps/wander-travel/tests/poi-consolidation.mjs
node apps/wander-travel/tests/nearby-provider.mjs
node apps/wander-travel/tests/field-guide.mjs
node apps/wander-travel/tests/field-guide-engine-flow.mjs
node apps/wander-travel/tests/field-test-logger.mjs
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
13. The field `discovery` profile is bounded to travel-relevant tag subsets and a 10 km maximum radius

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

## NearbyProvider field pipeline

`nearby-provider.mjs` covers:

1. Adaptive search radii and movement thresholds by mobility
2. Effective-location search through multiple connectors
3. Normalized result consolidation
4. Distance and bearing calculation
5. Deterministic relevance ranking
6. `WanderContext.nearby` writes
7. Partial-source degradation when one connector fails
8. Skipping insignificant movement until threshold or age

## Engine-driven field guide

`field-guide.mjs` covers:

1. Nearby historic/cultural/natural POIs become `fieldGuide.candidate` context signals rather than direct UI calls
2. Utility POIs such as pharmacies do not create spontaneous candidates
3. Per-POI and global cooldowns begin only after an actual presentation
4. Existing Content Memory suppresses already-told proximity content
5. Mobility-dependent interruption distance
6. Relative direction can use current heading plus POI bearing
7. Consolidated notes and multi-source corroboration can enrich the presentation text

`field-guide-engine-flow.mjs` covers:

1. `fieldGuide.candidate` becomes a formal `field_guide.poi_nearby` relevance signal
2. `WanderEngineDecision` produces `field_guide_suggestion`
3. New-city events outrank nearby POI interruptions
4. Expired candidates are ignored
5. `WanderEnginePresenter` presents a formal engine decision exactly once
6. Content Memory and cooldowns are updated only after presentation

The production spontaneous-guide flow is:

```text
NearbyProvider
      ↓
FieldGuide candidate
      ↓
WanderContext.fieldGuide.candidate
      ↓
WanderEngineRelevance
      ↓
WanderEngineDecision
      ↓
WanderEnginePresenter
      ↓
WanderUI
      ↓
Content Memory + cooldown
```

`runtime-field-guide.js` no longer calls `WanderUI` directly.

## Field test logger

`field-test-logger.mjs` covers:

1. Field session creation and app metadata
2. Nearby-result summaries limited to the top ten items
3. Field-guide suggestions becoming diagnostic events
4. Clearing the log creates a new session

The production logger samples location rather than storing every GPS callback, records context transitions and nearby diagnostics, and exposes JSON export controls inside the Simulator screen.

A failing assertion exits with a non-zero status so all runners can execute in CI and before Cloudflare Pages deployment.

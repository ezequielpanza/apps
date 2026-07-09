# Wander Travel deterministic tests

Run from the repository root:

```bash
node apps/wander-travel/tests/wander-scenarios.mjs
node apps/wander-travel/tests/poi-source-foundation.mjs
node apps/wander-travel/tests/google-maps-connector.mjs
```

The runners have no external dependencies. They load the real production runtime modules in isolated Node `vm` contexts with controlled storage and no network access.

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

1. Tripadvisor Luperón research fixture discovers exactly five unresolved candidates
2. Listing metadata, candidate provenance, and detail-link evidence are preserved
3. Candidate/evidence store persists across reopen and uses `consolidated`, never `canonical`
4. Google Maps URL parsing separates entity coordinates from viewport center
5. Tripadvisor Google Maps `daddr` links resolve destination coordinates separately from viewport coordinates
6. Detail-page location extraction keeps visible address evidence separate from coordinate evidence
7. Tripadvisor connector exposes source-specific research instructions without promoting candidates to consolidated truth

The Tripadvisor fixture lives at:

```text
apps/wander-travel/tests/fixtures/poi/tripadvisor-luperon.json
```

It is a research corpus, not production POI data and not a live scrape. Its current research observations include:

- five candidates discovered from the public Luperón destination page
- listing rating/review metadata and detail URLs
- one observed detail page (`FricoLandia - El Nunca Jamás`)
- visible-address evidence for that observed detail page
- Google Maps `daddr` destination coordinates extracted from its public location link
- four detail pages explicitly marked `not_observed` when the research fetcher could not load them, without assuming the data is absent

## Google Maps connector

`google-maps-connector.mjs` covers:

1. Exactly six query profiles observed by the user: attractions, restaurants, hotels, museums, pharmacies, and ATMs
2. Deterministic semantic-query generation for Luperón
3. Search URL generation without inventing result POIs
4. Destination URL parsing that separates entity coordinates from viewport coordinates
5. Preservation of source entity identifiers without assigning undocumented semantics
6. Search URL parsing that keeps semantic query text separate from viewport context
7. Discovery provenance, visible-address evidence, place-link evidence, source IDs, and entity-coordinate evidence
8. Empty observed result sets produce no candidates

The Google Maps fixture lives at:

```text
apps/wander-travel/tests/fixtures/poi/google-maps-luperon.json
```

It records the two URLs supplied by the user, the six observed query profiles, and expected URL evidence. It intentionally contains no asserted search-result POIs yet.

A failing assertion exits with a non-zero status so all runners can execute in CI and before Cloudflare Pages deployment.

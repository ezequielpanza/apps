# Wander Travel deterministic tests

Run from the repository root:

```bash
node apps/wander-travel/tests/wander-scenarios.mjs
node apps/wander-travel/tests/poi-source-foundation.mjs
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

A failing assertion exits with a non-zero status so both runners can execute in CI and before Cloudflare Pages deployment.

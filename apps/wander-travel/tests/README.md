# Wander Travel deterministic scenarios

Run from the repository root:

```bash
node apps/wander-travel/tests/wander-scenarios.mjs
```

The runner has no external dependencies. It loads the real production runtime modules in an isolated Node `vm` context with:

- controlled clock
- isolated/shared `localStorage`
- deterministic `Math.random`
- no browser timers or network

Current scenarios cover:

1. New city without memory → `introduce_place`
2. User correction (`ya conozco`) → `known`, persisted across reopen
3. Previous-day presence → `recent_presence`
4. Explicit negative correction (`es mi primera vez`) → `new_confirmed`
5. Brief geocoder noise does not switch city; stable change does
6. Multimodal Journey remains one continuous session
7. Content Memory persists what Wander already told

A failing assertion exits with a non-zero status so the same file can run in CI.

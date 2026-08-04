---
name: contextum-current-context
description: Read the user's current opt-in Contextum snapshot when they explicitly ask to use Contextum, check their current device location or movement state, or verify how recently Contextum updated. Use the Contextum MCP tools and a temporary pairing code supplied by the user.
---

# Contextum current context

Use Contextum only when the user explicitly asks to consult it or clearly requests device context that Contextum supplies.

## Procedure

1. Look for a current 8-character Contextum pairing code in the conversation.
2. When no current code is available, ask the user to generate and provide one from Contextum.
3. Call `get_current_context`. Use `get_context` only as a compatibility fallback.
4. Report the useful context and the snapshot freshness. State clearly when `freshness.isStale` is true.
5. Treat coordinates, notes, and movement data as sensitive personal information. Do not repeat the pairing code in the answer.

## Interpretation

- `freshness.status = live`: captured or received within approximately two minutes.
- `freshness.status = recent`: older than two minutes but no more than ten minutes.
- `freshness.status = stale`: older than ten minutes; do not describe it as the user's current position without a warning.
- `freshness.status = unknown`: the snapshot lacks a valid timestamp; disclose that limitation.

Do not invent a place name when Contextum returns only coordinates. Distinguish GPS accuracy from certainty about the user's exact physical position.

## Errors

- `invalid_code`: request a correctly formatted current code.
- `expired_or_unknown`: ask the user to generate a new code.
- `context_not_found`: explain that Contextum has not uploaded a snapshot for that code.

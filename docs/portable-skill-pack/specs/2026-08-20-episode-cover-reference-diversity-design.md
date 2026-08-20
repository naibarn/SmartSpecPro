# Episode cover reference diversity

## Goal

Ensure the four generated episode-cover variants receive different primary scene references when an episode has enough approved shot images. Prompt directions already vary by cover slot; this change makes the attached scene-reference sets vary as well.

## Design

- Keep the existing four cover slots, credit flow, logo references, provider routing, and persisted state contract.
- When a cover slot is known, rank approved shots using the existing narrative relevance score, then assign the ranked list into four deterministic allocation bands representing the maximum scene-reference budget of slots 1, 2, 3, and 4 (`1 + 2 + 3 + 3 = 9`).
- Select references from the slot's own band first. Only when the band is too small or the episode has fewer than nine approved shots may selection fall back to unused ranked candidates. This preserves graceful behavior for short episodes while avoiding repeated primary references for the normal nine-shot case.
- Preserve the legacy selector behavior when no cover slot is supplied, so unrelated callers and old data remain stable.

## Failure and compatibility behavior

- Approved/owned URL resolution remains unchanged; unapproved or unresolvable frames are still excluded.
- If there are fewer candidates than the requested reference count, the selector returns the available deterministic set and may reuse a shot because distinct references are mathematically impossible.
- No database migration or provider contract change is required.

## Proof

- Add unit coverage proving four slots over nine candidates have disjoint reference sets.
- Retain existing prompt, legacy selection, logo-capacity, and media transport tests.
- Run focused Vitest suites and `git diff --check`; provider/browser/deployment proof remains outside this change.

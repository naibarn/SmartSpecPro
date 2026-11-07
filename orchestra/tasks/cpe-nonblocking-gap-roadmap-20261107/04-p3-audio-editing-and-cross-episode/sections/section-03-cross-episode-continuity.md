# Section 03 — Cross-Episode Continuity

## Requirement IDs

CPE-14, NB-02, NB-08

## Objective

Extend existing series memory/story bible to preserve verified visual and audio continuity across episodes without making old episode context a hard prerequisite.

## Owned paths

`verticalDramaSeriesMemoryPlanning.ts`, series bible and memory contracts, episode pipeline integration, audio/style snapshot fields and focused tests.

## Tasks

1. Reconcile existing memory event types, approvals and current-episode hydration.
2. Carry only versioned, owner-scoped accepted facts (character appearance/voice, location/time, wardrobe/props, unresolved story beats).
3. Treat missing, unavailable, stale or invalid prior episode memory as an advisory omission; never fabricate facts.
4. Ensure updates invalidate only affected future draft/prompt artifacts, not successful current media.

## Completion predicate

Tenant isolation, revisioning, stale-memory fallback and cross-episode continuity tests pass; image/video remain usable without memory.

## Prerequisites and fallback

Requires sections 01 and 02. Use current episode's own approved facts when prior memory is absent.

## Focused tests and evidence

Test accepted memory hydration, missing service, stale revision, invalid fact, rejected/unapproved memory, updated source episode, tenant mismatch and partial series history. Assert only accepted current facts are projected, stale artifacts are not reused, and current-episode image/video remains usable without prior memory.

## Unresolved assumptions

Confirm the canonical approval and invalidation contract for series-memory facts and which visual/audio fields are already persisted. Do not infer memory truth from generated output or expand updates to unrelated successful episodes.

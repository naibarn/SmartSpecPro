# Implementation plan

## Objective

Make Premium deep story generation continuity-safe across chunks and provide a bounded repair path for failed full-season jobs.

## Affected modules

- `apps/web/server/services/verticalDramaStoryBible.ts`
- `apps/web/shared/verticalDramaSeries/storyContinuity.ts`
- `apps/web/server/routers/verticalDramaSeries.ts`
- focused story-bible/continuity/job tests
- a narrow recovery utility or testable service boundary for the existing checkpoint

## Implementation

1. Add `openThreadIds` to the Premium chunk/fan-out parameter contract.
2. Seed it from prior memory/checkpoint and pass it into every `buildDeepDraftPrompts` call, including missing-episode recovery and revise paths where episode memory is emitted.
3. Update the set after the accepted winner/revised episode state, removing only exact resolved IDs.
4. Extend the pure continuity validator with an optional current-episode/due-date check. Emit a distinct issue for an unresolved thread whose declared payoff episode has arrived; preserve the `season` exception.
5. Add a bounded continuity repair helper that accepts complete episode-memory patches, preserves all non-continuity fields, validates the resulting timeline, and returns a repairable failure without mutation when validation fails.
6. Wire full-season deep-generate finalization to use the repair result. Keep the existing no-bible-write behavior until validation passes.
7. Add a recovery entry point for a failed story-job checkpoint. It must be tenant/user/series scoped, validate the checkpoint, and atomically persist the bible plus memory only after success.
8. Recover series #25 from Redis checkpoint and record exact success/failure evidence.

## Risks and mitigations

- LLM may still omit resolutions: bounded repair and fail-closed validation prevent fabricated or partial writes.
- Premium revise may drop episode-memory fields: preserve the prior accepted memory unless a repair explicitly replaces it with a valid complete memory block.
- Checkpoint data may be stale: compare job/series ownership and validate episode numbers before any write.
- Existing dirty worktree: inspect and stage only touched files if publishing is later requested.

## Acceptance criteria

- New regression reproduces the old Premium chunk propagation failure and passes after the fix.
- Due thread validation identifies the first overdue episode, not only the season finale.
- Failed recovery cannot change bible/memory.
- Series #25 is recovered only if all 15 episodes pass the continuity validator.
- Focused tests and `git diff --check` pass.

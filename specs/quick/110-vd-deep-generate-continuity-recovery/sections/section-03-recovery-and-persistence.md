# Section 03 — recovery and persistence

## Ownership

Bounded continuity repair and validate-before-write recovery for failed jobs.

## Targets

- `apps/web/server/services/verticalDramaStoryBible.ts`
- `apps/web/server/routers/verticalDramaSeries.ts`
- existing story-job tests and a new recovery regression where appropriate

## TDD

- Invalid repairs remain in memory and do not update bible/memory.
- Valid repairs write the complete candidate atomically.
- Series/user/tenant ownership is checked before recovery.

## Acceptance

Series #25 can be recovered from its existing checkpoint without a fresh full-season generation call.

## Risks

Checkpoint may expire or be malformed; return an actionable failure and preserve existing persisted data.

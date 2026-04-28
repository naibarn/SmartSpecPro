# Section 03: Media, Finalization, And Security

## Ownership

- `apps/web/server/services/autoTeamMediaExecutionService.ts`
- `apps/web/server/services/autoTeamMediaCompletionService.ts`
- `apps/web/server/services/autoTeamRecoveryService.ts`
- `apps/web/server/services/managedMediaAccessService.ts`
- `apps/web/server/routers/mediaJobs.ts`

## Goal

Make storyboard/image/video/final composition work as async automation, not as a human approval dead end.

## Acceptance

- Storyboard images feed video clip generation.
- Missing video clips are queued safely.
- Capacity/rate-limit waits and retries instead of failing immediately.
- Final composition starts only after all clips are complete.
- Final probe/review validates duration/objective.
- Final evidence is canonicalized.
- Media access tokens are user-bound and cannot be reused by another user or admin session.

## Verification

- autoTeamMediaExecutionService tests
- autoTeamMediaCompletionService tests
- autoTeamRecoveryService tests
- managedMediaAccessService tests

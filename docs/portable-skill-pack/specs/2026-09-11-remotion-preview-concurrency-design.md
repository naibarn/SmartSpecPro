# Remotion Preview Concurrency Design

## Goal

Allow distinct Remotion preview jobs to enter the worker queue concurrently while
preventing duplicate work for the same preview target. A target is identified by
the tenant, requesting user, `videoProjectId`, `projectRevision`, and preview
profile. For Vertical Drama episode previews this maps to one episode and one
preview slot.

## Current problem

`queueRemotionRenderVideoJob` rejects every queued/running preview belonging to a
user, even when the next request targets another episode or slot. The Vertical
Drama panel also disables every slot while any slot is pending. This makes the
frontend and backend policy broader than the user's intended queue model.

## Design

1. Replace the scheduler's user-wide active-preview lookup with an exact-target
   lookup using `videoProjectId` and `projectRevision` in addition to tenant,
   user, job type, preview profile, and active status.
2. Keep the existing idempotency lookup, credit reservation order, six-submission
   per-minute rate limit, worker priority, and tenant/runtime gates unchanged.
3. Change the Vertical Drama preview panel to lock only the slot currently being
   submitted or persisted as pending. Different slots may be submitted while a
   previous slot is queued/running.
4. Preserve the existing episode/slot pending-state check and add the exact-target
   scheduler check as a race guard when the manifest backlink has not been
   persisted yet.
5. Normalize scheduler admission failures at the tRPC boundary so conflict,
   rate-limit, feature, and dispatch errors do not get mislabeled as generic
   `INTERNAL_SERVER_ERROR` failures.

## Alternatives and trade-offs

- Remove the backend active-job guard entirely: simplest, but two tabs can create
  duplicate work for the same target before the persisted pending marker exists.
- Keep the user-wide cap: safest for queue load, but blocks valid independent work
  and contradicts the queue-based product behavior.
- Use an exact-target cap (recommended): preserves duplicate protection with the
  smallest concurrency boundary and does not require a schema migration.

## Failure handling and safety

The queue remains the authority for admission and billing. The exact-target guard
runs before credit reservation. A queued/running job for another target does not
block this request. Existing cancellation, terminal reconciliation, and retryable
slot state remain unchanged.

## Verification

- Scheduler tests prove same-target rejection and different-target acceptance.
- Client tests prove one pending slot does not disable other slots and that the
  submitting slot remains guarded.
- Focused TypeScript/Vitest checks and `git diff --check` are required.

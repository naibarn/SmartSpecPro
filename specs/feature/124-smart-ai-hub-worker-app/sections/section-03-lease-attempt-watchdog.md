# Section 03: Lease, Attempt, And Watchdog

## Goal

Make long-running HyperFrames worker jobs safe by adding assignment attempt
identity, stale attempt rejection, user-requested reassign, and stalled worker
watchdog behavior.

## Dependencies

- section-01-contracts-and-flags
- section-02-worker-queue-scheduler

## In Scope

- Claim response additions.
- Event/upload stale attempt validation.
- Lease renewal or progress-heartbeat policy.
- Cooperative stop and `cancel-ack`/`transfer-ack` handling.
- User reassign action after slow threshold.
- Watchdog for abandoned/stalled attempts.

## Files To Review

- `apps/web/server/services/workerRegistryService.ts`
- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/services/workerSchedulerService.ts`
- `apps/web/server/services/__tests__/workerRegistryService.test.ts`
- `apps/web/server/routes/__tests__/workerRuntime.test.ts`

## Files To Change

- `apps/web/server/services/workerRegistryService.ts`
- `apps/web/server/routes/workerRuntime.ts`
- optional `apps/web/server/services/workerStallWatchdogService.ts`
- tests listed above

## Test First

- Test: HyperFrames claim response includes `assignmentAttempt`.
- Test: HyperFrames progress event requires matching `assignmentAttempt`.
- Test: stale assignment attempt is rejected after reassign.
- Test: stale lease owner token is rejected.
- Test: worker cannot claim a job already leased by another live attempt.
- Test: user can request reassign after configured slow threshold.
- Test: user cannot request reassign too early.
- Test: heartbeat can return cooperative stop commands for reassignment or
  timeout.
- Test: `cancel-ack`/`transfer-ack` is accepted only for the active attempt.
- Test: watchdog requeues abandoned job after hard threshold.
- Test: repeated stalls stop automatic requeue and surface operator-required
  state.
- Test: max attempts move a job to failed/dead-letter state.

## Implementation Steps

1. Add assignment attempt creation during successful claim. Use a stable random
   identifier stored in worker job output/instructions or a new column if needed.
2. Include assignment attempt in claim response and job manifest.
3. Extend worker event payload validation for HyperFrames jobs.
4. Extend artifact init/complete validation to require matching attempt.
5. Add a worker release route or service method for clean abandonment.
6. Add heartbeat command generation for cooperative stop, pause after current
   job, timeout, runtime update required, and connection revoked.
7. Add `cancel-ack`/`transfer-ack` event or endpoint handling.
8. Add reassign service method callable by user/admin APIs.
9. Add watchdog service that scans active jobs for expired lease, missing
   progress, or too-long active attempts.
10. Record audit events for claim, reassign requested, attempt stalled, requeued,
   stale upload rejected, and watchdog action.
11. Add max-attempt/dead-letter policy so failed workers cannot requeue forever.

## Threshold Policy

- User-requested reassign allowed after 15 minutes by default.
- Watchdog hard-stall threshold is 30 minutes by default.
- Cooperative stop grace period should be configurable, default 60-120 seconds.
- Both thresholds should be constants or config values, not scattered literals.

## Acceptance Criteria

- No stale worker can complete/upload after another worker receives the job.
- Slow/stalled jobs become visible and recoverable.
- The worker queue remains idempotent and safe under concurrent claims.

## UI/UX Contract

### Target User / JTBD

Creators need confidence that a long render is still alive, can be reassigned
when it is too slow, and will not be overwritten by stale worker output.
Operators need enough state to diagnose a stuck worker without reading logs.

### Surface Inventory

- User job monitor detail view reassign/cancel controls.
- Storyboard Review final composite status panel.
- Admin worker monitor active job and stale attempt diagnostics.
- Worker App current job progress.

### Component Map

- No UI component is implemented in this section.
- Services must emit normalized events used by section 05, section 09, and
  section 10 for lease active, reassignment available, watchdog requeue, and
  stale upload rejected states.

### State Matrix

- Claimed recently: show active worker and elapsed time, no reassign button.
- Active over 15 minutes: user may request reassign.
- Active over 30 minutes without progress: watchdog can requeue or mark
  operator-required.
- Stale attempt upload rejected: admin sees diagnostic; user sees safe retry or
  verification failed copy.
- Repeated stalls: stop automatic looping and show operator action required.

### Responsive Matrix

Elapsed time, worker name, and action buttons must fit job cards on mobile by
stacking controls; desktop can show inline metadata.

### Accessibility Acceptance

Reassign availability must be text-visible and keyboard reachable. Countdown or
elapsed time updates must not spam screen readers.

### Copy Contract

Use user-facing Thai copy equivalent to: waiting, worker accepted the job,
worker seems slow, request another worker, requeued, and needs support. Avoid
terms like lease token or assignment attempt outside admin diagnostics.

### Browser Evidence Required

Later UI sections must capture evidence for claimed, reassign available,
watchdog requeued, and operator-required states.

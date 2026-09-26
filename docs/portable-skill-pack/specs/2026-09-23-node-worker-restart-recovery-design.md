# Node Worker Restart and Active Job Recovery Design

## Goal

Prevent `smartspec-node-worker.service` from restarting a healthy worker merely
because its process heartbeat is delayed while a canonical job still has a
valid lease, and make the active Vertical Drama prompt path use `worker_jobs`
as its only job lifecycle and result authority.

## Evidence and root cause

The affected jobs were claimed and heartbeating in `worker_jobs`, then the
worker received `SIGTERM` while execution was active. The active application
path still used real Redis domain records and the Redis shutdown hook closed
the client, producing `Connection is closed`. The domain projection could not
write a terminal Redis record, so the canonical executor later observed
`status=running` and reported `domain projection did not complete`.

The watchdog currently treats a stale process heartbeat as sufficient evidence
to restart an active service. It does not check whether any active canonical
job still has a valid lease. Long provider calls and event-loop scheduling can
delay the file heartbeat without proving that the worker is dead.

## Design

### Watchdog safety gate

Extend queue health with `activeLeaseValidCount`, counting active canonical
jobs whose `leaseExpiresAt` is still in the future. A stale process heartbeat
must not restart the service while this count is positive. Dispatch backlog
recovery remains limited to `activeJobCount = 0`. A stale heartbeat with no
valid active lease remains restartable, preserving recovery for genuinely dead
workers.

The same rule is applied to the TypeScript recovery policy and the shell
watchdog decision so the two recovery paths cannot disagree.

### Canonical prompt execution

When hard cutover is enabled, shot prompt and shot video prompt submit/status/
execute paths read and write only `worker_jobs`. The worker executor returns
the business result as `JobResult.output`, allowing the control plane to persist
it in `worker_jobs.outputJson`. Redis/BullMQ code remains compatibility-only
while the legacy flag is off; it is not part of the active canonical path.

### Graceful worker shutdown

The worker stops claiming new jobs on `SIGTERM`/`SIGINT` and waits up to a
bounded grace period for tracked canonical executions to settle. Redis is not
used as a shutdown barrier and does not participate in canonical prompt
liveness or completion.

## Trade-offs and limits

- Lease protection may delay recovery of a truly wedged worker until the
  active lease expires, which is safer than killing active provider work.
- The shutdown grace period is bounded by systemd `TimeoutStopSec`; it cannot
  guarantee completion for a provider call that exceeds the grace period.
- The compatibility Redis/BullMQ path is intentionally retained as a separate
  migration boundary; active hard-cutover traffic must not depend on it.

## Verification

Focused Vitest coverage will pin: stale-heartbeat protection with a valid
lease, restart after lease expiry, bounded shutdown draining, canonical prompt
result/status mapping, and shell watchdog syntax/policy alignment.
Systemd restart/deploy and provider/browser behavior remain runtime gates and
will not be claimed from unit tests.

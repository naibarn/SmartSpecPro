# Implementation plan

## Objective

Stop the active Redis startup OOM loop and prevent recurrence through a bounded
resource budget, safe Redis memory behavior, host overcommit configuration, and
direct OOM attribution.

## Files to change

- `docker-compose.infra.yml`
  - Make Redis cgroup memory/swap/reservation configurable with safe defaults of
    4G/4G/512M.
  - Start Redis with `maxmemory=3gb` and `maxmemory-policy=noeviction`.
- `ops/sysctl/99-smartspec-memory.conf`
  - Add `vm.overcommit_memory = 1` beside the existing swappiness policy.
- `scripts/system-crash-monitor.sh`
  - Add a bounded, read-only `docker inspect` check for
    `smartspec-redis` OOM/restart state and emit a deduplicated critical alert.
- `scripts/redis-memory-preflight.sh`
  - Validate active Compose rendering, resource ordering, and the read-only RDB
    metadata/integrity when the named volume is available.
- `scripts/tests/redis-memory-protection.test.sh`
  - Exercise the preflight budget parser and monitor alert logic with isolated
    command stubs, without touching Docker runtime state.
- `docs/operations/redis-memory-protection.md`
  - Document rollout, verification, rollback, and the no-flush/no-volume-delete
    data safety boundary.

## Implementation order

1. Add focused preflight/monitor expectations and shell-safe helper behavior.
2. Patch Compose and sysctl source configuration.
3. Patch monitor attribution without changing existing autokill behavior.
4. Add the operator runbook.
5. Run isolated shell tests, static/config checks, and execute the read-only
   preflight.
6. Re-read the final diff and verify unrelated dirty files were untouched.
7. Apply the host sysctl policy and reconcile only the Redis container using the
   same named volume, then run runtime health checks.

## Runtime rollout

The runtime step uses the active project/file explicitly. It must not run
`docker compose down`, remove volumes, flush Redis, or alter other services.
Before reconciliation, retain the current RDB and run the read-only integrity
check. After reconciliation, verify the container is running, Docker reports no
OOM kill, Redis health is healthy, backend `/health` is healthy, and Celery can
reach the broker.

## Risks and mitigations

- RDB still exceeds the new budget: preflight and runtime checks stop the
  rollout; do not keep increasing the limit blindly.
- Redis reaches 3G: `noeviction` preserves keys but may reject writes; expose
  this condition and investigate data growth.
- Sysctl cannot be applied: report it as pending instead of claiming full host
  protection.
- Existing dirty files overlap the monitor or Compose paths: inspect and stop
  before overwriting; current evidence shows those paths are clean.
- A container restart exposes stale queue jobs: preserve the RDB and report any
  queue recovery requirement; do not delete state automatically.

## Acceptance criteria

- Rendered active Compose config has Redis memory limit 4G, swap limit 4G, and
  Redis maxmemory 3gb with noeviction.
- The sysctl source includes `vm.overcommit_memory = 1` and the existing
  finalize script still owns its application.
- Monitor syntax passes and the Redis OOM check is read-only and deduplicated.
- Preflight confirms the RDB is valid or clearly reports unavailable/corrupt
  state without mutation and rejects RDB used memory at or above maxmemory.
- Runbook contains explicit no-destructive-action guidance and rollback.
- After authorized runtime reconciliation, Redis is healthy and backend/Celery
  no longer report Redis unavailability.

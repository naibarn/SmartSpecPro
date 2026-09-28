# Redis cgroup OOM Prevention Design

Date: 2026-09-10
Status: Implemented and runtime-verified on the active local host

## Problem

The active infrastructure stack starts `smartspec-redis` with a 512 MiB memory
limit while its persisted RDB reports roughly 2 GiB of Redis memory usage. Redis
is repeatedly killed with exit 137 during startup, causing the backend health
endpoint to report `degraded` and Celery to lose its broker connection. The host
still has ample RAM, so host-level memory thresholds alone do not prevent or
explain the failure.

## Goals

- Let the existing RDB load without deleting, flushing, or recreating the Redis
  data volume.
- Keep Redis below a deliberate application memory ceiling with headroom below
  the container cgroup limit.
- Make the kernel overcommit policy match Redis' persistence requirements.
- Make the crash monitor identify a Redis container OOM/restart loop directly,
  rather than only reporting aggregate `system.slice` events.
- Provide a reversible, low-risk rollout and verification runbook.

## Non-goals

- Do not flush Redis, delete `smartspec_redis_data`, rewrite the RDB, or apply an
  eviction policy that could remove queue/state keys.
- Do not change application cache semantics, Celery concurrency, database schema,
  provider behavior, or production deployment configuration.
- Do not restart the service as part of source editing or static verification.

## Design

### 1. Redis resource budget

Update the active `docker-compose.infra.yml` Redis service to use configurable
defaults:

- cgroup memory limit: `4G`
- cgroup swap limit: `4G`
- reservation: `512M`
- Redis `maxmemory`: `3G`
- Redis `maxmemory-policy`: `noeviction`

The 1 GiB gap between Redis' logical ceiling and its cgroup limit leaves room
for allocator/native overhead and RDB loading. `noeviction` preserves queue and
state data; if the ceiling is ever reached, new writes fail visibly instead of
silently deleting keys. Operators can override the budgets through Compose
environment variables without editing the service definition.

### 2. Host memory policy

Extend the existing scoped sysctl file used by `scripts/finalize-autostart.sh`
with `vm.overcommit_memory = 1`, retaining the existing `vm.swappiness = 10`.
The source file is committed as an operator-controlled policy; applying it to
the live host remains an explicit rollout step.

### 3. OOM attribution and guardrail

Extend `scripts/system-crash-monitor.sh` with a read-only Docker check for the
managed Redis container. When Docker reports `OOMKilled=true`, the monitor emits
a deduplicated critical alert containing the container name, exit code, and
restart count. This complements, rather than replaces, the existing cgroup and
host PSI checks.

Add `scripts/redis-memory-preflight.sh` for rollout checks. It validates the
rendered active Compose configuration and, when the Redis volume/RDB is
available, reports the RDB metadata and verifies that the configured Redis
ceiling is below the container limit. It must never mutate the volume.

### 4. Runbook

Add an operations runbook documenting:

1. Static validation and RDB integrity checks.
2. Applying the sysctl policy.
3. Recreating only Redis with the same named volume.
4. Verifying `OOMKilled=false`, Redis health, backend `/health`, and Celery.
5. Rollback to the prior Compose resource values if the service does not become
   healthy, without deleting the volume.

The runbook explicitly warns that the existing RDB contains queue/state data and
must not be flushed as a first response.

## Failure handling

- If the RDB is corrupt, the preflight reports failure and does not attempt
  repair or deletion.
- If Redis reaches `maxmemory`, Redis returns an error under `noeviction`; the
  monitor and health checks expose the condition for operator action.
- If the host cannot apply sysctl, the rollout remains safe but the runbook
  reports the policy as pending; this is not silently treated as complete.
- If the container remains in a restart loop after the budget change, stop the
  rollout and investigate RDB/data growth rather than increasing limits without
  bound.

## Security and data safety

All new checks are read-only. No credentials are added, logged, or exposed.
Compose interpolation is limited to non-secret resource values. The existing
named volume is preserved and no destructive Redis command is introduced.

## Verification

- `docker compose -f docker-compose.infra.yml config` succeeds and renders the
  intended memory/maxmemory values.
- `bash -n scripts/system-crash-monitor.sh scripts/redis-memory-preflight.sh`
  succeeds.
- The preflight reports the current RDB metadata without modifying the volume.
- `git diff --check` succeeds.
- After the separately authorized rollout: Redis remains running, its health
  check is healthy, backend `/health` is healthy, Celery is healthy, and Docker
  reports no new Redis OOM event.

Runtime note: the aggregate `system.slice` OOM counter remains cumulative and
includes the pre-fix Redis restart loop. The reconciled Redis container itself
is currently `OOMKilled=false`, healthy, and has restart count zero.

## Rollback

Restore the previous Redis resource values in the active Compose file and
reconcile only the Redis service. Do not remove the named volume. Keep the
monitoring and sysctl source changes unless a separate incident review shows
they are incorrect.

# Section 02: Monitoring, preflight, and runbook

## Ownership

Own the read-only operational checks and documentation for detecting and
recovering from Redis cgroup OOM without data deletion.

## Target files

- `scripts/system-crash-monitor.sh`
- `scripts/redis-memory-preflight.sh`
- `docs/operations/redis-memory-protection.md`

## TDD expectations

- Test healthy, OOM-killed, and unavailable Docker states without restarting or
  mutating containers.
- Test preflight rejection when maxmemory is not below the cgroup limit.
- Test that RDB integrity failure is reported and no repair/delete command runs.

## Acceptance checks

- Monitor emits a deduplicated critical Redis-specific OOM alert with exit and
  restart details.
- Existing aggregate cgroup/PSI monitoring remains unchanged.
- Preflight uses read-only volume access and reports RDB metadata/integrity.
- Preflight rejects an RDB whose recorded used memory reaches the Redis
  maxmemory ceiling.
- Runbook has static checks, sysctl application, Redis-only reconciliation,
  health verification, rollback, and no-flush/no-volume-delete warnings.

## Risks

Docker inspection may be unavailable in a restricted environment; the monitor
must skip safely and the preflight must report unavailable rather than claim
success. Runtime health proof must be labeled separately from static proof.

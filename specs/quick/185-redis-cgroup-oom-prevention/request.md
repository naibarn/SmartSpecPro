# Request

## Task summary

Prevent the confirmed Redis cgroup OOM/restart loop on the active SmartSpecPro
infrastructure host without losing the existing Redis RDB, queue, or state data.

## Evidence

- `smartspec-redis` was reported by Docker as `oomKilled=true`, exit `137`, with
  a 512 MiB memory and swap limit.
- The persisted RDB reported approximately 2 GiB of Redis memory usage and the
  named volume was approximately 2 GiB.
- The host retained substantial available RAM; the failure was container-local.
- Backend `/health` became `degraded` because Redis was unavailable and the
  Celery presentation worker became unhealthy.

## Constraints

- Preserve unrelated dirty worktree changes.
- Do not flush Redis, delete or recreate the named data volume, rewrite the RDB,
  or introduce silent key eviction.
- Do not run a repository-wide memory-heavy typecheck or production deployment.
- The live service may be reconciled only after static checks pass; verification
  must distinguish source/config proof from runtime proof.

## Intended outcome

The active Compose stack has a bounded Redis budget with startup headroom, Redis
has an explicit no-eviction ceiling below the cgroup limit, the existing host
memory policy enables Redis overcommit, and monitoring identifies Redis OOM
events directly. The same named volume must remain attached throughout rollout.

# TDD and verification plan

## Expected failing condition

Before the change, rendering `docker-compose.infra.yml` shows a 512M Redis
limit, the preflight helper does not exist, and the monitor has no named Redis
OOM attribution.

## Test-first checks

1. Create `scripts/tests/redis-memory-protection.test.sh` with isolated command
   stubs. It must accept a rendered 4G/3G configuration, reject a ceiling that
   is greater than or equal to the cgroup limit, and never write to the Redis
   volume.
2. Use the same fixture to verify Docker state `oomKilled=true` becomes a
   critical Redis-specific alert while a healthy state produces no alert.
3. Run the fixture before implementation to establish the missing behavior,
   then implement the smallest configuration/helper changes and rerun it.

## Focused regression checks

- `bash -n scripts/system-crash-monitor.sh scripts/redis-memory-preflight.sh`
- `bash scripts/tests/redis-memory-protection.test.sh`
- `docker compose -f docker-compose.infra.yml config`
- `scripts/redis-memory-preflight.sh --read-only`
- `git diff --check`
- `docker inspect smartspec-redis` and `docker ps` after the runtime step
- `curl http://127.0.0.1:8000/health` after Redis is healthy

## Safety checks

- Confirm the named volume remains `smartspec_redis_data` before and after
  reconciliation.
- Confirm no `docker volume rm`, `FLUSHDB`, `FLUSHALL`, or destructive migration
  is present in the implementation.
- Do not run full application typecheck/build because it is outside the touched
  runtime and has known high-memory baseline noise.

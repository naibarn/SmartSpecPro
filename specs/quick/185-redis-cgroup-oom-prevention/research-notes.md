# Research notes

## Current runtime

- Active Redis container is created by project `smartspecpro` from
  `docker-compose.infra.yml`.
- `HostConfig.Memory=536870912` and `HostConfig.MemorySwap=536870912`.
- Redis was repeatedly restarted with `oomKilled=true` and exit code 137.
- Redis logs show RDB memory usage around 1969 MiB during startup and warn that
  `vm.overcommit_memory` is disabled.
- The read-only RDB check reported a valid checksum, 12,185 keys, and RDB
  metadata `used-mem=2064666752`.
- The named volume is `smartspec_redis_data`; no volume deletion is permitted.

## Current source/config paths

- `docker-compose.infra.yml` owns the active Redis resource limit.
- `ops/sysctl/99-smartspec-memory.conf` is already applied by
  `scripts/finalize-autostart.sh` and currently sets only swappiness.
- `scripts/system-crash-monitor.sh` records aggregate cgroup events but does not
  attribute Docker OOM state to a named container.
- `docker/systemd/smartspec-infra.service` starts the active infra Compose file.
- `docker-compose.media.yml` consumes Redis as the Celery broker on the shared
  `smartspec-network`.

## Scope decision

The implementation targets the active infrastructure path and its existing
host policy/monitor. Other development Compose variants are not active for this
incident and will not be changed unless verification reveals that the active
service is sourced from them.

## Risk/data boundary

Redis is both cache-like storage and a Celery/BullMQ-related broker/state
dependency. `noeviction` is therefore safer than an eviction policy because it
fails writes visibly rather than silently removing queue/state keys. A 4 GiB
container limit and 3 GiB Redis ceiling provide room above the measured RDB
usage while staying bounded on this 30 GiB host.

## Verification constraints

Use Compose rendering, shell syntax, the read-only RDB check, and targeted local
health/container checks. Avoid full TypeScript checks and unrelated builds due
to the known memory-sensitive dirty worktree.

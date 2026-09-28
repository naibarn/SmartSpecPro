# Redis memory protection runbook

## Current incident

The active `smartspec-redis` container is a shared dependency for the host
backend and Docker media workers. Its persisted RDB was larger than the old
512 MiB cgroup limit, causing exit 137/OOM restart loops. The remediation keeps
the existing named volume and uses a 4 GiB container budget with a 3 GiB Redis
logical ceiling.

## Safety rules

Do not run any of the following as an incident shortcut:

- `docker volume rm smartspec_redis_data`
- Redis `FLUSHDB` or `FLUSHALL`
- `docker compose down` for the whole stack
- RDB deletion or rewrite without a separate backup/recovery decision

Redis contains broker/state data as well as cache-like keys. `noeviction` is
intentional: reaching the logical ceiling produces visible write errors rather
than silently deleting queue/state keys.

## Static and read-only checks

From the repository root:

```bash
bash -n scripts/system-crash-monitor.sh scripts/redis-memory-preflight.sh scripts/tests/redis-memory-protection.test.sh
bash scripts/tests/redis-memory-protection.test.sh
docker compose -p smartspecpro -f docker-compose.infra.yml config
scripts/redis-memory-preflight.sh --read-only
```

The preflight mounts `smartspec_redis_data` read-only and runs
`redis-check-rdb`. A corrupt RDB stops the process; it does not attempt repair or
deletion.

## Apply host policy

The source policy is `ops/sysctl/99-smartspec-memory.conf` and is already wired
into `scripts/finalize-autostart.sh`. Apply it on the host with root privileges:

```bash
install -m 0644 ops/sysctl/99-smartspec-memory.conf /etc/sysctl.d/99-smartspec-memory.conf
/sbin/sysctl --load=/etc/sysctl.d/99-smartspec-memory.conf
cat /proc/sys/vm/overcommit_memory
```

The final command must print `1`. If it does not, treat host-policy rollout as
pending.

## Redis-only reconciliation

After the preflight passes, reconcile only the Redis service with the explicit
active project/file. This preserves the existing named volume:

```bash
docker compose -p smartspecpro -f docker-compose.infra.yml up -d --no-deps redis
```

Do not use `down`, `--volumes`, or a manually recreated volume. The Redis image
must be able to load the existing RDB under the new 4 GiB cgroup limit.

## Verification after reconciliation

```bash
docker inspect smartspec-redis --format 'status={{.State.Status}} oom={{.State.OOMKilled}} exit={{.State.ExitCode}} restarts={{.RestartCount}} mem={{.HostConfig.Memory}} volume={{range .Mounts}}{{.Name}}->{{.Destination}} {{end}}'
docker ps --format '{{.Names}} {{.Status}}' | grep -E 'smartspec-(redis|celery-presentation)'
curl -fsS http://127.0.0.1:8000/health
```

Expected results:

- Redis is `running`, `OOMKilled=false`, and memory is `4294967296` bytes.
- The named volume remains `smartspec_redis_data` mounted at `/data`.
- Backend health reports Redis healthy, not memory-cache fallback.
- Celery presentation worker no longer reports Redis DNS/connection failure.

The crash monitor also emits a direct critical alert if Docker later reports a
Redis OOM/restart loop. It does not automatically restart or delete Redis data.

## Rollback

If Redis does not become healthy, stop the rollout and preserve the volume. The
source Compose values can be reverted to the previous limit only as a temporary
diagnostic; that limit is known to be below the current RDB requirement and will
reproduce the OOM. Investigate RDB growth and queue/state ownership before any
destructive cleanup or eviction decision.

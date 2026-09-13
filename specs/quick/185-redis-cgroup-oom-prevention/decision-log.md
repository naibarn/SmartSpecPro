# Decision log

## D1: Active Compose file only

Use `docker-compose.infra.yml` because Docker labels identify it as the source
of the failing Redis container. Avoid broad edits to inactive Compose variants.

## D2: 4 GiB cgroup / 3 GiB Redis ceiling

The measured RDB is about 2 GiB. A 4 GiB cgroup limit provides startup and
allocator headroom, while a 3 GiB Redis `maxmemory` prevents unbounded growth.
The values remain environment-overridable.

## D3: `noeviction`

Do not silently evict keys because Redis is a broker/state dependency. If the
logical ceiling is reached, visible write errors are safer and easier to alert
on than data loss.

## D4: Reuse existing sysctl application path

Add `vm.overcommit_memory=1` to the existing scoped policy rather than creating
a second competing sysctl file. The live application is explicit and can be
verified independently.

## D5: Read-only attribution

Extend the existing monitor with Docker inspection for the managed Redis
container. Do not add automatic container restart or data cleanup to the
monitor; Docker already has a restart policy and an operator must retain control
over persistent queue/state recovery.

## D6: No repository-wide typecheck

The task touches shell/YAML/operations paths, so focused syntax/config/runtime
checks provide better signal and avoid known high-memory baseline checks.

# Section 01: Resource policy

## Ownership

Own the active Redis service resource budget and the host sysctl source policy.
Do not modify application code or persistent Redis data.

## Target files

- `docker-compose.infra.yml`
- `ops/sysctl/99-smartspec-memory.conf`

## TDD expectations

- Prove the current render contains the undersized 512M budget before editing.
- After editing, render Compose and assert the 4G/3G/noeviction contract.
- Confirm the sysctl file remains valid key/value configuration.

## Acceptance checks

- Redis cgroup limit and swap limit default to 4G.
- Redis reservation defaults to 512M.
- Redis maxmemory defaults to 3gb and policy is noeviction.
- All resource values can be overridden with non-secret environment variables.
- Existing volume, network, healthcheck, and restart policy remain intact.
- Sysctl source retains swappiness and adds overcommit memory.

## Risks

The runtime service currently has an old 512M limit. Source changes do not alter
the running container until an explicit Redis-only reconciliation. Never use
`docker compose down` or remove the named volume.

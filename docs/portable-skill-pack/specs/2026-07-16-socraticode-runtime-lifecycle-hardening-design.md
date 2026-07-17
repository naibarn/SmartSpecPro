# SocratiCode Runtime Lifecycle Hardening Design

Date: 2026-07-16
Status: Implemented and live-verified

## Problem

The persistent SmartSpecPro SocratiCode watcher polled `codebase_status` every
60 seconds without preventing overlap. Slow or blocked requests accumulated,
eventually producing more than 102,000 status responses, 23 concurrent
`docker info` children, severe pressure in `system-smartspec-agent.slice`, and
long web-build stalls. Existing per-container and aggregate cgroup limits
contained the workload but did not stop the lifecycle leak.

Concurrent maintenance already changed the watcher to single-flight polling at
a 15-minute interval and reduced the default MCP PID cap. The implementation
must preserve those changes and close the remaining timeout, orphan-cleanup,
and recovery gaps.

## Goals

- Preserve active Codex, Claude, and dedicated watcher MCP sessions.
- Prevent overlapping SocratiCode status requests and unbounded Docker child
  accumulation.
- Recover automatically when the dedicated watcher or one of its tool calls
  stops responding.
- Remove only provably orphaned managed MCP containers.
- Keep SocratiCode resource use below a predictable shared-host budget so web
  builds and production services retain headroom.
- Provide dry-run cleanup, rollback artifacts, and observable verification.

## Non-Goals

- Replace SocratiCode or change its image/version.
- Force all interactive clients through one shared transport.
- Stop an MCP container whose launcher PID and client session are still alive.
- Change application, database, web, or backend behavior.

## Considered Approaches

### 1. Resource caps only

Keep the current slice and lower container memory. This limits blast radius but
does not repair hung request or orphan lifecycle behavior. Rejected as
insufficient.

### 2. Single-flight polling only

Keep the newly added in-flight flag and 15-minute poll interval. This prevents
request multiplication but a single permanently hung request leaves the
watcher unusable forever. Rejected as incomplete.

### 3. Layered lifecycle hardening

Combine single-flight polling, a bounded request watchdog, managed-container
metadata, safe orphan cleanup, controlled systemd restart, log rotation, and
fresh runtime verification. Selected because each layer handles a distinct
failure mode and remains reversible.

## Architecture

### MCP launcher wrapper

`/home/dev/tools/socraticode-docker/socraticode-mcp.sh` remains the configured
stdio MCP entrypoint. It will:

- assign a stable container name derived from the launcher PID;
- add managed, project, launcher-PID, role, and creation-time labels;
- run Docker as a child instead of replacing the wrapper process;
- preserve the MCP client's stdin on an explicit file descriptor while Docker
  runs as a background child, then forward stdout/stderr unchanged;
- install `EXIT`, `HUP`, `INT`, and `TERM` cleanup traps;
- forward termination to Docker and remove the owned container;
- run the orphan-cleanup helper in safe `--apply` mode before launch; the
  helper's eligibility rules remain fail-closed;
- retain the current cgroup parent, no-swap, and PID limits.

The wrapper owns only its own container. It never selects another live
container for removal.

### Orphan-cleanup helper

`/home/dev/tools/socraticode-docker/socraticode-cleanup.sh` will support
`--dry-run` and `--apply`.

A managed container is removable only when all conditions hold:

1. it has the expected SocratiCode managed/project labels;
2. it is older than the configured grace period;
3. its recorded launcher PID is absent, or that PID no longer belongs to the
   expected SocratiCode Docker launcher;
4. it is not the caller's owned container.

Legacy unlabeled containers are reported but never removed automatically.
Their one-time cleanup requires an explicit live audit of name-suffix PID,
container age, and owning process.

The helper uses bounded Docker CLI calls. A timeout is treated as a warning and
does not trigger broad deletion.

Defaults are a 15-minute orphan grace period, a 20-second Docker CLI timeout,
and a 10-second graceful container stop before forced removal. Tests may
override the Docker binary and `/proc` root without changing production
defaults.

### Persistent watcher

`/home/dev/tools/socraticode-docker/watch-smartspecpro.mjs` retains the current
single-flight guard and 15-minute default polling interval. It will add:

- a bounded watchdog for initialize, watch-start, and status calls;
- one timer per in-flight request;
- controlled child termination and non-zero exit on timeout;
- cleanup of timers and stdin on shutdown;
- bounded log messages containing method, elapsed time, and recovery action.

Default watchdogs are 30 seconds for initialization, 45 minutes for
`codebase_watch` startup, and 5 minutes for `codebase_status`. The longer
watch-start budget is evidence-based: the current 140,000-chunk repository can
take about 25 minutes to complete watcher startup after heavy changes. Timeout
values remain environment-overridable with minimum-safe validation.

The watcher service already uses `Restart=always`; a non-zero timeout exit lets
systemd start a clean watcher after `RestartSec` without accumulating children.
The watcher container cap will be 4 GB instead of 6 GB because overlapping
status work, not normal steady-state indexing, caused the observed growth.

### Periodic cleanup and logs

A small systemd oneshot service and timer will run the cleanup helper every five
minutes. The timer is defense in depth for wrappers killed with `SIGKILL` or
host/client crashes where shell traps cannot run.

The existing watcher log will be moved to a timestamped backup before rotation.
A logrotate policy will bound future size and retain a small history without
discarding the incident evidence.

The authoritative live control plane remains
`/home/dev/tools/socraticode-docker`, because both project `.mcp.json` and the
Codex MCP configuration execute that launcher directly. The repository design
record documents the behavior and rollback, while runtime files are backed up
atomically before installation.

### Shared resource guard

Keep `system-smartspec-agent.slice` as the aggregate control plane. The initial
implementation will preserve its current 8 GB `MemoryHigh`, 10 GB `MemoryMax`,
no-swap policy, and 400% CPU quota. Per-session caps and lifecycle cleanup are
fixed first; aggregate limits will be lowered only if fresh steady-state
measurements prove that is safe.

This avoids combining a lifecycle repair with an unproven capacity reduction.

## Failure Handling

- Docker unavailable: launcher fails clearly; cleanup performs no deletion.
- Cleanup timeout: warn and continue without removing containers.
- MCP initialize/watch/status timeout: terminate the owned watcher container,
  exit non-zero, and allow systemd to restart after the configured delay.
- Client disconnect: wrapper trap stops and removes only its owned container.
- Wrapper `SIGKILL` or host crash: the timer removes the orphan after the grace
  period and PID ownership check.
- Live client PID reuse: command-line ownership validation prevents cleanup
  based on PID existence alone.
- Legacy unlabeled container: report for manual one-time audit; never delete
  automatically.

## Safety and Rollback

Before changes, create a timestamped backup of the launcher, watcher, service
units, installed slice, and current container inventory. Record exact restore
commands.

Runtime rollout order:

1. validate scripts and Node syntax;
2. install cleanup service/timer and logrotate config;
3. run cleanup in dry-run mode;
4. audit and remove only proven legacy orphans;
5. restart only `socraticode-smartspecpro-watch.service`;
6. leave active interactive containers untouched;
7. verify container count, launcher ownership, PSI, cgroup events, and MCP
   initialize/status behavior.

Rollback restores the timestamped files, reloads systemd, disables the new
cleanup timer, and restarts only the dedicated watcher.

## Verification

- `bash -n` for launcher and cleanup scripts.
- `node --check` for watcher and index runners.
- shell fixture tests with a fake Docker CLI for live, orphaned, PID-reused,
  legacy, Docker-timeout, dry-run, and apply cases.
- `systemd-analyze verify` for watcher, cleanup service/timer, and agent slice.
- `logrotate --debug` for the new policy.
- live cleanup dry run shows no active interactive container selected.
- watcher restart leaves active interactive container PIDs unchanged.
- manual JSON-RPC initialize/status smoke test succeeds through the wrapper.
- short stability snapshots show no accumulating `docker info`, flat OOM count,
  quiet PSI, bounded memory, and healthy SmartSpecPro public/local probes.

## Acceptance Criteria

- No overlapping persistent-watcher status request is possible.
- A hung watcher request recovers automatically within the configured timeout
  plus systemd restart delay.
- Managed orphan containers are removed after the grace period; active and
  legacy-unlabeled containers are preserved automatically.
- `docker info` child count remains bounded during the verification window.
- Agent-slice PSI and memory events remain stable, and web build/health checks
  do not regress.
- Rollback files and commands are documented.

## Focused Spec Review

Review result: approved after one correction round.

Corrections applied:

- made the wrapper's background-child stdio ownership explicit;
- added fail-closed cleanup defaults and test injection points;
- selected evidence-based watchdog durations so a normal 25-minute watch-start
  cannot cause a restart loop;
- identified `/home/dev/tools/socraticode-docker` as the authoritative runtime
  control plane used by both MCP configurations.

No unresolved product, safety, rollback, or verification gaps remain in the
design.

## Implementation Evidence

- Repository-managed source and tests live under `ops/socraticode-runtime/`;
  validated copies are installed in `/home/dev/tools/socraticode-docker`,
  `/etc/systemd/system`, and `/etc/logrotate.d`.
- The pre-install backup is
  `/home/dev/tools/socraticode-docker/backups/20260716T165411Z-lifecycle-hardening`;
  repository-side inventory and restore notes are under
  `orchestra/backups/20260716T165411Z-socraticode-runtime/`.
- Cleanup lifecycle fixtures, watcher watchdog tests, Bash/Node syntax,
  installed systemd verification, logrotate parsing, and live MCP
  initialize/status smoke tests pass.
- The dedicated watcher was the only runtime restarted. All pre-existing
  interactive container IDs were preserved, and the replacement watcher is a
  labeled managed container with a 4 GiB/no-swap cap.
- Three post-rollout snapshots returned public/local/backend HTTP 200, quiet
  memory PSI, flat cgroup high/OOM counters, and zero accumulated
  `docker info` children.
- Legacy unlabeled containers remain report-only. A high-CPU legacy container
  was traced to a live remote client and correctly preserved. It later reached
  its existing 4 GiB container limit and was killed locally without host
  pressure; the monitor emitted the expected critical cgroup alert. Three
  follow-up snapshots had flat counters, quiet PSI, and HTTP 200 health. Future
  clients use the managed wrapper lifecycle.

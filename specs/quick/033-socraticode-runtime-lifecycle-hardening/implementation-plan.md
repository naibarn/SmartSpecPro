# Implementation Plan

## Objective
Prevent recurrence of host-wide SSH/Codex unresponsiveness by making every SocratiCode MCP container owned, bounded, self-cleaning, observable, and recoverable without rebooting the host.

## Current-codebase fit
The active MCP control plane remains `/home/dev/tools/socraticode-docker`, which both Codex and project configuration already launch. Durable source, units, policy, and tests are staged inside the repository at `ops/socraticode-runtime/`, validated there, then installed to the active paths with a timestamped backup. The repository also retains the approved design, quick-plan package, and directly related crash-monitor telemetry. Application and database code remain unchanged.

## Implementation approach
1. Add red tests under `ops/socraticode-runtime/tests/` for cleanup eligibility and watcher timeouts/single-flight behavior.
2. Replace launcher `exec docker run` with a signal-aware wrapper that labels and owns one background Docker CLI/container, preserves stdio, and removes only its own container on exit.
3. Add a cleanup helper with dry-run/apply modes, a non-overlap lock, bounded Docker calls, age/PID/cmdline validation, caller exclusion, and legacy reporting.
4. Add per-request watcher watchdogs with bounded environment-configurable timeouts, controlled child termination, timer cleanup, and bounded logs. Mark watcher/index roles and set watcher cap to 4G.
5. Stage a five-minute cleanup systemd timer, watcher unit, and logrotate policy under `ops/socraticode-runtime/`; install only validated copies without changing application units.
6. Extend the crash monitor to record user-slice cgroup events, active SSH session count, managed/legacy MCP container counts, and threshold alerts.
7. Back up all host-side files and inventory, validate syntax/config, run cleanup dry-run, install files, restart only the watcher, enable the timer, rotate the oversized watcher log, and verify active sessions are preserved.

## Risks and mitigations
- Active MCP container removal: blocked by managed labels, caller exclusion, grace period, launcher UID/start-time/PID and command-line validation, dry-run, and fixture tests.
- Healthy watcher restart loop: timeout minimums and integration tests; systemd restart delay; only watcher unit restarted.
- Docker daemon slowness: every cleanup Docker command is timeout-bounded and timeout means no deletion.
- Dirty-tree collision: exact path ownership and no broad staging/reset.
- Alert noise: thresholds and existing deduplication remain active; new counts are logged compactly.

## Acceptance criteria
- Cleanup tests cover live, absent PID, PID reuse, legacy, timeout, dry-run, apply, and caller-owned cases.
- Watcher tests prove initialize/watch/status timeout recovery and no overlapping status calls.
- Systemd/logrotate/script syntax checks pass.
- Live cleanup dry-run selects no active interactive container.
- Watcher restart preserves pre-existing interactive container IDs/PIDs.
- MCP initialize/status succeeds after rollout.
- Cleanup timer is enabled and last run succeeds.
- Fresh snapshots show quiet PSI, flat OOM/high counters, bounded memory, no `docker info` pileup, and public/local/backend health 200.

## Rollback
Disable the cleanup timer, restore timestamped launcher/watcher/index/unit/logrotate files, reload systemd, and restart only the dedicated watcher. Validate MCP status and production health after restore.

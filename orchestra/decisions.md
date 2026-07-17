# Orchestra Decisions

[2026-07-16T16:36:30Z] DECISION: Archive the previous completed Orchestra session before starting this task.
  Context: no active snapshot existed and artifact-management requires a non-destructive fresh start.
  Archive: /home/dev/projects/SmartSpecPro/orchestra/archive/2026-07-16T16-36-30Z

[2026-07-16T16:40:00Z] DECISION: Use direct standard-light execution with sequential rollout waves.
  Context: the task changes critical production runtime behavior in a heavily dirty worktree; one conductor preserves backup, install, rollback, and verification ordering.
  Alternatives considered: parallel writers; rejected because runtime files share lifecycle contracts and live rollout is inherently sequential.

[2026-07-16T16:54:11Z] DECISION: Capture a timestamped host-runtime backup before installation.
  Context: active SocratiCode scripts and systemd units live outside the application git worktree; watcher log rotation is also state-changing.
  Backup: /home/dev/tools/socraticode-docker/backups/20260716T165411Z-lifecycle-hardening
  Manifest: /home/dev/projects/SmartSpecPro/orchestra/backups/20260716T165411Z-socraticode-runtime/RESTORE.md
  Restore: install the saved launcher/watcher/index/unit files, remove the newly added cleanup units/logrotate policy, daemon-reload, and restart only the dedicated watcher.

[2026-07-16T16:55:48Z] DECISION: Install checksum-validated runtime copies and restart only the dedicated watcher.
  Context: cleanup dry-run selected no active container; the four pre-rollout interactive/watcher IDs were inventoried first.
  Result: all three interactive IDs were preserved, the legacy watcher was replaced by one labeled 4 GiB managed watcher, and live MCP initialize/status passed.

[2026-07-16T17:04:01Z] DECISION: Enable the five-minute cleanup timer after fail-closed service repairs.
  Context: the first service run exposed a read-only temporary-directory mismatch without mutating any container. The lock was then moved from shared `/tmp` into the dev-owned runtime lock directory and the sandbox was narrowed.
  Result: the automatic timer run succeeded at 00:04:01 +07; installed security exposure is 2.6 OK and legacy containers remain report-only.

[2026-07-16T17:05:22Z] DECISION: Treat the busy legacy-client OOM as successful local containment, not an orphan-cleanup target.
  Context: process-tree evidence proved the launcher and remote client live, so deleting it would violate the approved policy. It later reached its existing 4 GiB/no-swap cap.
  Result: only that container exited; the monitor emitted a critical cgroup alert, host PSI stayed zero, and three follow-up snapshots retained flat counters and HTTP 200 health.

[2026-07-17T10:23:15Z] DECISION: Temporarily disable all SocratiCode runtime entry points after recurrence was proven.
  Context: the previous boot recorded 16 SocratiCode Node memcg OOM kills, and ten managed MCP containers had already returned within 19 minutes of reboot. The fail-closed orphan policy correctly preserved live launchers but could not bound aggregate live-client memory.
  Actions: set `/home/dev/tools/socraticode-docker/socraticode-mcp.sh` mode to `000`; disable and stop the watcher/index/cleanup units; stop all managed MCP containers; set `socraticode-qdrant` restart policy to `no` and stop it.
  Data safety: the `socraticode_qdrant_data` named volume was preserved; no database, application container, or repository source file was changed.
  Restore: restore launcher mode `0755`; enable the units; set Qdrant restart policy to `unless-stopped`; start Qdrant, index, watcher, and cleanup timer in that order.

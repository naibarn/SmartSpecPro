# Section 03 - Safe Runtime Rollout

## Ownership
- timestamped backup under `/home/dev/tools/socraticode-docker/backups/`
- installed runtime/systemd/logrotate files from Sections 01-02
- Orchestra progress, decisions, risk register, and review artifacts

## TDD and gate expectations
All static and fixture checks pass before installation. Capture active container IDs and launcher PIDs before restarting only the dedicated watcher. Run cleanup dry-run before enabling apply timer.

## Acceptance checks
- Backup includes source files, installed units, logrotate state, container inventory, and exact restore steps.
- Active interactive container IDs/PIDs remain unchanged across watcher restart.
- Timer enabled, service succeeds, watcher returns active, JSON-RPC initialize/status succeeds.
- Three short snapshots show PSI quiet, no new cgroup high/OOM events, no Docker child pileup, and HTTP 200 health.

## Known risks
If dry-run selects an active/uncertain container, stop rollout and repair eligibility logic. If blocking gates fail three times, stop and report rather than broad-restarting services.

## Implemented
- Captured the active scripts, units, logs, and pre-rollout container inventory
  at `/home/dev/tools/socraticode-docker/backups/20260716T165411Z-lifecycle-hardening`.
- Installed only checksum-validated runtime copies, ran cleanup dry-run first,
  and restarted only `socraticode-smartspecpro-watch.service`.
- Preserved all three pre-existing interactive container IDs. The timer is
  enabled, its cleanup service succeeds, and legacy unlabeled containers remain
  report-only.
- Rotated the oversized logs only after backup and verified the installed
  logrotate policy.
- Passed live MCP initialize/status smoke, public/local/backend health probes,
  and three stability snapshots with quiet PSI, flat cgroup event counters, and
  no Docker child pileup.

Rollback commands and the exact saved-file inventory are recorded in
`orchestra/backups/20260716T165411Z-socraticode-runtime/RESTORE.md`.

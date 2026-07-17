# Section 02 - Watchdog and Observability

## Ownership
- `/home/dev/projects/SmartSpecPro/ops/socraticode-runtime/tests/watch-smartspecpro.test.mjs`
- `/home/dev/projects/SmartSpecPro/ops/socraticode-runtime/watch-smartspecpro.mjs`
- `/home/dev/projects/SmartSpecPro/ops/socraticode-runtime/index-smartspecpro.mjs`
- `/home/dev/projects/SmartSpecPro/ops/socraticode-runtime/systemd/socraticode-smartspecpro-cleanup.service`
- `/home/dev/projects/SmartSpecPro/ops/socraticode-runtime/systemd/socraticode-smartspecpro-cleanup.timer`
- `/home/dev/projects/SmartSpecPro/ops/socraticode-runtime/systemd/socraticode-smartspecpro-index.service`
- `/home/dev/projects/SmartSpecPro/ops/socraticode-runtime/systemd/socraticode-smartspecpro-watch.service`
- `/home/dev/projects/SmartSpecPro/ops/socraticode-runtime/logrotate/socraticode-smartspecpro`
- `/home/dev/projects/SmartSpecPro/scripts/system-crash-monitor.sh`

## TDD expectations
Use a fake stdio MCP child to reproduce initialize/watch/status hangs and rapid polling. Prove timeout exits non-zero and no second status request is issued while one is in flight.

## Acceptance checks
- Per-request timers are cleared on response/shutdown.
- Timeout logs contain method, elapsed time, and recovery action without unbounded child output.
- Watcher uses 4G; index role remains bounded at 6G within the aggregate slice.
- Boot-time index runs as a oneshot before the persistent watcher, preventing the previous 6G + 4G startup overlap; a failed index does not enter an automatic retry overlap loop.
- Cleanup timer runs every five minutes and log rotation bounds future growth.
- Monitor records user-slice events and SSH/MCP counts with deduplicated thresholds.
- Staged source is byte-for-byte installable to the active runtime paths after validation.

## Coordination risks
Timeouts must not interrupt a normal long watcher startup; retain the approved 45-minute watch-start default.

## Implemented
- Added per-request watchdogs for initialize, watch-start, and status; controlled SIGTERM/SIGKILL recovery; bounded stdout/log handling; and JSON-RPC/stdin failure handling.
- Added four Node integration tests for initialize timeout, watch-start timeout, protocol error, and status single-flight timeout.
- Added a single-flight index poller with a 6G indexer role and a oneshot boot unit ordered before the persistent 4G watcher.
- Added cleanup service/timer, watcher unit hardening, daily/10M log rotation, and repository-managed runtime documentation.
- Extended the crash monitor with `user-1000.slice` events, SSH session/pre-auth counts, and bounded managed/legacy MCP counts.

Verification: cleanup and watcher tests pass; Bash/Node syntax passes; staged logrotate config parses. Installed systemd verification remains a Section 03 rollout gate.

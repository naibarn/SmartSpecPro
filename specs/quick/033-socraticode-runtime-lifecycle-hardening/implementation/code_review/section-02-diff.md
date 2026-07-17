# Section 02 Diff Capsule

Files reviewed:
- staged watcher/index runners, systemd units, logrotate policy, runtime README
- `scripts/system-crash-monitor.sh`
- watcher integration tests

Change summary:
- Added initialize/watch/status watchdogs, controlled child termination, single-flight polling, bounded logs/buffers, JSON-RPC error handling, and EPIPE handling.
- Added watcher/index roles and 4G/6G per-container budgets.
- Serialized boot-time index completion before watcher startup with a oneshot index unit.
- Added five-minute orphan cleanup timer and bounded log rotation.
- Added user-slice cgroup events plus SSH/MCP fan-out metrics and alerts.

Evidence: 4 watcher tests pass; cleanup tests pass; Bash/Node syntax passes; staged logrotate policy parses.

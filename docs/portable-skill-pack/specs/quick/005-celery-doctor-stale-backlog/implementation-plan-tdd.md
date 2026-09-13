# TDD matrix

- 3 processing + old unclaimed backlog => healthy, no stale alert.
- 2 processing + old unclaimed pending => one stale task and critical report.
- 0 processing + old unclaimed pending => stale report.
- Fresh unclaimed pending => no stale report.
- Claimed pending older than three minutes => not a dispatch-stall alert.
- Auto-report create and dedup retain bounded affected users/tasks.
- Admin card presents in-flight capacity separately from waiting backlog.

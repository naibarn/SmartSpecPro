# Section 03 Diff Capsule

Files and live surfaces reviewed:
- installed/staged launcher, cleanup helper, watcher/index runners, units, and
  logrotate policy
- timestamped runtime backup, inventory, and restore commands
- dedicated watcher, cleanup timer/service, MCP containers, cgroups, PSI, and
  production health probes

Change summary:
- Installed checksum-matching repository sources after backup and dry-run.
- Restarted only the persistent watcher and enabled the five-minute cleanup
  timer.
- Preserved all active interactive sessions and left legacy unlabeled
  containers report-only.
- Rotated backed-up logs and verified automatic lifecycle recovery plus live
  MCP initialize/status behavior.

Evidence: installed systemd/logrotate gates pass; cleanup and watcher tests
pass; live smoke cleans its owned container; three stability snapshots are
healthy.

# Host Memory Pressure Runbook

## Incident pattern

On 2026-07-12 the production host became unreachable over SSH until a power
cycle. The retained journal shows RAM and swap exhaustion, repeated
`systemd-journald` memory-pressure events, Docker health-check timeouts, and
database connection timeouts before the unclean reboot. No disk-full, NVMe, or
kernel-panic evidence was found.

On 2026-07-22 the host hung again with a different mechanism ("reclaim
purgatory", full RCA in `planning/memory-purgatory-permanent-fix/plan.md`):
dev/agent workloads pushed `user-1000.slice` to its `MemoryHigh=18G` cap with
the slice swap allowance pinned at `MemorySwapMax=4G`. With no swappable pages
left, `memory.high` reclaim could only evict file pages (running code), so the
kernel throttled the slice indefinitely — 1.16M memory.high events/min, memory
PSI 88–94% sustained for 20 minutes, while **host RAM still had >5 GB
available** and the kernel OOM killer never fired. New SSH logins land in the
same slice via pam_systemd, so the operator was locked out and had to power
cycle. Production services in `system.slice` stayed healthy throughout.
Lesson: a `MemoryHigh` band with an exhausted swap ceiling and no killer does
not degrade — it stalls forever. Every cap needs a matching kill mechanism.

The host runs production services and development/agent workloads together.
Container memory limits were individually present but their aggregate budget
exceeded host RAM, and the default Docker swap allowance let pressure spread to
the whole host. The hourly maintenance job also dropped page cache and killed
Celery parents, which increased I/O and worker churn during pressure.

## Guardrails now in source

- `scripts/auto-maintenance.sh` reports zombie/swap pressure without killing
  service parents or writing `/proc/sys/vm/drop_caches`.
- `scripts/system-crash-monitor.sh` records and alerts on available memory,
  swap percentage, and memory PSI in addition to used-memory percentage.
- Compose stacks set bounded memory and `memswap_limit` values for workers,
  databases, GlitchTip, Hermes, and the full-stack fallback configuration.
- Web/backend systemd units have `MemoryHigh`, `MemoryMax`, and
  `MemorySwapMax=0` limits.
- The shared `user-1000.slice` for development/agent sessions is bounded at
  `MemoryHigh=18G`, `MemoryMax=20G`, and `MemorySwapMax=4G`, leaving headroom
  for production services on this 30 GiB host.
- `ops/sysctl/99-smartspec-memory.conf` persists `vm.swappiness=10`.
- **systemd-oomd** (since 2026-07-22): `ManagedOOMMemoryPressure=kill` with a
  50% pressure limit on `user-1000.slice` (`systemd/user-1000.slice.d/`) and a
  20s reaction window (`systemd/oomd.conf.d/50-smartspec.conf`). Sustained
  slice pressure now kills the heaviest descendant cgroup within ~30s instead
  of stalling the slice. Verify with `sudo oomctl` (the slice must appear
  under "Memory Pressure Monitored CGroups").
- **Crash-monitor autokill** (since 2026-07-22): `system-crash-monitor.sh`
  runs from cron (`cron.service`, i.e. `system.slice`) so it keeps working
  while the user slice is stalled. If memory PSI ≥60 for 3 consecutive minutes
  AND `user-1000.slice` throttle events grew ≥50k/min, it SIGKILLs the
  largest-RSS process in the slice (never `sshd*`/`systemd*`), with a 3-minute
  cooldown. Tune or disable via `CRASH_MONITOR_AUTOKILL*` env vars; alerts as
  `autokill_slice_hog` in `logs/system-watch/alerts.log`.
- **Attribution logging** (since 2026-07-22): the per-minute watch log records
  `user_slice_mem_mb` / `user_slice_swap_mb`, and snapshots the top-RSS
  processes (host-wide and slice-only) whenever RAM ≥ warn or PSI ≥ crit —
  earlier incidents left no record of which process held the memory.
- **Gap — alert delivery**: webhook is still unconfigured, so alerts only
  reach `alerts.log` (`[ALERT-SKIP] Webhook not configured`). On 2026-07-22
  there were 4 hours of warnings nobody saw. Set `ALERT_WEBHOOK_URL` (or
  `SLACK_WEBHOOK_URL`/`DISCORD_WEBHOOK_URL`) in the cron environment to get
  paged before a stall.

## First response

```bash
free -h
cat /proc/pressure/memory
docker stats --no-stream
sudo journalctl -k --since "10 minutes ago" | rg -i 'oom|memory pressure|lockup|i/o error'
curl --max-time 10 -fsS https://smartaihub.app/healthz
```

If available memory is below 2 GiB, swap is above 70%, or memory PSI is above
the configured critical threshold, stop/admit fewer nonessential workers and
identify the largest host process/container. Do not drop page cache and do not
kill a Celery parent with active work. Prefer a bounded container restart after
checking active tasks; keep PostgreSQL on its existing volume.

## Deployment note

Apply the source limits with the existing systemd/compose deployment workflow.
For a live host, use `docker update` or a planned rolling recreate for workers;
do not recreate PostgreSQL during active work without a current dump and a
maintenance window. Verify public health, local backend health, service state,
container limits, and OOM/restart counters after applying changes.

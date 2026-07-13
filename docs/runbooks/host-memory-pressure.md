# Host Memory Pressure Runbook

## Incident pattern

On 2026-07-12 the production host became unreachable over SSH until a power
cycle. The retained journal shows RAM and swap exhaustion, repeated
`systemd-journald` memory-pressure events, Docker health-check timeouts, and
database connection timeouts before the unclean reboot. No disk-full, NVMe, or
kernel-panic evidence was found.

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

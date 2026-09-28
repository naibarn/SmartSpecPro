# Memory Purgatory Permanent Fix (2026-07-22 incident)

## Problem statement

Host became fully unresponsive (SSH logins hung, required power cycle) for the
5th time in 10 days (Jul 12, 16, 17, 21, 22). Global RAM was **never**
exhausted and the kernel OOM killer **never** fired in any of those boots.

## Root cause (evidence-backed)

Timeline 2026-07-22 (from `logs/system-watch/system-watch-2026-07-22.log`):

| time | available RAM | slice swap | PSI some avg10 | user-1000.slice high events/min |
|---|---|---|---|---|
| 21:07 | 12.7 GB | 4289 MB | 6.36 | rising |
| 21:35 | 6.0 GB | 4368 MB | 0.72 | 15,082 |
| 21:36 | 5.9 GB | **4370 MB (pinned)** | **93.55** | **1,164,697** |
| 21:36–21:55 | ~5.5 GB free | pinned at 4370 | 88–94 sustained | 100k–590k |

Mechanism:

1. `/etc/systemd/system/user-1000.slice.d/50-smartspec-memory.conf`
   (installed after the Jul-12/Jul-21 incidents) caps the dev/agent session
   slice at `MemoryHigh=18G MemoryMax=20G MemorySwapMax=4G`.
2. Dev workload (Claude Code agent sessions + `npm run build:deploy` finished
   21:24 + tests) pushed the slice to 18G **and** its 4G swap ceiling.
3. With slice swap pinned, `memory.high` reclaim can no longer swap anon
   pages — it can only evict file pages (running code), so every process in
   the slice page-faults its own executable back from disk in a loop.
   Kernel throttles the slice (1.16M high-events/min), PSI hits 93%.
4. **Nothing kills anything**: `MemoryMax=20G` is unreachable (throttling
   prevents further allocation), global RAM has 5.4G available so the kernel
   OOM killer never runs, and neither systemd-oomd nor earlyoom is installed.
   The slice stalls forever ("purgatory") instead of failing fast.
5. New SSH logins are placed **into the same throttled slice** by
   pam_systemd → logins hang → operator locked out → power cycle.
   Production services (system.slice) stayed healthy the whole time —
   the Jul-21 guardrail protected them but locked out the operator.

## Fix design — defense in depth

- **L1 (keep)**: slice caps 18G/20G/4G stay — production protection works.
- **L2 (new)**: install + enable `systemd-oomd`;
  `ManagedOOMMemoryPressure=kill` + `ManagedOOMMemoryPressureLimit=50%` on
  user-1000.slice, `DefaultMemoryPressureDurationSec=20s`. Sustained slice
  pressure now kills the heaviest descendant cgroup within ~30 s instead of
  stalling for 20 min.
- **L3 (new)**: `system-crash-monitor.sh` last-resort responder (runs from
  cron.service = system.slice, proven to keep running during purgatory):
  if PSI-some-avg10 ≥ 60 for 3 consecutive minutes AND user-1000.slice
  high-events delta ≥ 50k → SIGKILL the largest-RSS process inside
  user-1000.slice (never sshd*/systemd*), with cooldown + CRITICAL alert.
  Tunable/disable via `CRASH_MONITOR_AUTOKILL*` env vars.
- **L4 (new)**: attribution logging — every minute record
  `user_slice_mem_mb` / `user_slice_swap_mb`; when RAM ≥ warn or PSI ≥ crit,
  also snapshot top-RSS processes (global + inside the slice).
- **L5 (docs)**: update `docs/runbooks/host-memory-pressure.md`; note that
  webhook alerts are still unconfigured (alerts.log showed `[ALERT-SKIP]
  Webhook not configured` — operator got no early warning despite 4 h of
  signals).

## Affected files

- `systemd/user-1000.slice.d/50-smartspec-memory.conf` (+ /etc copy)
- `systemd/oomd.conf.d/50-smartspec.conf` (new, + /etc/systemd/oomd.conf.d)
- `scripts/finalize-autostart.sh` (installer steps for both)
- `scripts/system-crash-monitor.sh` (L3 + L4)
- `docs/runbooks/host-memory-pressure.md`

## Risk assessment

- oomd kill / L3 kill terminates one dev process or session scope (lost
  in-flight agent work) — strictly better than the status quo (power cycle
  loses everything). Thresholds are far above normal operation (slice PSI ~0
  on healthy days, incident PSI 88–94).
- No schema/DB/service-code changes. Services untouched. All config changes
  reversible by removing drop-ins + daemon-reload.
- apt install of systemd-oomd: standard Debian package, no service restart of
  smartspec units required.

## Verification steps

1. `oomctl` shows user-1000.slice under managed pressure-kill.
2. `systemctl show user-1000.slice` reflects ManagedOOMMemoryPressure=kill.
3. Manual run of monitor script: clean output, new slice metrics in daily
   log; responder dry-run (forced thresholds) picks correct victim PID.
4. `bash -n` on both scripts; `./scripts/validate-all-configs.sh`.
5. Next real pressure event: expect `cgroup_oom_kill` / oomd kill alert in
   logs instead of a frozen host.

## Status

- [x] Investigation complete (this file)
- [x] Repo config/script changes (slice drop-in, oomd conf, finalize-autostart, crash monitor)
- [x] Live install: systemd-oomd 257.13 installed + enabled, both drop-ins in /etc, daemon-reload
- [x] Verification: `oomctl` shows user-1000.slice monitored (50% / 20s);
      `ManagedOOMMemoryPressure=kill` live on the slice; `bash -n` clean;
      monitor run logs `user_slice_mem_mb`; autokill dry-run picked the
      correct victim (largest-RSS slice process, sshd excluded);
      `validate-all-configs.sh` passes (pre-existing DATABASE_URL warn only)
- [x] Runbook updated (docs/runbooks/host-memory-pressure.md)

## Addendum 2026-07-22 22:40 — "Memory cgroup out of memory" reports

`reboot-analysis-latest.log` preserves 4 kernel memcg kills from the previous
boot (11:29, 16:32, 17:36, 21:07): node, UID:0, anon-rss ~3.09G each. These
are the **socraticode-mcp docker container** (`--memory=3g`, runs as root)
whose node process had no V8 heap cap, so it grew to the memcg wall and was
killed every 4-5 h. Unrelated to the 21:36 purgatory (last kill 21:07;
purgatory window had zero kills). Fixed in
`~/tools/socraticode-docker/socraticode-mcp.sh` by passing
`NODE_OPTIONS=--max-old-space-size=2300` (override: `SOCRATICODE_NODE_HEAP_MB`);
applies to the next container spawn — the currently running container still
has the old env. Note: these kill records were already rotated out of
journald's kernel transport (journalctl -b -1 -k showed nothing); the
post-reboot analyzer snapshot is the durable source.

Also patched the monitor: attribution snapshots now fire on slice-local
throttle deltas too, not only host-level RAM/PSI (22:30 showed slice
throttling while host RAM sat at 24%).

## Follow-ups (not done here)

- Configure `ALERT_WEBHOOK_URL` for the cron monitor — alerts currently stop
  at alerts.log; the 2026-07-22 incident had 4 h of unseen warnings.
- Consider capping vitest/build parallelism during heavy agent-fleet work;
  the 18G slice budget is shared by all dev sessions.

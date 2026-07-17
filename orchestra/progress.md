# Orchestra Progress - SocratiCode lifecycle hardening

Loop policy:
  orchestra_id: fable_style_coding_orchestra
  purpose: prevent recurrence of SSH/Codex/SocratiCode host memory thrashing
  iteration: 8/12
  tool_call_batches: unknown/30
  estimated_cost_usd: unknown <= 0.50
  dispatch_waves: 0/6
  active_subagents: 0/4
  parallel_writers: 0/2
  required_subagent_wait: 0/10 minutes
  background_subagent_wait: 0/15 minutes
  repair_rounds: 3/5
  stop_conditions: success_criteria_met, tests_passed, no_open_blockers
  stop_reason: success

Evidence ledger:
  source: kernel/cgroup/SSH/server-log
  identifier: previous boot 2026-07-16
  observed failure: three memcg OOM kills plus sustained memory PSI and SSH reconnect/session accumulation
  data state: lifecycle hardening installed and live-verified; current boot healthy
  confidence: high
  next evidence needed: none for the requested scope

[COMPLETE] wave-0-diagnosis-and-design - Root cause isolated and design approved.
[COMPLETE] wave-1-quick-plan - Standard-depth package passed five stabilization rounds with two consecutive clean rounds.
[COMPLETE] wave-1-section-01 - Cleanup/launcher red-green cycle complete; 10 focused lifecycle scenarios pass.
[COMPLETE] wave-2-section-02 - Watchdog, index serialization, units, log rotation, and lifecycle telemetry implemented; focused tests pass.
[COMPLETE] wave-3-live-rollout - Backup captured, validated copies installed, only the dedicated watcher restarted, timer enabled.

Rollout repair 1: cleanup service failed closed before mutation because `/tmp` was read-only under `ProtectSystem=strict`. Added the minimal `ReadWritePaths=/tmp` exception; service/timer verification is stale and must rerun.

Security repair 2: moved the cleanup lock from world-writable `/tmp` to the dev-owned SocratiCode locks directory; enabled `PrivateTmp` and narrowed `ReadWritePaths`. Fresh gates pass.

Security repair 3: removed Linux capabilities, isolated network/devices/temp,
restricted sockets/namespaces/realtime/SUID, protected kernel/cgroup surfaces,
and set umask 0077. Installed service succeeds and systemd security exposure is
2.6 OK.

[COMPLETE] wave-2-runtime-implementation - Launcher, cleanup, watchdog, units, logs, monitor.
[COMPLETE] wave-4-verification-convergence - Fresh gates, automatic timer run, live MCP smoke, security review, and stability snapshots pass.
[COMPLETE] wave-5-emergency-pause - Recurrence confirmed from 16 Node memcg OOM kills; SocratiCode launcher, units, MCP containers, and Qdrant were reversibly stopped without touching application services or data.

Dirty-work note: the worktree contains extensive unrelated feature changes. This task owns only the exact runtime/monitor/planning paths in `orchestra/plan.md`.

Impact hypothesis: incorrect cleanup eligibility could kill an active MCP client; watchdog mistakes could restart a healthy watcher; unit/logrotate errors could break recovery. Fail-closed tests, dry-run output, active-container PID checks, systemd verification, and post-rollout MCP/health probes cover these risks.

Section 01 review: initial completeness review found missing grace-period and project-mismatch tests; both were added. Fresh Bash syntax and cleanup lifecycle tests pass. No active Docker container was touched.

Final evidence: cleanup lifecycle tests pass; watcher tests pass 4/4; live MCP
smoke passes and cleans its owned container; installed files match source;
systemd/logrotate gates pass; automatic cleanup ran successfully; public/local/
backend returned 200; three post-containment snapshots held PSI at zero,
high/oom counters flat, watcher restarts at zero, and Docker info children at
zero.

Recurrence evidence ledger:
  source: previous-boot kernel journal, current Docker/cgroup state, HTTP health probes
  identifier: boot 4b89432960434b81a29530b58822774d and 2026-07-17T17:19-17:23+07 containment
  observed failure: 16 SocratiCode Node memcg OOM kills; ten managed MCP containers returned within 19 minutes of reboot and the watcher reached about 3.57 GiB
  data state: SocratiCode paused; Qdrant volume preserved; web/backend/Postgres healthy
  confidence: high
  next evidence needed: none for the requested temporary stop

Loop policy final:
  iterations_used: 8/12
  tool_call_batches_used: unknown/30
  estimated_cost_usd: unknown/0.50
  dispatch_waves_used: 0/6
  timed_out_subagents: none
  repair_rounds_used: 3/5
  stop_conditions_met: [success_criteria_met, tests_passed, no_open_blockers]
  stop_reason: success

Gap closure:
  must_do_now: none
  should_offer_next: redesign SocratiCode around one shared bounded runtime or a strict global concurrency limit before re-enabling it
  safely_deferred: permanent lifecycle redesign because the requested containment is to keep SocratiCode stopped for now
  no_action_needed: Qdrant data backup because the named volume was preserved and no delete/recreate command ran

# Orchestra Learning Log

## Learning entry - 2026-07-16T17:05:22Z

Outcome:
  stop_reason: success
  requested_goal: prevent recurrence of host hangs and SSH loss caused by SocratiCode and reconnect lifecycle pressure
  completed_scope: fail-closed ownership cleanup, watchdog recovery, boot serialization, bounded resources/logs, monitoring, backup, live rollout, and proof
  skipped_or_deferred: external webhook endpoint is unavailable and optional

Loop counters:
  iterations_used: 5/12
  tool_call_batches_used: unknown/30
  dispatch_waves_used: 0/6
  repair_rounds_used: 3/5
  timed_out_subagents: none
  estimated_cost_usd: unknown/0.50

Evidence quality:
  data_first_debug_applied: true
  evidence_sources: [server-log, test-output, cgroup, process-tree, systemd, HTTP-probe]
  evidence_gap: no external alert receiver was provided
  ui_guessing_prevented: true

Verification:
  commands_run: [cleanup lifecycle tests, watcher node tests, live MCP smoke, systemd verify and security, logrotate debug, crash monitor, three stability snapshots]
  commands_skipped: [shellcheck - unavailable]
  stale_gates_rerun: [cleanup service after sandbox repairs, installed checksums, systemd verification, live health and cgroup snapshots]
  must_do_now_gaps_fixed: [private temp compatibility, world-writable lock path, cleanup-service sandbox exposure]
  should_offer_next: [configure an external alert webhook if the user supplies an endpoint]
  safely_deferred: [legacy unlabeled cleanup - live clients must exit or be proven orphaned first]
  residual_risk: two idle legacy clients remain report-only until reconnecting through the managed launcher

Next improvement signals:
  routing_miss: none
  missing_agent_or_gate: none
  repeated_failure_pattern: service hardening should validate writable runtime paths before first live start
  context_pressure: high
  suggested_policy_change: add systemd security analysis to the pre-install unit gate for host-runtime tasks

## Learning entry - 2026-07-17T10:23:15Z

Outcome:
  stop_reason: success
  requested_goal: verify whether SocratiCode caused daily memory exhaustion and stop it temporarily if confirmed
  completed_scope: evidence-backed diagnosis plus reversible shutdown of launcher, units, MCP containers, and Qdrant
  skipped_or_deferred: permanent SocratiCode concurrency redesign is deferred while the tool remains disabled

Loop counters:
  iterations_used: 8/12
  tool_call_batches_used: unknown/30
  dispatch_waves_used: 0/6
  repair_rounds_used: 3/5
  timed_out_subagents: none
  estimated_cost_usd: unknown/0.50

Evidence quality:
  data_first_debug_applied: true
  evidence_sources: [server-log, cgroup, process-tree, Docker state, systemd, HTTP-probe]
  evidence_gap: none for temporary containment
  ui_guessing_prevented: true

Verification:
  commands_run: [previous-boot OOM journal query, Docker and systemd state checks, three stability snapshots, public/local/backend/Postgres health probes]
  commands_skipped: [source-code tests - no source code changed]
  stale_gates_rerun: [runtime state, respawn check, application health, memory and PSI]
  must_do_now_gaps_fixed: [disable every SocratiCode entry point, stop Qdrant without deleting its named volume]
  should_offer_next: [replace one-full-runtime-per-client with one shared bounded runtime or a strict global concurrency cap before re-enable]
  safely_deferred: [permanent redesign - SocratiCode is intentionally disabled]
  residual_risk: high only if an operator restores execute permission or reinstalls the launcher before concurrency is redesigned

Next improvement signals:
  routing_miss: prior cleanup hardening solved orphans but not aggregate memory from many legitimate live clients
  missing_agent_or_gate: add a global live-client concurrency gate to SocratiCode lifecycle verification
  repeated_failure_pattern: fail-closed orphan preservation can still exhaust aggregate memory when each live client owns a full 4 GiB runtime
  context_pressure: medium
  suggested_policy_change: treat aggregate live-client count and slice budget as a first-class gate, not only per-container limits and orphan cleanup

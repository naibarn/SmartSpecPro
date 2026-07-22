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

## Learning entry - 2026-07-18T18:00:13Z

Outcome:
  stop_reason: success
  requested_goal: implement the wizard no-seed plan so creators can generate every draft field without selecting a preset
  completed_scope: basics-only client action and copy, bounded router payload, v1/v2 synthesis prompt, lineage continuity, skill contract, and targeted tests
  skipped_or_deferred: real LLM smoke and deploy were not run because they are paid or external runtime side effects

Loop counters:
  iterations_used: 4/12
  tool_call_batches_used: unknown/30
  dispatch_waves_used: 0/6
  repair_rounds_used: 1/5
  timed_out_subagents: none
  estimated_cost_usd: unknown/0.50

Evidence quality:
  data_first_debug_applied: false
  evidence_sources: [test-output]
  evidence_gap: no live provider response or browser screenshot
  ui_guessing_prevented: true

Verification:
  commands_run: [126 targeted Vitest tests, pnpm check, dual-case skill cmp, git diff check]
  commands_skipped: [real LLM smoke - paid external call, build deploy restart - external runtime side effect, browser screenshots - no browser session]
  stale_gates_rerun: [targeted Vitest, TypeScript check]
  must_do_now_gaps_fixed: [category seed max bound, seeded path byte identity, sequel lineage forwarding, contradictory no-preset copy]
  should_offer_next: [run one authorized real LLM smoke and deploy verification]
  safely_deferred: [repository-wide skill audit - blocked by unrelated pre-existing deep skill runtime artifacts]
  residual_risk: live model output quality and production browser rendering are not yet proven

Next improvement signals:
  routing_miss: none
  missing_agent_or_gate: none
  repeated_failure_pattern: optional category filters need explicit payload semantics when promoted into generation seeds
  context_pressure: medium
  suggested_policy_change: none

## Learning entry - 2026-07-19T16:15:00Z

Outcome:
  stop_reason: external_user_action_required
  requested_goal: repair stuck Hermes Grok connection and verify the complete login method
  completed_scope: server claim gate, central and desktop control-job state machine, production cleanup, Worker App 0.1.131 release, and xAI OAuth verification
  skipped_or_deferred: Windows installation, xAI browser consent, and post-consent capability probe

Loop counters:
  iterations_used: 6/12
  tool_call_batches_used: 27/30
  dispatch_waves_used: 0/6
  repair_rounds_used: 2/5
  timed_out_subagents: none
  estimated_cost_usd: unknown/0.50

Evidence quality:
  data_first_debug_applied: true
  evidence_sources: [production-db, worker-heartbeat, test-output, installed-cli-source, release-manifest, HTTP-probe]
  evidence_gap: user-controlled xAI consent has not occurred
  ui_guessing_prevented: true

Verification:
  commands_run: [focused web tests, Worker App tests, Worker App typecheck, Windows release build, runtime check, production release checksum, production DB status, HTTP health]
  commands_skipped: [live xAI consent - requires user browser]
  stale_gates_rerun: [production health, release manifest, installer checksum, worker and connection status]
  must_do_now_gaps_fixed: [claim capability precedence, positive event sequences, running and terminal transitions, capabilities payload name, desktop minimum version gate, repeated pending rows]
  should_offer_next: [monitor the retained job until authorized and capability-probed after Worker App 0.1.131 starts]
  safely_deferred: [browser consent and capability probe]
  residual_risk: the retained job stays claimed/pending while the online worker remains on 0.1.130

Next improvement signals:
  routing_miss: selector unit tests originally covered generic families but not an explicit authoritative claim capability
  missing_agent_or_gate: release verification should assert control jobs emit running and terminal events before publishing
  repeated_failure_pattern: queued-to-claimed success can conceal a missing worker-to-server terminal event contract
  context_pressure: high
  suggested_policy_change: include the minimum Worker App version in Hermes readiness UI when a protocol fix requires a desktop upgrade

## Learning entry - 2026-07-20T00:53:00+07:00

Outcome:
  stop_reason: external_user_action_required
  requested_goal: repair repeated Hermes authorization failure and compact old connection history
  completed_scope: Windows child environment repair, safe diagnostics, compact localized history, 0.1.132 version gate, installer release, atomic production deployment
  skipped_or_deferred: xAI browser consent and post-consent capability probe

Evidence quality:
  data_first_debug_applied: true
  evidence_sources: [production-db, worker-heartbeat, installed-cli-source, test-output, release-download, HTTP-health]
  evidence_gap: no 0.1.132 heartbeat or live xAI device-code event until the user installs the new Windows client
  ui_guessing_prevented: true

Verification:
  commands_run: [Worker App full tests, Worker App typecheck, focused web regression, NSIS build, atomic web build, service restart, release endpoint and checksum, production DB status]
  commands_skipped: [live xAI consent - requires user browser]
  must_do_now_gaps_fixed: [Windows home resolution, diagnostic redaction, history clutter, central admin duplication, stale client eligibility]
  safely_deferred: [browser consent and post-consent image/video capability probe]
  residual_risk: live OAuth remains unproven until Worker App 0.1.132 replaces the online 0.1.131 process

Next improvement signals:
  repeated_failure_pattern: aggressively clearing child environments requires explicit tests for runtime-specific OS plumbing on every supported platform
  suggested_policy_change: release gates for desktop OAuth should execute a child-process bootstrap smoke with the production environment allow-list

## Learning entry - 2026-07-20T08:50:00+07:00

Outcome:
  stop_reason: success
  requested_goal: unify Kie GPT Image 2 selection and auto-route by reference-image presence
  completed_scope: catalog seed, migration, legacy alias, metadata forwarding, provider routing, and focused tests
  skipped_or_deferred: migration apply and paid live Kie generation smoke

Evidence quality:
  data_first_debug_applied: true
  evidence_sources: [SocratiCode, source inspection, provider docs, test-output]
  evidence_gap: no paid live provider request
  ui_guessing_prevented: true

Verification:
  commands_run: [focused Vitest tests, focused Pytest tests, Ruff, git diff check]
  commands_skipped: [migration apply, paid live Kie smoke]
  must_do_now_gaps_fixed: [seed convergence, legacy ID compatibility, opt-in isolation]
  safely_deferred: [unrelated repository-wide TypeScript failures]
  residual_risk: upstream live behavior remains unproven until deployment smoke

Next improvement signals:
  routing_miss: none
  missing_agent_or_gate: none
  repeated_failure_pattern: paired upstream modes should share one public catalog identity through explicit provider metadata
  context_pressure: medium
  suggested_policy_change: add a reusable schema for reference-driven provider variants if a second model family needs the same behavior

## Learning entry - 2026-07-20T08:51:00+07:00

Outcome:
  stop_reason: success
  requested_goal: apply migration 0212 so the database is ready for unified GPT Image 2
  completed_scope: live preflight, backup, transactional dry-run, journal repair, apply, and verification
  skipped_or_deferred: paid live Kie provider smoke

Evidence quality:
  data_first_debug_applied: true
  evidence_sources: [live migration ledger, live media_models rows, backup catalog, test-output]
  evidence_gap: none for database readiness
  ui_guessing_prevented: true

Verification:
  commands_run: [pg_dump, transactional psql dry-run, db:migrate twice, live SQL assertions, focused Vitest, git diff check]
  must_do_now_gaps_fixed: [journal timestamp below live migration watermark]
  residual_risk: live upstream generation remains untested

Next improvement signals:
  repeated_failure_pattern: Drizzle migrate success does not prove a newly added migration ran when journal timestamps trail an out-of-band live entry
  suggested_policy_change: compare target migration hash and timestamp against the live ledger after every production-like migrate

## Learning entry - 2026-07-20T09:12:00+07:00

Outcome:
  stop_reason: success
  requested_goal: make reference-bearing GPT Image 2 episode frames use and display image-to-image
  completed_scope: runtime evidence, graceful worker restart, effective-model persistence, tests, and backend rollout
  skipped_or_deferred: paid live provider smoke

Evidence quality:
  data_first_debug_applied: true
  evidence_sources: [media_tasks row, Celery active state, provider request log, runtime health, test-output]
  evidence_gap: no new paid Kie request after repair
  ui_guessing_prevented: true

Verification:
  commands_run: [Celery drain and restart, worker ping and queue inspection, 31 focused Pytest tests, scoped Ruff, py_compile, backend health]
  must_do_now_gaps_fixed: [stale worker process, canonical model persisted into History]
  residual_risk: next paid generation is needed to capture end-to-end provider evidence

Next improvement signals:
  repeated_failure_pattern: bind-mounted worker code changes require worker lifecycle verification, not only backend restart
  suggested_policy_change: deployment gates should compare worker process start time with changed provider module time and log effective provider model

## Learning entry - 2026-07-20T09:42:00+07:00

Outcome:
  stop_reason: success
  requested_goal: stop abnormal MCP polling and prevent it from blocking direct Kie generation
  completed_scope: containment, routing guard, stable poll scheduler, JWT bucket isolation, media-type timeout, rollout, and RCA
  skipped_or_deferred: paid live Kie generation smoke

Evidence quality:
  data_first_debug_applied: true
  evidence_sources: [production logs, mcp_media_tasks row, deterministic tests, post-deploy observation]
  evidence_gap: none for internal rate-limit recurrence
  ui_guessing_prevented: true

Verification:
  commands_run: [focused Vitest, focused Pytest, TypeScript check, Ruff, systemd health, journal observation, DB pending-task count]
  must_do_now_gaps_fixed: [wrong MCP dispatch, rerender polling loop, shared authenticated IP bucket, excessive image timeout]
  residual_risk: paid upstream Kie behavior was not exercised

Next improvement signals:
  repeated_failure_pattern: mixed-transport history lists require server-authoritative dispatch and polling must reserve before awaiting
  suggested_policy_change: add 404 and 429 burst alerts keyed by route and transport
## Learning entry - 2026-07-20T03:43:00Z

Outcome:
  stop_reason: success
  requested_goal: forward Vertical Drama reference images to Grok via Hermes
  completed_scope: resolver compatibility, fail-closed routing, tests, production restart
  skipped_or_deferred: paid live Grok regeneration

Loop counters:
  iterations_used: 2/3
  tool_call_batches_used: unknown/unknown
  dispatch_waves_used: 0/0
  repair_rounds_used: 1/3
  timed_out_subagents: none
  estimated_cost_usd: unknown/unknown

Evidence quality:
  data_first_debug_applied: true
  evidence_sources: [db-row, test-output, server-log]
  evidence_gap: none
  ui_guessing_prevented: true

Verification:
  commands_run: [focused Vitest, Episode Hermes subset, production DB resolver, healthz]
  commands_skipped: [paid Grok image regeneration - external cost]
  stale_gates_rerun: [focused unit and router tests, health]
  must_do_now_gaps_fixed: [legacy prefixed storage key resolution, silent reference drop]
  should_offer_next: [user retries the affected shot]
  safely_deferred: [repository-wide type errors unrelated to this patch]
  residual_risk: upstream Grok visual fidelity remains provider-dependent after references are attached

Next improvement signals:
  routing_miss: none
  missing_agent_or_gate: none
  repeated_failure_pattern: URL to asset-id reverse lookup assumed one storage representation
  context_pressure: medium
  suggested_policy_change: prefer durable asset ids at internal generation boundaries
## Learning entry - 2026-07-20T04:00:00Z

Outcome:
  stop_reason: success
  requested_goal: fix Hermes reference downloads and show all Hermes image/video jobs in Media History
  completed_scope: canonical storage-key presigning, worker_jobs history projection, production web rollout
  skipped_or_deferred: paid Grok retry deferred to avoid spending provider credits

Loop counters:
  iterations_used: 5/12
  tool_call_batches_used: 14/30
  dispatch_waves_used: 0/6
  repair_rounds_used: 1/5
  timed_out_subagents: none
  estimated_cost_usd: unknown/0.50

Evidence quality:
  data_first_debug_applied: true
  evidence_sources: [db-row, worker-job-event, test-output, server-log]
  evidence_gap: none for URL download and history projection
  ui_guessing_prevented: true

Verification:
  commands_run: [64 focused Vitest tests, TypeScript noEmit, production reference HTTP proof, local and public healthz]
  commands_skipped: [paid live Grok generation - external provider credit spend]
  stale_gates_rerun: [focused Vitest, TypeScript, diff check]
  must_do_now_gaps_fixed: [canonicalized legacy proxy storage keys, merged Hermes history, deterministic test timestamp]
  should_offer_next: [none]
  safely_deferred: [paid live Grok retry - user-controlled credit spend]
  residual_risk: provider generation itself is not re-run in this repair

Next improvement signals:
  routing_miss: none
  missing_agent_or_gate: none
  repeated_failure_pattern: public media URL persisted in storageKey instead of object key
  context_pressure: medium
  suggested_policy_change: normalize managed storage refs at every presign boundary

## Learning entry - 2026-07-20T22:55:37Z

Outcome:
  stop_reason: source fix verified; rollout deferred because the production worktree is broadly dirty
  requested_goal: diagnose intermittent 524 errors while rapidly generating Vertical Drama prompts and images
  completed_scope: production evidence, per-shot workflow fix, missing-frame materialization, concurrency regression coverage
  skipped_or_deferred: production restart and paid browser generation smoke

Loop counters:
  iterations_used: 3/12
  tool_call_batches_used: exact telemetry unavailable/30
  dispatch_waves_used: 0/6
  repair_rounds_used: 1/5
  timed_out_subagents: none
  estimated_cost_usd: unknown/0.50

Evidence quality:
  data_first_debug_applied: true
  evidence_sources: [server-log, db-row, test-output, screenshot]
  evidence_gap: no post-deploy browser smoke because rollout is unsafe from the shared dirty worktree
  ui_guessing_prevented: true

Verification:
  commands_run: [19 focused Vitest tests, repository TypeScript check, git diff check]
  commands_skipped: [production restart - unrelated dirty changes, paid live generation - provider credit spend]
  stale_gates_rerun: [focused Vitest, diff check]
  must_do_now_gaps_fixed: [removed duplicate whole-plan call from per-shot button, added row-lock merge for missing frames]
  should_offer_next: [clean scoped rollout and rapid-click browser smoke]
  safely_deferred: [production restart - unrelated dirty changes would be activated]
  residual_risk: source fix is not active in the current web process

Next improvement signals:
  routing_miss: none
  missing_agent_or_gate: none
  repeated_failure_pattern: long synchronous whole-episode work was hidden behind a repeatable per-shot action
  context_pressure: medium
  suggested_policy_change: per-shot actions must call bounded per-shot mutations and row-lock-merge their own state

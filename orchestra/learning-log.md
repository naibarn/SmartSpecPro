# Learning Log

## 2026-09-02 — Feature 173 follow-up audit

- A disabled Enhanced button without a visible readiness reason is operationally
  ambiguous even when the server returns structured blocker codes. Keep the reason
  visible in the storyboard while preserving the disabled state and Legacy path.
- A local service restart is a meaningful production-readiness gate for Beta. A
  missing ESM export can prevent the entire Node process from starting, so startup
  must be rechecked after any touched runtime/UI change.
- Grok's app transport profile remains distinct from the raw provider skill adapter:
  SmartAIHub sends Start + image references in one ordered array, while the raw
  provider contract remains unchanged to avoid widening scope or invalidating its
  manifest assumptions.
- Readiness errors can be caused by persisted JSON naming drift rather than missing
  media. When a typed projection is camelCase but stored storyboard output is
  provider-shaped snake_case, normalize at the Enhanced boundary and test the
  actual stored shape.

## Learning entry - 2026-09-03

Outcome:
  stop_reason: success with external evidence deferred
  requested_goal: Diagnose and repair Enhanced video-prompt creation failure.
  completed_scope: Repaired missing observed camera field handling and bridge audio result assembly.
  skipped_or_deferred: authenticated browser retry and live provider execution

Loop counters:
  iterations_used: 12/12
  tool_call_batches_used: unknown/30
  dispatch_waves_used: 0/6
  repair_rounds_used: 5/5
  timed_out_subagents: none
  estimated_cost_usd: negligible/0.50

Evidence quality:
  data_first_debug_applied: true
  evidence_sources: [db-row, test-output, server-log, ui-only]
  evidence_gap: live provider and authenticated browser retry unavailable
  ui_guessing_prevented: true

Verification:
  commands_run: [v11 runtime checks, audio bridge unittest, package validator, bridge health, py_compile, Enhanced service Vitest, git diff --check]
  commands_skipped: [pytest - pytest executable unavailable; authenticated browser and live provider - external evidence]
  stale_gates_rerun: [Python runtime, Enhanced service test, package validator, bridge health, diff check]
  must_do_now_gaps_fixed: [missing movementAtT0 contract handling, stale audio_direction NameError]
  should_offer_next: [authenticated browser retry]
  safely_deferred: [live provider execution - paid/external]
  residual_risk: local tests do not prove provider behavior

Next improvement signals:
  routing_miss: none
  missing_agent_or_gate: none
  repeated_failure_pattern: model omissions on required still-image fields
  context_pressure: low
  suggested_policy_change: complete fields that are provably unobservable from still evidence with explicit uncertainty.

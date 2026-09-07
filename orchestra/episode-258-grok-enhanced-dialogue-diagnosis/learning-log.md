# Learning entry - 2026-09-07

Outcome:
  stop_reason: success
  requested_goal: compare Legacy and Enhanced prompts for Grok speaker correctness
  completed_scope: read-only DB, log, compiler, validator, budget, and focused test comparison
  skipped_or_deferred: paid provider replay, build, restart, and typecheck were intentionally not run

Evidence quality:
  data_first_debug_applied: true
  evidence_sources: ui-only, db-row, audit-log, test-output, deterministic local reproducer
  evidence_gap: no local provider render task/result for episode 258
  ui_guessing_prevented: true

Next improvement signals:
  repeated_failure_pattern: presence-only speaker tests miss cross-character action binding contradictions
  suggested_policy_change: implemented canonical speaker events plus terminal semantic validation; retain this structure for future Enhanced models

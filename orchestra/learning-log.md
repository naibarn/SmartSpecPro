# Learning Log

- The user-visible QC failure was traced to a server-managed audit field being evaluated by an active immutable-field guard.
- Focused regression proof was more reliable than the baseline-wide typecheck, which contains unrelated dirty-worktree errors.

## Learning entry - 2026-08-19T01:15:00Z

Outcome:
  stop_reason: success
  requested_goal: Prevent `storyDesign.legacyControlArchive` from stopping Draft QC and blocking Draft confirmation.
  completed_scope: Added a server-managed audit metadata contract, sanitized provider patches, and regression coverage for QC and create receipt paths.
  skipped_or_deferred: Browser-authenticated workflow and live provider verification - external runtime state unavailable.

Loop counters:
  iterations_used: 5/12
  tool_call_batches_used: unknown/30
  dispatch_waves_used: 0/6
  repair_rounds_used: 0/5
  timed_out_subagents: none
  estimated_cost_usd: unknown/0.50

Evidence quality:
  data_first_debug_applied: true
  evidence_sources: [ui-only, test-output]
  evidence_gap: no live run id or server log was supplied; local regression reproduced the exact error.
  ui_guessing_prevented: true

Verification:
  commands_run: ["pnpm test server/services/__tests__/verticalDramaDraftQualityQc.test.ts", "pnpm test shared/verticalDramaSeries/draftStoryDesign.test.ts", "pnpm test server/routers/__tests__/verticalDramaSeries.createPresetStamp.test.ts", "pnpm check", "git diff --check"]
  commands_skipped: ["browser/provider/deployment verification - not available in local workspace"]
  stale_gates_rerun: ["focused QC service test after final test change"]
  must_do_now_gaps_fixed: ["immutable audit metadata falsely blocking QC"]
  should_offer_next: none
  safely_deferred: ["live workflow proof - external runtime unavailable"]
  residual_risk: baseline-wide TypeScript errors remain outside changed files

Next improvement signals:
  routing_miss: none
  missing_agent_or_gate: none
  repeated_failure_pattern: server-managed audit fields should be explicitly classified beside immutable/mutable contract fields.
  context_pressure: medium
  suggested_policy_change: none

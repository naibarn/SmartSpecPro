# Learning log

- Session started with SocratiCode unavailable; bounded shell discovery is the fallback.
- For video-prompt grounding, the persisted `frame_analysis` position map must
  be treated as an admission contract: retry with an exact lock, then block
  contradictory output before billing or persistence.
- A judge that only sees the start frame cannot independently validate identity
  against the character portraits; pass the labeled portraits through the same
  quality-review call.

## Learning entry - 2026-08-08T00:05:00Z

Outcome:
  stop_reason: success
  requested_goal: repair bulk Vertical Drama prompt plus image generation when prompts persist but only some image tasks reach Media History
  completed_scope: client prompt/image submission flow and focused regression coverage
  skipped_or_deferred: production replay and browser/network trace - no task id or authenticated live trace was provided

Loop counters:
  iterations_used: 1/3
  tool_call_batches_used: unknown/unknown
  dispatch_waves_used: 0/0
  repair_rounds_used: 0/1
  timed_out_subagents: none
  estimated_cost_usd: unknown/unknown

Evidence quality:
  data_first_debug_applied: true
  evidence_sources: [test-output, source-trace]
  evidence_gap: no authenticated production task ids or request logs
  ui_guessing_prevented: true

Verification:
  commands_run: ["npm --workspace @smartspec/web run test -- client/src/pages/__tests__/VerticalDramaEpisodePage.promptAndImageFlow.test.ts", "git diff --check", "npm --workspace @smartspec/web run check", "npm --workspace @smartspec/web run test -- server/routers/__tests__/verticalDramaEpisodes.characterRefV2.test.ts"]
  commands_skipped: ["browser replay - no authenticated session or exact task ids", "full clean typecheck - unrelated dirty-worktree baseline errors remain"]
  stale_gates_rerun: ["focused client flow test"]
  must_do_now_gaps_fixed: ["stale refetch could skip image submission", "fire-and-forget bulk image admission"]
  should_offer_next: none
  safely_deferred: ["production confirmation - requires authenticated live evidence"]
  residual_risk: provider-specific failures still require the existing Media History/task error surface

Next improvement signals:
  routing_miss: none
  missing_agent_or_gate: none
  repeated_failure_pattern: none
  context_pressure: medium
  suggested_policy_change: none

## Learning entry - 2026-08-09T02:46:00.689Z

Outcome:
  stop_reason: success
  requested_goal: Restore per-shot video-prompt generation when both Dual View images exist.
  completed_scope: Resolved canonical display-name speakers to view keys, aligned prompt identity inputs, and preserved exact backend errors.
  skipped_or_deferred: Authenticated production browser smoke and deployment were outside the requested repo-local fix.

Loop counters:
  iterations_used: 4/12
  tool_call_batches_used: 19/30
  dispatch_waves_used: 0/6
  repair_rounds_used: 1/5
  timed_out_subagents: none
  estimated_cost_usd: negligible local-only/0.50

Evidence quality:
  data_first_debug_applied: true
  evidence_sources: [db-row, test-output, ui-only]
  evidence_gap: no captured production tRPC response body; database state isolated the deterministic precondition mismatch
  ui_guessing_prevented: true

Verification:
  commands_run: [focused Vitest 75/75, npx tsc --noEmit, targeted git diff --check]
  commands_skipped: [authenticated browser smoke - no production session, deployment - not requested]
  stale_gates_rerun: [focused tests, TypeScript, diff check]
  must_do_now_gaps_fixed: [resolved keys now drive validation and motion speaker binding]
  should_offer_next: none
  safely_deferred: [existing Radix dialog-description warnings - unrelated]
  residual_risk: production requires deployment before the fix is live

Next improvement signals:
  routing_miss: none
  missing_agent_or_gate: none
  repeated_failure_pattern: client generic PRECONDITION mapping hid the real server reason
  context_pressure: medium
  suggested_policy_change: preserve server precondition details for multi-state workflows
## Learning entry - 2026-08-09T03:46:59Z

Outcome:
  stop_reason: success
  requested_goal: prevent a View 2 character position from being interpreted as presence in Image 1
  completed_scope: per-view analysis contract, generation and judge instructions, deterministic correction/rejection, persistence, and tests
  skipped_or_deferred: live paid prompt regeneration and deployment were not authorized

Loop counters:
  iterations_used: 4/12
  tool_call_batches_used: exact telemetry unavailable; conservative local proxy
  dispatch_waves_used: 0/6
  repair_rounds_used: 1/5
  timed_out_subagents: none
  estimated_cost_usd: negligible local-only/0.50

Evidence quality:
  data_first_debug_applied: true
  evidence_sources: [audit-log, db-row, test-output]
  evidence_gap: none for root cause; no paid live regeneration
  ui_guessing_prevented: true

Verification:
  commands_run: [focused Vitest suites, TypeScript diagnostic, git diff --check, skill twin cmp]
  commands_skipped: [paid live generation - external cost and mutation not required]
  stale_gates_rerun: [prompt service, judge, router, shared contract, real skill files, TypeScript]
  must_do_now_gaps_fixed: [nullable character source type, view-scoped judge facts]
  should_offer_next: [deploy and regenerate shot 4 when the user chooses to publish]
  safely_deferred: [unrelated repository-wide TypeScript baseline]
  residual_risk: live model adherence is protected by retry/fail-closed validation but not paid-smoked in this turn

Next improvement signals:
  routing_miss: none
  missing_agent_or_gate: none
  repeated_failure_pattern: multi-image vision contracts need explicit per-image roles, not prose-only ordering
  context_pressure: medium
  suggested_policy_change: require a view/image role whenever one prompt analyzes multiple physical frames

## 2026-08-09 - Provider-neutral multi-image naming

- Prompt-facing frame identifiers should follow attachment order (`Image 1`, `Image 2`).
- Product roles such as start/reference frame belong in metadata and explanatory facts, not in competing cue labels.
- Deterministic validators should accept one canonical prompt label while preserving legacy metadata aliases internally.

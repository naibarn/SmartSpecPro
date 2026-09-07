# Progress

Loop policy final:
  iterations_used: 4/12
  tool_call_batches_used: 18/30
  estimated_cost_usd: unknown/0.50; local read-only proxy negligible
  dispatch_waves_used: 0/6
  timed_out_subagents: none
  repair_rounds_used: 0/5
  stop_conditions_met: success_criteria_met, tests_passed, no_open_blockers
  stop_reason: success

- [COMPLETE] Evidence — queried persisted episode 258 prompt variants and canonical dialogue read-only.
- [COMPLETE] Code trace — isolated deterministic action/dialogue index coupling and missing semantic validation.
- [COMPLETE] Verification — existing Enhanced bridge tests passed 11/11; a no-write reproducer generated the same cross-character timeline contradiction.
- [COMPLETE] Review round 1 — cross-checked DB dialogue mapping against terminal prompt and compiler call path; no alternate mapping defect found.
- [COMPLETE] Review round 2 — checked prompt-budget/provider boundary and existing tests; found 4,096-char compression risk and a regression-test blind spot, with no new competing root cause.

Gap closure:
  must_do_now: none for the requested read-only comparison
  should_offer_next: implement provider-safe speaker-bound timeline events and semantic fail-closed validation with episode 258 regressions
  safely_deferred: real Grok vs Omni provider replay, because it would spend credits and was not authorized
  no_action_needed: canonical DB speaker/position mapping is already correct for Enhanced shots 1-2

## Approved implementation extension

- [COMPLETE] Brainstorming design — speaker-safe shared compiler and model-specific limits for Grok 4,096; MiniMax H3 7,000; Omni Flash 1.1 20,000; Wan 3.0 20,000; Seedance 2.5 30,000.
- [COMPLETE] Spec review round 1 — corrected limit precedence so known model ceilings cannot be raised by stale/generic config; added Enhanced input fingerprinting for the resolved limit.
- [COMPLETE] Spec review round 2 — added deterministic compaction tiers and protected-core fail-closed behavior so Grok receives a valid prompt without semantic LLM rewriting.
- [COMPLETE] User approved the written design and authorized implementation without further confirmation.
- [COMPLETE] Speaker-safe compiler — canonical speech events are separated from sanitized physical actions; Thai/English speech and mouth-motion leakage is rejected.
- [COMPLETE] Budget integration — Grok 4,096; MiniMax H3 7,000; Omni Flash 1.1 and Wan 3.0 20,000; Seedance 2.5 30,000, resolved by model identity across all production call sites.
- [COMPLETE] Boundary safety — resolved budget is fingerprinted, enforced by Python compaction and checked again by TypeScript before persistence; swapped lines fail closed.
- [COMPLETE] Focused verification — Python 14/14, budget/Enhanced 33/33, motion-prompt integration 118/118, static call-site audit and `git diff --check` passed.
- [SKIPPED BY USER] Build, service restart and typecheck.

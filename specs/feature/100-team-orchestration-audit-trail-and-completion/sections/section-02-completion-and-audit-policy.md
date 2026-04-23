# Section 02: Completion And Audit Policy

## Purpose

Define the policy layer that decides when a run is complete, what attempt payload must be retained for audit, and how detailed audit data is exposed safely.

## Scope

This section should concentrate on:

- completion gate modeling in the run or monitoring layer
- attempt audit payload structure and retention rules
- room-message to ledger-event linking rules
- authorization and redaction rules for attempt drill-down

## Responsibilities

- Define the minimum completion gates per objective class
- Define which stop reasons are terminal failure versus accepted exception versus successful completion
- Define the minimum attempt-level audit fields required for diagnosis
- Define which detailed fields are visible inline versus drill-down only
- Define how long-history rooms preserve completeness without becoming unreadable
- Define the default reviewer-versus-self-check policy
- Define the default rework and re-plan loop limits
- Define strict pass/fail behavior for planning, review, and final-review gates with no fallback plan, no fallback review, and no silent success
- Define the diagnostic message shape for planner, reviewer, final-review, and missing-plan failures

## Key implementation notes

- Avoid leaving completion semantics as informal prose in the runtime
- Make review findings resolvable across multiple revision attempts
- Ensure the dashboard can explain "what is still missing" when a run is not done
- Keep the audit policy compatible with existing tenant, room, and run authorization boundaries
- Treat recent active rooms and older historical rooms differently for backfill: background derive recent history, lazy derive older history
- Keep full redacted attempt payload for audit while limiting default inline exposure to summary-safe fields
- Planning and review failures must be explicit evidence-bearing states, not repaired data. The system should say what failed, which gate failed, and that no fallback was applied.
- Team planning/review LLM calls must use no provider fallback and no schema retry fallback. If the selected provider/model cannot produce the required structured output, the run pauses or fails that gate.
- Reviewer policy must preserve accountability: the owner and reviewer should be distinct when more than one active member is available, and reviewer findings must map to the exact step or attempt being corrected.
- Expected stop reasons include `planning_generation_failed`, `planning_review_failed`, `replanning_generation_failed`, `replanning_review_failed`, `planning_exploration_selection_missing`, and `final_review_plan_artifact_missing`.
- Expected diagnostic issue prefixes include `planner_unknown_owner_member`, `planner_unknown_reviewer_member`, `planner_owner_reviewer_not_distinct`, `llm_reviewer_unavailable`, and `llm_final_reviewer_unavailable`.

## Strict gate policy

- Planning gate: the LLM planner must produce a valid plan from the objective and room personas before work starts.
- Plan-review gate: the reviewer validates the plan as-is. It may fail the plan, but it must not patch missing owners, reviewers, evidence, or verification fields.
- Execution gate: each step attempt must keep enough result and metadata for later human audit.
- Review gate: reviewer feedback must be preserved as a pass/fail result tied to the attempt, including required changes when it fails.
- Rework gate: failed work loops back to the responsible owner with reviewer findings attached; the subsequent attempt must remain linked to the failed attempt it addresses.
- Final-review gate: final acceptance requires the persisted audited plan and completed evidence. Missing plan evidence is a blocking failure, not a reason to synthesize a plan.

## Tests expected from this section

- completion gate evaluation across success, rework, accepted exception, and hard failure
- attempt payload retention for model-driven steps
- planner and reviewer unavailability produce failed or paused gates with `noFallbackApplied: true`
- incomplete planner output fails validation instead of being repaired
- reviewer output fails validation instead of falling back to heuristic approval or rejection
- final review without an audited plan artifact pauses with `final_review_plan_artifact_missing`
- drill-down authorization and redaction behavior
- reconstruction of the current state after reload or polling recovery
- reviewer-policy enforcement for plan, artifact, and publishing steps
- stall detection for repeated attempts and no-gate-progress loops

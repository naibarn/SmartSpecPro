# SPEC-308 Lifecycle

Goal: deliver SPEC-308 R1.2 with existing notification/chat/task/feedback authority preserved.
Scope/risk: large/high.
Current stage: PLANNING
Resume from: PLANNING
Stop reason: active
Mandatory stages: PLANNING, TDD_DESIGN, IMPLEMENT, VERIFY, DEBUG_FIX, REVIEW, FINAL_VERIFY

Stage ledger:
  - stage: PLANNING
    status: IN_PROGRESS
    entry_evidence: fresh origin/main + registry/source audit, plan.md
    exit_evidence: pending Work Package contracts and test design
    attempt: 1
    stale: false
    next_action: integrate WP0 checkpoint and finalize task design
  - stage: TDD_DESIGN
    status: PENDING
  - stage: IMPLEMENT
    status: PENDING
  - stage: VERIFY
    status: PENDING
  - stage: DEBUG_FIX
    status: PENDING
  - stage: REVIEW
    status: PENDING
  - stage: FINAL_VERIFY
    status: PENDING

Gap ledger:
  - gap_id: GAP-001
    discovered_at_stage: PLANNING
    earliest_affected_stage: PLANNING
    classification: VERIFY_ONLY
    severity: MEDIUM
    condition: live baseline screenshots and source-authorization fixture not yet captured
    evidence: WP0 source audit; no browser session captured
    owner: conductor
    action: capture best available baseline and distinguish runtime skips
    attempts: 0/5
    stale_gates: [browser, visual, network]
    status: OPEN
    resume_from: PLANNING
    residual_risk: no runtime baseline yet
    root_cause: browser/runtime availability not yet probed
    decision_class: VERIFY_NOW
    attempted_strategies: []
    prohibited_retries: []
  - gap_id: GAP-002
    discovered_at_stage: PLANNING
    earliest_affected_stage: IMPLEMENT
    classification: MUST_FIX
    severity: HIGH
    condition: group occurrence identity is not available as a unique server-authorized arrival ID
    evidence: notificationStream.ts source audit: SSE id is userNotification row id and repeated occurrences can reuse it
    owner: conductor
    action: scope cosmetic event to newly seen distinct authorized notification IDs; suppress unproven grouped repeats
    attempts: 0/5
    stale_gates: [attention reducer, SSE negative cases]
    status: OPEN
    resume_from: IMPLEMENT
    residual_risk: no per-occurrence animation claim
    root_cause: current transport does not expose occurrence identity
    decision_class: SUBSTITUTE
    attempted_strategies: [use new distinct notification row ID only]
    prohibited_retries: [infer new occurrence from count/title/metadata]

Completion invariants:
  all_mandatory_stages_closed: false
  no_open_must_do_gap: false
  no_stale_required_gate: true
  review_converged: false
  final_verify_fresh: false

# SPEC-308 Lifecycle

Goal: deliver SPEC-308 R1.2 with existing notification/chat/task/feedback authority preserved.
Scope/risk: large/high.
Current stage: IMPLEMENT
Resume from: IMPLEMENT
Stop reason: implementation checkpoint recorded; consolidated verification intentionally pending
Mandatory stages: PLANNING, TDD_DESIGN, IMPLEMENT, VERIFY, DEBUG_FIX, REVIEW, FINAL_VERIFY

Stage ledger:
  - stage: PLANNING
    status: COMPLETE
    entry_evidence: fresh origin/main + registry/source audit, plan.md
    exit_evidence: pending Work Package contracts and test design
    attempt: 1
    stale: false
    next_action: integrate WP0 checkpoint and finalize task design
  - stage: TDD_DESIGN
    status: COMPLETE
  - stage: IMPLEMENT
    status: IN_PROGRESS
    exit_evidence: safe source checkpoint dd6a42f82; see evidence/implementation-gap-update-20261010-wave2.md
    next_action: finish source gap sweep, then publish one checkpoint for consolidated exact-head verification
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
  - gap_id: GAP-003
    discovered_at_stage: IMPLEMENT
    earliest_affected_stage: IMPLEMENT
    classification: AUTHORIZATION_SCOPE
    severity: HIGH
    condition: in-flight Chat conversation creation could commit its conversation ID after user or tenant identity changed
    evidence: fixed in source checkpoint dd6a42f82; wave-2 read-only review also identified null-tenant desktop identity and Task Control rejection handling edge cases
    owner: conductor
    action: verify user/tenant and null-tenant switch behavior in the consolidated exact-head test round
    attempts: 0/1
    stale_gates: [Chat, Task Control, identity transition, auth isolation]
    status: FIXED_PENDING_VERIFICATION
    resume_from: VERIFY
    residual_risk: local implementation has not yet been tested on the candidate SHA
    root_cause: conversation state and asynchronous completion were not scoped to the current identity
    decision_class: MUST_FIX
    attempted_strategies: [read-only source review; generation and identity fencing implemented]
    prohibited_retries: []

Completion invariants:
  all_mandatory_stages_closed: false
  no_open_must_do_gap: false
  no_stale_required_gate: true
  review_converged: false
  final_verify_fresh: false

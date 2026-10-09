# SPEC-308 Lifecycle

Goal: deliver SPEC-308 R1.2 with existing notification/chat/task/feedback authority preserved.
Scope/risk: large/high.
Current stage: IMPLEMENT
Resume from: IMPLEMENT
Stop reason: implementation checkpoint da4d7d8214ffa0e144ccf89988e503663956a9f0 recorded; one consolidated exact-head verification pending
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
    exit_evidence: source checkpoint da4d7d8214ffa0e144ccf89988e503663956a9f0; see evidence/implementation-gap-update-20261010-wave3.md
    next_action: publish the frozen implementation checkpoint to PR #399 and run one consolidated exact-head CI round
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

  - gap_id: GAP-004
    discovered_at_stage: IMPLEMENT
    earliest_affected_stage: VERIFY
    classification: VERIFY_ONLY
    severity: MEDIUM
    condition: prior browser run failed the manual motion fixture, balloon visibility measurement and post-drag alignment
    evidence: CI 37977803447 on 2ddd19fdfeacb20f58dd01ecb75cc2844be9ada4; evidence/implementation-gap-update-20261010-wave3.md
    owner: conductor
    action: run consolidated browser suite on da4d7d8214ffa0e144ccf89988e503663956a9f0 and repair any remaining geometry failure from exact log data
    attempts: 1/5
    stale_gates: [browser, responsive geometry, motion fixture]
    status: FIXED_PENDING_VERIFICATION
    resume_from: VERIFY
    residual_risk: candidate has not been tested; prior geometry delta may expose an additional product issue
    root_cause: fixture omitted mock EventSource; count-only assertion accepted a hidden node; fake page clock controls the product requestAnimationFrame remeasurement
    decision_class: FIX_NOW
    attempted_strategies: [add EventSource fixture, assert visibility, run mocked clock for 32ms before post-drag geometry]
    prohibited_retries: [loosen the 24px alignment threshold]
    waiting_predicate: consolidated PR #399 browser workflow completes on the exact candidate SHA
    reactivation_predicate: workflow run for da4d7d8214ffa0e144ccf89988e503663956a9f0 completes
    progress_delta: test fixture/readiness and i18n behavior added; alignment check retained
  - gap_id: GAP-005
    discovered_at_stage: IMPLEMENT
    earliest_affected_stage: VERIFY
    classification: VERIFY_ONLY
    severity: MEDIUM
    condition: new EN/TH localized Feedback and accessible dialog copy has no exact-head browser evidence
    evidence: source commit a5093fdcf2641939deb8afd1891cb4a9b05d8608 and locale parity scan in evidence/implementation-gap-update-20261010-wave3.md
    owner: conductor
    action: verify localized authenticated dialog, Feedback form, urgent control and accessible names in the consolidated browser suite
    attempts: 0/5
    stale_gates: [localization browser coverage, Chat/Feedback regression]
    status: FIXED_PENDING_VERIFICATION
    resume_from: VERIFY
    residual_risk: locale key parity does not prove rendering or assistive technology behavior
    root_cause: implementation changed localized surfaces after the prior tested SHA
    decision_class: VERIFY_NOW
    attempted_strategies: [static JSON parse and locale key parity passed]
    prohibited_retries: []
    waiting_predicate: consolidated exact-head browser run has an artifact for Thai dialog and feedback assertions
    reactivation_predicate: browser workflow completes on the candidate SHA
    progress_delta: translation keys and Thai dialog/form assertions added

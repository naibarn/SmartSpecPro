# SPEC-308 Lifecycle

## Latest verified checkpoint — wave 7 (2026-10-10)
- Canonical `origin/main`: `6dcd7934332db7929904f8da642915751a6bb79`.
- PR #399 head `7325a117b2f342ef54af82fdb9b52235ae81adbe`: SPEC-308 focused/browser workflow `37986151623` passed 8 files / 144 tests and 18/18 Chromium simulations with mocked APIs on UI-only Vite. This is not live authenticated acceptance.
- PR #399 MCP workflow `37986151602` failed baseline test fixtures (missing DB-backed session state and retired-service test imports) and live smoke due missing approved endpoint/token. PR #403 owns the fixture repair but remains based on older canonical and its exact audit/live gates are not cleared. PR #405 compatibility regressions passed 18 files / 238 tests; full audit remains failed for one Moderate `sprintf-js@1.1.3` pending owner disposition.
- All 66 requirement rows remain OPEN. No row can close from PR-head mock evidence; integration SHA is still null. Production flags remain OFF.
- Earliest resume stage: reconcile PR #405 authority/mandatory audit, then refresh #403, then re-evaluate #399 on the integrated candidate. Independently retain the approved non-production runtime/user and Feature-049 tenant/revision contract as external prerequisites for live acceptance.
- Evidence: `evidence/implementation-gap-update-20261010-wave7.md`, `evidence/pr-ci-37986151623.json`, Actions run `37986151623`, MCP run `37986151602`, #403 run `37967358012`, and #405 run `37967353996`.

Goal: deliver SPEC-308 R1.2 with existing notification/chat/task/feedback authority preserved.
Scope/risk: large/high.
Current stage: VERIFY
Resume from: VERIFY
Stop reason: test-fixture follow-up f0fa060c55779beb6d55c7baeba727d9dd3a517c recorded; focused unit and mocked browser workflow 37984601979 is running on the exact head
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
    exit_evidence: source checkpoint f0fa060c55779beb6d55c7baeba727d9dd3a517c; Bell responsive/accessibility hardening, local mascot fallback, and focused test fixture repair committed
    next_action: inspect run 37984601979 focused tests and mocked browser artifacts, then repair only proven candidate failures
  - stage: VERIFY
    status: IN_PROGRESS
    entry_evidence: PR #399 exact source candidate f0fa060c55779beb6d55c7baeba727d9dd3a517c; workflow run 37984601979
    next_action: complete focused units and browser simulation, inspect artifacts and exact-SHA test summary
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
  - gap_id: GAP-006
    discovered_at_stage: IMPLEMENT
    earliest_affected_stage: VERIFY
    classification: MUST_FIX
    severity: MEDIUM
    condition: Chat, Task Control and Feedback controls used tab roles without complete tab-panel relationships or keyboard arrow/Home/End focus navigation
    evidence: source review of FeedbackButton.tsx before checkpoint 2d554f2097d230d957cbfbacfcd822bdb62b9568
    owner: conductor
    action: verify manual-activation keyboard navigation, tab-panel naming, focus behavior, and no Chat request on focus in the focused FeedbackButton suite
    attempts: 0/3
    stale_gates: [focused FeedbackButton unit suite, browser dialog flow]
    status: FIXED_PENDING_VERIFICATION
    resume_from: VERIFY
    residual_risk: source and test changes await the current exact-head CI run
    root_cause: dialog tabs had selected state but no full keyboard-operable ARIA tab pattern
    decision_class: FIX_NOW
    attempted_strategies: [manual activation, arrow/Home/End focus without implicit conversation creation]
    prohibited_retries: [auto-activate Chat on arrow focus]
    waiting_predicate: focused FeedbackButton and Bell accessibility suites complete on eee0fa4cc389590d378307fff3af5a15f74c42e0
    reactivation_predicate: workflow run 37984108309 completes
    progress_delta: source now exposes roving selected tab and associated tabpanel IDs; a unit regression asserts focus navigation causes no Chat conversation request
  - gap_id: GAP-007
    discovered_at_stage: VERIFY
    earliest_affected_stage: DEBUG_FIX
    classification: TEST_FIXTURE_AND_ACCESSIBILITY
    severity: HIGH
    condition: focused run 37984108309 found stale EN translation mocks/aria selectors and jsdom-incompatible dock style assertions after the earlier mutation/settings/Bell issues were corrected
    evidence: exact log from run 37984108309 on eee0fa4cc389590d378307fff3af5a15f74c42e0; corrections in f0fa060c55779beb6d55c7baeba727d9dd3a517c
    owner: conductor
    action: confirm the corrected focused suites pass on run 37984601979 before browser stage proceeds
    attempts: 2/5
    stale_gates: [Bell English aria fixture, authenticated Feedback translations, safe-area dock style]
    status: FIXED_PENDING_VERIFICATION
    resume_from: VERIFY
    residual_risk: latest focused run has not completed exact-head CI
    root_cause: test mocks returned raw i18n keys, Bell dock tests expected numeric inline offsets, and the prior source used jsdom-unsupported max() values
    decision_class: FIX_NOW
    attempted_strategies: [add reset to the tRPC mutation mock, query radio by accessible name and preload valid scoped settings, derive Bell status from actual data, map EN strings in focused mocks, preserve numeric dock offsets and safe-area padding]
    prohibited_retries: [weaken assertions or claim the skipped browser stage passed]
    waiting_predicate: focused unit step completes on f0fa060c55779beb6d55c7baeba727d9dd3a517c
    reactivation_predicate: workflow run 37984601979 completes
    progress_delta: prior test causes corrected; localized Bell truthful state and no-history badge suppression remain in source
  - gap_id: GAP-008
    discovered_at_stage: IMPLEMENT
    earliest_affected_stage: VERIFY
    classification: RESPONSIVE_ACCESSIBILITY
    severity: HIGH
    condition: Notification popover could overflow the viewport and its programmatic open/close flow did not manage focus
    evidence: source review of GlobalAlerts.tsx and new narrow-viewport/keyboard regression in spec-308-dual-surface.spec.ts
    owner: conductor
    action: verify 320px visual bounds, viewport resize/keyboard positioning, and focus return in run 37984601979
    attempts: 0/3
    stale_gates: [narrow viewport, visual viewport, Escape focus return]
    status: FIXED_PENDING_VERIFICATION
    resume_from: VERIFY
    residual_risk: CSS/visual viewport placement has not been observed in the browser runner
    root_cause: popover was fixed to the Bell's right edge with static dimensions and did not have a focus lifecycle
    decision_class: FIX_NOW
    attempted_strategies: [clamp using visualViewport geometry, safe-area offsets, resize/scroll recalculation, focus dialog on open and Bell on Escape/close]
    prohibited_retries: [remove viewport bounds assertion]
    waiting_predicate: exact-head browser simulation completes and includes Bell popover bounds/focus assertions
    reactivation_predicate: workflow run 37984601979 completes
    progress_delta: responsive popover positioning, localized names, and keyboard focus lifecycle implemented

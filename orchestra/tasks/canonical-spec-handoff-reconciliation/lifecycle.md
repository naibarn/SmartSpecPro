# Orchestra Lifecycle

Goal: implement the shared canonical Spec handoff framework and reconcile every canonical Spec dynamically without implementing feature Specs.
Scope/risk: project/high
Current stage: VERIFY
Resume from: VERIFY
Stop reason: active
Mandatory stages: PLANNING, TDD_DESIGN, IMPLEMENT, VERIFY, DEBUG_FIX, REVIEW, FINAL_VERIFY

Stage ledger:
  - stage: PLANNING
    status: COMPLETE
    entry_evidence: user brief and repository discovery
    exit_evidence: task plan, project decomposition, contract decisions
    attempt: 1
    stale: false
    result: six bounded work units retained; configured roots and classification rules reviewed
    next_action: none
  - stage: TDD_DESIGN
    status: COMPLETE
    entry_evidence: orchestra/tasks/canonical-spec-handoff-reconciliation/test-design.md
    exit_evidence: requirement-to-test matrix with RED absence evidence recorded in progress.md
    result: initial contract, discovery, stale-write, and no-false-complete tests specified
  - stage: IMPLEMENT
    status: COMPLETE
    entry_evidence: focused RED: `python3 -m unittest tools.spec_handoff.tests.test_contracts` failed because module did not exist
    exit_evidence: tools/spec_handoff package, 294 migrated handoffs, repository-wide generated views, skill consumer updates and runtime sync
    next_action: none
  - stage: VERIFY
    status: IN_PROGRESS
    entry_evidence: focused framework suite, compileall, generated-index and repository-invariant commands
    exit_evidence: 39 framework tests pass; compileall, runtime sync, index --check and validate --all pass
    attempt: 1
    stale: false
    result: local framework verification passes on current worktree state
    next_action: add/close remaining cross-skill behavior coverage and run final audit
  - stage: DEBUG_FIX
    status: PENDING
  - stage: REVIEW
    status: PENDING
  - stage: FINAL_VERIFY
    status: PENDING

Gap ledger:
  - gap_id: RECONCILIATION-A-B
    status: OPEN
    severity: MUST_DO
    finding: automated evidence is not sufficient to assert which of 294 canonical Specs remain product-relevant versus superseded/retired; all remain unresolved and no automatic implementation is recommended
    root_cause: source references and prose similarity establish candidate evidence only; runtime/deployment/product authority is not encoded comprehensively
    recovery: improve evidence-backed classification, then publish a consolidated human decision set for the genuine unresolved cases
    owner: current task
    next_action: complete review passes and classification/evidence mapping before final completion
  - gap_id: REVIEW-CONVERGENCE
    status: OPEN
    severity: MUST_DO
    finding: required ten or more distinct review passes are not yet recorded
    owner: current task
    next_action: execute and record distinct review passes; close actionable findings with focused tests

Completion invariants:
  all_mandatory_stages_closed: false
  no_open_must_do_gap: false
  no_stale_required_gate: true
  review_converged: false
  final_verify_fresh: false

Durable worktree: `/home/dev/.codex/worktrees/canonical-spec-handoff-reconciliation` on `codex/canonical-spec-handoff-reconciliation`.
Primary checkout preservation: `/home/dev/projects/SmartSpecPro` remains untouched by this task; extensive pre-existing dirty work remains there.

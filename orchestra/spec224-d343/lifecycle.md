# Orchestra Lifecycle

Goal: recover persisted terminal Runner receipts into canonical DevelopmentRun state after process interruption without duplicate side effects.
Scope/risk: medium/high.
Current stage: REVIEW
Resume from: REVIEW
Stop reason: implementation complete; focused verification passed; broader certification remains deferred
Mandatory stages: PLANNING, TDD_DESIGN, IMPLEMENT, VERIFY, DEBUG_FIX, REVIEW, FINAL_VERIFY

Stage ledger:
  - stage: PLANNING
    status: COMPLETE
    entry_evidence: D3.42 checkpoint f225ca0d61ccce27349e2a803ff52bcd879ede93
    exit_evidence: orchestra/spec224-d343/plan.md
    attempt: 1
    stale: false
    next_action: None
  - stage: TDD_DESIGN
    status: COMPLETE
    exit_evidence: Focused regression tests were added and run RED before implementation.
  - stage: IMPLEMENT
    status: COMPLETE
    exit_evidence: Durable continuation intent, reconciler hook, fencing, conflict audit and unknown-outcome review are implemented.
  - stage: VERIFY
    status: COMPLETE
    exit_evidence: 69 focused unit tests and 5 PostgreSQL 15.17 child-process tests passed; git diff --check passed.
  - stage: DEBUG_FIX
    status: COMPLETE
    exit_evidence: Fixed persisted receipt-type mismatch and concurrent settlement deadlock found by PostgreSQL tests.
  - stage: REVIEW
    status: IN_PROGRESS
    next_action: Review scoped diff and finalize D3.43 commit.
  - stage: FINAL_VERIFY
    status: PENDING

Gap ledger:
  - gap_id: GAP-1
    discovered_at_stage: PLANNING
    earliest_affected_stage: TDD_DESIGN
    classification: MUST_FIX
    severity: HIGH
    condition: Persisted Runner completion/ACK can precede DevelopmentRun reconciliation, and the periodic canonical reconciler does not scan durable Spec 224 continuation work.
    evidence: apps/web/server/routes/runnerControl.ts calls recordRunnerReceipt, then separate completeExternal/failExternalWait, then ACK; only explicit phase controller callers invoke DevelopmentRun reconcile.
    owner: conductor
    action: Add receipt-bound durable continuation intent and hook it into existing job reconciler with restart/idempotency tests.
    attempts: 2/3
    stale_gates: [VERIFY, REVIEW, FINAL_VERIFY]
    status: CLOSED
    resume_from: REVIEW
    residual_risk: External provider dispatch for the next phase must remain behind current approval, budget, workspace, Runner, and outbox policy.

Completion invariants:
  all_mandatory_stages_closed: false
  no_open_must_do_gap: true
  no_stale_required_gate: true
  review_converged: false
  final_verify_fresh: false

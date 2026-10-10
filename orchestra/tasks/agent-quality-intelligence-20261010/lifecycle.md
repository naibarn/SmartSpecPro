# WorkUnit Lifecycle

Goal: add evidence-based progress intelligence to the existing agent runtime without duplicating its lifecycle, persistence, queue, or authorization systems.
Scope/risk: medium-to-large cross-service slice / high correctness and tenant-isolation risk.
Current stage: FINAL_VERIFY
Resume from: FINAL_VERIFY
Stop reason: active
Mandatory stages: PLANNING, TDD_DESIGN, IMPLEMENT, VERIFY, DEBUG_FIX, REVIEW, FINAL_VERIFY

Stage ledger:
  - stage: PLANNING
    status: COMPLETE
    entry_evidence: task request, repository policy, current specs and runtime source
    exit_evidence: `plan.md`, `decisions.md`, `capability-matrix.md`
    attempt: 1
    stale: false
  - stage: TDD_DESIGN
    status: PARTIAL
    entry_evidence: `test-design.md`
    exit_evidence: 29 focused tests authored; Vitest runner unavailable, so assertion-level RED/GREEN remains pending
    attempt: 1
    stale: false
  - stage: IMPLEMENT
    status: COMPLETE
    exit_evidence: pure evaluator and optional trusted-context team projection seam
  - stage: VERIFY
    status: PARTIAL
    exit_evidence: Node TS-strip behavioral smoke, syntax checks, and diff check; Vitest/typecheck unavailable/not run
    next_action: rerun focused package tests when dependencies are available
  - stage: DEBUG_FIX
    status: COMPLETE
    exit_evidence: ten review rounds and recorded fixes in `review-findings.md`
  - stage: REVIEW
    status: COMPLETE
    exit_evidence: `review-findings.md`
  - stage: FINAL_VERIFY
    status: PARTIAL
    next_action: promote safe partial checkpoint; schedule live instrumentation, normative spec updates, focused Vitest, and UAT as follow-up

Gap ledger:
  - gap_id: GAP-1
    discovered_at_stage: PLANNING
    earliest_affected_stage: PLANNING
    classification: MUST_DO_NOW
    severity: HIGH
    condition: No generic progress trajectory evaluator is integrated into current AgentRuntime, while existing trace/evidence contracts are available.
    evidence: targeted source/spec searches recorded in `capability-matrix.md`
    owner: conductor
    action: add pure evaluator and safe runtime projection
    attempts: 0/3
    stale_gates: []
    status: PARTIAL
    resume_from: FINAL_VERIFY
    residual_risk: production event producers and user-facing Task Control remain follow-up scope
    root_cause: existing schemas preserve correlated runtime traces but do not derive evidence-weighted progress health
    decision_class: FIX_NOW
    attempted_strategies: [reuse existing events and evidence records]
    prohibited_retries: [create a second state machine, DB, queue, or mandatory PandaProbe dependency]
    waiting_predicate: none
    reactivation_predicate: none
    progress_delta: isolated canonical task workspace and owner map established

Completion invariants:
  all_mandatory_stages_closed: false
  no_open_must_do_gap: false
  no_stale_required_gate: false
  review_converged: true
  final_verify_fresh: false
  checkpoint_classification: CHECKPOINT_PROMOTED_PARTIAL_PENDING_INTEGRATION

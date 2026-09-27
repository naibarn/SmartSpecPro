# Orchestra Lifecycle

Goal: Make receipt ACK and replay decisions depend on durable canonical job-event evidence.
Scope/risk: medium/high.
Current stage: FINAL_VERIFY
Resume from: FINAL_VERIFY
Stop reason: active
Mandatory stages: PLANNING, TDD_DESIGN, IMPLEMENT, VERIFY, DEBUG_FIX, REVIEW, FINAL_VERIFY

Stage ledger:
  - stage: PLANNING
    status: COMPLETE
    entry_evidence: D3.41 report and verified Git baseline
    exit_evidence: orchestra/spec224-d342/plan.md
    attempt: 1
    stale: false
    next_action: Implement failing focused tests
  - stage: TDD_DESIGN
    status: COMPLETE
    entry_evidence: orchestra/spec224-d342/plan.md
    exit_evidence: orchestra/spec224-d342/test-design.md
    attempt: 1
    stale: false
    next_action: Implement durable receipt gate and replay validation
  - stage: IMPLEMENT
    status: COMPLETE
    exit_evidence: Six scoped application/test files changed; canonical worker_job_events remains the only receipt ledger.
  - stage: VERIFY
    status: COMPLETE
    exit_evidence: 5 focused Vitest files, 84/84 tests; git diff --check PASS.
  - stage: DEBUG_FIX
    status: COMPLETE
    exit_evidence: Durable retries and replay conflicts covered; final focused run green.
  - stage: REVIEW
    status: COMPLETE
    exit_evidence: Conductor performed a separate diff/source review; no subagent runtime was available.
  - stage: FINAL_VERIFY
    status: COMPLETE
    exit_evidence: Implementation commit ffc4638d2; focused 84/84 pass; diff check pass; post-commit scoped worktree clean.

Gap ledger:
  - gap_id: GAP-1
    discovered_at_stage: PLANNING
    earliest_affected_stage: TDD_DESIGN
    classification: MUST_FIX
    severity: HIGH
    condition: Receipt cursor may advance before durable receipt persistence; event-key replay does not validate the prior content.
    evidence: WSS handler in apps/web/server/routes/runnerControl.ts mutates `receiptStates` before `recordRunnerReceipt`; jobControlPlane.ts returns duplicate on idempotency-key existence alone.
    owner: conductor
    action: Add RED tests and make canonical event persistence the ACK gate.
    attempts: 1/3
    stale_gates: [VERIFY, REVIEW, FINAL_VERIFY]
    status: CLOSED
    resume_from: FINAL_VERIFY
    residual_risk: PostgreSQL concurrency/restart is untested; crash after persisting a semantic-handshake receipt but before continuation remains dependent on a future durable reconciliation hook. No live Runner or provider proof.

Completion invariants:
  all_mandatory_stages_closed: false
  no_open_must_do_gap: true
  no_stale_required_gate: true
  review_converged: true
  final_verify_fresh: true

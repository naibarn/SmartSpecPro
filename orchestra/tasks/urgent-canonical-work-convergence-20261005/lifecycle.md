# Orchestra Lifecycle — Urgent Canonical Work Convergence

Goal: make safe valuable progress converge continuously into canonical shared state and preserve complete handoffs across session boundaries, following the attached ordered scope.
Scope/risk: project / high.
Current stage: IMPLEMENT
Resume from: P0.2 spec/authority audit
Stop reason: partial checkpoint; P0.1 has a safe candidate, broader implementation remains open.
Mandatory stages: PLANNING, TDD_DESIGN, IMPLEMENT, VERIFY, DEBUG_FIX, REVIEW, FINAL_VERIFY

Stage ledger:
  - stage: PLANNING
    status: IN_PROGRESS
    exit_evidence: attachment decomposed into P0.1–P2 in plan.md; canonical index checked across origin/main and 118 registered worktrees; Spec 282 chosen after local proposals 279–281; implementation-state and authority matrices added. No Spec 269/275 source directory was found in the canonical checkout/current numbered specs; generic Work/Goal mapping remains unresolved and must not be invented.
  - stage: TDD_DESIGN
    status: IN_PROGRESS
    exit_evidence: requirement-to-test matrix covers scenarios A–J; P0.1 shell syntax, JSON structure, and Git fixture cover unmarked/local-only refs, dirty detached worktrees, exact dirty paths, and uniform 14-column TSV output. Runtime scenarios remain pending.
  - stage: IMPLEMENT
    status: IN_PROGRESS
    exit_evidence: P0.1 candidate policy/skills and discovery changes are present; exact dirty paths are included in the candidate inventory. Downstream runtime/UI work remains incomplete.
  - stage: VERIFY
    status: IN_PROGRESS
    exit_evidence: scoped checks pass; `skills/audit-skills.sh` still reports existing agent registry/generated-agent/route expectation failures, recorded in progress.md.
  - stage: DEBUG_FIX
    status: PENDING
    exit_evidence: pending scoped review findings.
  - stage: REVIEW
    status: PENDING
    exit_evidence: pending P0.1 review and later cross-spec/runtime reviews.
  - stage: FINAL_VERIFY
    status: PENDING
    exit_evidence: pending all required implementation and acceptance gates.

Gap ledger:
  - gap_id: CANONICAL-CONVERGENCE-P0-2
    discovered_at_stage: PLANNING
    earliest_affected_stage: PLANNING
    classification: MUST_FIX
    severity: HIGH
    condition: the additive contract and initial authority map exist, but referenced Spec 269/275 sources and generic Work/Goal mapping are still unresolved.
    evidence: latest canonical index ends at Spec 278; all 117 registered worktrees were checked and original dirty checkout holds proposals 279–281; Spec 282 was added as the next collision-free number.
    owner: conductor
    action: locate or formally disposition Spec 269/275 references and map non-development Work/Goal IDs to existing canonical owners before runtime implementation.
    attempts: 0/5
    stale_gates: [planning, test-design, implementation, verification, review]
    status: OPEN
    resume_from: PLANNING
    residual_risk: duplicate or conflicting contract if a number/owner is assumed without path-level audit.
  - gap_id: CANONICAL-CONVERGENCE-P0-5
    discovered_at_stage: VERIFY
    earliest_affected_stage: IMPLEMENT
    classification: MUST_FIX
    severity: HIGH
    condition: candidate inventory is discovered but not semantically reconciled; dirty owners and durable run/task claims remain unaudited.
    evidence: discovery-checkpoint.md and inventory-2026-10-05.tsv show 86 branch-ref records and 118 worktrees, including 27 dirty worktrees with exact dirty paths in 36 inventory records.
    owner: conductor
    action: reconcile unique refs by source path and owner; preserve dirty work; inspect durable job/run records through authorized read-only sources. Do not promote unknown-owner work without an owner decision.
    attempts: 0/5
    stale_gates: [implementation, verification, review]
    status: OPEN
    resume_from: IMPLEMENT
    residual_risk: valuable unique work may remain outside main until semantic ownership review is complete; inventory is discovery evidence, not completed reconciliation.

Completion invariants:
  all_mandatory_stages_closed: false
  no_open_must_do_gap: false
  no_stale_required_gate: false
  review_converged: false
  final_verify_fresh: false

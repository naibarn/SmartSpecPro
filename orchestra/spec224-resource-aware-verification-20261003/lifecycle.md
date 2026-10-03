# Orchestra Lifecycle

Goal: Deliver Phase 0–2 resource-aware verification contracts for Spec 224 and prepare a local commit on the isolated branch.
Scope/risk: medium/high (runtime service contract, durable DB lease, Spec 224 events and migration)
Current stage: FINAL_VERIFY
Resume from: VERIFY
Stop reason: implemented_with_deferred_gap; local commit only, no push/merge authorized in the final scope
Mandatory stages: PLANNING, TDD_DESIGN, IMPLEMENT, VERIFY, DEBUG_FIX, REVIEW, FINAL_VERIFY

Stage ledger:
  - stage: PLANNING
    status: COMPLETE
    entry_evidence: User-approved Phase 0–2 scope and clean worktree at origin/main b8d6c7fd5
    exit_evidence: `plan.md` inventory, architecture decision, and affected paths
    attempt: 1
    stale: false
    next_action: closed
  - stage: TDD_DESIGN
    status: COMPLETE
    entry_evidence: `test-design.md` requirement-to-test matrix
    exit_evidence: Focused resource-control, persistence and migration test cases authored before implementation
    attempt: 1
    stale: false
    next_action: closed
  - stage: IMPLEMENT
    status: COMPLETE
    entry_evidence: Test-first cases
    exit_evidence: Resource sampler/admission/failure/evidence contracts, fenced Drizzle lease store/migration, phase-neutral durable events, AGENTS guidance and Spec 224 §602
    attempt: 1
    stale: false
    next_action: closed
  - stage: VERIFY
    status: BLOCKED
    entry_evidence: Focused command recorded in `test-design.md`
    exit_evidence: `git diff --check` passed; Drizzle JSON/schema/migration/snapshot/journal and import paths cross-checked. Focused Vitest unavailable (`vitest` not installed in isolated worktree).
    attempt: 1
    stale: false
    next_action: Run the three focused Vitest files in a prepared dependency environment
  - stage: DEBUG_FIX
    status: COMPLETE
    entry_evidence: Static review of admission, lease fencing, evidence sanitization, and migration shape
    exit_evidence: Fixed code/baseline/resource distinction, stale/missing sample handling, OOM delta sampling, heartbeat duration validation, secret argument redaction and durable event idempotency. No remaining statically observable must-fix issue found.
    attempt: 1
    stale: false
    next_action: closed
  - stage: REVIEW
    status: COMPLETE
    entry_evidence: Changed-file review round 1
    exit_evidence: Two conductor review passes checked contract/runtime consistency, lease SQL/schema/snapshot, event scope/idempotency, secret handling, and non-impact to Specs 260/262/266; second pass found no additional static finding.
    attempt: 2
    stale: false
    next_action: closed
  - stage: FINAL_VERIFY
    status: BLOCKED
    entry_evidence: Final verification requested before commit/push
    exit_evidence: `git diff --check`, structure/import checks passed; tests and full checks not run as recorded in `plan.md`.
    attempt: 1
    stale: false
    next_action: Commit only to the isolated branch, then report the test environment gap and remaining runtime integration release gate

Gap ledger:
  - gap_id: GAP-1
    discovered_at_stage: PLANNING
    earliest_affected_stage: IMPLEMENT
    classification: MUST_FIX
    severity: HIGH
    condition: No runtime contract for resource-aware verification admission, single FULL lease, resource outcome classification, or evidence existed.
    evidence: Targeted source/spec search recorded in `plan.md`
    owner: conductor
    action: Implement profile sampler/admission, durable fenced lease, safe evidence and phase-neutral durable verification events.
    attempts: 1/3
    stale_gates: []
    status: VERIFIED
    resume_from: none
    residual_risk: Runtime executor must call the new admission service before scheduling verification.
  - gap_id: GAP-2
    discovered_at_stage: VERIFY
    earliest_affected_stage: VERIFY
    classification: BLOCKED
    severity: MEDIUM
    condition: Focused Vitest cannot start because the isolated worktree does not contain Vitest.
    evidence: `pnpm --filter @smartspec/web exec vitest run ...` returned `Command "vitest" not found`.
    owner: environment
    action: Run the recorded focused tests in a dependency-prepared clean worktree; do not install dependencies or run full checks in this task.
    attempts: 1/3
    stale_gates: [focused Vitest]
    status: BLOCKED
    resume_from: VERIFY
    residual_risk: Runtime behavior has static review only; no test pass is claimed.
  - gap_id: GAP-3
    discovered_at_stage: REVIEW
    earliest_affected_stage: IMPLEMENT
    classification: DEFER_OPTIONAL
    severity: HIGH
    condition: The audited codebase has no active production Spec 224 verification executor/caller or Linux/CI certification path.
    evidence: `plan.md` inventory and current Spec 224 runtime call graph
    owner: future Spec 224 runtime integration
    action: Wire admission and event recording into the eventual canonical worker_jobs/outbox verification executor, then certify DB/CI/Linux behavior before enablement.
    attempts: 0/3
    stale_gates: [executor integration, live PostgreSQL, CI runner, Linux cgroup certification]
    status: DEFERRED
    resume_from: IMPLEMENT
    residual_risk: Helpers and migration are available but do not change any active verification invocation yet.

Completion invariants:
  all_mandatory_stages_closed: false
  no_open_must_do_gap: true
  no_stale_required_gate: false
  review_converged: true
  final_verify_fresh: false

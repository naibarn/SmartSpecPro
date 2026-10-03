# Orchestra Lifecycle

Goal: Deliver Spec 224 resource-aware verification profiles and a canonical full-verification admission seam on the isolated branch. Never push or merge to `main` in this task.
Scope/risk: medium/high (worker job contract, persisted events, tenant ownership, and missing execution runtime)
Current stage: FINAL_VERIFY
Resume from: IMPLEMENT
Stop reason: implemented_with_deferred_gap; default full-verification runtime is not configured and focused Vitest dependencies are unavailable
Mandatory stages: PLANNING, TDD_DESIGN, IMPLEMENT, VERIFY, DEBUG_FIX, REVIEW, FINAL_VERIFY

Stage ledger:
  - stage: PLANNING
    status: COMPLETE
    entry_evidence: Clean isolated worktree at origin/main b8d6c7fd5; targeted Phase 4 read-only inventory in `phase4-plan.md`
    exit_evidence: Chose existing `worker_jobs` + outbox and DevelopmentRun transaction; no new queue or migration
    attempt: 2
    stale: false
    next_action: closed
  - stage: TDD_DESIGN
    status: COMPLETE
    entry_evidence: `phase4-test-design.md` requirements matrix
    exit_evidence: RED/GREEN Node tests for resource-only assessment; Vitest persistence/router tests authored but unavailable in this worktree
    attempt: 2
    stale: false
    next_action: closed
  - stage: IMPLEMENT
    status: COMPLETE
    entry_evidence: Phase 0–3 implementation committed; Phase 4 transaction and worker seams identified
    exit_evidence: Added resource assessment, protected request mutation, idempotent phase-neutral event, transaction-scoped canonical job/outbox creation, fixed Node worker registration, and fail-closed NOT_CONFIGURED outcome
    attempt: 3
    stale: false
    next_action: closed for this boundary; reopen when a real workspace runtime is supplied
  - stage: VERIFY
    status: BLOCKED
    entry_evidence: Fresh Node 22 tests and TypeScript syntax-only checks after last code change
    exit_evidence: Runner/resource/registration/job-contract tests passed 11/11; `git diff --check` passed. Vitest, Drizzle, PostgreSQL and full runtime are unavailable; syntax-only parsing is not typecheck evidence.
    attempt: 3
    stale: false
    next_action: Run focused Vitest and live transaction/outbox checks in a dependency-prepared environment
  - stage: DEBUG_FIX
    status: COMPLETE
    entry_evidence: Manual diff and contract review of transaction/idempotency/request scope
    exit_evidence: Fixed event-key sizing/collision risk, validated duplicate request state and expected revision/fence, hashed active dedupe identity, preserved no-phase-attempt behavior
    attempt: 2
    stale: false
    next_action: closed
  - stage: REVIEW
    status: COMPLETE
    entry_evidence: Two targeted conductor review passes over route, persistence, job registration, resource seam, and test coverage
    exit_evidence: Confirmed no second queue/schema, worker registration matches fixed type, default path cannot enqueue without configured runtime, local full command cannot spawn, and admission does not advance phase/attempt
    attempt: 2
    stale: false
    next_action: closed for current contract boundary
  - stage: FINAL_VERIFY
    status: BLOCKED
    entry_evidence: Final targeted test/syntax/diff checks after code and docs edits
    exit_evidence: 11/11 Node tests passed; all changed TS parses with Node strip-types; `git diff --check` passed. Database atomicity and worker execution are not live-certified.
    attempt: 2
    stale: false
    next_action: Bind and verify the actual worker runtime, then run the focused Vitest/PostgreSQL gates

Gap ledger:
  - gap_id: GAP-1
    discovered_at_stage: PLANNING
    earliest_affected_stage: IMPLEMENT
    classification: VERIFIED
    severity: HIGH
    condition: Resource-aware verification admission, single FULL lease, resource outcome classification, and evidence were absent.
    evidence: Phase 0–2 implementation commits and focused resource control tests
    owner: conductor
    action: Implemented resource sampler/admission, fenced lease, evidence, and phase-neutral events.
    attempts: 3/3
    stale_gates: []
    status: VERIFIED
    resume_from: none
    residual_risk: Active worker execution still needs to bind the lease/runtime boundary (GAP-3).
  - gap_id: GAP-2
    discovered_at_stage: VERIFY
    earliest_affected_stage: VERIFY
    classification: BLOCKED
    severity: MEDIUM
    condition: Focused Vitest and live PostgreSQL transaction tests cannot start because Vitest/Drizzle are absent from the isolated worktree.
    evidence: `vitest` and `drizzle-orm` module availability checks returned missing.
    owner: environment
    action: Run focused persistence/router tests and DB outbox transaction checks in a dependency-prepared test environment; do not install dependencies in this task.
    attempts: 1/3
    stale_gates: [focused Vitest, PostgreSQL transaction/outbox]
    status: BLOCKED
    resume_from: VERIFY
    residual_risk: Persistence behavior is statically reviewed and has authored tests but is not runtime-proven.
  - gap_id: GAP-3
    discovered_at_stage: REVIEW
    earliest_affected_stage: IMPLEMENT
    classification: BLOCKED
    severity: HIGH
    condition: No full workspace verification runtime/composition exists. Default request correctly records NOT_CONFIGURED and queues no job; the registered executor is fail-closed and does not fake PASSED.
    evidence: Runtime inventory and Phase 4 default service configuration; no workspace execution runtime is wired to the Node worker.
    owner: Spec 224 runtime integration
    action: Bind a real workspace runtime that fresh-samples worker resources, acquires/heartbeats/releases the Spec 224 FULL lease, executes the allowlisted full profile, and persists evidence/outcome; then exercise the canonical outbox worker.
    attempts: 0/3
    stale_gates: [workspace runtime binding, worker-side resource admission, lease heartbeat/release, live outbox execution]
    status: BLOCKED
    resume_from: IMPLEMENT
    residual_risk: Full verification cannot execute in production through this default path until runtime integration is supplied.

Gap closure:
  must_do_now: none
  should_offer_next: none
  safely_deferred:
    - GAP-2 | reason: isolated worktree lacks test/runtime dependencies and dependency installation is outside scope | residual_risk: medium
    - GAP-3 | reason: workspace runtime is absent from the current architecture/composition | residual_risk: high
  no_action_needed:
    - schema migration | reason: existing worker_jobs/outbox and worker_job_events provide required persistence
    - local full spawn | reason: explicitly prohibited; the CLI remains QUEUE_REQUIRED

Completion invariants:
  all_mandatory_stages_closed: false
  no_open_must_do_gap: true
  no_stale_required_gate: false
  review_converged: true
  final_verify_fresh: false

# Orchestra Lifecycle

Goal: Deliver Phase 0–3 resource-aware verification contracts and the allowlisted command runner for Spec 224, then prepare a local commit on the isolated branch.
Scope/risk: medium/high (runtime service contract, durable DB lease, Spec 224 events and migration)
Current stage: FINAL_VERIFY
Resume from: REVIEW
Stop reason: implementation committed with deferred runtime gates; local branch only, no push/merge authorized in the current scope
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
    entry_evidence: Phase 0–2 resource control commit plus Phase 3 command-profile gap confirmed by read-only inventory
    exit_evidence: Added apps/web allowlist runner for quick/package/integration, command-specific raised memory floor, no-shell spawn, pre-spawn admission and full queue-required response; updated §602
    attempt: 2
    stale: false
    next_action: closed
  - stage: VERIFY
    status: BLOCKED
    entry_evidence: Focused runner tests authored and run with Node 22 built-in test runner
    exit_evidence: Six focused tests passed; full profile CLI returned queue-required with exit 75; `package.json` parsed; `git diff --check` passed. Existing Vitest suite still unavailable (`vitest` not installed in isolated worktree).
    attempt: 2
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
    entry_evidence: Changed-file review round 3 including Phase 3 allowlist and spawn boundary
    exit_evidence: Confirmed command allowlist, path/symlink containment, shell-free spawn, raised package memory floor, serial focused/integration test workers, no local full spawn, and use of existing build-atomic lock without adding global concurrency policy.
    attempt: 3
    stale: false
    next_action: closed
  - stage: FINAL_VERIFY
    status: BLOCKED
    entry_evidence: Current final verification after Phase 3 edits
    exit_evidence: Node runner tests, queue-only CLI check, manifest parse, and `git diff --check` passed; Vitest, PostgreSQL integration, full build/typecheck, and live worker queue certification remain unrun/deferred.
    attempt: 1
    stale: false
    next_action: Run the unavailable Vitest suite and complete canonical-worker/DB/CI/Linux certification before production enablement; Phase 3 local implementation is committed

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
    condition: The audited codebase has no active production Spec 224 verification executor/caller or Linux/CI certification path; the local runner can report that full verification requires queueing but cannot durably enqueue it.
    evidence: `plan.md` inventory and current Spec 224 runtime call graph
    owner: future Spec 224 runtime integration
    action: Wire admission, event/evidence persistence, fencing ownership, and full-profile enqueue into the canonical worker_jobs/outbox verification executor, then certify DB/CI/Linux behavior before enablement.
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

# Orchestra Lifecycle

Goal: Complete a source-backed deep plan and implement all repository-local Spec 215 requirements with at least ten evidence-backed gap review rounds.
Scope/risk: project/high
Current stage: IMPLEMENT
Resume from: IMPLEMENT
Stop reason: active
Mandatory stages: PLANNING, TDD_DESIGN, IMPLEMENT, VERIFY, DEBUG_FIX, REVIEW, FINAL_VERIFY

Stage ledger:
  - stage: PLANNING
    status: COMPLETE
    entry_evidence: user request and Spec 215 v5
    exit_evidence: claude-plan.md, claude-plan-tdd.md, sections/index.md; section checker 12/12 and UI/UX contract checker 12/12 pass; two self-review rounds recorded
    attempt: 1
    stale: false
    next_action: implementation section 01
  - stage: TDD_DESIGN
    status: COMPLETE
    entry_evidence: orchestra/test-design.md and claude-plan-tdd.md
    exit_evidence: requirement-to-test rows cover persistence, dependency admission, idempotency, adapters, policy, security, recovery, and residual proof boundaries
    attempt: 1
    stale: false
    next_action: implement section 01
  - stage: IMPLEMENT
    status: IN_PROGRESS
    entry_evidence: deep_implement_config.json and section manifest 12/12
    exit_evidence: Sections 01–12 have scoped implementation records; local partial code includes durable state, DAG scheduling, compiler/input guards, adapter contract, checkpoints, and control-plane projection. Multiple sections remain incomplete.
    attempt: 1
    stale: false
    next_action: close durable settlement/outbox and unsupported graph, adapter, auth/economics sections or retain explicit owner gates with executable fail-closed paths
  - stage: VERIFY
    status: IN_PROGRESS
    entry_evidence: focused Spec 215 cross-section suites
    exit_evidence: 7 files / 87 tests pass; Drizzle metadata check and diff whitespace check pass; migration not applied
    attempt: 1
    stale: false
    next_action: rerun after the next implementation changes; add DB integration/fault-injection proof where available
  - stage: DEBUG_FIX
    status: IN_PROGRESS
    entry_evidence: review rounds 41–52 found input, scheduler, and control-action gaps
    exit_evidence: fixes landed and current focused cross-section suite passes; database and external-owner gaps remain
    attempt: 1
    stale: false
    next_action: continue with earliest open implementation gap
  - stage: REVIEW
    status: IN_PROGRESS
    entry_evidence: 52 evidence-backed code/spec gap rounds
    exit_evidence: no convergence yet; runtime bootstrap, durable outbox, graph control flow, Spec 225/226, authorization/placement, economics, and release gates remain open
    attempt: 1
    stale: true
    next_action: review each remaining section as implementation advances
  - stage: FINAL_VERIFY
    status: PENDING

Gap ledger:
  - gap_id: GAP-1
    discovered_at_stage: PLANNING
    earliest_affected_stage: IMPLEMENT
    classification: MUST_FIX
    severity: HIGH
    condition: Initial admission is root-only, but run activation, logical rows, canonical job/outbox, and first-root linkage are not atomic and no recovery sweep covers partial admission.
    evidence: workflowStudio router admission and workflowStudioSettlement.ts
    owner: conductor
    action: finish atomic activation/outbox or implement restart reconciliation and fault-injection proof
    attempts: 1/3
    stale_gates: [implementation, verification, review]
    status: OPEN
    resume_from: IMPLEMENT
    residual_risk: none if repaired and verified
  - gap_id: GAP-2
    discovered_at_stage: PLANNING
    earliest_affected_stage: IMPLEMENT
    classification: MUST_FIX
    severity: HIGH
    condition: Logical output/checkpoint/fencing is projected after physical settlement, but the post-commit hook has no durable retry outbox and DB restart/fence tests are absent.
    evidence: workflowStudioSettlement.ts, jobSettlementHooks.ts, Feature 195 completion hook
    owner: conductor
    action: make settlement replayable through durable canonical control-plane state and prove fault recovery
    attempts: 1/3
    stale_gates: [schema, implementation, verification, review]
    status: OPEN
    resume_from: IMPLEMENT
    residual_risk: deployed-data migration requires owner/runtime evidence
  - gap_id: GAP-3
    discovered_at_stage: PLANNING
    earliest_affected_stage: IMPLEMENT
    classification: MUST_FIX
    severity: HIGH
    condition: Workflow job handler fails closed without configured production dispatcher and full 16-type execution adapter coverage is absent.
    evidence: workflowNodeTaskExecutor.ts and jobExecutorRegistry.ts read-only scout
    owner: conductor
    action: wire exact manifest adapter bootstrap and owner preflight integrations, or retain admission closed with explicit release gates
    attempts: 1/3
    stale_gates: [implementation, verification, review]
    status: OPEN
    resume_from: IMPLEMENT
    residual_risk: provider/runtime certification remains external
  - gap_id: GAP-4
    discovered_at_stage: PLANNING
    earliest_affected_stage: PLANNING
    classification: MUST_FIX
    severity: MEDIUM
    condition: Spec 215 §75 incorrectly said Spec 251 was absent; the existing artifact is an untracked draft with registry/owner approval still unverified.
    evidence: Spec 215 §75 now names the draft path and explicitly retains registry/owner approval as a release gate.
    owner: conductor
    action: correct the false absence claim; retain registry/owner acceptance as a gate
    attempts: 0/3
    stale_gates: [cross-spec review]
    status: VERIFIED
    resume_from: IMPLEMENT
    residual_risk: no claim of Creator production conformance without provider gates
  - gap_id: GAP-5
    discovered_at_stage: REVIEW
    earliest_affected_stage: IMPLEMENT
    classification: MUST_FIX
    severity: HIGH
    condition: Router/join/loop/subflow semantics and durable branch expansion are not implemented; non-data channels now fail closed.
    evidence: Section 07 implementation record and compiler channel rejection tests
    owner: conductor
    action: implement persisted graph control-flow state machines or keep those node types unavailable at run admission
    attempts: 1/3
    stale_gates: [implementation, verification, review]
    status: OPEN
    resume_from: IMPLEMENT
    residual_risk: current DAG-only runtime cannot execute all Spec 214 node semantics
  - gap_id: GAP-6
    discovered_at_stage: REVIEW
    earliest_affected_stage: IMPLEMENT
    classification: BLOCKED
    severity: HIGH
    condition: Spec 225/226 human attention, Spec 220/207/229/251 authorization/economics/retrieval/profile owners and production provider/runtime are not wired in this source slice.
    evidence: Sections 08/10/11 implementation records; adapter dispatcher remains unconfigured.
    owner: cross-spec owners
    action: connect approved owner services and supply current integration contracts/evidence; keep unsupported actions fail-closed meanwhile
    attempts: 1/3
    stale_gates: [implementation, verification, review, final-verify]
    status: OPEN
    resume_from: IMPLEMENT
    residual_risk: production workflow admission must remain disabled
  - gap_id: GAP-7
    discovered_at_stage: REVIEW
    earliest_affected_stage: IMPLEMENT
    classification: MUST_FIX
    severity: HIGH
    condition: Workflow input references are content digests without a durable artifact writer/reader; large or sensitive input snapshots are still stored in the run JSON column.
    evidence: Section 03 implementation record; `workflow-input:<digest>` construction in workflowStudioRuntime.ts; workflowStudio router persistence.
    owner: conductor
    action: integrate approved tenant-scoped artifact/encrypted snapshot storage and hydrate it in exact adapter execution context before enabling runs
    attempts: 1/3
    stale_gates: [implementation, verification, review]
    status: OPEN
    resume_from: IMPLEMENT
    residual_risk: actual node adapters cannot reliably resolve workflow input refs and stored input sensitivity is not handled by this runtime slice

Completion invariants:
  all_mandatory_stages_closed: false
  no_open_must_do_gap: false
  no_stale_required_gate: false
  review_converged: false
  final_verify_fresh: false

## Active outcome: AUTONOMOUS_MINI_APP_FACTORY_PROGRAM (2026-10-08)

- Stage: `DEBUG_FIX` → `IMPLEMENT` → `MIGRATE` → `DEPLOY` → `SMOKE` → `UAT`.
- Resume source: `/home/dev/worktrees/mini-app-factory-reset`, reconciled to `origin/main` `526b40b6df8e8aee730aeb7be13bca2a1120b7f1`; canonical user workspace `/home/dev/projects/SmartSpecPro` is clean at the same SHA.
- Completed: Research Notes feature slice, AI/background code, portable package, 0393 disposable-schema/service proof, retryable GitHub recovery, and SPEC-302 partial handoff are integrated. No production migration/deploy/UAT claim.
- New ready work: make the existing local development server usable as an ephemeral loopback-only target backed by a disposable full-schema PostgreSQL DB. The normal `db:migrate` path exposed a wrapped 42P01 failure before Drizzle could bootstrap an empty migration ledger.
- Open gap: clean-database migration receipt path is not yet verified through the normal runner. Earliest stage `DEBUG_FIX`; a focused unit test now captures PostgreSQL error-code traversal through ORM `cause`.
- Runtime safety: production `smartspec-web.service` stays untouched; ephemeral DB binds only `127.0.0.1` and is removed after UAT; do not use retired Docker/OpenSandbox or unconfigured Cloudflare bindings.
- Next action: integrate the focused error-classification fix, retry full normal migrations on the same disposable DB, then seed authenticated synthetic users/projects/App and start the local server only when loopback binding is verified.
- Waiting predicate: if the existing app/server or shared PostgreSQL-pull worker cannot run without production credentials/data, keep only the affected provider/deploy stage in `WAITING_ENVIRONMENT`, continue independent package/action/UI evidence, and record the exact missing variable/capability by name (never its value).
- User outcome remains open until M1–M5 and a reusable persisted Factory pipeline pass; M6 follows when environment permits.

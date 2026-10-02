# Spec 265 / 266 Lifecycle

Goal: Deep-implement Specs 265 and 266 in dependency order and preserve unrelated worktree changes.
Scope/risk: project/high.
Current stage: IMPLEMENT.
Resume from: IMPLEMENT.
Stop reason: active; migration 0381 is applied on the configured local database and registry proposals now persist through protected APIs, while resolver/governance composition, approved research/analysis runtime, product surfaces and production proof remain incomplete.
Mandatory stages: PLANNING, TDD_DESIGN, IMPLEMENT, VERIFY, DEBUG_FIX, REVIEW, FINAL_VERIFY.

Stage ledger:
  - stage: PLANNING
    status: COMPLETE
    entry_evidence: both spec files and grouped section plans/manifests
    exit_evidence: orchestra/spec265-266-progress.md dependency order and section scope
    attempt: 1
    stale: false
    next_action: continue sections 01–08 and 01–07 in dependency order
  - stage: TDD_DESIGN
    status: COMPLETE
    entry_evidence: section test plans and focused contract tests
    exit_evidence: focused tests cover contract parsing, auth, rights, health, geometry, semantic projection, planning and worker seams
    attempt: 1
    stale: false
    next_action: add tests with each new behavior
  - stage: IMPLEMENT
    status: IN_PROGRESS
    entry_evidence: section plans and existing schema-free service groundwork
    exit_evidence: added bounded SourceHealth evaluation, strict direct DataRequirement validation, dense-array parser guards, safe research idempotency canonicalization, tenant/owner scoped project persistence and protected workspace API/UI
    attempt: 3
    stale: false
    next_action: continue schema-free shared registry/resolver/runtime adapters; retain fail-closed research execution until an approved runtime and schema gate exist
  - stage: VERIFY
    status: IN_PROGRESS
    entry_evidence: latest service changes
    exit_evidence: focused current aggregate verification: 32 files / 209 tests passed; scoped `git diff --check` passed for owned files
    attempt: 5
    stale: false
    next_action: continue database-backed fabric repositories and resolver composition on 0381; keep provider execution fail-closed until approved runtime/policy is bound
  - stage: DEBUG_FIX
    status: IN_PROGRESS
    entry_evidence: independent review found request TOCTOU, context-specific index health, and required-dimension policy bounds
    exit_evidence: normalized/deep-frozen research contracts, health-context priority, and requiredDimensions size/density/uniqueness are covered; broad focused suite passes
    attempt: 4
    stale: false
    next_action: re-review each persisted boundary; preserve fail-closed runtime and any new-schema changes while Wave 3/4A remains active
  - stage: REVIEW
    status: COMPLETE
    entry_evidence: independent schema-free gap scout and latest implementation diff
    exit_evidence: independent follow-up confirmed detached deep-frozen requests and scoped health reasons; latest dimension-bound finding fixed and regression tested
    attempt: 3
    stale: false
    next_action: reopen review after the next meaningful implementation slice
  - stage: FINAL_VERIFY
    status: PENDING

Gap ledger:
  - gap_id: GAP-265266-01
    discovered_at_stage: IMPLEMENT
    earliest_affected_stage: IMPLEMENT
    classification: IN_PROGRESS
    severity: HIGH
    condition: 0381 is applied and tenant-scoped project APIs plus pending source/dataset proposal APIs are connected, but authoritative shared-fabric resolver/governance, research execution, and end-to-end rollout remain incomplete.
    evidence: target ledger hash matched 0380 before migration and 0381 afterward; seven tables, sampled constraints/indexes/triggers exist; tenant/worker_jobs/outbox counts are unchanged; focused tests cover project/run persistence, protected project and registry routes; the active schema-owner marker remains in place for future schema edits.
    owner: conductor
    action: continue schema-free resolver/runtime/UI work on 0381; do not add another migration until the active schema owner closes. Keep provider/research execution and rollout gated until server-owned policy and environment proof exist.
    attempts: 1/3
    stale_gates: [shared_fabric_persistence, research_runtime, end_to_end_verification, rollout]
    status: IN_PROGRESS
    resume_from: IMPLEMENT
    residual_risk: Specs remain partial; this was the configured local database, not production. No production readiness is claimed.
  - gap_id: GAP-265266-02
    discovered_at_stage: REVIEW
    earliest_affected_stage: IMPLEMENT
    classification: MUST_DO_NOW
    severity: HIGH
    condition: SourceHealth can only be authoritative when assessments are loaded from server-owned persistence; current evaluator accepts a supplied snapshot.
    evidence: sourceHealth.ts is a pure evaluator and no durable health history/composition exists yet.
    owner: conductor
    action: implement persisted server-owned health history and resolver composition on 0381; keep production offers fail-closed until the complete source/rights policy path exists.
    attempts: 1/3
    stale_gates: [persistence, resolver_runtime, end_to_end_verification]
    status: IN_PROGRESS
    resume_from: IMPLEMENT
    residual_risk: Pure resolver fixtures are not live source-health evidence.
  - gap_id: GAP-265266-03
    discovered_at_stage: REVIEW
    earliest_affected_stage: IMPLEMENT
    classification: MUST_FIX
    severity: HIGH
    condition: ResearchRequest and DataRequirement parsers returned caller-owned nested references, allowing mutation after request hashing.
    evidence: independent review; mutation-after-return regression now passes in researchContracts.test.ts and researchAdapter.test.ts
    owner: conductor
    action: completed independent review, fixed follow-up findings and passed fresh broad focused verification
    attempts: 2/3
    stale_gates: [review, broad_verification]
    status: CLOSED
    resume_from: IMPLEMENT
    residual_risk: none identified in the reviewed parser boundary
  - gap_id: GAP-265266-04
    discovered_at_stage: IMPLEMENT
    earliest_affected_stage: IMPLEMENT
    classification: MUST_FIX
    severity: HIGH
    condition: Registry resolver could accept ambiguous duplicate record IDs, oversized catalogs, malformed rights enums, or sparse capability lists.
    evidence: resolver regression tests cover duplicate IDs, malformed cache policy, oversized source catalog, invalid source visibility, invalid index policy and sparse semantic capabilities.
    owner: conductor
    action: closed with bounded catalog and selected-record policy validation; focused tests pass.
    attempts: 1/3
    stale_gates: []
    status: CLOSED
    resume_from: IMPLEMENT
    residual_risk: snapshot remains supplied by caller until durable server-owned registry composition is implemented
  - gap_id: GAP-265266-05
    discovered_at_stage: IMPLEMENT
    earliest_affected_stage: IMPLEMENT
    classification: MUST_FIX
    severity: HIGH
    condition: Source identity, candidate validation and dependency-aware corroboration contracts were absent, allowing repost/summary volume to appear independent if consumed naively.
    evidence: researchAdmission.test.ts covers canonical URL query identity, explicit provider/dataset match recommendation, provenance retention, immutable validation, repost root collapse, unknown dependencies, cycles and derived-claim observation rejection.
    owner: conductor
    action: closed the pure contract/evaluator slice; next wire admitted candidates and corroboration against trusted records after persistence/schema ownership clears.
    attempts: 1/3
    stale_gates: [persistence, admission_router, trusted_identity_resolution, end_to_end_verification]
    status: CLOSED
    resume_from: IMPLEMENT
    residual_risk: this evaluator does not load trusted records or authorize merges; independent-root output is not proof of truth or authority
  - gap_id: GAP-265266-06
    discovered_at_stage: REVIEW
    earliest_affected_stage: IMPLEMENT
    classification: MUST_FIX
    severity: MEDIUM
    condition: registry insert paths treated every database error as an immutable replay conflict, concealing connectivity and service failures.
    evidence: regression tests simulate PostgreSQL unique conflict code 23505 and non-conflict connection error 08006.
    owner: conductor
    action: fixed in registryPersistence.ts; only unique conflicts enter replay resolution and other errors propagate to the protected router's generic service error mapping.
    attempts: 1/3
    stale_gates: []
    status: CLOSED
    resume_from: IMPLEMENT
    residual_risk: database driver error wrapping may change; unique detection follows at most five `cause` links and remains fail-closed for unknown errors.

Completion invariants:
  all_mandatory_stages_closed: false
  no_open_must_do_gap: false
  no_stale_required_gate: false
  review_converged: false
  final_verify_fresh: false

# Spec 224 Implementation-First Campaign

Status: `IN_PROGRESS`
Created: 2026-09-26
Worktree: `/home/dev/projects/SmartSpecPro-spec224-solo-fastlane`
Branch: `codex/spec224-solo-fastlane-20260926`

## Frozen development baseline

- Base commit: `447ca9d5259e48017406b973dbf5090d70dd17e4` (`main`, same as `origin/main` at capture).
- Canonical development Spec path: `specs/feature/224-Autonomous Development Orchestrator Runtime/spec.md`.
- SHA-256: `83c47d91871965d48f6d67f7ec3876fe37e0727061ca3b982f2ad5d0991e3793`.
- The tracked file itself is the baseline. Its opening revision label and appended revision markers are not perfectly aligned; for this development campaign, identity is the exact file hash, not a reconstructed or inferred revision sequence. Appended text present in these exact bytes is included; no external amendment is silently imported.
- D3.22 Option 3 proposal SHA-256: `0c34fe63e4297f1adde1936fe1884fa32d6b69d4546b1604ce298554ee27687e` (architectural direction only; not final design admission).
- Historical v6 receipt is historical only and is not evidence for this candidate.

## Development authority and boundaries

The owner's 2026-09-26 directive authorizes ordinary source/test/development dependency work in this isolated branch. This is not P-SOURCE, P-RECOVERY, migration certification, provider approval, production approval, or a claim that a system gate passed. No shared worktree changes are imported. One writer (Lead) owns this branch; reviewers are read-only. Never run the rejected D3.19 harness. TypeScript typecheck remains `SKIPPED_POLICY`.

Campaign validation policy: implementation-time syntax, import/module resolution, and focused interface/configuration checks only. Comprehensive unit, integration, E2E, performance, migration, and production campaigns are deferred to the coordinated validation phase. Completed code is labeled `IMPLEMENTED_UNVERIFIED` until that phase.

## Cross-Spec dependency DAG

Edges below mean a consumer depends on the producer's canonical contract; they do not transfer authority or imply production readiness.

```text
Feature 186 worker_jobs + outbox
  └─> Feature 195 unified execution authority / Runner control
        ├─> Spec 200 external-agent gateway (no second queue)
        └─> Spec 207 economic binding (no second job authority)

Spec 222 advisory development fabric ───────────┐
Feature 186 / Feature 195 / Spec 200 / Spec 207 ├─> Spec 224 DevelopmentRun,
                                                │   requirement DAG and Final Verify
                                                └─> Spec 226 canonical device/UI bridge

Feature 186 + Feature 195 ──> Spec 245 Cloudflare migration (owned by another session)
Spec 224 ────────────────────> Spec 245 integration consumers (contract dependency only)
```

Source evidence is the tracked Spec 186 §1/§2 (canonical `worker_jobs`/outbox boundary), Feature 195 §§1–3 (durable execution truth), Spec 200 §§1–2 (external-agent control consumes Feature 195), Spec 207 §5.1 (economic controls bind to jobs without replacing them), Spec 222 §§1–3 (advisory layer cannot own execution), Spec 224 §§1–2 and the explicit dependency table, Spec 226 §§1–3 (additive projection/bridge), and Spec 245 §§1–3 (Cloudflare migration keeps the existing canonical job authority). The narrower import-level DAG for WP-REQ-01 is: SpecBaseline → RequirementClosureContracts → RequirementClosurePersistence → FinalVerify/DevelopmentRunPersistence; persistence reuses `DevelopmentRunPersistenceAdapter`, its transaction/event/fence boundary, and existing `worker_jobs`/`worker_job_events`.

## Work-package ordering and admission

| Order | Workpackage                                                                         | Dependency                                            | Status                              | Implementation boundary                                                                                                                                                                                                                 |
| ----: | ----------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | WP-AUTH-01 — freeze exact development Spec bytes                                    | Owner directive + tracked baseline                    | `COMPLETE_DEV_BASELINE`             | This record only; no authenticated P-SOURCE claim                                                                                                                                                                                       |
|     2 | WP-REQ-01 — deterministic baseline, requirement closure, DAG and blocker provenance | WP-AUTH-01; canonical job/run persistence             | `IMPLEMENTED_UNVERIFIED`            | Closure v2, full PlanSection/WorkPackage fields, derived provenance, complete source manifest inventory, unrequested-change classification and evidence freshness/invalidation are implemented; comprehensive evidence remains deferred |
|     3 | WP-RECOVERY-04 — durable approval continuation                                      | WP-REQ-01 + existing Feature 186/195 services         | `P_RECOVERY_BLOCKED`                | Separate integration package; no P-RECOVERY grant or certification is inferred                                                                                                                                                          |
|     4 | WP-SOURCE-03 — immutable source/dependency bundle                                   | WP-REQ-01 + approved Option 3 final admission         | `P_SOURCE_BLOCKED`                  | Do not run D3.19; no secure-harness execution                                                                                                                                                                                           |
|     5 | WP-DB-05 — economic DB binding                                                      | WP-REQ-01, WP-RECOVERY-04, canonical economic service | `MIGRATION_AND_VALIDATION_DEFERRED` | Code-only adapters may be considered; no production migration/account mutation                                                                                                                                                          |
|     6 | WP-RUNNER-06 — canonical Runner integration                                         | WP-SOURCE-03 + WP-RECOVERY-04 + WP-DB-05              | `DEPENDENCY_BLOCKED`                | No paid provider/live execution                                                                                                                                                                                                         |
|     7 | WP-UI-01 / Spec 226 projection                                                      | Stable WP-REQ-01 and canonical Spec 224 API           | `DEPENDENCY_BLOCKED`                | Use canonical state; no duplicate lifecycle authority                                                                                                                                                                                   |
|     8 | WP-FINAL-07 — independent Final Verify/integration candidate                        | All implementation packages                           | `DEFERRED_TO_INTEGRATION`           | Never mark complete from code-only evidence                                                                                                                                                                                             |
|     9 | Spec 245/232 Cloudflare migration                                                   | Feature 186/195 interfaces                            | `EXCLUSIVE_OTHER_SESSION_OWNER`     | This campaign does not implement, stage, or modify KV/DO/Queues/Worker foundation, migration adapters, or deployment files; consume interfaces only after owner publishes them                                                          |

Blocked packages do not block the independent WP-REQ-01 implementation. Cloudflare implementation is excluded by explicit competing ownership; no migration history, shared database, paid provider, Runner, Cloudflare account, or production target is mutated.

## Implementation-time contract checklist

- Requirement and section identities bind to exact Spec hash/revision/line range.
- Closure inputs cannot smuggle a requirement from a different Spec/revision/baseline.
- Equivalent plans compile to a canonical digest irrespective of input ordering.
- Persisted graphs validate every state, source, mapping, evidence, blocker, and digest before use.
- Final Verify rejects stale, unbound, or caller-forged terminal evidence.
- Source inventories carry baseline/candidate path/hash manifests plus repository/revision/recursive/untracked coverage and a persisted attestation ref; computed manifest digests and derived changed-path sets must match the declared inventory, including additions/deletions.
- PlanSection, WorkPackage, derived-decision and evidence projections are validated as closure-v2 data; closure-v1 remains fail-closed pending the separate recovery/compatibility package.
- PlanSection/WorkPackage and derived-requirement provenance carry the minimum Spec-defined fields.
- Blocker closure is based on current blocker-specific verification evidence, not executor text.
- Persistence remains within the canonical DevelopmentRun / worker_jobs event/fence/idempotency boundary.

Comprehensive tests for these invariants are added/updated with the implementation but are not run during this implementation-first campaign; they remain explicit deferred cases for the consolidated test matrix.

## Latest safe checkpoint — 2026-09-26

- Exact worktree: `/home/dev/projects/SmartSpecPro-spec224-solo-fastlane`.
- Branch/base: `codex/spec224-solo-fastlane-20260926` from `447ca9d5259e48017406b973dbf5090d70dd17e4`.
- Frozen Spec 224 artifact SHA-256 remains `83c47d91871965d48f6d67f7ec3876fe37e0727061ca3b982f2ad5d0991e3793`. Shared repository has independently advanced to `a3154dc94ea1dc01e540b5a0b7d7e47cc29a9b2f` during this session; its current status is clean. That commit/change was not imported, rebased, or modified here.
- Exclusive writer: Lead Agent for this isolated branch. Shared `/home/dev/projects/SmartSpecPro` remains untouched; its Spec 245/232 dirty entries remain owned by the other session.
- Implemented, not verified: requirement IDs now bind Spec/revision/exact source artifact digest/normalized digest/line/text; closure rejects cross-Spec/revision refs and forged identities; requirement, section, package and reverse-map ordering is canonical; persisted graph validation re-derives mappings/states/evidence/blocker schema; DevelopmentRun Final Verify revalidates projection digest and blocker run binding; terminal requirement and blocker evidence refs must already exist on the canonical DevelopmentRun; BlockerLedger now records opener/time/current owner/subrun/resolution/verification/reopen/closure metadata.
- Changed source/tests: `apps/web/server/services/spec224SpecBaseline.ts`, `spec224RequirementClosureContracts.ts`, `spec224RequirementClosurePersistence.ts`, `spec224DevelopmentRunPersistence.ts`, and seven Spec 224 baseline/closure/final-verify test files. Closure projection/graph contract versions are v2; prior v1 persisted closure projections fail closed until a separately scoped compatibility/recovery package handles them. Test files were updated/added but not executed.
- Dependencies: `npm ci --ignore-scripts --no-audit --no-fund` completed using `apps/web/package-lock.json` SHA-256 `1fbc37a45f48cc2bc76ff43d170d5ab8bc03acc063903dba49d1bac7707e15aa`; install is confined to this worktree.
- Actual checks: Spec 224 service import smoke (`node --import tsx ...`) PASS; Prettier on changed baseline/closure source and direct tests PASS; `git diff --check` PASS. Unit/integration/E2E suite NOT RUN by campaign policy. TypeScript typecheck `SKIPPED_POLICY`.
- Uncommitted artifact fingerprint: tracked diff SHA-256 `12d720d97534808eaff325597b25b0a04f42ab9f9cc4d77947f80995d00305f3`; recompute before review/transfer because source is still evolving.
- External interface dependency: none for this WP tranche. Feature 186/195 canonical persistence remains the only runtime adapter; no Cloudflare APIs are referenced. If future integration consumes a Spec 245/232 interface, wait for the exclusive owner to publish its contract rather than implementing it here.
- Unfinished in WP-REQ-01: full PlanSection planning obligations and lifecycle status, richer WorkPackage execution/TDD ownership/write-set contract, explicit derived-requirement provenance records, event-current evidence freshness, and unrequested-change detection. Current persistence uses DevelopmentRun evidence references, which proves run linkage but not cryptographic artifact freshness or independent verification.
- Next executable workpackage: continue WP-REQ-01 in this worktree by adding source-provenance/PlanSection/WorkPackage contract fields and enforcing current-evidence linkage; then proceed to the next independent non-Cloudflare WP only after this compiler/persistence interface is internally coherent. Keep implementation `IMPLEMENTED_UNVERIFIED`; do not claim certification.
- No tests, production systems, shared databases, migrations, Cloudflare resources, providers, Runner, or paid services were executed or mutated. No files staged or committed.

## WP-REQ-01 completion checkpoint — 2026-09-26

- Status: `IMPLEMENTED_UNVERIFIED`; not certified or marked VERIFIED.
- Implemented in this branch: exact Spec artifact identity in requirement IDs; PlanSection and WorkPackage planning/execution/TDD/write-set/approval/evidence fields and admission gaps; derived-requirement origin/classification/decision provenance; baseline/candidate file-hash manifests bound to the unchanged Spec artifact and an explicit repository/revision/recursive/untracked coverage scope; manifest-derived changed-path completeness (including file additions/deletions); unrequested-change classification against mapped parents and declared write sets; requirement and package evidence bindings to Spec baseline and candidate manifest digests; stale evidence invalidation with terminal status downgrade and persisted invalidation refs; accepted derived requirements require active WorkPackage evidence for every declared verification obligation; Final Verify entry points bind all evidence and scanner attestation refs to canonical DevelopmentRun evidence before completion; canonical DevelopmentRun projection-v2 validation and digest/run/evidence binding.
- Closure contract and projection remain v2. v1 remains fail-closed. Compatibility/recovery of v1 data is a separate WP-RECOVERY-04 integration concern and is not silently admitted.
- Minimal checks actually run: Prettier on edited contract/persistence/fixture/test files PASS; Node/tsx import smoke for SpecBaseline, ClosureContracts, ClosurePersistence and DevelopmentRunPersistence PASS; closure-v2 runtime smoke compiling a baseline, complete manifest, requirement/package evidence and Final Verify guard PASS; `git diff --check` PASS. `vitest list` exited 0 but emitted no listing; no tests were executed. TypeScript typecheck `SKIPPED_POLICY`.
- Deferred test requirements: focused compiler tests for missing PlanSection/WorkPackage fields, DAG/cycle/write-set overlap and section barriers; derived ID stability, accepted/rejected decision provenance, missing/wrong parent and amendment refs; complete manifest digest, scope mismatch, omitted/extra path, modified/added/deleted file and unrequested write-set cases; requirement and WorkPackage evidence freshness/invalidation, baseline change and Final Verify rejection; DevelopmentRun persistence/restart/fencing/idempotency with projection v2; closure-v1 fail-closed and separate v1 recovery; cross-tenant, forged refs, stale evidence, and bounded real-spec multi-section closure; all existing Spec 224 regression/integration/E2E/PostgreSQL suites.
- Explicit evidence boundary: the contract binds a source inventory to a recursive/untracked coverage declaration and a persisted attestation evidence ref, but this branch does not implement or cryptographically certify the trusted scanner/attestation issuer. Completeness therefore remains `IMPLEMENTED_UNVERIFIED`; scanner identity/trust and live workspace revalidation remain a separate integration/admission gate (not proof supplied by a caller boolean).
- Exclusive change set is limited to Spec 224 service source/tests plus this campaign checkpoint; no Spec 245/232 Redis/KV/DO/Queues/Worker/binding/deployment files and no shared worktree files are included. No DB, migration, Runner, provider, Cloudflare, production or paid-service operation occurred.
- Next independent candidate: WP-UI-01 / Spec 226 canonical-state projection, subject to a narrow file-ownership check and avoiding migration-owned paths. WP-RECOVERY-04 remains separately `P_RECOVERY_BLOCKED`; no recovery authority is claimed.

# WP-TEST-OBL-01 and WP-UI-02

## Admission evidence

- Canonical Spec 224 SHA-256: `83c47d91871965d48f6d67f7ec3876fe37e0727061ca3b982f2ad5d0991e3793`.
- Source DAG: `orchestra/spec224-solo-fastlane/campaign-plan.md` in WP-REQ-01 commit `1bb9c8ea09e59b3be5789e79e91d756bfd5a9fcf`.
- Existing DAG has WP-REQ-01, WP-RECOVERY-04, WP-SOURCE-03, WP-DB-05, WP-RUNNER-06, WP-UI-01 and WP-FINAL-07. It has no package or persisted type for deferred-test obligations. `WorkPackageRecord.testPlanRefs` is a plan reference only, not a deferral record.
- Integration branch base: common ancestor `447ca9d5259e48017406b973dbf5090d70dd17e4`; WP-REQ-01 and WP-UI-01 are promoted by their exact patches, in separate commits. The other `a3154dc...` ancestry consists of Cloudflare/session changes and is intentionally excluded.
- The Spec 224 bytes match at the common base and both source commits. No Spec 224 spec file is changed by this package.

## Package graph

```text
WP-REQ-01 (closure v2 + canonical run persistence)
  └─> WP-TEST-OBL-01 (versioned deferred-test contract + persistence through existing closure graph/events)
        └─> WP-UI-02 (read-only Task Control projection through Spec 226 bridge)
```

No schema migration, new job/test ledger, test execution authority, queue, or lifecycle state machine is in scope. Closure v2 remains the contract version. Unknown/unsupported closure v1 remains fail-closed.

## WP-TEST-OBL-01 write set

- `apps/web/server/services/spec224RequirementClosureContracts.ts`
- `apps/web/server/services/spec224RequirementClosurePersistence.ts`
- `apps/web/server/services/spec224DevelopmentRunContracts.ts` (typed non-evidence lifecycle events only)
- `apps/web/server/services/spec226DevelopmentControlBridge.ts`
- Focused closure-persistence and Spec 226 bridge contract tests.
- This package record/checkpoint.

Each obligation is scoped to the owning run and authenticated tenant/actor, a requirement, its responsible WorkPackage and the closure baseline's immutable Spec revision/source digests. It records test category/target, deferral reason/environment, monotonic per-obligation version, creation and invalidation timestamp/reason. It never creates passing evidence.

Mutation boundaries: existing `DevelopmentRunPersistenceAdapter` transaction, run revision CAS, fencing version, `worker_job_events`/run event history, and closure projection digest. Duplicate delivery uses the existing idempotency-event boundary.

## WP-UI-02 write set

- `apps/web/client/src/components/chat/UniversalControlPlanePanel.tsx`
- Focused UI contract test if available without broad test execution.
- This package record/checkpoint.

Read-only presentation in the existing Task Control panel: current deferred obligations separated from invalidated history; state must say `DEFERRED` or `INVALIDATED`, never PASS. Keep revision/source digest, test target/category, reason, required environment and WorkPackage visible. No local obligation source or mutation authority.

## Implementation-time test design

| Requirement                                                  | Focused contract smoke                                                                | Full deferred test obligation                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Required references bind to run/requirement/package/baseline | Static import/validation smoke with valid + mismatched bindings                       | Compiler/service unit cases for wrong run, wrong tenant, unknown requirement/package, wrong baseline digest/revision |
| Stable version and invalidation                              | Smoke one record, invalidate, then superseding version                                | Duplicate callbacks, concurrent CAS, restart/reload, version monotonicity and full event provenance                  |
| No pass evidence                                             | Inspect projected record and evidence arrays                                          | Final Verify rejects deferred or invalidated obligation as verification evidence                                     |
| Bridge/UI projection                                         | Import/type/syntax check and inspect canonical read projection                        | tRPC router tests, UI state tests, browser responsive/accessibility review                                           |
| Compatibility                                                | v1 fixture is rejected; legacy v2 digest remains unchanged when optional field absent | Existing closure-v2 persistence/final-verify regression matrix                                                       |

Execution policy: full Vitest, browser, integration, restart/concurrency and regression suites remain deferred. Typecheck is `SKIPPED_POLICY`.

## Status

- Isolated worktree: `/home/dev/projects/SmartSpecPro-spec224-obligations-integration`; branch `codex/spec224-deferred-obligations-integration-20260926`.
- Push evidence: GitHub `refs/heads/main` was verified at `585c2424414b74a8ec782d21f55b9bacfae62e58` after a non-force fast-forward push.
- Shared checkout `/home/dev/projects/SmartSpecPro` was not modified or staged; it remains behind remote and contains unrelated uncommitted work from concurrent sessions.
- WP-TEST-OBL-01: `IMPLEMENTED_UNVERIFIED` after typed contract, versioned persistence, audit events, baseline invalidation, and Spec 226 canonical projection.
- WP-UI-02: `IMPLEMENTED_UNVERIFIED`, committed separately after the canonical backend projection.
- Integration commits on `main`: WP-TEST-OBL-01 `a341bdfb0`; WP-UI-02 `585c2424414b74a8ec782d21f55b9bacfae62e58`. Promoted WP-REQ-01 and WP-UI-01 commits are `7bcee4f60` and `4af1689e7`; their implementation was not reopened.
- Bounded evidence on candidate `585c2424`: focused Vitest selection `-t deferred` passed (5 passed, 8 skipped across two files), including post-rebase rerun; TypeScript `transpileModule` syntax checks passed; `git diff --check` passed. Prettier check passed on backend/tests/docs; the UI file's pre-existing unrelated formatting was restored afterward to keep the UI commit scoped.
- Deferred: complete unit/integration/regression suites, restart/concurrency/DB-backed cases, browser/responsive/accessibility tests, production migration/provider/Runner certification. Typecheck remains `SKIPPED_POLICY`.
- Exact Spec 224 SHA-256 remains `83c47d91871965d48f6d67f7ec3876fe37e0727061ca3b982f2ad5d0991e3793`; closure v2 is preserved and v1 remains fail-closed.
- DAG has no next independent `READY` package: WP-RECOVERY-04 is `P_RECOVERY_BLOCKED`, WP-SOURCE-03 is `P_SOURCE_BLOCKED`, WP-DB-05 is migration/validation-deferred and depends on recovery, WP-RUNNER-06 depends on source/recovery/DB, and WP-FINAL-07 depends on all implementation packages. Next executable package is WP-RECOVERY-04 only after its separate recovery authorization; otherwise WP-SOURCE-03 requires its own source admission.
- No migration, database mutation, Runner/provider execution, Cloudflare implementation, or production operation occurred. Integration candidate is not release certification.

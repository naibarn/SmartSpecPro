# Workunit B — DevelopmentRun Eligibility Contract

**State:** `IMPLEMENTED_UNWIRED`
**Source:** `a6cf3d5efc8f8ae93b67946fdf93941af0ec25f4` plus this task delta
**Contract:** `development-run-eligibility.v1`

## Delivered

- Added a deterministic, versioned advisory evaluator for a canonical durable SPEC-224 DevelopmentRun.
- Bound eligibility to tenant, run ID/state, workunit/project/repository, current canonical source revision, verified ownership receipt, dependency receipt, and freshness window.
- Reused the existing lifecycle predicate registry and watcher contract. Missing adapters/watchers fail closed; unresolved capability dependencies map to `WAITING_AUTHORITY`.
- Added 16 focused tests, including malformed ownership data, stale and cross-tenant/run/owner evidence, future/expired evidence, predicate/watcher absence, dependency states, deterministic evidence ordering, and the SPEC-038 blocked continuation regression.
- The evaluator has no persistence, dispatch, grant, approval, lease, budget, or ledger side effects. `READY` is advisory and cannot authorize execution.

## Verification

- Focused Vitest: `16 passed` (`apps/web/server/services/__tests__/developmentRunEligibility.test.ts`).
- Test run used the existing canonical dependency tree via a temporary symlink; the symlink was removed after execution. No dependency install was performed.
- No full build/typecheck was run.

## QA/review passes

1. Contract version and state enum are stable and explicit.
2. Result always carries `advisory: true`.
3. Missing durable run cannot become READY.
4. Tenant and run identities are checked against the loaded run.
5. Run lifecycle state is allowlisted.
6. Workunit/project/repository/actor binding is required.
7. Source revision must equal canonical workunit revision; old receipts are stale.
8. Ownership evidence is bound to tenant/run/workunit/owner/revision.
9. Ownership expiry and future verification timestamps fail closed.
10. Conflicting owners produce `OWNERSHIP_CONFLICT`.
11. Dependency evidence is bound to its tenant/run/workunit/source/dependency contract.
12. Stale, future, missing, duplicate, and unbound dependency evidence cannot satisfy a dependency.
13. Predicate registry and watcher availability are required.
14. Capability dependencies remain `WAITING_AUTHORITY`; ordinary pending dependencies remain `WAITING_DEPENDENCY`.
15. Evidence and reason ordering is deterministic.
16. Malformed ownership/evidence collection shapes fail closed; SPEC-038's blocked continuation remains ineligible absent a durable run.

## Boundary / next action

This contract is intentionally not wired into `spec224RuntimeAdmission.ts`. Workunit A found no production remote source-trust verifier, trusted issuer/root, or freshness/revocation authority. Workunit C is therefore `BLOCKED_AUTHORITY_UNAVAILABLE`; the protected deny-only path remains unchanged. Before integration, obtain the exact-SHA evidence for the claimed Lane 2-2 production DevelopmentRun path and an approved remote trust-verifier contract, then have Lane 1 remain the sole writer for runtime admission.

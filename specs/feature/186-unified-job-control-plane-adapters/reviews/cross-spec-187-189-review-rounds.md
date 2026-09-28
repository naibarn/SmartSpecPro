# Cross-spec 186–189 Review Ledger

**Review date:** 2026-09-14
**Scope:** Feature 186 implementation and its declared integration boundaries
with Features 187, 188, and 189.
**Review mode:** conductor-owned sequential review; local repository evidence
only.
**Important limitation:** a passing local check cannot prove a staging,
production, provider, Cloudflare-account, or PITR gate.

This ledger records twenty prior review passes plus five additional passes
completed on 2026-09-14. A `PASS` means the
contract or local guard is present. A `FIXED` means a gap was found and changed
during this review. A `BLOCKED` means the requirement is intentionally not
claimed as complete because its owning feature is still proposed or requires
external evidence.

| # | Review surface | Result | Evidence / action |
|---:|---|---|---|
| 01 | Feature ownership and dependency order | PASS | 186 owns the canonical job boundary; 189 owns tenant identity/transfer; 187 prepares promotion; 188 owns production activation. |
| 02 | Shared canonical job identity | PASS | All three documents preserve `worker_jobs.id`; no parallel generic job ledger was introduced. |
| 03 | Feature 186 migration journal anchor | PASS | Current Feature 186 journal sequence ends at `0315`; the verifier derives the next feature migration numbers from the journal. |
| 04 | Feature 189 migration numbering | FIXED | Replaced stale/colliding `0307_feature_189...` references with `0316_feature_189_tenant_identity_and_data_transfer.sql`. |
| 05 | Feature 188 migration numbering | FIXED | Replaced stale/colliding `0306_feature_188...` references with the next available `0318_feature_188_platform_operations.sql`, after Feature 189 schema migration `0316` and backfill completion `0317`. |
| 06 | Feature 187 cutover ownership | PASS | Feature 187 explicitly prepares and hands off `CUTOVER_CANDIDATE`; it does not own production activation. |
| 07 | Feature 188 activation ownership | PASS | Feature 188 is the activation owner, but its current `PROPOSED` status keeps production activation disabled. |
| 08 | Feature 189 second-ledger prohibition | PASS | Feature 189 explicitly forbids a second generic jobs ledger and consumes Feature 186's canonical job contract. |
| 09 | Authenticated tenant context source | FIXED | Central request context now resolves the authenticated account's `currentTenantId`; a public host tenant is not an authenticated authority. |
| 10 | Protected host-tenant override paths | FIXED | Local upload, storage proxy, and approved vertical-drama routes now use authenticated account context and fail closed when it is missing. |
| 11 | Internal agency tenant assertion | FIXED | The body `tenantId` is now an assertion checked against the DB-bound account tenant, not a selector that can override it. |
| 12 | Tenant-context regression coverage | PASS | Focused tenant-context tests cover account-over-host precedence, missing binding, and unauthenticated public-host behavior. |
| 13 | Feature 189 runtime implementation | PASS (local) | Transfer handlers, guarded identity move, transfer router/UI, executor registry, session revocation, and additive migrations are present; verifier reports `runtimeMissingFiles: []`. The rollout remains disabled pending external evidence. |
| 14 | Feature 189 rollout manifest truthfulness | FIXED | Manifest now states `PROPOSED / NOT_ENABLED` and requires immutable evidence links before any flag is enabled. |
| 15 | Feature 187 handoff evidence | BLOCKED | No accepted `CUTOVER_CANDIDATE` package/evidence is present; this remains a Feature 187 preparation gate. |
| 16 | Feature 188 activation evidence | BLOCKED (correct) | Admin operations, promotion binding/fencing, and activation guards exist locally, but no accepted target identity, final fence, rollback, or production evidence is present; activation remains disabled. |
| 17 | Feature 186 producer boundary | PASS | Current audit reports 0 unowned direct transport producers, 47 adapter-owned submissions, and 0 unmigrated side-effecting producers. |
| 18 | Feature 186 compatibility drain | BLOCKED | Three rollback-only legacy transport calls and seven compatibility status readers remain; retirement evidence is not claimed. |
| 19 | Lifecycle/recovery/external gates | BLOCKED | Local contract checks exist, but provider recovery, deployment identity/restart proof, PITR rehearsal, and Cloudflare target-account proof are external gates. |
| 20 | Final convergence and honesty of readiness | PASS | Structural verifier and focused tests pass; `productionReady` remains false while the blockers above exist. |
| 21 | Feature 187 to Feature 188 handoff gate | FIXED | Added required `feature_187_cutover_candidate` and `feature_189_tenant_auth` gates to the Feature 188 readiness contract, runbook, specification, and contract test. |
| 22 | Feature 189 transfer-command evidence | FIXED | `approve`, `resume`, `resolveItem`, and `cancel` now persist tenant-scoped action records with expected status/attempt/fencing snapshots and stable command target hashes. |
| 23 | Feature 189 canonical job/admission boundary | FIXED | Transfer approval now uses the Feature 186 transaction port; the port enforces admission and the approval path follows global/class -> tenant -> user lock ordering. |
| 24 | Local migration and contract verification | PASS (local) | `npm run db:migrate` succeeded; Feature 189/188 migration tags and session-revocation schema are present; focused contract runs passed. |
| 25 | Final readiness truthfulness | BLOCKED (correct) | `verify:feature-186` returns `ok: true` and `productionReady: false`; remaining blockers are legacy drain, Feature 187 candidate evidence, external recovery/deployment/PITR/Cloudflare proof, and disabled Feature 189 rollout. |

## Changes made during this review

- Serialized Feature 189's planned migration after the current Feature 186
  journal as `0316_feature_189_tenant_identity_and_data_transfer.sql`.
- Serialized Feature 188's planned migration after Feature 189 as
  `0318_feature_188_platform_operations.sql`.
- Added cross-feature structural checks to the Feature 186 verifier for stale
  migration references, next-migration declarations, ownership boundaries,
  authenticated tenant-context guards, and Feature 189 readiness.
- Hardened the authenticated tenant boundary in the central web context and
  the identified protected Express routes; added focused regression tests.
- Marked Feature 189's rollout manifest explicitly as implemented locally/not
  enabled so local code cannot be mistaken for staging or production evidence.
- Added Feature 187/189 readiness gates to Feature 188 activation validation.
- Added durable Feature 189 action snapshots and cross-tenant-safe finalization.
- Added the Feature 186 transaction-port admission check used by transfer
  approval and fixed its lock ordering.

## Remaining blockers accepted by this review

These are not silently closed because doing so would make the specification
claim more than the repository proves:

1. Feature 189 local implementation and schema are present, but staging/
   production migration, browser, execution, and deployment evidence remain
   required before enabling its rollout flags.
2. Feature 187 still requires an accepted immutable `CUTOVER_CANDIDATE`
   handoff and staging promotion/recovery evidence.
3. Feature 188 local admin operations/cutover guards are present, but target
   identity and Hyperdrive proof, production fence, rollback/forward-repair
   proof, and legacy-retirement evidence remain required.
4. Feature 186 still has rollback-only legacy transport/status compatibility,
   domain projection/checkpoint retirement, provider recovery, deployment
   restart identity, PITR/restore, and Cloudflare target-account gates.

The local verifier is therefore expected to report `ok: true` with
`productionReady: false` until the owning evidence is actually supplied.

## Verification executed

- `cd apps/web && npm run verify:feature-186` — PASS (`ok: true`,
  `crossFeatureStructuralFindings: []`, `productionReady: false` with the
  blockers listed above).
- `cd apps/web && FEATURE_186_HARD_CUTOVER=true FEATURE_186_POSTGRES_PYTHON_WORKER=true npm run audit:feature-186-call-sites` — PASS
  (0 unowned direct transport calls, 47 adapter-owned submissions, 0
  unmigrated side-effecting producers, 0 unowned status readers, 7 explicit
  compatibility readers, 3 rollback-only legacy transport calls).
- Focused web tests in the current five-pass review — PASS, 6 files and 49
  tests, plus a separate 7-file/22-test migration/auth/promotion run (some
  files overlap).
- No npm TypeScript/type-check command was run in the current review because
  the requested environment has insufficient RAM.
- Cross-spec invariant smoke loop — PASS, 20/20 repeated checks covering the
  review ledger, migration numbering, stale-reference absence, tenant-context
  guard, and no-second-ledger boundary.
- `git diff --check` for the changed review/code/spec paths — PASS.

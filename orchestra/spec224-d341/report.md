# Spec 224 D3.41 — Focused Completion Report

Date: 2026-09-27 (Asia/Bangkok)

## Baseline and scope

- D3.40 base: `98f1451c67fd2beb3a6922e72dc9b2981900f444`.
- D3.35 integration: `01a6ea96d45bb4e959b13da105eb6020922f2d76`; verified ancestor of D3.40 (and D3.41 branch).
- Worktree: `/home/dev/projects/SmartSpecPro-spec224-d341`, branch `codex/spec224-d341-completion`.
- Scoped commits: Track A `ffe8b21b9` (durable Python→Node continuation); Track B `8ac7d3859` (guarded economic provisioning/refund contract); Track C `a3c8c3f65` (isolated fresh-profile Runner auth schema). Checkpoint/report commit follows these source commits.
- Canonical Spec 224 SHA-256: `83c47d91871965d48f6d67f7ec3876fe37e0727061ca3b982f2ad5d0991e3793`; not modified.
- All PostgreSQL work used disposable PostgreSQL 15.17, DB `spec224_d341_test`, isolated internal network and loopback-only test proxy. Runtime and migration roles were separately verified `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`. No production database, provider, paid execution or shared checkout was used.

## Track A — Python → Node Approval Continuation

**Status: PASS for local continuation; not Runner/provider certification.**

Python `ApprovalDBService` now claims durable terminal decisions from the existing approval row using `FOR UPDATE SKIP LOCKED`, a bounded lease, incrementing lease epoch and stable delivery/event payload. The internal claim API is protected by the existing gateway token. ACK checks the decision digest and current lease owner/epoch/expiry. Node consumes claims from the existing `unifiedJobControlPlaneReconcilerJob`; it resumes only through the existing `spec224ApprovalContinuation` and canonical Feature 186 `worker_jobs`/events/outbox authority. No second scheduler, queue, job ledger or approval authority was introduced.

The local cross-language PostgreSQL E2E exercised Python FastAPI → durable Python approval decision → claim → Node reconciliation → `resolveComputerUseApproval` → queued canonical job → persisted `APPROVAL_RESOLVED`, `APPROVAL_DELIVERY_ACKNOWLEDGED`, dispatch/outbox → Python ACK. A second reconciliation claimed no decision and did not add a resume side effect. **1/1 PostgreSQL E2E passed.** It used a registered Runner record/session/capability binding through the existing Runner Gateway, but did not start the Rust Runner process or call a provider.

The E2E exposed a real binding defect: Rust creates semantic IDs such as `capability:<runner>:<timestamp>`, while the DB snapshot row PK is a separate UUID (`varchar(36)`). The previous authorization check compared the semantic ID to the row PK and safely rejected the continuation. The check now matches `snapshotJson.capabilitySnapshotId` while independently retaining runner, tenant, revision, session, trust, revocation and expiry checks. The test proves the semantic ID differs from the row PK and still resumes successfully. The persisted approval transition event is the canonical `APPROVAL_RESOLVED`; ACK is a separate event. No duplicate “reconciled” event is fabricated under the same idempotency key.

Coverage: Python PostgreSQL test **1/1** passed for actor/tenant scope, approval replay/conflicting decision, claim exclusivity, lease expiry/reclaim/fencing, digest/ACK idempotency, fresh SQLAlchemy session recovery, and cancellation race. Node approval/control-plane focused run **62/62** passed including the cross-language E2E. The approve E2E is integrated; reject/cancel are exercised in service/contract tests, not as separate cross-language HTTP E2Es. A fresh session after decision is proven; a killed/restarted multi-process deployment is not.

## Track B — Economic Account/Budget Provisioning

**Status: IMPLEMENTED and focused PostgreSQL behavior PASS; real account funding is not provided.**

Added `economicControlPlaneRouter.provisionLedgerAccount` and `.provisionBudget`, gated by existing `adminProcedure`, server-derived tenant scope and authorization checks in `economicProvisioningService`. Account owner reference is derived from authenticated tenant/user context; account type/currency are validated; accounts open at zero balance. Budgets bind to tenant/user or a same-tenant `worker_job`, carry currency/limit/status and are idempotent. Provisioning audit events and the account/budget write share one DB transaction. No endpoint increases cash or account balance.

The PostgreSQL integration test used a disposable-only helper restricted to a loopback host and database name `spec224_*_test`; it creates test accounts/budgets and posts balanced entries only through the existing `recordJournalEntry` service. This is fixture funding, not a canonical real-money top-up path. Tests verified zero-balance account creation, ownership, budget idempotency/conflict, actor audit provenance, insufficient budget, transaction rollback, hold/release, verified capture, duplicate settlement, unknown outcome to reconciliation, cross-tenant account rejection and concurrent settlement. Result: economic PostgreSQL **7/7 passed**; provisioning/refund/continuation unit tests are included in Node **18/18** focused suite.

### Post-capture refund/reversal

The repository's existing `creditService.refundCredits` and `refundReservation` belong to the legacy prepaid-credit rail and its Redis reservation rules; they are not a canonical reversal of the new immutable Economic Control Plane capture/journal. No approved new-ledger refund/rail policy was found. `requestPostCaptureRefund` therefore fails closed with `ECONOMIC_REFUND_POLICY_REQUIRED`; no captured journal or balance is mutated. Owner decision required before an operational post-capture refund/reversal can be exposed: policy for full/partial refund, eligible capture/receipt, rail/provider reversals, dispute interaction, idempotency, authorization and audit provenance.

## Track C — Integration and disposable schema

D3.40 is a verified descendant of D3.35; no cherry-pick or second merge was needed. D3.41 starts from D3.40 and carries the current integration candidate. No dependency manifest/lockfile, historical migration, Feature 245 migration, Cloudflare source, or shared worktree file was changed.

The separate D3.39 Spec 224 fresh-baseline profile lacked canonical Runner authorization tables required by `assertRunnerAuthorizationBinding`. Added `runner_nodes`, `runner_capability_snapshots` and `revoked_token_jtis` to that **isolated profile only** and generated its next canonical Drizzle migration. Canonical Drizzle `check` passed; canonical migration mechanism applied the profile to disposable PostgreSQL. Evidence: PostgreSQL **15.17**, 27 public tables, 63 foreign keys, 2 Drizzle journal rows, and schema-only `pg_dump` SHA-256 `f48ea570e10eeae550b28b02d0867f6f64ce2d3ca05dbf5c0ae1b7faf0a8e995`. The new SQL migration SHA-256 is `ccce375595ee4e1445d42bb5a54eea5514a8000f579f429f049d59a22330d2b2`; journal SHA-256 is `550b9730085b62c0bf67c12df7cca616e7f02f790213cfe59f4907dce789f75a`.

**Integration caution:** `revoked_token_jtis` also exists in Feature 245 migration `0345_feature_245_postgres_jti_revocations.sql`. D3.41's profile is separate and does not change or promote either migration history. Deduplication/ownership must be reconciled before the fresh profile and Feature 245 chain are ever combined.

## Track D — Historical upgrade

**UPGRADE_BASELINE_BLOCKED.** Read-only D3.37/D3.39/D3.40 certification records were checked. They identify disposable migration experiments and a fresh baseline, but no supported previously installed journal/schema/data snapshot. No production/shared database was queried. Fresh replay does not establish upgrade compatibility.

## Test and verification results

| Check | Result |
|---|---|
| `spec224ApprovalContinuationPostgres.integration.test.ts`, real Python API + Node + disposable PG | PASS, 1/1; included in final 62-test run |
| `spec224ApprovalContinuation.test.ts` + `jobControlPlane.test.ts` + cross-language E2E | PASS, 3 files / 62 tests, exit 0 |
| `spec224EconomicPostgres.integration.test.ts` | PASS, 7/7 on PostgreSQL 15.17 after final Runner-binding fix |
| `economicProvisioningService.test.ts`, `economicRefundContract.test.ts`, `spec224ApprovalContinuation.test.ts`, `spec224EconomicPostgres.integration.test.ts` | PASS, 4 files / 18 tests, exit 0 |
| `test_spec224_approval_postgres.py` | PASS, 1/1 against disposable PostgreSQL using non-superuser runtime role |
| `drizzle-kit check --config=drizzle.spec224-baseline.config.ts` | PASS, “Everything's fine”; exit 0 |
| Python `py_compile` for changed API/service/tests | PASS, exit 0 |
| `git diff --check` | PASS before commit; rerun after final checkpoint edits |
| Python Ruff | NOT RUN: Ruff executable absent from the isolated environment |
| TypeScript typecheck | `SKIPPED_POLICY`, per AGENTS.md |
| Full regression, production migration/upgrade, Rust Runner process, paid provider, production | NOT RUN / separate gates |

## Status and blockers

- Approval continuation local Python→Node path: **PASS**.
- Economic account/budget provisioning contract: **IMPLEMENTED**; disposable behavior **PASS**; account remains zero balance absent a funding API.
- Post-capture refund/reversal: **BLOCKED** pending owner financial policy; fail-closed contract is in place.
- WP-DB-05: **PARTIAL / BLOCKED**, not fully certified. Historical upgrade baseline and real funding/top-up/account-balance proof remain absent; broader restart/failure/recovery matrix belongs to consolidated validation.
- WP-RUNNER-06: **DEPENDENCY_BLOCKED** per campaign DAG until WP-SOURCE-03 admission, WP-RECOVERY-04 runtime admission and WP-DB-05 are satisfied. Only local continuation/capability binding was proven; no Rust process/provider E2E.
- P-SOURCE / P-RECOVERY: **BLOCKED**; no runtime admission is inferred from local tests.
- Production Scheduler, live provider and production deployment: **NOT CERTIFIED / NOT RUN**.

## Changed source ownership

- Track A: Python approval service/API/tests; Node approval continuation and existing Feature 186 reconciler; canonical Runner snapshot semantic-ID authorization check; PostgreSQL cross-language test-only ASGI app.
- Track B: economic provisioning service/router and focused unit/PostgreSQL tests; fail-closed post-capture refund contract.
- Track C: `apps/web/drizzle/spec224-fresh-baseline/schema.ts`, its journal, generated `0001_sparkling_leopardon.sql` and snapshot; isolated profile only.
- D3.41 evidence: `orchestra/spec224-d341/**`.

No Spec 224 source was changed. No unrelated files were staged.

## Commit boundaries

| Track | Commit | Scope |
|---|---|---|
| A — Approval continuation | `ffe8b21b9` | Existing approval authority, Node reconciler/continuation, Runner semantic snapshot binding, focused tests |
| B — Economic controls | `8ac7d3859` | Existing economic router/service, zero-balance account/budget provisioning, fail-closed refund contract and tests |
| C — Integration profile | `a3c8c3f65` | Spec 224 disposable fresh-profile Runner authorization schema/migration only |

No commit was pushed or merged. The source candidate is the branch tip after the evidence/checkpoint commit; report that exact SHA from Git after committing this file.

## Next owner actions

1. Supply/approve a supported non-production historical upgrade baseline if upgrade certification is required.
2. Define and approve the Economic Control Plane's post-capture refund/reversal policy and a canonical real funding/top-up API/authority; do not fund by direct SQL.
3. Reconcile the fresh-profile `revoked_token_jtis` duplicate with Feature 245 migration 0345 before any migration-chain promotion.
4. Keep P-SOURCE, P-RECOVERY, Rust Runner/provider, and production as independent gates.

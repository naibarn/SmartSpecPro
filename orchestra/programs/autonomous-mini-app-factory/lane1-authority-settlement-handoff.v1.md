# Lane 1 Runner Authority and Receipt Settlement Handoff

**State:** `CHECKPOINT_PROMOTED_PARTIAL`
**Repository:** `naibarn/SmartSpecPro`
**Settlement implementation SHA:** `d8791f7a7bd71c47506d46fffabce5c2c820d3e6`
**Latest integrated SHA:** `dfe21a86d7b0a5e232851c3faf5f04317835fa6e`
**PRs:** [#375](https://github.com/naibarn/SmartSpecPro/pull/375) implementation, [#376](https://github.com/naibarn/SmartSpecPro/pull/376) program handoff, [#377](https://github.com/naibarn/SmartSpecPro/pull/377) transaction tests, and [#380](https://github.com/naibarn/SmartSpecPro/pull/380) verifier-lock fix/PostgreSQL evidence, plus [#381](https://github.com/naibarn/SmartSpecPro/pull/381) evidence metadata; all merged normally
**Task commits:** `2ecbe20b9d8967ef236a07c21f08c76f32e7b660` (implementation), `130bf5e90f08b3682dedaf20b5fd3c91bf61a410` (transaction tests), `1ac47dc0cb488e11ef441fe09714f0acd15d545f` (verifier-lock fix)
**Canonical workspace:** `/home/dev/projects/SmartSpecPro`, clean at `dfe21a86d7b0a5e232851c3faf5f04317835fa6e`
**Latest convergence receipt:** `workspace-convergence:3b461ba8-57ea-48cb-98ed-6a394d0aa994`
**Program:** `AUTONOMOUS_MINI_APP_FACTORY_PROGRAM`

## Implemented in this checkpoint

- Added `economicReceiptSettlement.ts` as a server-side receipt settlement port over existing economic holds, ledger, events, reconciliations, and WSS-authenticated Runner completion records. Provider metering captures only verified actual cost; subscription and explicitly verified zero-charge classifications release the hold; unknown, failed, and untrusted accounting evidence records reconciliation and leaves the hold untouched. Receipt digest, hold/job/attempt binding, duplicate protection, and balanced journals are enforced transactionally.
- Added deterministic accounting-classification tests.
- Tightened Spec 224 approval-to-hold binding: the approved budget cap and currency must exactly match the durable hold before reservation/binding. Clarified UI cap units as currency minor units.
- Tightened economic hold release to verify that journal currency and amount equal the exact remaining hold amount.
- Added [`owner-action-manifest.v1.json`](./owner-action-manifest.v1.json). It is a preparation artifact only; no owner approval, grant, hold, ledger account, dispatch, receipt, or charge was created.

## Exact current blockers

The last recorded read-only Windows Runner observation is from `2026-10-08T16:17:17Z` and is stale. It recorded tenant `tenant-ZCSKEM9s`, Runner `local-runner`, session `68bd6529-052a-455c-84ae-4a7c472ea2fb`, and workspace `ws-codextest-36c7be692aaa`. The latest recorded Codex snapshot had expired at `2026-10-08T16:03:21.967Z`; Codex authentication was `auth_required` and policy decision `pending`. Workspace data lacked repository, branch, project, job, and source-attestation bindings.

At that observation, no DevelopmentRun/job/attempt existed to authorize; economic budgets, ledger accounts, and holds were zero. `worker_job_grants=0` is not the missing authority for this trusted Runner path. The applicable gates are a fresh authenticated Runner snapshot, exact job/attempt-bound P-RECOVERY grant and approval, a provisioned non-production budget/funding source and tenant ledger accounts, plus the production accounting verifier and account source. No missing schema migration was identified for settlement.

**No real Windows Codex dispatch, completion receipt, artifact collection, economic settlement, retry/resume, or deployment has been verified.** The new settlement port is not yet wired to a registered policy-backed verifier and authorized ledger account source.

## Verification evidence

- Focused Vitest after PR #377: 9 files, 68 tests passed: `economicReceiptSettlement`, `economicReceiptSettlementTransaction`, `spec224AuthorizationBinding`, `agentControlPlaneContracts`, `externalAgentRunnerDispatcher`, `spec224ProtectedExecutionStart`, `spec224AuthorizationRevocation`, `economicSettlementService`, and `spec224ApprovalContinuation`.
- Focused QA/review: 12 targeted test surfaces passed (the 9 Vitest files above plus the three Rust launcher tests below); disposable migration and Linux installer checks are additional independent passes.
- The five transaction orchestration tests use deterministic repository/ledger mocks. They validate service decisions and retry/idempotency wiring, not PostgreSQL transaction atomicity or live settlement.
- Windows launcher tests compiled and passed on Linux: `windows_powershell_shims_preserve_arguments_without_a_shell_command_string`, `native_windows_executable_does_not_use_a_shell`, and `cmd_shims_fail_closed_for_shell_metacharacters_in_path_or_arguments`. These do not exercise the Windows host.
- Linux Runner installer lifecycle test passed. It does not establish a registered or online Linux Runner.
- Fresh Linux CLI status at `2026-10-08T17:20:17.216Z`: Runner `0.2.13`, state `ready`, `toolCount=11`, `readyToolCount=0`; Codex is installed but auth/health/availability are `unknown`, trust is `discovered`, and the reason is `probe_required`. No probe or job was run. Linux readiness remains a separate workunit from Windows authority and deployment.
- Disposable PostgreSQL 17 migration chain `0389–0394` applied and verified, including target tables and indexes. No shared or production DB was touched.
- UI assertion `explains installed, usable, and not-yet-connected harnesses` fails identically on canonical `main` and this branch because it expects `ติดตั้งแล้ว — ต้องเข้าสู่ระบบ`; classified as pre-existing baseline failure.
- Targeted ESLint invocation could not run: `pnpm exec eslint` resolved ESLint 6.4.0 and found no configuration. This is tooling/config discovery, not a lint pass.
- `git diff --check` passed; the legacy `spendCeilingMicros` symbol is absent from the web source.

## Migration and rollback plan for a future registered non-production target

1. Confirm the intended tenant/project/environment, approved target/runtime identity, isolated DB, credential authority, and authorization before touching a target.
2. Apply migrations `0389–0394` only to that approved isolated non-production DB, in canonical order. Capture the pre-migration DB/schema snapshot, migration journal, and exact source SHA.
3. Verify target and credential schema/indexes, tenant isolation, and migration journal before registering a target or importing credentials. Never copy production credentials.
4. Roll back only under target-owner approval and only after confirming no dependent deployment records exist. Reverse in dependency order (`0394` through `0389`). For `0391`, preserve an authorized encrypted backup before dropping the credential table; rollback otherwise destroys stored credential ciphertext. For index changes, check for duplicate keys before restoring the prior uniqueness definition. Export/retain rows for additive target/project records before removal. Do not execute rollback against a shared or production database.

## Next eligible workunits

1. Refresh Windows Runner registration/session and Codex capability; bind a real job-specific workspace to an integrated source SHA and attestation.
2. Create the minimal real DevelopmentRun/job/attempt through existing control-plane admission; then request owner-only P-RECOVERY approval and exact budget/funding/ledger authorization. Keep dispatch blocked until all gates are current and pass.
3. Register the policy-backed receipt accounting verifier and approved ledger account source, then run deterministic DB-backed idempotency/retry/reconciliation tests before any live settlement.
4. Independently verify Linux Runner readiness: perform an authorized Codex probe and confirm registered tenant-bound session/capability evidence; current CLI status is only local discovery/install evidence.
5. Independently obtain a registered non-production deployment target and execute migration, deploy, smoke, and UAT gates under that target's owner authority.

## Integration obligations

PR #375 implementation and PR #377 transaction tests were integrated at `42f2e62f9a1aab4c1ceb3bdc609dcffa73cb0181`; PR #380 extends that implementation and is integrated at `7ca6dacb5773c1b2eaf4e29dd139220d6018bac0`. The latest canonical user workspace convergence and verification are recorded below. Do not mark live dispatch, settlement, or deployment `PASS` without corresponding real receipts.

## 2026-10-09 verifier-lock and PostgreSQL follow-up

**Candidate base:** `origin/main` at `89ef3697976cade1d6811ee9e4ec0f822e1d0e7a` (includes PR #379). The primary checkout was clean but two commits behind when this worktree was created.

**Implementation:** External accounting verification now runs before opening the economic settlement transaction. The service passes an abort signal and applies a bounded verifier timeout; timeout/unavailable evidence enters reconciliation without changing the hold. Before applying evidence, the transaction locks and re-reads the current hold, re-reads the persisted receipt and recomputes its digest, verifies tenant/job/attempt/hold bindings, checks the current hold state, and rejects a changed receipt. A prior settlement is checked by tenant/job/attempt/hold while the hold lock is held, so another receipt cannot settle that same hold attempt twice. Capture and unused-cap release remain atomic and use the existing ledger service; no new schema, migration, ledger service, or long-lived verifier lock was added.

**Focused evidence:**

- Five Vitest files passed: 33 tests across `economicReceiptSettlement`, its transaction orchestration, `economicDurableService`, `economicLedgerService`, and `economicSettlementService`.
- `spec224EconomicPostgres.integration.test.ts` passed all 8 tests against a disposable PostgreSQL 17 loopback cluster. The receipt-specific integration test uses Drizzle's PostgreSQL pool plus a separate `postgres` client pool and a two-call verifier barrier. While both verifiers wait, another PostgreSQL transaction acquired `FOR UPDATE NOWAIT` on the hold row. The test asserts the verifier and database clients use distinct backend PIDs.
- The same real PostgreSQL test forced an invalid ledger account during capture and verified rollback left the hold/budget unchanged with no settlement event; it then retried the same receipt, settled once, and replayed concurrently with one settlement event, one capture journal, one release journal, actual capture of 75 USD minor units, and release of the remaining 125. It also mutated the persisted receipt during verification and confirmed digest conflict/no capture, timed out a verifier into reconciliation without changing the hold, resolved that reconciliation after verified retry, and rejected a distinct completion receipt for the same hold/attempt without additional journal entries.
- This isolated database was initialized from the repository's Spec 224 fresh-baseline migration profile, then received test-only compatibility DDL for three worker columns absent from that profile (`worker_jobs.activeDedupeKey`, `worker_job_events.workerJobAttempt`, and `worker_job_events.leaseFencingVersion`). It was never a shared or production database. This proves transaction behavior against PostgreSQL, not that the historical full migration journal or a deployment target is current.
- A separate attempt to run the full historical `db:migrate` journal on a pristine disposable database stopped at its first `ALTER TABLE workflow_templates` because that legacy base table is not created by the 380-entry journal. The failure is limited to disposable migration-path setup; it was not repaired or bypassed as part of settlement work.
- Thirteen focused QA/review points passed: tenant scope; job/attempt/hold binding; terminal receipt shape; verifier outside the hold transaction; timeout fail-closed behavior; persisted receipt digest revalidation; same-hold duplicate receipt rejection; actual-only capture; unused-cap release; remaining-cap/currency validation; balanced journal validation; transaction rollback and retry; concurrent idempotent replay with unique settlement/capture/release entries.

**Fresh local discovery, not Windows evidence:** On `2026-10-08T18:03:08Z`, the Linux `local-runner` CLI reported version `0.2.13`, state `ready`, `readyToolCount=0`; its Codex entry was installed but auth, availability, and health were `unknown`, trust was `discovered`, and reason was `probe_required`. This is a local Linux scan only. SSH from this execution environment to Windows host `192.168.1.123:22` timed out; no Windows process, Codex auth/policy, Runner registration/session, capability acknowledgement, or source/workspace attestation was freshly observed. The stored Windows session/snapshot figures earlier in this handoff remain historical and stale.

**Still separate and unverified:** No DevelopmentRun/job/attempt was prepared because Windows identity, workspace, and source attestation could not be refreshed. No P-RECOVERY grant, owner approval, budget/funding source, ledger account, production accounting verifier, dispatch, Windows receipt, artifact collection, or live economic settlement was created or observed. Linux registered Runner acceptance and non-production deployment remain independent gates. Disposable PostgreSQL evidence does not satisfy any of those gates.

## PR #380 integration and canonical workspace

- PR #380 merged normally. Candidate commit: `1ac47dc0cb488e11ef441fe09714f0acd15d545f`; merge commit and integrated SHA: `7ca6dacb5773c1b2eaf4e29dd139220d6018bac0`.
- `origin/main` was refreshed to `7ca6dacb5773c1b2eaf4e29dd139220d6018bac0`.
- The registered canonical user workspace `/home/dev/projects/SmartSpecPro` was clean, converged, and verified at that SHA. Receipt: `workspace-convergence:804ac55f-0e1b-416a-80c2-1debc1ec2482`; verified `2026-10-08T18:10:19.806Z`.
- Program metadata records this partial integration. The open work remains Windows physical readiness, owner-issued scope/budget/funding/account authority, production verifier registration, and a real authorized dispatch/receipt/settlement.


## PR #381 integration and canonical workspace

- PR #381 merged normally. Candidate commit: `73bee043392d7fb821eb3688de99407494aa1a85`; merge commit and integrated SHA: `dfe21a86d7b0a5e232851c3faf5f04317835fa6e`.
- The canonical user workspace `/home/dev/projects/SmartSpecPro` was converged and verified clean at that SHA. Receipt: `workspace-convergence:3b461ba8-57ea-48cb-98ed-6a394d0aa994`; verification: `2026-10-08T18:14:11.894Z`.
- PR #381 records the PR #380 PostgreSQL settlement evidence; it does not change live readiness or authorization status.

## SPEC-224 runtime admission ownership resolution — 2026-10-09

- **Decision:** `COORDINATED_CHANGE`. Lane 1 retains sole write ownership of `apps/web/server/services/spec224RuntimeAdmission.ts` and `apps/web/server/services/__tests__/spec224RuntimeAdmission.test.ts`; no paths are released. Shared Lifecycle supplies its versioned eligibility contract from a collision-free workunit, and Lane 1 is the single canonical writer that integrates it. Eligibility remains advisory and cannot authorize protected Runner execution.
- **Source SHA:** `cf4fccc2b9744451f68a66f632049073ce0bb981`. The current Lane 1 worktree is clean at this SHA. The Shared Lifecycle proposal worktree is also clean. A read-only scan of registered worktrees found no dirty edits or branch deltas on the reserved files, and workspace authority reported no active sessions. The logical reservation remains because the files are required for Lane 1 protected-start/trusted-Runner closure.
- **Trust blocker:** the evaluator validates only the shape of remote evidence references and then denies `REMOTE_TEST_TRUSTED` as `DENIED_REMOTE_TRUST_REQUIRED`. No verified production authority currently re-fetches and verifies the trusted issuer/signature, object/content digest, freshness/revocation, and tenant/run/job/attempt/source/profile/artifact bindings. The Python recovery-grant validator checks grant authority and scope; it does not verify source provenance. `PRODUCTION_TRUSTED` is unsupported. Keep the path deny-only.
- **Before Shared Lifecycle runtime implementation:** provide a versioned advisory eligibility contract with stable states/reasons and freshness/ownership evidence; record Lane 2-2's production-path proof against its exact SHA; wire only at that verified caller; preserve all current Runner trust, grant, approval, lease, fencing, economic, idempotency, and persisted-proof gates; and keep Lane 1 as the only writer to the reserved paths.
- **Next independent workunit:** `LANE1_REMOTE_TRUST_VERIFIER_AUTHORITY_DISCOVERY`, read-only discovery of an existing authorized verifier, issuer/configuration, evidence source, and accountable owner. Continue separate Runner readiness work; do not dispatch or change trust configuration based on synthetic/development tests.
- Detailed decision and conditions: [`ownership-resolution-handoff.md`](../../tasks/shared-lifecycle-ownership-resolution-20261009/ownership-resolution-handoff.md).

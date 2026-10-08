# Lane 1 Runner Authority and Receipt Settlement Handoff

**State:** `CHECKPOINT_PROMOTED_PARTIAL`
**Repository:** `naibarn/SmartSpecPro`
**Integrated SHA:** `d8791f7a7bd71c47506d46fffabce5c2c820d3e6`
**PR:** [#375](https://github.com/naibarn/SmartSpecPro/pull/375) merged normally
**Task commit:** `2ecbe20b9d8967ef236a07c21f08c76f32e7b660`
**Canonical workspace:** `/home/dev/projects/SmartSpecPro`, clean at the integrated SHA
**Convergence receipt:** `workspace-convergence:2dc16d49-2bb6-43e7-b0fd-aa67a2a1ae01`
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

- Focused Vitest: 8 files, 63 tests passed: `economicReceiptSettlement`, `spec224AuthorizationBinding`, `agentControlPlaneContracts`, `externalAgentRunnerDispatcher`, `spec224ProtectedExecutionStart`, `spec224AuthorizationRevocation`, `economicSettlementService`, and `spec224ApprovalContinuation`.
- Focused QA/review: 11 targeted test surfaces passed (the 8 Vitest files above plus the three Rust launcher tests below); disposable migration and Linux installer checks are additional independent passes.
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

PR #375 is integrated and reachable from `origin/main`. The canonical user workspace was resolved, converged, and verified at the integrated SHA. Temporary dependency symlinks created for focused tests were removed. This handoff and `program.json` now record the integrated SHA and receipt. Do not mark live dispatch, settlement, or deployment `PASS` without corresponding real receipts.

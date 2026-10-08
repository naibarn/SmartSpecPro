# Lane 1 Runner Authority and Receipt Settlement Handoff

**State:** `CHECKPOINT_CANDIDATE_NOT_YET_INTEGRATED`
**Repository:** `naibarn/SmartSpecPro`
**Base:** `origin/main` `34aa1137b2bfa1aa2c1c752fbad23cf5d02157ab`
**Task branch:** `codex/lane1-receipt-settlement`
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

- Focused Vitest: 8 files, 63 tests passed, including receipt settlement, Spec 224 binding, trusted dispatcher/contracts, economic settlement, protected execution, revocation, and continuation paths.
- Windows launcher tests compiled and passed on Linux: PowerShell argument preservation, native Windows executable dispatch without a shell, and CMD metacharacter fail-closed behavior. These do not exercise the Windows host.
- Linux Runner installer lifecycle test passed. It does not establish a registered or online Linux Runner.
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
4. Independently verify registered Linux Runner readiness.
5. Independently obtain a registered non-production deployment target and execute migration, deploy, smoke, and UAT gates under that target's owner authority.

## Integration obligations

This checkpoint has not been committed or integrated yet. Before ending the work session: remove only the temporary dependency symlinks created in this task worktree; run the FAST INTEGRATION GATE; promote via a normal non-force PR; verify the merged SHA on `origin/main`; then update `program.json` through its integration-success handoff writer with the actual merged SHA and fresh checkpoint evidence. Do not mark live dispatch, settlement, or deployment `PASS` without corresponding real receipts.

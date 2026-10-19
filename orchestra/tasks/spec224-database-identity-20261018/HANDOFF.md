# SPEC-224 Database Identity and Targeted Recovery Handoff

## Current checkpoint

- Latest verified source: `origin/main` `f31cf14adfb8e87690d2c07adb8b3556eef5cbe2`.
- Evidence checkpoint commit `a9cbe93e35b93fd3a725e313d1ae64b3ffb35faa` was pushed to `origin/main`; GitHub reports the same SHA for `main`.
- PR #1113, which added exact-admin read-only diagnostics and future run-failure backend identity metadata, is integrated. The UI action is available under **Admin → Settings → Infrastructure → Monitoring → SPEC-224 Database Identity → Collect evidence** (`/admin/settings`). It uses the existing exact-admin authority; no new auth path was added.
- A user-provided Admin screenshot on 2026-10-19 shows the current production Backend at revision `319fbc7a107341b466e5c1e0f4ddf50c630af6e4`, instance label `production:pid-3876410`, database `smartspec`, schema `public`, role `smartspec`, fingerprint `sha256:522c1764a431a6eb0a8f13502ca8905ee65f0783b063ca6c2ccd746205351b0f`.
- The observed current database has `0395_spec224_external_runtime_job_type` pending; `external_runtime` is absent from `worker_runtime_type`. The diagnostic reports 88 pending entries, 41 unknown applied hashes, reconciliation `FAILURE_HISTORY_UNAVAILABLE`, and zero observed active migration candidates.
- No matching failure audit was found. The current production database identity is verified for the diagnostics request, but it is **not** correlated to the historical run-creation error. The PID fallback is not a stable instance identity.
- Source inspection confirms `apps/web/package.json` runs `db:migrate` through `apps/web/scripts/db-migrate-with-receipt.ts`, which invokes `drizzle-kit migrate` over the full journal. No existing targeted-0395 protected migration operation was found. Do not run the full set with this observed drift.
- Evidence: `specs/feature/224-Autonomous Development Orchestrator Runtime/handoff/evidence/spec224-database-identity-admin-observation-20261019.md`.

## Targeted recovery implementation and execution (2026-10-19)

- User authorized proceeding with the exact production recovery. Added the narrowly scoped `db:migrate:spec224-0395` operation and manual `apply-spec224-0395-targeted-migration.yml` workflow. It pins the observed database fingerprint, checks the exact SQL/journal entry, prerequisites, current DB role, migration activity, advisory lock, and ledger drift; it writes the migration receipt and verifies enum/ledger postconditions transactionally. The normal full-journal migrator now takes the same advisory lock. No other migration is requested by the targeted runner.
- Integrated implementation to `origin/main`: `5c53011d207119b25798efa946d5ce41f778d610`; workflow package-manager repair: `268d07524a64346f3684030c3aa77e0d089239ea`; setup-order repair: `f31cf14adfb8e87690d2c07adb8b3556eef5cbe2`.
- Focused checks: 3 files / 24 tests passed (`spec224-targeted-0395-migration`, `drizzleMigrationEvidence`, `migration-receipt-helpers`); `git diff --check`, package JSON and workflow YAML parsing passed. No repository-wide typecheck was run.
- GitHub workflow run `39181157510` failed at `npm ci` because this pnpm workspace contains `workspace:*`; it stopped before DB connection. Run `39181249972` failed during Node/pnpm cache setup, also before DB connection. After repairs, run `39181385038` reached the exact migration script, which failed closed with `MIGRATION_CONTEXT_MISSING_DATABASE_URL`. Its Actions log shows `DATABASE_URL` was not configured; repository secret metadata contains no DB URL secret, and the `production` GitHub Environment has no secrets or protection rules. No migration connection, DB write, migration receipt, run creation, or dispatch occurred.
- Resume condition: a Platform/Database Owner must configure the existing production database connection for this exact protected workflow as the `production` Environment secret `NEON_PROD_DB_URL` (least-privilege role allowed to alter the existing enum, inspect migration activity, update `drizzle.__drizzle_migrations`, and append `api_audit_events`). Do not send the value to Codex or chat. Then rerun the workflow on `main` with the exact confirmation and authorization reference; it will independently verify the database fingerprint and all drift/activity preconditions before applying. If that connection is unavailable or preflight rejects the drift, do not bypass the guard.
- The conversational authorization is present, but live target access is not. Do not claim `TARGETED_RECOVERY_AUTHORIZED` as an execution receipt or `ENUM_POSTCONDITION_VERIFIED` until the workflow succeeds and its receipt/postcondition is inspected.

## Required authority action

The user has authorized this exact recovery. A scoped, audited main-branch workflow is now available; its required production DB secret is not configured in GitHub. Do not edit migration history, use manual SQL outside the authority, or run the full migration journal.

The missing historical failure correlation must remain explicit in the Database Owner decision. If the owner requires proof of the exact connection that handled the earlier error, use the already-authorized backend log access and the existing request trace/error evidence; do not infer it from the present PID label.

## Resume sequence after authorized recovery

1. Verify the exact target's `worker_runtime_type` contains `external_runtime` and record the protected operation receipt.
2. Invoke authenticated `spec226DevelopmentControl.startWorkspaceRun`; record actual Run ID, Job ID, and source SHA.
3. Reconcile Windows Runner/session/workspace/source binding and exact-run profile certification, capability, admission, lease and fencing.
4. Obtain a Tenant Owner Recovery Grant only if the existing authority requires it. Dispatch only after every exact-run gate passes.
5. Capture the real Runner execution, settlement and Final Verify receipt. Do not treat local or disposable PostgreSQL tests as live acceptance.

## Status

- `BACKEND_DB_IDENTITY_VERIFIED`: yes, for the current production Backend diagnostics request; historical run-error correlation remains unavailable.
- `MIGRATION_0395_STATUS`: pending; enum postcondition fails because `external_runtime` is absent.
- `TARGETED_RECOVERY_AUTHORIZED`: user authorization received; DB execution credential binding unavailable to the workflow.
- `ENUM_POSTCONDITION_VERIFIED`: no.
- `CANONICAL_RUN_CREATED`: not attempted.
- `WINDOWS_RUNNER_BOUND` / exact-run admission and lease-fencing: not verified for a run.
- `LIVE_FINAL_VERIFY_ACCEPTED`: no.

No database write, migration, run creation, dispatch, or Windows Final Verify was attempted. Prior disposable PostgreSQL migration tests were not repeated.

# SPEC-224 Database Identity and Targeted Recovery Handoff

## Current checkpoint

- Latest verified source: `origin/main` `cf43f498a002e42e128837ab0f397f1b672fd930`.
- PR #1113, which added exact-admin read-only diagnostics and future run-failure backend identity metadata, is integrated. The UI action is available under **Admin → Settings → Infrastructure → Monitoring → SPEC-224 Database Identity → Collect evidence** (`/admin/settings`). It uses the existing exact-admin authority; no new auth path was added.
- A user-provided Admin screenshot on 2026-10-19 shows the current production Backend at revision `319fbc7a107341b466e5c1e0f4ddf50c630af6e4`, instance label `production:pid-3876410`, database `smartspec`, schema `public`, role `smartspec`, fingerprint `sha256:522c1764a431a6eb0a8f13502ca8905ee65f0783b063ca6c2ccd746205351b0f`.
- The observed current database has `0395_spec224_external_runtime_job_type` pending; `external_runtime` is absent from `worker_runtime_type`. The diagnostic reports 88 pending entries, 41 unknown applied hashes, reconciliation `FAILURE_HISTORY_UNAVAILABLE`, and zero observed active migration candidates.
- No matching failure audit was found. The current production database identity is verified for the diagnostics request, but it is **not** correlated to the historical run-creation error. The PID fallback is not a stable instance identity.
- Source inspection confirms `apps/web/package.json` runs `db:migrate` through `apps/web/scripts/db-migrate-with-receipt.ts`, which invokes `drizzle-kit migrate` over the full journal. No existing targeted-0395 protected migration operation was found. Do not run the full set with this observed drift.
- Evidence: `specs/feature/224-Autonomous Development Orchestrator Runtime/handoff/evidence/spec224-database-identity-admin-observation-20261019.md`.

## Required authority action

Database Owner must authorize a protected and audited recovery operation against the exact verified target fingerprint above, scoped only to migration `0395_spec224_external_runtime_job_type`. The operation must validate enum state, migration history/drift and concurrent activity before applying, then prove the `external_runtime` postcondition. The canonical migration authority currently lacks this target-scoped operation; make that protected operation available before any production apply. Do not edit migration history, use manual SQL outside the authority, or run the full migration journal.

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
- `TARGETED_RECOVERY_AUTHORIZED`: no.
- `ENUM_POSTCONDITION_VERIFIED`: no.
- `CANONICAL_RUN_CREATED`: not attempted.
- `WINDOWS_RUNNER_BOUND` / exact-run admission and lease-fencing: not verified for a run.
- `LIVE_FINAL_VERIFY_ACCEPTED`: no.

No database write, migration, run creation, dispatch, or Windows Final Verify was attempted. Prior disposable PostgreSQL migration tests were not repeated.

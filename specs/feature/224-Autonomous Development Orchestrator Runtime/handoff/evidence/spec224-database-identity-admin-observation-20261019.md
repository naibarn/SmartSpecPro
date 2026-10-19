# SPEC-224 Admin Database Identity Observation

Observed from the user-provided Admin → Settings → Infrastructure → Monitoring screenshot at `/admin/settings` on 2026-10-19. The existing exact-admin diagnostics action is present and returned:

- Backend environment: `production`
- Backend revision: `319fbc7a107341b466e5c1e0f4ddf50c630af6e4`
- Backend instance label: `production:pid-3876410` (PID fallback; not a stable instance identifier)
- Database identity: database `smartspec`, schema `public`, effective role `smartspec`
- Non-secret instance fingerprint: `sha256:522c1764a431a6eb0a8f13502ca8905ee65f0783b063ca6c2ccd746205351b0f`
- Migration evidence: `OBSERVED` / current state `UNKNOWN`; migration `0395_spec224_external_runtime_job_type` is `PENDING`; 88 pending entries; 41 applied hashes are unknown; reconciliation is `FAILURE_HISTORY_UNAVAILABLE`; active migration candidates: 0 (`OBSERVED`)
- The displayed `worker_runtime_type` labels do not include `external_runtime`.
- Run-creation correlation: no matching failure audit was found.

This verifies the database currently used by the production Backend that served this diagnostics request. It does **not** correlate that connection to the earlier failed run-creation request: the diagnostics found no matching failure audit, and the instance label is a process-PID fallback.

Source inspection at canonical `origin/main` SHA `cf43f498a002e42e128837ab0f397f1b672fd930` found that `apps/web/package.json` maps `db:migrate` to `scripts/db-migrate-with-receipt.ts migrate`, which invokes `drizzle-kit migrate` against the full journal. No existing targeted-0395 migration authority or protected operation was found. With 88 pending entries and 41 unknown hashes, the full migration command must not be run as a substitute for targeted recovery.

No database write, migration, run creation, dispatch, or Windows Final Verify was attempted. The disposable PostgreSQL migration tests already recorded in prior evidence were not repeated.

## Exact remaining authority action

The Database Owner must authorize a protected, audited recovery operation against the exact verified production target (fingerprint above), scoped only to migration `0395_spec224_external_runtime_job_type`, with precondition checks for enum state, migration history/drift and concurrent migration activity, and a postcondition requiring `external_runtime` to appear. The current repository migration command is not target-scoped, so an existing protected targeted operation must be made available through the canonical migration authority before any production apply. Do not mark migration 0395 applied by editing its ledger, and do not run the full migration set.

Because the prior failure audit is absent, the exact historical run-error-to-backend correlation remains unavailable. Preserve this limitation in any Database Owner decision; do not claim that the screenshot proves which connection handled that historical request.

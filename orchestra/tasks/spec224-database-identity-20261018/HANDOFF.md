# SPEC-224 Database Identity Action Handoff

## Current checkpoint

- Source base after reconciliation: `origin/main` `d40202cb8552f25f6dd125496ba4e3fe7b41c61a`.
- Work branch: `codex/spec224-db-identity-20261018`.
- Implementation commit after rebase: `ca20bbbf403c19b87af6e189502bc0aa6aa283b3`.
- Scope: exact-admin, read-only diagnostics endpoint and a manual Admin UI action. It reports only backend runtime identity, a hashed non-secret DB fingerprint, database/schema/role, summarized migration state, `worker_runtime_type` labels, migration activity count and the latest failed `startWorkspaceRun` correlation.
- The endpoint uses the existing `exactAdminProcedure`. It has no input, mutation, migration, grant or dispatch behavior. `startWorkspaceRun` behavior is unchanged; new failure audit records include allowlisted backend runtime identity fields.
- Focused service tests: `spec224DatabaseDiagnostics.test.ts`, 4 passing. Browser UAT and live backend diagnostics have not run.
- PR: [#1113](https://github.com/naibarn/SmartSpecPro/pull/1113), opened through the normal workflow. The initial PR head `54647d793dcd0d494fa073dfe2085030a05cf3fe` passed `local-contract` (push and PR events), `progressive_integration_gate`, and Mocked SPEC-308 browser simulation; `build-preview` was skipped by workflow policy. Recheck the current PR head before merge.

## Exact authorized Admin action

After this checkpoint is integrated and available on the Admin backend, a real Platform/Database Administrator with the existing SmartAIHub `admin` role should open **Admin → Settings → Infrastructure → Monitoring → SPEC-224 Database Identity → Collect evidence**. The visible route is `/admin/settings`.

The Admin should save/share only the displayed diagnostic result, especially `instanceFingerprint`, database name/schema/effective role, migration target `0395`, enum labels, activity count and failure trace/run correlation. Do not share session cookies, connection strings, credentials or other secret values. If the failure predates runtime identity audit metadata, `TRACE_ONLY` plus the trace ID is expected; use that ID to locate the producing backend instance in authorized backend logs.

## Resume predicate

Resume the database-dependent SPEC-224 phase only after the authorized Admin result confirms the exact backend/database that produced the run-creation failure. Reconcile the target 0395 ledger entry and enum labels, confirm no active migration candidates, then use the existing protected database-owner workflow if any shared-database change is still required. Do not infer identity from the shared local development database, edit migration history, run the full migration set, dispatch a run, or claim live acceptance from these unit tests.

After schema is verified on the exact backend target, continue with authenticated `spec226DevelopmentControl.startWorkspaceRun`, then validate its actual run/job against the Windows binding, admission, certification and lease/fencing authorities. Linux evidence is not Windows acceptance.

## Current status

- `BACKEND_DB_IDENTITY_VERIFIED`: pending authorized Admin invocation.
- `TARGETED_RECOVERY_AUTHORIZED`: not evaluated until target identity is verified.
- `ENUM_POSTCONDITION_VERIFIED`: pending exact-target diagnostics.
- `CANONICAL_RUN_CREATED`: not attempted; schema target is unverified.
- `LIVE_FINAL_VERIFY_ACCEPTED`: not attempted.

# Migration 0415 Environment Evidence

Captured: 2026-10-28 (UTC)
Integrated source: `cfb19bd4f78d0fc53dc5c78558eac94f098b8289`
Migration: `0415_spec293_canonical_project_workspace_bindings`
Migration SHA-256: `b635602614ef429255fd006ca40a6dbaf02be44eb1860edadd0a5b27942752f2`

## DEV

- Target: development PostgreSQL, database `smartspec`, schema `public`, role `smartspec`; local Docker PostgreSQL 15.17 reached using the configured development URL with its host resolved to loopback in process memory. No URL or password is recorded here.
- Before apply: ledger head was 0414 (`ad1109055b14654b2c975829a02634379d8b30fa2da57d6460ff940016323a01`), target absent, binding table absent, prerequisites present, no duplicate `(tenantId, runnerId)` groups.
- Apply: succeeded on 2026-10-28 12:03:10 UTC through `db:migrate:core-0415`. The migration, exact Drizzle ledger row, and settled DB receipt were committed in one transaction. External receipt log: `migration-0415-development.jsonl`.
- Attempts: three earlier runner attempts failed while correcting receipt recording/postcondition checks. The two attempts that reached DDL were rolled back with their ledger inserts; the first failed before DDL. Their failed receipts are retained in the external log; the successful attempt is the only persistent migration/schema change.
- Post-apply: exact hash and timestamp recorded; all 12 expected columns, 7 constraints, 3 binding indexes, and the runner composite unique index verified valid. No row data was copied or modified by the additive DDL.
- Idempotency: rerun in `--preflight` mode at 12:04:17 UTC returned `ALREADY_APPLIED` and verified the existing settled receipt and schema; no SQL was executed again. External record: `migration-0415-development-idempotency.jsonl`.
- Historical drift: current development ledger comparison reported 324 exact entries, 14 timestamp/hash mismatches, and 37 unknown entries. No historical ledger row or baseline was changed; target 0414 predecessor and 0415 entry were checked independently.
- RPC over `https://aimarkethubs.com/trpc`: `runnerNodes.list`, `spec226DevelopmentControl.availableWorkspaces`, and `spec226DevelopmentControl.getConversationWorkspace` each returned HTTP 401 `UNAUTHORIZED` because no authenticated session was available. RPC business results and removal of PostgreSQL 42P01 from authenticated execution therefore remain unverified.
- UI: domain HEAD returned HTTP 200. Authenticated Runner/Debian Runner visibility, Workspace and Project selection, and binding display were not verified.

## PRODUCTION

- Target identity: intended production target is the allowlisted fingerprint `sha256:67a8ab64ed2fab25355103df7e256b941bd3c2140ac62b7c797e106054ef5f83`; the live DB target, history, schema, and drift were not read because the existing authority gate blocked before the production secret was used.
- Authority: GitHub Actions run [40684866061](https://github.com/naibarn/SmartSpecPro/actions/runs/40684866061), dispatched for migration 0415 at integrated SHA `cfb19bd4f78d0fc53dc5c78558eac94f098b8289` with the approved exact migration selector and confirmation.
- Result: failed at `Verify Database Owner environment protection`: `SPEC224_DATABASE_OWNER_TEAM_ID is not configured; refusing production migration.` The live GitHub `production` environment read also showed no protection rules and no deployment branch policy. The job stopped before any Production DB preflight or migration step; no production DB secret was consumed and no DB write occurred.
- RPC over `https://smartaihub.app/trpc`: all three named RPCs returned HTTP 401 `UNAUTHORIZED` without an authenticated session. Production RPC/business behavior is unverified.
- UI: domain HEAD returned HTTP 200. Authenticated Runner, Workspace, Project Binding selection/display, and UI E2E are unverified.

## Cross-environment limits

- Production migration status, schema, receipt, and drift remain unknown until the existing Database Owner environment gate is configured and the same workflow is rerun.
- Browser automation could not be used: `orca-ide computer` exited with `accessibility_error` (`computer sidecar exited with code 1`). Shell RPC calls reached the actual tRPC route but returned the expected unauthenticated 401.
- No claim is made that authenticated RPCs pass, that PostgreSQL 42P01 is absent from authenticated requests, or that either UI is fully functional.

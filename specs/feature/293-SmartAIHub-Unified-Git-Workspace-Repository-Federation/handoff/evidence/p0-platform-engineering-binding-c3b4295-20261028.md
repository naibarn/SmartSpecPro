# Trusted Platform Engineering binding — 2026-10-28

- Implementation source SHA: `c3b429551fcf15e619ba34d45eaa3862dfba6acf`
- Integrated ref: `refs/heads/main`; fetched `origin/main` matched the implementation SHA at verification time.
- Outcome: trusted scope binding and server projection are integrated. The broader SPEC-293 acceptance remains open.

## Authority and projection

- Added a tenant-scoped canonical Project/Repository-to-Runner/workspace binding with lifecycle/revocation, tenant-safe foreign keys, and canonical Project membership authorization.
- Existing Debian Runner `runner-f1328901deec1b147d200a818e12e4be` was bound to the existing repository/workspace identity through a guarded development-database transaction after revalidating actor, tenant, trusted online Runner, session snapshot, and exact project/repository IDs.
- Authorized `runnerNodes.list`, SPEC-224 `availableWorkspaces`, and Workspace Authority projections derive scope from the persisted binding and active canonical Project membership, then require the current Runner/session/workspace/repository snapshot to match. Revoked, stale, mismatched, and unauthorized platform bindings fail closed. Ordinary tenant-owned projects remain unscoped.
- Simple Task Control presentation uses the canonical title and omits internal source IDs. Existing workspace selection remains the consumer; no Goal or DevelopmentRun was started.

## Verification

- Disposable PostgreSQL connected service-path command: `python3 /tmp/run_disposable_postgres_debug.py -- bash -lc 'cd /mnt/SmartSpecDev/projects/SmartSpecPro/apps/web && SPEC224_BASELINE_DATABASE_URL="$DATABASE_URL" corepack pnpm exec drizzle-kit migrate --config=drizzle.spec224-baseline.config.ts && JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 RUN_DB_INTEGRATION_TESTS=true corepack pnpm exec vitest run drizzle/schema.test.ts server/services/workspaceAuthorityProjectReadModel.test.ts server/routers/__tests__/runnerNodesCompanionState.test.ts server/services/__tests__/workspaceScopeAuthorityPostgres.integration.test.ts'`
- Result: 4 test files passed, 122 tests passed. The PostgreSQL integration calls the actual authenticated tRPC router callers and production `availableWorkspaces`/Runner list/Project Mission Control projections against persisted binding and Runner records.
- Focused unit regression: `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 pnpm exec vitest run server/services/workspaceAuthorityProjectReadModel.test.ts server/routers/__tests__/runnerNodesCompanionState.test.ts` — 2 files, 25 tests passed.
- `pnpm exec drizzle-kit check` and `git diff --check` passed. The development active-baseline migration was applied and the migration ledger audited separately; production was not touched.
- The local development web service restarted from checkout SHA `c3b429551fcf15e619ba34d45eaa3862dfba6acf`; `dev:web:verify` reported a fresh login HTTP 200. This does not establish production deployment or browser-level authenticated Task Control acceptance.

## Remaining work and safety

- The requested explicit “พัฒนาระบบ SmartAIHub” entry CTA and authenticated Playwright selection check remain with Task Control UX ownership (Session C); no Session C session was reachable here, so no UI ownership was assumed.
- Runner-reported workspace state was dirty and its observed source revision lagged canonical main. Do not start a write-capable Goal until the existing workspace is safely converged/isolated under the authorized workspace flow.
- No live Goal, approval, or execution was started. Windows/device acceptance and SPEC-224 live execution remain separate downstream gates.

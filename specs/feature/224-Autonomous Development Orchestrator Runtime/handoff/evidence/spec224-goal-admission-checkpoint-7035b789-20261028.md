# SPEC-224 Goal Admission checkpoint

- Canonical source: `origin/main` SHA `7035b789476e2b3b96ec414674f285eb77f60988`.
- Profile: `integration` for connected disposable PostgreSQL; focused package checks for router/UI regressions and Python syntax.
- Observed: 2026-10-28 07:25 Asia/Bangkok.
- Resource snapshot before final PostgreSQL run: 30 GiB RAM total, 21 GiB available; 15 GiB swap total, 12 GiB available.

## Passed

- Disposable PostgreSQL: `RUN_DB_INTEGRATION_TESTS=true python3 scripts/spec224_certification/run_disposable_postgres.py -- bash -c 'cd apps/web && SPEC224_BASELINE_DATABASE_URL="$DATABASE_URL" pnpm exec drizzle-kit migrate --config=drizzle.spec224-baseline.config.ts && pnpm exec vitest run server/services/__tests__/spec224DelegatedChildContinuationPostgres.integration.test.ts'` — 8/8 passed. This exercises the Approval Authority operation, durable Goal/Run records, production delegated authorization, canonical outbox, receipt reconciliation, automatic successor admission and dispatch, replay/concurrency, revocation/expiry and budget constraints. Runner receipts are synthetic integration inputs, not live acceptance.
- Focused Task Control and panel tests: `cd apps/web && pnpm exec vitest run server/routers/__tests__/spec226DevelopmentControl.test.ts client/src/components/chat/Spec224WorkspacePanel.test.tsx` — 46/46 passed.
- Python syntax: `cd python-backend && python3 -m py_compile app/api/approvals.py tests/integration/test_spec224_approval_postgres.py` — passed.
- Fast patch check: `git diff --cached --check` — passed before integration.

## Remaining proof

The connected PostgreSQL test creates a durable run fixture through production persistence and invokes the actual Approval Authority and execution services. The focused router test invokes the actual `startWorkspaceRun` handler but mocks its surrounding services. No single disposable-PostgreSQL test yet invokes the tRPC `startWorkspaceRun` caller with a persisted conversation/workspace binding, real Runner snapshot and real Approval Authority HTTP request. The next source operation is to add that ingress case and verify pending approval, idempotent duplicate Start, approved first-child dispatch, then receipt-driven Child 2. Keep that test on the existing disposable PostgreSQL infrastructure.

No tenant Goal Grant or live DevelopmentRun/Job/Attempt receipt was observed on the Windows Runner. The supplied Runner screen shows Codex readiness only; it is not execution evidence. Do not claim deployment or Windows live acceptance from this checkpoint.

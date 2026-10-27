# SPEC-224 live Runner and admission recheck

Observed 2026-10-28 06:47:31 +07:00 (2026-10-27 23:47:31 UTC), exact canonical source `f1b400c014c692b08ae9fb6de66b832595987a4c` (`HEAD` equals `origin/main`).

## Source verification

- `pnpm test server/services/__tests__/spec224DevelopmentRunContracts.test.ts` — 1 file, 8 tests passed.
- `RUN_DB_INTEGRATION_TESTS=true python3 scripts/spec224_certification/run_disposable_postgres.py -- bash -c 'cd apps/web && SPEC224_BASELINE_DATABASE_URL="$DATABASE_URL" pnpm exec drizzle-kit migrate --config=drizzle.spec224-baseline.config.ts && pnpm test server/services/__tests__/spec224DelegatedChildContinuationPostgres.integration.test.ts'` — disposable PostgreSQL migrations applied; connected production-service integration test 6/6 passed.
- `buildDevelopmentRun()` persists the same default `goal:<runId>` already used by the canonical job manifest. Explicit parent Goal IDs remain unchanged.

These checks cover source and disposable PostgreSQL behavior. They are not live Runner execution evidence; the connected test uses its own approved fixtures and synthetic receipts.

## Current Windows Runner state

- Registered `local-runner` is trusted and online. Latest observed heartbeat: `2026-10-27 23:47:07.555 UTC`.
- Snapshot `snapshot:local-runner:2026-10-27T23:46:26.042Z` expires at `23:51:26.042 UTC`. The publication was acknowledged `applied` by `smartspec-web` at `23:46:26 UTC` with `executionReadiness=capability_ready`.
- Codex CLI `0.161.0` is authenticated; task probe is `passed` through `2026-10-28 00:37:46 UTC`, with authorization evidence present. The owner supplied a Runner screenshot showing the Codex real-command test succeeded.
- The sole registered workspace is `ws-smartspecpro-12883242a753` (`SmartSpecPro`, source `fbd7fd1bd8324973540664d7f7de2bd9e5844757`, clean). This does not establish an isolated pilot workspace.

## Live admission state

Read-only PostgreSQL checks at 2026-10-27 23:47 UTC for this Runner's tenant found zero active SPEC-224 Goal Grants, zero active SPEC-224 development policies, zero active Goal Budgets, and zero Goal-scoped runs. No Child Job/Attempt, Outbox dispatch, Runner receipt, settlement, automatic Phase 2, restart recovery, or independent Final Verify was observed. A fresh anonymous Chromium visit to Task Control redirected to login, so no authenticated owner Start was made.

`startWorkspaceRun` still routes through exact-job `advanceStart`; `buildSpec224GoalGrantApprovalPayload()` has no production caller. The live Goal Grant and shared Goal Budget admission path therefore remains unfinished even though the connected delegated-child test passes. Do not issue a grant from chat or treat Runner readiness as a DevelopmentRun receipt.

The active Linux web/node-worker release observed in the prior preflight remains source `a2d33cbd1d4525e922214a821375acc6b37c6dc6`, while canonical development main is `f1b400c014c692b08ae9fb6de66b832595987a4c`. No deployment of the current main SHA is claimed.

## Exact next source operation

Complete Goal admission in `apps/web/server/routers/spec226DevelopmentControl.ts` and the existing Approval Authority client/service: issue or recover an owner-authorized Goal Grant from persisted Run/Job configuration, persist its approved decision under the Goal ID, and make Start/replay use the same idempotency key. Bind only an owner-selected isolated Runner workspace and approved source. Then exercise the authenticated Task Control Start and continue real receipt-driven two-phase acceptance.

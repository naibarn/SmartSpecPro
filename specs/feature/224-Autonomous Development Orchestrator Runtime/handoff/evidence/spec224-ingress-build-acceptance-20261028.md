# SPEC-224 authenticated ingress and build acceptance

- Source and canonical ref: `origin/main` `ac26e203df068e76f3bcd2be41e177478f614f3c` (`refs/heads/main`), verified after non-force push and fetch.
- Observed: 2026-10-28 01:58 UTC. Profile: integration plus focused package checks. Disposable PostgreSQL was loopback-only PostgreSQL 15.17 using the pinned image digest.

## Connected ingress proof

- Command: `RUN_DB_INTEGRATION_TESTS=true python3 scripts/spec224_certification/run_disposable_postgres.py -- bash -c 'cd apps/web && SPEC224_BASELINE_DATABASE_URL="$DATABASE_URL" pnpm exec drizzle-kit migrate --config=drizzle.spec224-baseline.config.ts && pnpm exec vitest run server/services/__tests__/spec224GoalAdmissionIngressPostgres.integration.test.ts'` — 1/1 passed.
- This runs an HTTP tRPC request through production `createContext` and `startWorkspaceRun`, validates a bearer-authenticated test user, persisted conversation/workspace, live-shaped Runner snapshot and capability inventory, then sends the Goal Grant through the production Approval Authority HTTP route. The authorized test approver approves through the persisted Approval Authority service; durable reconciliation writes Child 1 authorization, hold and outbox, and a canonical synthetic terminal receipt drives Child 2 authorization and outbox without a browser callback or manual Continue.
- Duplicate Start and approval request replay retain one Goal approval. Concurrent admission/continuation reconciliation and a duplicate receipt retain exactly two Jobs, two distinct Attempts/holds and two Outbox rows. The shared Goal Budget is created once at 10,000 minor units; each child reserves 5,000 minor units. This is deterministic disposable integration evidence, not live Codex execution.

## Related regressions

- Command: `RUN_DB_INTEGRATION_TESTS=true python3 scripts/spec224_certification/run_disposable_postgres.py -- bash -c 'cd apps/web && SPEC224_BASELINE_DATABASE_URL="$DATABASE_URL" pnpm exec drizzle-kit migrate --config=drizzle.spec224-baseline.config.ts && pnpm exec vitest run server/services/__tests__/spec224DelegatedChildContinuationPostgres.integration.test.ts'` — 8/8 passed, including revoked/expired grant, pinned-provider mismatch, cumulative budget exhaustion, duplicate reservation, replay and concurrent reconciliation.
- Command from `apps/web`: `pnpm exec vitest run server/routers/__tests__/spec226DevelopmentControl.test.ts server/services/__tests__/spec224DevelopmentRunPersistence.test.ts server/services/__tests__/spec224GoalDelegationGrant.test.ts` — 82/82 passed.
- `python3 -m py_compile python-backend/app/api/approvals.py` and `git diff --check` passed. Repository-wide `npm run typecheck` was not run per local resource policy. ESLint was unavailable because this checkout has no ESLint config and resolved the system ESLint 6.4.0.
- The SPEC-224 disposable baseline migrations applied successfully. No application schema change or migration was introduced. The test creates only the omitted production-shaped conversation/auth fixture tables inside its disposable database.

## Canonical build and runtime observation

- `pnpm run build:canonical` passed for exact source SHA `ac26e203df068e76f3bcd2be41e177478f614f3c`; artifact digest `sha256:3e4cf78b62153f2463b5872ab7f5fd087fb0832db03875c6c63f37a8aa7e1e74`, 127,007 files. Result receipt: `/mnt/SmartSpecDev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/ac26e203df068e76f3bcd2be41e177478f614f3c-c829caf1-cb28-422c-bf6f-ac475bb809ff.json`.
- The Cloudflare bundle dry-run generated artifact digest `sha256:5a02e3a68b8ebf63294c46ef3d7b0770237e5e1d30c1389b1dd1d38d6b4bcb77`; Wrangler exited in dry-run mode. No service promotion, Cloudflare deployment or production release was performed.
- Read-only `GET https://smartaihub.app/api/health` returned HTTP 200 at 2026-10-28 01:57:18 UTC with `status=ok`, `service=smartaihub-web`, runtime `linux-origin` and ingress `cloudflare-worker`. The endpoint exposed no frontend/backend source SHA, so the serving revision is unverified against this build.
- The user-provided Windows Runner screenshot reports Codex ready, but this session has no fresh authenticated Runner heartbeat/capability ACK, isolated workspace binding, actual owner-approved Goal Grant or Task Control activity evidence. No live DevelopmentRun, Codex receipt, settlement or automatic live Phase 2 was observed. Windows acceptance remains open.

# P0-WU-4C internal readiness evidence

- Canonical integration: `origin/main` at `60678faa879d5cad0646275086a79760b4b6ba8a` (PR #178); preceding cross-host conflict projection checkpoint: PR #177 at `46f17355679a746cd8637198e9af96ee807d20cc`.
- Change: `/readyz` and internal runtime evidence share `evaluateApplicationReadiness`; the evidence includes normalized readiness, health, freshness, source, and dependency checks. It uses the application PostgreSQL readiness query and local Feature 186 configuration gate; it does not contact Cloudflare or prove deployed runtime health.
- Verification: `pnpm --dir apps/web exec vitest run server/services/applicationReadiness.test.ts server/services/internalRuntimeEvidence.test.ts server/services/__tests__/runtimeHealthMonitor.test.ts` — 9 passed; `git diff --check` passed.
- PR workflow: build-preview check was skipped. Focused tests and fast integration gate are the available evidence.
- Still open: migration failed-execution source is not recorded in Drizzle's ledger; Mission Control task/provider and push/integration identity evidence; Cloudflare credential path fixture verification; RunnerGateway isolation and known-owner retirement dogfood; remaining regression and acceptance gates. External runtime verification remains separate.
- Next action: continue P0_INTERNAL_GAP_CLOSURE against current `origin/main`; preserve the dirty noncanonical primary checkout.

# Runner API ingestion and test-isolation evidence

- Canonical integration: PR #184, SHA `9bdf7c1bba56fd9f0a77ec7b4dc7c649f62573d5`.
- Root cause: the Runner route test suite reused a module-scoped revoked-JTI set across tests and called `postgresEphemeralStore` for refresh-grace persistence. The latter depended on the shared PostgreSQL runtime, so the refresh route returned 503 in a focused suite without that external store.
- Fix: isolate revocation and refresh-grace ephemeral state in per-suite in-memory fixtures, cleared before each test. Production auth, revocation, idempotency, and refresh replay checks remain unchanged.
- Verification: `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 pnpm --dir apps/web exec vitest run server/routes/__tests__/runnerControl.test.ts server/services/__tests__/runnerGateway.test.ts server/services/__tests__/runnerContracts.test.ts server/routers/__tests__/runnerNodesWorkspaceProjection.test.ts` — 4 files, 55 passed.
- The route contract remains authenticated and scope-bound; RunnerGateway tests cover older revisions, same-revision and idempotency conflicts, and persistence behavior through the repository seam. Workspace projection tests exercise tenant/owner-scoped Runner facts.
- Residual boundary: this fixture run proves route/service contract behavior but not a live shared PostgreSQL deployment. External runtime verification remains separate.

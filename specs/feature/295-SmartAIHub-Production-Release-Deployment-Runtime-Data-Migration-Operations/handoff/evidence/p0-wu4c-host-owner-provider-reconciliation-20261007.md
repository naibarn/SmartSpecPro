# P0-WU-4C host and owner-session provider reconciliation

- Integrated canonical ref: `refs/heads/main`
- Integrated merge SHA: `f1bf44911d8176db9414ddc4eee934b0f304dec7`
- Source implementation commit: `ff0836935e9b3ac9c944417aea973f47158ffa1c`
- PR: #209
- Verification: `pnpm --dir apps/web exec vitest run server/services/workspaceAuthorityProjectReadModel.test.ts server/routers/__tests__/spec226DevelopmentControl.test.ts` — 2 files, 30 tests passed after integration.
- RED evidence: host projection ignored a matching owner-session provider and preferred Runner inventory despite conflicting authoritative facts.
- GREEN evidence: matching live owner session supplies `claude` when Runner tool inventory is absent; conflict with trusted Runner `codex` reports `UNKNOWN` and `conflicting_authoritative_provider_facts`; stale Runner facts remain `UNKNOWN`.
- Overall P0 remains PARTIAL; tests do not prove a production Runner/session emitted truthful facts.

Mission Control hosts now reuse the reconciled active-session provider result rather than running a separate precedence path.

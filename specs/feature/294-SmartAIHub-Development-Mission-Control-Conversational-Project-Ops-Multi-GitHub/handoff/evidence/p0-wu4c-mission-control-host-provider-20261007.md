# P0-WU-4C Mission Control host provider evidence

- Integrated canonical ref: `refs/heads/main`
- Integrated merge SHA: `fb9012f80ef413f34180ccf294588155b0454ae7`
- Source implementation commit: `ad9feb324571a98e2b63e277a7fde2b0bff64afd`
- PR: #205
- Result: PASS for provider resolution from trusted live-session evidence; overall P0 implementation remains PARTIAL.
- Verification: `pnpm --dir apps/web exec vitest run server/services/workspaceAuthorityProjectReadModel.test.ts server/routers/__tests__/spec226DevelopmentControl.test.ts` — 2 files, 28 tests passed after integration.
- RED evidence: fresh trusted Codex Runner facts were projected as `hosts[].provider = UNKNOWN`; stale evidence also lacked an explicit resolution source.
- GREEN evidence: fresh active Runner tool inventory projects `codex` with source `trusted_runner_active_tool_inventory`; expired snapshots remain `UNKNOWN` with source `no_active_session_provider_fact`.
- Boundary: fixture-backed tests do not establish that a production Runner reports truthful facts or that a live database has current snapshots.

The hosts projection now resolves the provider from one fresh, trusted, active Runner session tool fact. Stale snapshots remain UNKNOWN; no provider is inferred from workspace or directory names. This closes the host-level UNKNOWN-provider projection gap while the overall P0 workunit remains PARTIAL.

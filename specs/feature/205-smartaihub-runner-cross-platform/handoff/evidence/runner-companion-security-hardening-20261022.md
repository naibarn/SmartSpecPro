# Runner Companion security hardening — 2026-10-22

Scope: WP2C0/WP2C1/WP2C2 correction pass, preserving the existing Runner,
Task Control, approval and SPEC-205 authority boundaries.

## Source and PR chain

- `origin/main` after reconciliation: `7f82d9720ef708fb0f0b0be3d5b8e0724da1a9ba`
- WP2C0 / PR #1164: `664de1dfd7715de8954730a821d129c5ad9b6c67`
- WP2C1 / PR #1166: `728c8e84c9a3541a34079a8c41ed902486d49ae9`
- WP2C2 / PR #1167: `5e798c72cc7a8130e3126e2bd828b430066a454e`

The branches remain stacked and protected main was not modified directly.

## Corrections and focused proof

- Companion sign-out clears the local active session before network work and
  reports server revocation only after both access and refresh revocations are
  confirmed. Offline, timeout and rejection classifications remain
  `unconfirmed`; failed revocation is retained in the native protected store
  for a bounded retry on the next authorization start.
- Unix protected writes use parent mode `0700`, create the temporary file as
  `0600`, serialize concurrent writes, flush before atomic rename, and remove
  failed temporary files. Windows continues to use DPAPI.
- Refresh rotation preserves the original user, tenant, installation and
  session bindings. Client refreshes are serialized; server refresh JTIs are
  atomically claimed and tenant membership is checked again. Replayed or
  membership-revoked refreshes fail closed.
- The installation ID hash is documented as an identifier, not proof of
  possession. The current companion scope remains read-only/least-privilege;
  Runner device credentials are not treated as browser user authentication.
- The panel distinguishes local sign-out from confirmed server revocation.

Focused validation passed:

- `cargo test --manifest-path apps/runner-app/Cargo.toml companion_auth` — 5
  tests on the stacked C1/C2 source.
- `cargo test --manifest-path apps/runner-desktop/src-tauri/Cargo.toml` — 9
  tests.
- Web auth/projection/revocation Vitest set — 27 tests passed.
- Companion, panel and state contract scripts — passed.
- `git diff --check` — passed.
- Express route architecture guard against `origin/main` — passed; the guard's
  missing-file warnings are expected for new Runner routes absent from main.

## CI and acceptance classification

- The MCP pnpm setup duplication was removed from all workflows with explicit
  `version: 10.4.1`; the repository `packageManager` pin remains authoritative.
- The MCP focused gate's missing `@smartspec/remotion-render/render-video-schema`
  import was reproduced and fixed by building that workspace package after the
  frozen install. The remaining CI failure is a separate mainline baseline:
  the focused suites require unavailable `DATABASE_URL` test state and three
  security tests still import the retired, absent `agencyMcpService`. No retired
  Agency compatibility path, dummy database, or test exclusion was added.
- MCP live-contract evidence remains blocked when the authorized
  `MCP_SMOKE_URL`/`MCP_SMOKE_TOKEN` secrets are absent. No dummy credential or
  skip was added.
- Latest CI media-probe runtime completed successfully after the bounded cold
  start fix; local execution remains tool-environment dependent when `pnpm` is
  unavailable.
- The TEST_JWT_SECRET failure was reproduced and corrected by defining the
  test fixture before the dynamic route import; the focused route tests pass.
- The media-probe failure was traced to cold `pnpm dlx wrangler` workerd startup
  exceeding the former 18-second readiness loop while the Rust probe itself
  passed. The bounded loop was extended and the workflow now warms the pinned
  Wrangler cache; workerd readiness still fails closed.

CI references: MCP gate `39751060721` (scope passed; focused contract failure
is the documented mainline baseline; live-contract failed closed for missing
credentials), C0 local readiness `39751060791` (running at capture), C1 media
probe `39751102101` (passed), and C2 progressive gate `39751140581` (passed).
These are CI evidence, not device acceptance.

## Targeted gap-review passes

The correction pass reviewed and retested these boundaries independently:

1. logout result certainty and UI wording;
2. offline, timeout and server-rejection revocation paths;
3. pending-revocation expiry, retry and protected retention;
4. fail-closed behavior for missing/corrupt local session state;
5. Unix `0600` creation, parent `0700`, atomic rename and concurrent writers;
6. immutable user, tenant, installation and session refresh bindings;
7. serialized client refresh rotation;
8. server refresh replay/JTI claim and revoked tenant membership;
9. installation-ID replay threat and proof-of-possession boundary;
10. browser-cookie versus Runner-device credential separation;
11. exact least-privilege scopes and no UI-derived approval authority;
12. stale/offline/unknown status and no fabricated progress or evidence;
13. reconnect, missed updates, logout and revocation recovery;
14. absence of a second scheduler, task store or approval authority;
15. MCP package readiness, pinned pnpm setup and credential-gated live evidence;
16. native Windows/real-device evidence separation from mocks and unit tests.

- Real Windows installer/UI acceptance: **BLOCKED** in this environment.
- Real device Chat-to-Runner receipt/dispatch E2E: **UNVERIFIED**. No
  `chat.runOnRunner` canonical admission API exists in the inspected source;
  no parallel dispatch path was introduced.

This is implementation and focused-test evidence, not a production or
real-device acceptance claim.

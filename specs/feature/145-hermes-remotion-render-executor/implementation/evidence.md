# Feature 145 implementation evidence

Status: code-level implementation complete in the shared worktree. Production
enablement is intentionally still blocked by native signing and real platform
render evidence; those are external gates that cannot be honestly proven on
this Linux host.

Implemented surfaces:

- Shared `remotion_executor` runtime contract, strict metadata/capability/
  readiness schemas, typed target-resolution envelope, feature flag, API
  scopes, enum migration, registration gate, and scheduler target resolver.
- MCP PKCE pairing endpoints and browser approval at
  `/mcp/pairing/approve`; access/refresh tokens are owner/device-bound and
  pairing Redis records contain no tokens or media payloads.
- MCP catalog tools for Hermes capabilities/status/authorize/probe/disconnect/
  bounded test-generation/media execution, connector status/device revocation,
  server-compiled Remotion submit, owner-scoped status, and owner-scoped cancel.
- Standalone Node executor package with Windows DPAPI/macOS Keychain storage,
  closed Hermes discovery, signed pack verification, atomic extraction,
  manifest/architecture/asset/sidecar-hash/executable doctor checks before
  activation, atomic activation with previous-pack rollback,
  connect/poll/refresh, heartbeat, claim, event, Remotion sidecar launch, and
  checksum-presigned artifact upload.
- Runtime-pack manifest/download branches, shared manifest schema, pack build /
  verify / promote / rollback tooling, release docs, and native release-gate
  workflow for signed standalone executor packs.
- Redis cache-backed worker-connect state, MCP sessions, bounded submission
  limiting, and active download grants; production security paths no longer
  use the worker-connect process-memory fallback or serialize bearer tokens.

Focused verification:

- `npm --workspace apps/remotion-executor run typecheck` — pass.
- `npm --workspace apps/remotion-executor run build` — pass.
- `npm --workspace apps/remotion-executor run test` — 6 tests pass, including
  device-proof signing, doctor fail-closed, and archive symlink/hard-link
  rejection.
- `npm --workspace packages/remotion-render run test` — 3 runtime-pack schema
  tests pass.
- Focused scheduler/admission/runtime/MCP/worker Vitest set — 127 tests pass
  across the final rerun (queue/scheduler/admission, runtime route, MCP
  session/security, and target admission).
- `npm --workspace apps/web run check` — pass after the final contract, Redis,
  scheduler, worker heartbeat, and download-grant changes.
- Worker App connect and runtime compatibility tests — 9 tests pass.
- `git diff --check` on the feature surfaces — pass.
- `npm audit --omit=dev --json` — 0 production vulnerabilities reported.

The executor advertises the shared Remotion contract claim token and capability
families used by the server scheduler. Native Windows 11 and macOS arm64/x64
are current standalone targets; WSL2/Linux is explicitly future-only for this
package and remains served by the existing Worker App path.

Known gates before setting the tenant flag true:

1. Publish signed Windows x64 and macOS arm64/x64 executor packs with the
   pinned public key and archive signature fields.
2. Run real short preview renders and artifact publication on Windows 11 and
   macOS; verify output parity with Worker App.
3. Run the native release workflow with approved runtime-pack inputs, add the
   real Windows/macOS credential-store/control-plane evidence, and run short
   preview renders through artifact publication and MCP download redemption.

The repository-wide web typecheck passed after the final changes. Native
credential-store, signed archive, real Remotion render, and Windows/macOS
artifact parity remain unverified external gates.

## MCP onboarding closure — 2026-08-17

The executor CLI now also exposes `setup`, which runs the existing secure
`connect` flow (including verified runtime provisioning and browser device
approval) and then starts the worker loop. `doctor`, `connect`, and `start`
remain available for diagnostics and service-oriented deployments. MCP OAuth
credentials and worker execution/upload credentials remain separate.

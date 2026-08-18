# Feature 146 implementation evidence

Date: 2026-08-17

## Automated proof

Command:

```bash
npm --workspace apps/web run test -- --run \
  server/_core/__tests__/mcpResources.test.ts \
  server/_core/__tests__/mcpV2Protocol.test.ts \
  server/_core/__tests__/mcpRegistry.v2.test.ts \
  server/_core/__tests__/mcpOAuthMetadata.test.ts \
  server/_core/__tests__/mcpRolloutPolicy.test.ts \
  server/_core/__tests__/mcpPublicServer.test.ts \
  server/_core/__tests__/mcpPublicServerSecurity.test.ts \
  server/middleware/__tests__/publicApiCors.test.ts
```

Result: **PASS — 8 test files, 85 tests**.

The expanded run supersedes that baseline:

```bash
JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 \
npm --workspace apps/web run test -- --run \
  server/_core/__tests__/mcpResources.test.ts \
  server/_core/__tests__/mcpV2Protocol.test.ts \
  server/_core/__tests__/mcpRegistry.v2.test.ts \
  server/_core/__tests__/mcpOAuthMetadata.test.ts \
  server/_core/__tests__/mcpOAuthJwks.test.ts \
  server/_core/__tests__/authz.mcpOAuth.test.ts \
  server/_core/__tests__/mcpRolloutPolicy.test.ts \
  server/_core/__tests__/mcpPublicServer.test.ts \
  server/_core/__tests__/mcpPublicServerSecurity.test.ts \
  server/services/__tests__/mcpDownloadBrokerService.test.ts \
  server/middleware/__tests__/publicApiCors.test.ts
```

Result: **PASS — 11 test files, 96 tests**.

Covered by this run:

- modern `server/discover`, stateless `tools/list`/`tools/call`, and legacy
  session compatibility;
- tenant/deployment rollout ordering, fail-closed feature-store behavior, and
  legacy broad-scope compatibility gating;
- `resources/list/read` documentation allowlist, traversal and scheme safety;
- registry metadata, guide aliases, credit estimate, Remotion kind and scope
  gates, unknown-field schema rejection, and signed principal-bound cursors;
- Protected Resource Metadata fail-closed behavior and Bearer challenge;
- CORS origin/header restrictions and existing MCP public-server/security
  regressions.

Additional focused run after the `render.list` scope fix: **PASS — 2 test
files, 56 tests**.

`git diff --check` was run for the Feature 146 planning/implementation files
and passed during the implementation wave.

The repository TypeScript check was rerun with output filtered to Feature 146
changed modules after fixing the resource-document type contract; no
diagnostics remained for the MCP core, CORS, feature-flag, or tenant-flag
files.

Security gates: `npm audit --omit=dev --audit-level=high` reported 0
vulnerabilities. `npm run security:mcp146` scanned 21 MCP/auth/download files
from the working tree and reported no findings. `npm run check:mcp146` completed
with exit code 2 from unrelated repository-wide diagnostics, but reported no
diagnostic in the MCP-targeted path set; it is therefore a scoped PASS, not a
full-repository typecheck PASS.

The Remotion executor gate also passes locally:

```bash
npm --workspace apps/remotion-executor run typecheck
npm --workspace apps/remotion-executor run test
```

Result: **PASS — 7 tests**, including device-proof signing, checksum-bound
init/PUT/complete upload, and rejection of insecure presigned URLs.

Repository automation added:

- `.github/workflows/mcp-v2-gates.yml` runs focused tests, targeted typecheck,
  secret scan, dependency audit, the pinned official MCP Inspector CLI
  (`@modelcontextprotocol/inspector@2.2.0`), and optional live protocol/failure
  evidence.
- `apps/web/scripts/mcp-v2-protocol-smoke.mjs` exercises manifest,
  `server/discover`, `tools/list`, `tools/call`, `resources/list`, and
  `resources/read` against a deployed endpoint without storing credentials.
- `apps/web/scripts/mcp-v2-failure-harness.mjs` checks session-header misuse,
  unknown methods, and unauthenticated rejection.
- `load-tests/scenario-mcp-v2.js` provides a manual k6 protocol load gate.
- Missing live secrets intentionally fail the live-evidence CI job; they are
  never represented as a green production proof.

## Gate status

| Gate | Status | Evidence / blocker |
| --- | --- | --- |
| Protocol/catalog/resources code path | PASS | Focused Vitest suites above |
| Legacy compatibility | PASS | Existing public-server/security suites above |
| Modern cursor integrity and schema enforcement | PASS | Signed cursor binding and unknown-field rejection tests |
| Redis as durable source of truth | PASS by design | Modern path is request-scoped; legacy Redis remains session/cache only |
| Inbound OAuth verifier | PASS in code / deployment BLOCKED | Opt-in `jose` JWKS verifier validates HTTPS JWKS, issuer, audience, RS256/ES256 signature, expiry, tenant/user mapping and scopes; deployment still needs real issuer/JWKS evidence |
| Tenant-level independent modern/alias/resource rollout flags | PASS / enabled for Smart AI Hub | Global `MCP_MODERN_PROTOCOL_ENABLED=true`; `tenant-ZCSKEM9s` has modern/resources/guide-alias flags enabled and verified through the application Redis client; other tenants remain unchanged |
| MCP Inspector/protocol contract | PASS in code / live BLOCKED | Modern Node smoke, failure harness, and pinned official Inspector CI command are implemented; live endpoint credentials were not available in this environment |
| Windows 11 Hermes/Remotion native render/upload | PASS in shared executor code / host BLOCKED | Device proof, doctor, signed runtime-pack path, checksum upload and HTTPS presigned URL validation are tested; real Windows 11 job claim/render/upload is still required |
| macOS Hermes/Remotion native render/upload | PASS in shared executor code / host BLOCKED | Same shared path and existing macOS matrix apply; real macOS arm64/x64 render/upload proof is still required, and Xcode-free use is not inferred from Linux |
| Live R2/Media History artifact upload/download parity | PASS in ACL contract / live BLOCKED | Library, media-history, managed-storage ACL re-check, Redis grant revocation, video content type and range path are covered; deployed R2 fixture remains required |
| Full repository TypeScript check | FAIL / baseline | Existing repository-wide client/server/VerticalDrama diagnostics remain; filtered Feature 146 changed paths are clean after the resource typing fix |

## Operational rollout update

On 2026-08-17 the modern MCP transport was enabled for the Smart AI Hub tenant
(`tenant-ZCSKEM9s`) only:

- `MCP_MODERN_PROTOCOL_ENABLED=true` is active in the `smartspec-web` systemd
  process environment.
- `mcpModernProtocolEnabled=true` enables `server/discover`, stateless modern
  requests, and modern `tools/list`/`tools/call` routing.
- `mcpResourcesEnabled=true` enables `resources/list` and `resources/read`.
- `mcpGuideToolAliasesEnabled=true` enables the guide aliases in the tool
  catalog.
- The values were written through `updateTenantFeatureFlags`, read back from
  the database, and verified through the application-configured Redis client.
- After restart, `/healthz` returned `{"status":"ok"}`; a tenant-scoped
  short-lived verification token successfully returned 19 tools and 4
  documentation resources.

MCP tasks and subscriptions remain disabled intentionally; asynchronous work is
handled through the existing job/status tools. OAuth protected-resource
advertising is enabled when the real issuer/JWKS configuration is present. A
static server token without tenant context continues to fail closed by design;
Hermes must use an API key, pairing token, session, or OAuth token that carries
the authenticated tenant/user context.

## Incremental closure — 2026-08-17

- Production discovery now includes the protected-resource metadata URL, and
  the Bearer challenge derives the canonical metadata link from the
  UI/database-backed MCP runtime config.
- OAuth scope metadata and consent use registry-canonical `llm:chat` and
  `remotion:*` names. Legacy `models:read` and `render:*` request names are
  normalized before token issuance. Library search/upload scopes are included
  for the corresponding owner-scoped tools.
- The shared generic OPTIONS handler delegates `/v1/mcp` preflights to the
  MCP-specific CORS allow-list, including hosted Claude and Codex origins;
  public `/v1/docs` and `/v1/openapi.json` are registered before the API auth
  chain for zero-config onboarding.
- The Connected Devices UI now explains that MCP OAuth and the local Remotion
  Executor are separate credential families and shows the exact doctor,
  connect, and start commands.
- Admin Infrastructure → MCP/OAuth now owns the production runtime config,
  encrypted signing key, legacy workspace policy, and readiness source. The
  production process no longer requires `MCP_*` env configuration.

No commit was created because the checkout contains unrelated dirty work; all
changes remain recoverable in the worktree.

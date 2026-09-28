# Feature 146 deep-plan research

## Research decision

- Codebase research: required. This is an existing TypeScript/Node/Drizzle/Vitest
  repository and the change touches shared HTTP, auth, registry, storage, and
  worker boundaries.
- Web research: required. The feature targets MCP 2026-07-28 compatibility,
  Streamable HTTP, resources, and OAuth Protected Resource Metadata.
- Testing research: required. The repository uses Vitest and has focused MCP,
  auth, device, and service tests; the plan extends those fixtures rather than
  introducing a second test framework.
- SocratiCode: unavailable in this runtime; no callable `codebase_status` or
  related tool was exposed. Findings below were verified with targeted shell
  search and exact file reads.

## Codebase findings

### HTTP and transport

- `apps/web/server/_core/mcpPublicServer.ts` implements a sessionful JSON-RPC
  endpoint at `/v1/mcp`, with `initialize`, `ping`, `tools/list`, and
  `tools/call` plus bounded batch handling.
- Legacy sessions are stored in Redis and generic replay caching is also
  Redis-backed. Redis must not become the durable exactly-once authority.
- The same module owns the product discovery manifest, static catalog route,
  download broker route, and MCP route registration. The root path is owned by
  Vite SPA fallback and must not be redirected to MCP.
- Shared CORS/header behavior is in `_core/index.ts`; new MCP protocol headers
  belong there rather than in a route-only workaround.

### Registry and domain adapters

- `apps/web/server/_core/mcpRegistry.ts` already owns models, credits, image,
  video, media history, Library, Hermes, and Remotion tool execution.
- Existing `smartspec.*` names are public compatibility identifiers. Aliases
  must resolve to those entries and must not duplicate business logic.
- Existing media and Remotion services already carry durable idempotency,
  ownership, billing, and worker contracts. Feature 146 must project them, not
  create a second scheduler/job/credit/artifact authority.

### Auth and storage

- `authz.ts` supports bearer/API-key parsing, MCP scopes, tenant/user context,
  paired-agent validation, JTI/device revocation, and owner binding.
- Connected-device, pairing, and managed-storage services are the safe boundary
  for user-owned devices and R2/external file reads.
- `mcpDownloadBrokerService.ts` is the safe download path. MCP resources must
  not expose arbitrary paths or pre-authenticated URLs.
- `mcpOAuthBroker.ts` is an outbound provider OAuth broker, not inbound
  SmartAIHub protected-resource metadata or an authorization server.

### Dependencies and testing

- `apps/web` targets Node 22 and uses Vitest. The repository does not currently
  depend on MCP TypeScript SDK v2 packages, so a compatibility adapter around
  the existing handler is lower risk for the first implementation. SDK adoption
  remains staged; v1/v2 types must not be mixed across one flow.
- Existing focused suites include `mcpPublicServer.test.ts`,
  `mcpPublicServerSecurity.test.ts`, registry tests, connected-device tests,
  OAuth tests, and media adapter tests.
- The current security suite has two known baseline failures: a timeout in a
  files-read negative test and a fixture that sends an undefined session id.
  These must be closed or explicitly isolated before rollout.

## Web research findings

The official MCP 2026-07-28 announcement describes modern requests as
stateless, without the initialize/session handshake, with per-request metadata,
`server/discover`, and cache hints (`ttlMs`, `cacheScope`). This supports a
stateless adapter while retaining the repository's legacy path.

Source: https://blog.modelcontextprotocol.io/posts/2026-07-28/

The official TypeScript SDK compatibility guide describes `createMcpHandler` as
the v2 HTTP entry point that can serve modern traffic and a legacy stateless
mode. Because this repository already has a custom registry and sessionful
behavior, the plan uses protocol-compatible boundary logic first and keeps SDK
migration staged.

Source: https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28

The MCP authorization specification requires Protected Resource Metadata and
authorization-server discovery. PRM alone is not an authorization server: the
server must only advertise metadata when issuer, token validation, audience,
JWKS/introspection, redirect, and scope configuration is real and testable.

Source: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization

## Planning decisions

1. Preserve current legacy endpoint behavior and add modern dispatch explicitly.
2. Use one registry snapshot for tools/list, static catalog, discovery, and docs.
3. Use durable domain idempotency as authority; Redis is cache/session/ephemeral
   state only.
4. Do not enable inbound OAuth metadata by default without a configured issuer.
5. Keep native Windows/macOS render evidence as Feature 145 release gates.

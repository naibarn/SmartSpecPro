# Section 01 — Transport, protocol eras, and discovery

## Scope

Own the `/v1/mcp` HTTP/JSON-RPC boundary and all discovery surfaces. Do not
change business tool implementations in this section.

## Current anchors

- `apps/web/server/_core/mcpPublicServer.ts:56` only supports `2025-03-26`.
- `mcpPublicServer.ts:692-862` requires Redis-backed `Mcp-Session-Id` for every
  non-initialize call.
- `mcpPublicServer.ts:882-890` is a product JSON manifest, not
  `server/discover`.
- `mcpPublicServer.ts:1062-1081` mounts `/v1/mcp`, catalog, and well-known.
- `apps/web/server/_core/vite.ts:230-265` owns SPA fallback and must remain so.

## Required design

1. Add a transport adapter that identifies modern vs legacy before dispatch.
2. Modern `2026-07-28` is stateless/per-request and does not read or create a
   Redis MCP session.
3. Legacy supports `2025-11-25` plus the current migration revision while the
   compatibility flag is on; preserve existing tests and session DELETE.
4. Validate parsed JSON content type, bounded body/batch, `MCP-Protocol-Version`,
   `Mcp-Method`, and `Mcp-Name` according to the locked SDK/spec. Reject any
   header/body mismatch before registry execution.
5. Implement `server/discover` using the exact official wire schema. Keep the
   existing well-known product manifest and static catalog generated from the
   same capability snapshot.
6. Define explicit POST/GET/DELETE/OPTIONS/HEAD behavior. Phase 1 GET must not
   open a public subscription stream; OPTIONS must validate Origin and only
   allow/expose the exact MCP headers.
7. Define HTTP disconnect cancellation, legacy `notifications/cancelled`, and
   post-commit non-rollback semantics. Reject MRTR/requestState until the
   future signed/replay-bound implementation exists.
8. Never route `/` to MCP; add a regression test asserting HTML/SPA behavior.
9. Keep HTTP status and JSON-RPC error mapping distinct for auth, expired
   legacy sessions, protocol errors, and tool errors.

## TDD contract

Write failing fixtures first for modern discovery, sessionless modern list/call,
legacy initialize/list/call, unsupported versions, header mismatch, malformed
content type, root route, batch limits, and load-balancer instance switching.
Only then implement the adapter and update the current legacy tests.

## Exit criteria

- Modern and legacy routes are independently testable with no cross-era state.
- Discovery never advertises resources/tasks/subscriptions before flags/tests
  enable them.
- Current `mcpPublicServer.test.ts` behavior remains green except for an
  intentionally versioned expectation with an explicit compatibility reason.

## Implementation status — 2026-08-17

Implemented in the current wave:

- `mcpV2Protocol.ts` separates modern stateless requests from legacy
  `initialize`/Redis-session requests and validates protocol/method/tool header
  consistency.
- `mcpPublicServer.ts` implements `server/discover`, `ping`, `tools/list`,
  `tools/call`, `resources/list`, and `resources/read`; legacy resources are
  also exposed without changing legacy session semantics.
- `GET`/`HEAD /v1/mcp` return an explicit 405 and MCP CORS allow/expose lists
  include the modern protocol headers.
- Modern behavior requires both `MCP_MODERN_PROTOCOL_ENABLED=true` and the
  tenant `mcpModernProtocolEnabled` flag; discovery advertises only legacy
  versions while either gate is disabled.
- Modern list cursors are signed, short-lived, and bound to tenant, user,
  scopes, and protocol era; legacy numeric cursors remain for compatibility.
- JSON responses expose bounded ETag/cache headers and modern HTTP contract
  validation rejects unsupported media types/Accept values.

Focused protocol/public-server tests pass. Batch/load-balancer and MCP
Inspector evidence remain release gates, not simulated as complete by unit
tests.

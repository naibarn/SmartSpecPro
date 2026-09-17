# Feature 199 Research

## Research decision

- Codebase: required; inspect Web MCP registry/routes/routers/schema, Python MCP client/executor, Runner bridge and existing MCP UI.
- Web topics: MCP authorization/lifecycle, official SDK transport behavior, OAuth/PKCE and Cloudflare isolation.
- Testing: focused Web Vitest, Python pytest and browser/state tests; no whole-repository typecheck.
- SocratiCode: unavailable; targeted shell discovery is recorded.

## Codebase findings

- Existing MCP code is in `apps/web/server/_core/mcpRegistry.ts`, `mcpRoutes.ts`, `mcpPublicServer.ts`, `mcpOAuthServer.ts`, MCP routers and `python-backend/app/services/mcp_client.py`/`mcp_executor.py`.
- Existing persistence includes `mcpProviderTemplates`, `userMcpConnections`, shares, schema cache, usage events, media tasks, `mcpServers` and assignments. Feature 199 must map/extend these rather than create parallel connection truth.
- `/admin/mcp-servers`, settings MCP panels and `/chat` are existing UI anchors. Runner connection is `/workers/connect`; Feature 199 must not create a second device/control plane.
- Feature 199 is target work beyond the current inbound/hosted MCP surface: full external upstream lifecycle, quarantine, schema revision, revocation and governed execution are not yet complete.

## External research

- MCP HTTP authorization requires secure bearer handling, metadata discovery, PKCE and HTTPS/redirect validation. See https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization.
- Official MCP Go SDK documentation distinguishes legacy initialize lifecycle and newer stateless behavior by negotiated protocol version; gateway contracts must version and probe instead of assuming one lifecycle. See https://go.sdk.modelcontextprotocol.io/protocol/.
- MCP authorization can be per-server or per-tool, but unauthorized protected requests must be rejected at the HTTP boundary. See https://apps.extensions.modelcontextprotocol.io/api/documents/authorization.html.
- Cloudflare Containers is the approved isolated runtime boundary for server-side workloads. See https://developers.cloudflare.com/containers/.

## Planning implications

Build management persistence and policy/quarantine before invocation. Keep credentials inside server/Runner adapters, use lazy bounded discovery, re-review schema changes, and route all calls through Feature 196 capability policy and Feature 195 Jobs where durable.


# Section 03 Diff Summary

- Added Redis-backed MCP idempotency caching in `apps/web/server/_core/mcpPublicServer.ts`
- Reused delegated execution budget controls via `apps/web/server/_core/mcpRegistry.ts`
- Hardened legacy gateways in `apps/web/server/_core/mcp.ts` and `apps/web/server/_core/mcpRoutes.ts`
- Fixed unrelated implicit-any blockers in `apps/web/server/routers/multiProvider.ts` so full `tsc` passes

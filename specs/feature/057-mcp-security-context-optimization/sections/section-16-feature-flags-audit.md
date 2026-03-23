# Section 16 — Feature Flags & Audit Events

## Section ID
`section-16-feature-flags-audit`

## Dependencies
- **section-12**: mcp_servers table

## Overview

Adds 3 feature flags for phased MCP rollout and defines audit event types for MCP operations. Flags: `mcpServerRegistry` (Phase 1), `mcpStdio` (Phase 2), `mcpOAuth` (Phase 3).

## Files to Modify

| File | Path |
|------|------|
| tenantFeatureFlagService.ts | `apps/web/server/services/tenantFeatureFlagService.ts` |
| auditMiddleware.ts | `apps/web/server/middleware/auditMiddleware.ts` |

---

## TDD Specification

```
# Test: mcpServerRegistry flag exists in KNOWN_FEATURE_FLAGS
# Test: mcpStdio flag exists in KNOWN_FEATURE_FLAGS
# Test: mcpOAuth flag exists in KNOWN_FEATURE_FLAGS
# Test: mcp_tool_call audit event type accepted
# Test: mcp_server_created audit event type accepted
# Test: mcp_server_deleted audit event type accepted
```

---

## Implementation Guidance

### Feature Flags

Add to `KNOWN_FEATURE_FLAGS` in `tenantFeatureFlagService.ts`:

```typescript
"mcpServerRegistry": { description: "MCP Server Registry (centralized management)", defaultEnabled: false },
"mcpStdio": { description: "MCP stdio transport (subprocess-based servers)", defaultEnabled: false },
"mcpOAuth": { description: "MCP OAuth 2.1 authentication", defaultEnabled: false },
```

### Audit Events

Add event types: `mcp_tool_call`, `mcp_server_created`, `mcp_server_updated`, `mcp_server_deleted`, `mcp_server_assigned`.

`mcp_tool_call` fields: `serverId`, `toolName`, `tenantId`, `agencyId`, `agentId`, `userId`, `paramKeys[]`, `responseStatus`, `latencyMs`. Never log `paramValues`.

---

## Actual Implementation Notes

### Files Modified
- **Modified**: `apps/web/shared/featureFlags.ts` — Added F40-F42 flags (mcpServerRegistry, mcpStdio, mcpOAuth)
- **Modified**: `apps/web/server/services/auditLogger.ts` — Added 5 MCP audit event types
- **Created**: `apps/web/server/services/__tests__/mcpFeatureFlags.test.ts` — 9 tests

### Feature Flags Added
- `mcpServerRegistry` (F40) — Phase 1: centralized MCP server management. Default: false
- `mcpStdio` (F41) — Phase 2: stdio transport support. Default: false
- `mcpOAuth` (F42) — Phase 3: OAuth 2.1 authentication. Default: false

All flags default to `false` for phased rollout.

### Audit Event Types Added
- `mcp_tool_call` — individual tool invocation
- `mcp_server_created` — new MCP server registered
- `mcp_server_updated` — server config changed
- `mcp_server_deleted` — server removed
- `mcp_server_assigned` — server assigned to agency/agent

### Test Count
9 tests validating flag existence, default values, and audit event type validity.

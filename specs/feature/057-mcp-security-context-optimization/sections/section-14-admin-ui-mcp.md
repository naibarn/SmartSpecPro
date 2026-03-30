# Section 14 — Admin UI: MCP Server Manager

## Section ID
`section-14-admin-ui-mcp`

## Dependencies
- **section-13**: tRPC router endpoints available

## Overview

Creates `McpServerManager.tsx` admin page for managing MCP server configurations, and adds MCP server picker to agency builder agent node config panel. Includes server table with health indicators, add/edit modal with transport-specific forms, test connection button, and data classification warnings.

## Files to Create

| File | Path |
|------|------|
| McpServerManager.tsx | `apps/web/client/src/pages/McpServerManager.tsx` |

## Files to Modify

| File | Path |
|------|------|
| NodePropertyPanel.tsx | `apps/web/client/src/components/agency/NodePropertyPanel.tsx` |
| routes (add page) | `apps/web/client/src/App.tsx` or router config |

---

## TDD Specification

```
# Test: server table renders list of MCP servers
# Test: health status badge shows green/red/gray based on healthStatus
# Test: add modal shows transport-type-specific config form
# Test: test connection button shows tool count on success
# Test: data classification warning displayed for external servers
# Test: agent node config shows MCP server multi-select picker
# Test: server picker only shows servers available to current tenant
```

---

## Implementation Guidance

### McpServerManager Page

- Server table: name, transport type, slug, tool count, health status (badge), last health check, risk level, actions (edit/delete/test)
- Add/Edit modal: transport type dropdown → conditional form sections:
  - HTTP: URL, headers, timeout
  - stdio: command, args (note: requires OpenSandbox)
- OAuth section: client ID, client secret (masked), connect button for auth_code flow
- Test connection: calls `trpc.mcpServers.testConnection` → shows `{reachable, toolCount, latencyMs}`
- Data classification: colored badge (public=green, internal=yellow, confidential=red) with warning text for confidential

### Agency Builder Integration

In the agent node property panel, add an MCP Servers section:

- Multi-select dropdown listing available `mcp_servers` for the tenant
- Each item shows: server name, transport icon, tool count badge
- Data classification warning: "Tool calls to external servers will send user data outside your organization"
- Test connection button per server

### Security Considerations

1. **Never display encrypted values**: OAuth secret, access token, refresh token — show masked indicator `"••••configured"` only
2. **Data classification warning**: Users must understand that MCP tool calls transmit data to external servers

---

## Actual Implementation Notes

### Files Created/Modified
- **Created**: `apps/web/client/src/pages/McpServerManager.tsx` — Full admin page with CRUD, health badges, transport-specific forms
- **Created**: `apps/web/client/src/pages/__tests__/McpServerManager.test.tsx` — 4 tests
- **Modified**: `apps/web/client/src/App.tsx` — Added lazy import + `/admin/mcp-servers` route

### Features Implemented
- Server table with health status (green/red/gray), transport type icons, risk level badges, data classification badges
- Add/Edit modal with transport-specific config (URL for HTTP, npx args for stdio)
- OAuth section with masked client secret input
- Test connection button with tool count and latency result
- Confidential data warning banner for high-risk servers
- Delete with confirmation dialog

### Deviations from Plan
- NodePropertyPanel MCP picker already exists from prior work (McpServersPanel.tsx) — uses old JSONB-based approach. Not modified in this section. The migration to registry-based assignments will be handled when the JSONB cutover occurs.

### Test Count
4 tests covering module import, health badge mapping, classification mapping, and transport labels.

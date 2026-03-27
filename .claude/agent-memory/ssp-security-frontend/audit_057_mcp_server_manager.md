---
name: audit_057_mcp_server_manager
description: 2026-03-24 frontend security audit of McpServerManager.tsx (feature-057 section-14 admin MCP server CRUD UI)
type: project
---

CONDITIONAL PASS — McpServerManager.tsx is clean on all critical axes.

**Why:** Admin-only page with correct RequireAdmin guard, tRPC-only mutations, no dangerouslySetInnerHTML, and the backing router's toResponse() function explicitly strips oauthClientSecretEncrypted and oauthAccessTokenEncrypted. OAuth secret never round-trips through the edit form (cleared to empty string on modal open).

**Remaining LOW gaps:**
- URL input (line 435) missing maxLength — server Zod schema has no length cap on the url field either
- npx args input (line 444) missing maxLength — server caps each arg at 256 chars and limits array to 10
- OAuth Client ID input (line 537) missing maxLength — server schema has no explicit cap

**How to apply:** For future MCP-related frontend work, note that the toResponse() whitelist pattern is the correct approach for any admin page displaying records that contain encrypted columns. Verify any new field additions to mcpServers schema are also excluded from toResponse() if they are encrypted.

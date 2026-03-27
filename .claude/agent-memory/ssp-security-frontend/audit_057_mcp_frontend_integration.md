---
name: audit_057_mcp_frontend_integration
description: 2026-03-24 frontend integration audit of MCP components (McpServerManager, McpServersPanel, ToolPicker, NodePropertyPanel MCP section, App.tsx routes) — CONDITIONAL PASS with 3 HIGH blocking findings
type: project
---

Audit of MCP frontend integration across 5 files on branch codex/feature-044-multimodal-chat-memory.

**Verdict: CONDITIONAL PASS** — 3 HIGH blocking findings, 3 MEDIUM, 2 LOW.

**Blocking (HIGH):**
- FE01: McpServersPanel URL field has no protocol guard — `new URL(server.url).hostname` renders without validating the scheme; `javascript:` and `file:` URIs parse without error. Add `https://` prefix enforcement and `maxLength={500}`.
- FE02: Per-agent Bearer token in McpServersPanel state is passed to `agency.saveMcpServers` and may persist as plaintext JSON in the DB. Should be encrypted server-side via `crypto.ts`; UI should never pre-populate on edit.
- FE03: McpServerManager admin page has no feature-flag gate — McpServersPanel gates on `useTenantFeatureFlag("agencyMcpBridge")` but the admin CRUD page does not. Admins on flag-disabled tenants can still CRUD server records.

**Non-blocking (MEDIUM/LOW):**
- FE04 MEDIUM: `new URL(server.url)` will throw at render time if the stored URL is invalid; no error boundary wraps McpServersPanel.
- FE05 MEDIUM: McpServersPanel add-form URL/name inputs lack `maxLength` attributes.
- FE06 MEDIUM: `toast.error(err.message)` exposes raw tRPC error messages; should sanitize to user-facing text for non-BAD_REQUEST codes.
- FE07 LOW: `confirm()` for MCP server delete — should use AlertDialog (same pattern flagged in prior audits).
- FE08 LOW: ToolPicker uses `(trpc as any)` casts for `deleteCustomTool` and `listTools`, bypassing TypeScript type safety.

**PASS items:**
- XSS: no dangerouslySetInnerHTML, no innerHTML assignment anywhere in scope.
- CSRF: all mutations go through tRPC httpLink with `credentials: "include"`.
- Secret display: oauthClientSecret uses `type="password"` and is never pre-populated on edit; `oauthConfigured` boolean used instead of value.
- Auth guard: `/admin/mcp-servers` wrapped in `<RequireAdmin>` in App.tsx:298–300.

**Why:** MCP server data is user-supplied (server names, descriptions, tool names) and connects to external endpoints; any URL or token handling needs hardening before production use.

**How to apply:** When reviewing future MCP-related PRs, verify the three HIGH items above are resolved. The URL protocol guard pattern (reject non-https:// before storing) should be applied consistently to any field that accepts external server URLs.

# Frontend MCP Integration Security Audit

**Auditor:** CMD-6 (SSP Frontend Security Auditor)
**Date:** 2026-03-24
**Branch:** codex/feature-044-multimodal-chat-memory
**Scope:** McpServerManager.tsx, ToolPicker.tsx, NodePropertyPanel.tsx (MCP section), McpServersPanel.tsx, App.tsx

---

## Summary

**Verdict: CONDITIONAL PASS** — No CRITICAL findings. Three HIGH findings must be resolved before merge: an unguarded protocol in the McpServersPanel URL input that allows `javascript:` / `file:` injection into the server URL render path, a Bearer token stored in React component state with no masking when the agent config is persisted, and a missing feature-flag gate on the admin McpServerManager page. Three MEDIUM and two LOW findings are also documented.

---

## Findings Table

| ID   | Severity | File:Line                                                                              | Anti-Pattern          | Description                                                                                                                                                                                                                                                                                                                                               | Recommended Fix                                                                                                                                                                  |
|------|----------|----------------------------------------------------------------------------------------|-----------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| FE01 | HIGH     | apps/web/client/src/components/agency/McpServersPanel.tsx:147                         | User-controlled URL   | `new URL(server.url).hostname` is rendered inside JSX without any protocol guard. An MCP server URL saved as `javascript://evil.com/...` does not throw on `new URL()` (it parses with hostname `evil.com`) but any downstream rendering or navigation using the raw `server.url` string could be exploitable. More immediately: a `file:///etc/passwd` URL parses fine and `.hostname` returns `""`, producing silent breakage. The form has no `maxLength` on the URL field and no `https://` prefix enforcement. | Validate that `server.url` starts with `https://` (or `http://` if stdio localhost is intended) before storing. Add `maxLength={500}` to the URL `<Input>`. Wrap the `new URL()` call in try/catch to avoid an uncaught render-time exception. |
| FE02 | HIGH     | apps/web/client/src/components/agency/McpServersPanel.tsx:48, 65–68, 114             | Secret in component state / persisted | The Bearer token for each MCP server is held in React state (`tokens`) and passed verbatim to `saveMutation.mutateAsync({ tokens })`. If the tRPC `agency.saveMcpServers` procedure stores these tokens in the agency config column (JSON), they persist in the database as plaintext. There is no masking in the UI when re-opening an existing server. | Tokens should be sent to the server and stored encrypted (using `crypto.ts` encrypt). The UI should never pre-populate the token field on edit — display `••••••••` placeholder with `type="password"` and only send a new value when the admin types one. |
| FE03 | HIGH     | apps/web/client/src/pages/McpServerManager.tsx (entire file)                          | Missing feature-flag gate | McpServerManager renders and makes tRPC calls regardless of whether the `agencyMcpBridge` (or an admin-level MCP flag) feature flag is enabled. McpServersPanel.tsx correctly gates on `useTenantFeatureFlag("agencyMcpBridge")`, but the admin CRUD page has no equivalent guard. An admin user on a tenant where MCP is disabled can still access `/admin/mcp-servers` and create server records. | Add `const mcpAdminEnabled = useTenantFeatureFlag("agencyMcpBridge");` at the top of McpServerManager and return an "unavailable" placeholder when false — matching the pattern used in McpServersPanel. |
| FE04 | MEDIUM   | apps/web/client/src/components/agency/McpServersPanel.tsx:147                         | Uncaught exception    | `new URL(server.url).hostname` throws a `TypeError` if `server.url` is not a valid URL (e.g., an empty string or a relative path saved by an older code path). This causes the entire NodePropertyPanel to unmount with an unhandled render-time exception. No error boundary wraps McpServersPanel at the call site in NodePropertyPanel.tsx:940. | Wrap in try/catch: `const hostname = (() => { try { return new URL(server.url).hostname; } catch { return server.url; } })();`. Add an ErrorBoundary wrapper around `<McpServersPanel>` in NodePropertyPanel. |
| FE05 | MEDIUM   | apps/web/client/src/components/agency/McpServersPanel.tsx:217–235                    | No input maxLength on URL / name fields | The add-server form inputs for URL and server name have no `maxLength` attribute. A user with agency edit access can submit an arbitrarily long URL string that the tRPC procedure must validate server-side. The absence of client-side caps creates a degraded UX (no feedback) and relies entirely on server-side Zod validation to prevent oversized payloads. | Add `maxLength={500}` to the URL input and `maxLength={100}` to the name input, consistent with the McpServerManager admin form which already has `maxLength={100}` on its fields. |
| FE06 | MEDIUM   | apps/web/client/src/pages/McpServerManager.tsx:199                                    | Raw error message surfaced | `toast.error(err.message || "Failed to save MCP server")` exposes the raw tRPC error message to the UI. For create/update failures the server may include internal detail (e.g., DB constraint text, stack fragments in development). The same pattern appears at lines 211 and the pattern is systemic across the file. | Sanitize tRPC errors before display: use the tRPC `TRPCClientError` shape's `message` only when it is a user-facing validation error (TRPC code `BAD_REQUEST`). For other codes render a generic message. |
| FE07 | LOW      | apps/web/client/src/pages/McpServerManager.tsx:206                                    | confirm() for destructive action | `confirm("Delete this MCP server? All assignments will be removed.")` uses the browser's synchronous `confirm()` dialog, which is blocked in cross-origin iframes and has inconsistent appearance. This is the same low-severity pattern noted in prior audits (agency_swarm_r2.md FE-CONFIRM-01). | Replace with a Radix UI `AlertDialog` confirmation modal, consistent with other destructive actions in the codebase. |
| FE08 | LOW      | apps/web/client/src/components/agency/ToolPicker.tsx:63–73                            | (trpc as any) casts bypass type safety | The `deleteMutation` and `listTools` query both use `(trpc as any)` casts with optional chaining fallbacks. This suppresses TypeScript errors but means the compiler cannot catch a procedure rename or signature change at build time. The fallback `{ mutate: () => {} }` silently no-ops if the tRPC namespace is missing, making failures invisible. | Remove the `as any` casts. Access `trpc.agency.deleteCustomTool.useMutation` and `trpc.agency.listTools.useQuery` directly with full TypeScript types. |

---

## Detailed Notes by Check Area

### 1. XSS via dangerouslySetInnerHTML / innerHTML
No instances of `dangerouslySetInnerHTML` or `ref.innerHTML` found in any of the four audited files. All MCP server names, slugs, descriptions, and tool names from the server list are rendered via React JSX text interpolation (`{server.name}`, `{tool.name}`, `{tool.description}`), which is safe. ToolPicker renders tool names and descriptions as plain JSX text with no raw HTML paths. **PASS.**

### 2. CSRF Protection
All MCP mutations (`mcpServers.create`, `mcpServers.update`, `mcpServers.delete`, `mcpServers.testConnection`, `agency.saveMcpServers`) use the tRPC client defined in `main.tsx:263–297`. That client uses `httpLink` with a custom `fetch` wrapper that sets `credentials: "include"`, sending the session cookie on every request. The app uses cookie-based session auth (JWT in httpOnly cookie), making CSRF the responsibility of the SameSite cookie attribute set server-side. No raw `fetch()` calls are used for state-changing MCP operations. **PASS.**

### 3. Secret Exposure
The admin form correctly uses `<Input type="password">` for `oauthClientSecret` (McpServerManager.tsx:545) and the field is never pre-populated on edit (lines 151–153 leave both OAuth fields blank). The `oauthConfigured` boolean flag is displayed instead of any token value (line 314). However, FE02 above identifies that the per-agent Bearer token in McpServersPanel is persisted without encryption. No `VITE_` env vars exposing server secrets were found in the audited files. **PARTIAL PASS — see FE02.**

### 4. Feature Flag Gating
McpServersPanel.tsx correctly gates on `useTenantFeatureFlag("agencyMcpBridge")` and renders a disabled placeholder when the flag is off. NodePropertyPanel renders `<McpServersPanel>` inside its MCP section which inherits this gate. However McpServerManager.tsx (the admin CRUD page) has no feature-flag gate — see FE03. **PARTIAL PASS — see FE03.**

### 5. Auth Guard on Admin Route
App.tsx line 298–300 wraps `/admin/mcp-servers` in `<RequireAdmin>`, which checks `user.role === "admin"` and redirects to `/dashboard` for non-admins and to `/login` for unauthenticated users. The `RequireAdmin` guard returns `null` while `isLoading` is true, preventing a flash-of-content race. **PASS.**

### 6. Input Validation
McpServerManager admin form:
- `name`: `maxLength={100}` — present.
- `slug`: `maxLength={100}`, enforced to `[a-z0-9-]` on change — present.
- `description`: `maxLength={500}` — present.
- `url`: no `maxLength` and no protocol validation (see FE01 for risk level assessment; in the admin form this is lower risk since only admins can submit, but defense-in-depth dictates adding it).
- `args` (stdio): no `maxLength` — noted in prior audit `audit_057_mcp_server_manager.md` as LOW.
- `timeoutSeconds`: `min={5}` `max={120}` — present.
- `creditPerCall`: `min={0}` `max={100}` — present.

McpServersPanel user-facing form:
- URL: no `maxLength`, no protocol guard — see FE01, FE05.
- Name: no `maxLength` — see FE05.

### 7. Error Handling
tRPC query errors from `mcpServers.list` are not explicitly handled — `listQuery.isLoading` is shown but `listQuery.isError` has no UI path; on error the component renders the empty-state card, which is acceptable UX but silent. Mutation errors surface via `toast.error(err.message)` — see FE06. The discover path in McpServersPanel (line 97) catches errors but silently swallows them with no user-visible feedback (`// Error shown via TanStack Query error handling` — but `utils.agency.discoverMcpTools.fetch` is a direct fetch, not a `useQuery`, so TanStack Query's error UI is never triggered). This means discovery failures are invisible to the user. **MEDIUM concern** — consider adding a toast on the catch block at McpServersPanel.tsx:97.

---

## Pass/Fail Summary

| Check Area              | Result          | Finding IDs |
|-------------------------|-----------------|-------------|
| XSS (dangerouslySetInnerHTML) | PASS      | —           |
| CSRF protection         | PASS            | —           |
| Secret exposure         | PARTIAL PASS    | FE02        |
| Feature flag gating     | PARTIAL PASS    | FE03        |
| Auth guard on admin route | PASS          | —           |
| Input validation        | PARTIAL PASS    | FE01, FE05  |
| Error handling          | PARTIAL PASS    | FE04, FE06  |

**Blocking items before merge:** FE01, FE02, FE03.

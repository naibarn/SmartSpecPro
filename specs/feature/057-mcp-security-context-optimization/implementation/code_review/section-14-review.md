## Section 14 Code Review

**File reviewed:** `apps/web/client/src/pages/McpServerManager.tsx` (577 lines)
**Route registration:** `apps/web/client/src/App.tsx` — `/admin/mcp-servers` wrapped in `<RequireAdmin>`
**Backing router:** `apps/web/server/routers/mcpServers.ts`

---

### Issues (if any)

#### LOW — URL field has no maxLength bound on the form input (line 435)

The URL input for HTTP/Streamable HTTP transport has no `maxLength` attribute:

```tsx
<Input
  value={form.url}
  onChange={(e) => setForm({ ...form, url: e.target.value })}
  placeholder="https://mcp-server.example.com/rpc"
/>
```

The server-side Zod schema enforces `z.string().url()` but no length cap. A very long URL string will pass the client form and be caught only at the server layer. The `args` field for stdio transport has the same gap (no `maxLength` on the input, though the server caps each arg at 256 chars and limits the array to 10 items). A `maxLength={2048}` on the URL input and a reasonable cap on args (e.g., `maxLength={512}`) would give consistent defence-in-depth.

#### LOW — `oauthClientId` field has no maxLength bound (line 537)

The OAuth Client ID input has no `maxLength`. The server schema has no explicit cap on this field either (`z.string().optional()`). A 64- or 256-char maxLength would be appropriate.

#### LOW — `err.message` forwarded directly to toast on mutation failure (lines 200, 212, 279)

```typescript
toast.error(err.message || "Failed to save MCP server");
```

`err` is typed `any`, so `err.message` will contain whatever the tRPC layer returns. For `adminProcedure` errors this is generally safe because tRPC strips internal details from non-TRPCError exceptions, but the pattern opens a path for a server-generated error message containing a stack trace fragment or internal path to reach the UI. The fallback string approach is correct; the risk is low given tRPC's default error masking but worth noting as a pattern to avoid propagating raw server messages in general.

---

### What was checked and passed

**XSS — PASS.** No `dangerouslySetInnerHTML` anywhere in the file. All server-derived strings (`server.name`, `server.slug`, `server.riskLevel`, `server.transportType`, classification/health labels) are rendered as React text nodes or resolved through a static lookup map (e.g., `HEALTH_BADGES[server.healthStatus]`), not injected as raw HTML. The confidential data warning (line 357–361) is entirely static string content.

**Secret exposure — PASS.** The `toResponse()` function in `mcpServers.ts` (line 79–102) explicitly omits `oauthClientSecretEncrypted` and `oauthAccessTokenEncrypted`. The UI receives only the boolean `oauthConfigured` flag and renders a lock icon; it never displays or re-populates the secret value. On edit open, `oauthClientId` and `oauthClientSecret` are initialised to empty strings (lines 151–152), preventing any stored secret from round-tripping through the form. The password field placeholder correctly shows masked dots for edit mode.

**Auth guard — PASS.** The route is registered as `<RequireAdmin><McpServerManager /></RequireAdmin>` (diff line 45–47). The backing tRPC procedures use `adminProcedure` (all CRUD) and `rateLimitedAdminProcedure` (testConnection), so both the UI and API layers enforce admin-only access.

**Form input bounds — LARGELY PASS.** `name` (maxLength 100), `slug` (maxLength 100 + regex sanitisation on change), `description` (maxLength 500), `timeoutSeconds` (min 5 / max 120), `creditPerCall` (min 0 / max 100) are all correctly bounded. Transport type, risk level, and classification use closed `<Select>` components with no free-text path. The gaps are the URL and OAuth Client ID fields noted above.

**Error handling / mutation feedback — PASS.** All four mutations (create, update, delete, testConnection) have `try/catch` blocks with `toast.error` on failure and `toast.success` on success. The save button is disabled while any mutation is pending. The test connection handler correctly handles the `reachable: false` case as well as thrown exceptions.

**CSRF — PASS.** All state-changing operations use tRPC mutations (`trpc.mcpServers.*.useMutation`), not raw `fetch()`.

**`VITE_` env var leakage — PASS.** No `import.meta.env` references in this file.

**JWT/token in localStorage — PASS.** No localStorage access in this file.

---

### Security Assessment

**CONDITIONAL PASS**

The implementation is well-structured for an admin-only page. Encrypted secrets are correctly withheld from API responses and never re-populated into form fields. All routes are properly guarded. No XSS vectors are present.

The three LOW findings are defence-in-depth gaps rather than exploitable vulnerabilities — the server-side Zod validation catches all of them before persistence. Recommended remediation before merge:

1. Add `maxLength={2048}` to the URL input (line 435).
2. Add `maxLength={512}` to the npx args input (line 444).
3. Add `maxLength={256}` to the OAuth Client ID input (line 537).

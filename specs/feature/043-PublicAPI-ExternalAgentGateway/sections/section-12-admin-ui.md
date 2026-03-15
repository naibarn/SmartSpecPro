I have enough context now. Let me produce the section content.

# Section 12 -- Admin UI: API Key Management, Usage Dashboard, and Webhook Administration

## Overview

This section builds the admin-facing UI and tRPC backend for managing Public API keys, viewing per-key usage analytics, and administering webhook endpoints. It replaces the existing placeholder `AdminAPIKeys.tsx` page (which uses raw `fetch()` calls to REST endpoints that do not exist yet) with a fully functional implementation backed by a new tRPC `apiKeys` router.

**Scope:**
- New tRPC router: `apps/web/server/routers/apiKeys.ts` with RBAC (admin sees all tenant keys, user sees own)
- Rewrite `apps/web/client/src/pages/AdminApiKeys.tsx` to use tRPC, add scope checkboxes, one-time key display, usage dashboard, webhook tab
- Wire the page into `App.tsx` routing and admin sidebar navigation
- Test files for both tRPC router and React components

**Dependencies (must be completed first):**
- Section 01 (database schema): `api_keys`, `api_audit_events`, `api_webhook_endpoints`, `api_webhook_deliveries` tables
- Section 02 (API key service): `apiKeyService.ts` with `createKey`, `listKeys`, `revokeKey`, `getKeyUsageStats`, `validateKey`
- Section 11 (webhooks): webhook endpoints and delivery infrastructure

---

## Tests

All tests use Vitest. Create test files co-located with the implementation.

### 12.1 tRPC Router Tests

**File:** `apps/web/server/routers/__tests__/apiKeys.test.ts`

```typescript
/**
 * Tests for the apiKeys tRPC router.
 *
 * Uses Vitest with mocked DB and apiKeyService.
 * Follows existing pattern from apps/web/server/routers/audit.ts.
 */

// Test: apiKeys.list returns keys for current user (non-admin)
//   - Mock ctx.user with role='user', userId=42
//   - Expect apiKeyService.listKeys called with (tenantId, userId=42)
//   - Returns array of key objects without keyHash

// Test: apiKeys.list returns all tenant keys for admin
//   - Mock ctx.user with role='admin'
//   - Expect apiKeyService.listKeys called with (tenantId, userId=undefined)
//   - Returns all tenant keys

// Test: apiKeys.create generates key and returns prefix + raw key
//   - Input: { name: 'Test Key', scopes: ['skills:list', 'skills:execute'] }
//   - Expect apiKeyService.createKey called with correct args
//   - Returns { id, prefix, rawKey, name, scopes }
//   - rawKey is only returned on create (never on list)

// Test: apiKeys.create validates scopes against ALLOWED_API_SCOPES
//   - Input with invalid scope 'admin:nuke' should throw TRPCError FORBIDDEN

// Test: apiKeys.revoke deactivates key
//   - Input: { keyId: 'uuid-123' }
//   - Expect apiKeyService.revokeKey called
//   - Returns { success: true }

// Test: apiKeys.revoke rejects if key belongs to different tenant
//   - Should throw NOT_FOUND or FORBIDDEN

// Test: apiKeys.getUsageStats aggregates audit events
//   - Input: { keyId: 'uuid-123', days: 7 }
//   - Returns { requestsPerDay, totalRequests, totalCredits, errorRate, topEndpoints }

// Test: apiKeys.listWebhooks returns webhook endpoints for tenant
//   - Returns array with id, url, events, isActive, failureCount, lastDeliveredAt

// Test: apiKeys.deleteWebhook removes webhook by id
//   - Verifies tenant ownership before deletion
//   - Returns { success: true }
```

### 12.2 React Component Tests

**File:** `apps/web/client/src/pages/__tests__/AdminApiKeys.test.tsx`

```typescript
/**
 * Tests for AdminApiKeys page component.
 *
 * Uses Vitest + @testing-library/react with mocked tRPC.
 */

// Test: AdminApiKeys page renders key list table
//   - Mock tRPC apiKeys.list to return 2 keys
//   - Expect table rows with name, prefix, scopes badges, status

// Test: create key dialog shows scope checkboxes
//   - Click "Create API Key" button
//   - Expect dialog with checkboxes for all 15 scopes
//   - Expect name input, expiry input, credit limit input, rate limit input

// Test: one-time key display dialog shows raw key with copy button
//   - Mock tRPC apiKeys.create to return { rawKey: 'sk-ssp_test_abc123' }
//   - After creation, expect dialog showing the raw key
//   - Expect "Copy to Clipboard" button
//   - Expect warning text about one-time display

// Test: revoke button disables key
//   - Click revoke on a key row
//   - Expect confirmation dialog
//   - On confirm, expect tRPC apiKeys.revoke called
//   - Expect key list to refresh

// Test: admin sees all tenant keys, user sees only own keys
//   - This is controlled by the tRPC router (tested above)
//   - UI test verifies the list renders whatever the router returns
```

---

## Implementation Details

### 12.4 tRPC Router: `apps/web/server/routers/apiKeys.ts`

Create a new tRPC router following the pattern established by `apps/web/server/routers/audit.ts`.

**Key design decisions:**
- Use `protectedProcedure` (not `adminProcedure`) for `list` and `create` so regular users can manage their own keys
- RBAC logic inside each procedure: admin/domain_admin sees all tenant keys; regular users see only their own
- Use `adminProcedure` for `getUsageStats` (analytics are admin-only)
- The `create` procedure returns the raw key exactly once; subsequent `list` calls never return the hash or raw key

**Procedures to implement:**

1. **`list`** -- `protectedProcedure`, no input required
   - Determine `tenantId` from `ctx.user.tenantId`
   - If `ctx.user.role === 'admin' || ctx.user.role === 'domain_admin'`, call `apiKeyService.listKeys(tenantId)` (all tenant keys)
   - Otherwise, call `apiKeyService.listKeys(tenantId, ctx.user.id)` (own keys only)
   - Return array of `{ id, name, keyPrefix, scopes, rateLimit, creditLimit, expiresAt, lastUsedAt, isActive, createdAt }`

2. **`create`** -- `protectedProcedure`
   - Zod input: `{ name: z.string().min(1).max(100), scopes: z.array(z.string()), expiresInDays: z.number().optional(), creditLimit: z.number().nullable().optional(), rateLimit: z.number().optional() }`
   - Validate each scope against `ALLOWED_API_SCOPES` constant (the 15 scopes defined in the plan: `skills:list`, `skills:execute`, `agencies:list`, `agencies:invoke`, `presentations:create`, `video_projects:create`, `media:generate`, `llm:chat`, `mcp:read`, `mcp:write`, `jobs:create`, `jobs:read`, `webhooks:manage`, `events:read`, `api_keys:manage`)
   - Call `apiKeyService.createKey(tenantId, userId, name, scopes, { expiresInDays, creditLimit, rateLimit })`
   - Return `{ id, keyPrefix, rawKey, name, scopes }` -- the `rawKey` is only available at creation time

3. **`revoke`** -- `protectedProcedure`
   - Zod input: `{ keyId: z.string() }`
   - Call `apiKeyService.revokeKey(keyId, tenantId)` -- the service verifies tenant ownership
   - Return `{ success: true }`

4. **`getUsageStats`** -- `adminProcedure`
   - Zod input: `{ keyId: z.string(), days: z.number().min(1).max(90).default(7) }`
   - Query `api_audit_events` table, aggregating by day
   - Return `{ requestsPerDay: { date, count, errors, creditsUsed }[], totalRequests, totalCredits, errorRate, topEndpoints: { path, count }[] }`

5. **`listWebhooks`** -- `adminProcedure`
   - Query `api_webhook_endpoints` WHERE `tenantId = ctx.user.tenantId`
   - Return array of `{ id, url, events, isActive, failureCount, lastDeliveredAt, createdAt }`
   - Do NOT return `secretEncrypted` -- secrets are never exposed after creation

6. **`deleteWebhook`** -- `adminProcedure`
   - Zod input: `{ webhookId: z.string() }`
   - Verify tenant ownership: query `api_webhook_endpoints` WHERE `id = webhookId AND tenantId = ctx.user.tenantId`
   - Set `isActive = false` (soft delete) or hard delete per preference
   - Return `{ success: true }`

7. **`reEnableWebhook`** -- `adminProcedure`
   - Zod input: `{ webhookId: z.string() }`
   - Verify tenant ownership
   - Set `isActive = true`, `failureCount = 0` on the `api_webhook_endpoints` row
   - Return `{ success: true }`

**Registration:** Add `apiKeys: apiKeysRouter` to the `appRouter` in `apps/web/server/routers.ts`, importing from `./routers/apiKeys`.

### 12.1 Admin Page: `apps/web/client/src/pages/AdminApiKeys.tsx`

Rewrite the existing `AdminAPIKeys.tsx` file. The current version uses raw `fetch()` calls to `/api/v1/api-keys` REST endpoints that are part of an older implementation. The new version uses tRPC queries/mutations from the `apiKeys` router defined above.

**Note on filename:** The existing file is `AdminAPIKeys.tsx`. The plan specifies `AdminApiKeys.tsx`. Either name works -- use the existing filename to avoid breaking any existing imports, or rename it. The important thing is consistency with the route registration in `App.tsx`.

**Page layout and components:**

1. **Header** -- page title "API Keys", subtitle about managing external integrations, "Create API Key" button (top right)

2. **Key list table** -- Radix Table with columns:
   - Name (text)
   - Key Prefix (`sk-ssp_abc12...`, monospace font)
   - Scopes (Badge components, grouped by category)
   - Rate Limit (number or "Default")
   - Credit Limit (number/day or "Unlimited")
   - Status (Active/Inactive badge with color)
   - Last Used (relative time or "Never")
   - Created (date)
   - Actions (Usage stats button, Revoke button)

3. **Create key dialog** -- Dialog component with:
   - Name input (required, max 100 chars)
   - Scope checkboxes organized by category:
     - **Skills**: `skills:list`, `skills:execute`
     - **Agencies**: `agencies:list`, `agencies:invoke`
     - **Presentations**: `presentations:create`
     - **Video**: `video_projects:create`
     - **Media**: `media:generate`
     - **LLM**: `llm:chat`
     - **MCP**: `mcp:read`, `mcp:write`
     - **Jobs**: `jobs:create`, `jobs:read`
     - **Webhooks**: `webhooks:manage`
     - **Events**: `events:read`
     - **API Keys**: `api_keys:manage`
   - Expiry date picker (optional, default 365 days)
   - Daily credit limit input (optional, null = unlimited)
   - Rate limit override input (optional, default 60 RPM)

4. **One-time key display dialog** -- Shown after successful creation:
   - Warning banner: "Make sure to copy this key now. You will not be able to see it again."
   - Key displayed in a monospace code block with full `sk-ssp_...` value
   - "Copy to Clipboard" button using `navigator.clipboard.writeText()`
   - "Done" button that closes the dialog

5. **Revoke confirmation dialog** -- AlertDialog component:
   - Title: "Revoke API Key?"
   - Description warning that all services using this key will stop working
   - Cancel and Revoke buttons

6. **Usage stats panel** -- Opened when clicking the activity icon on a key row:
   - Dialog or expandable panel showing per-key analytics
   - Requests over time (simple bar list, one row per day with count and errors)
   - Total requests, total credits consumed, error rate percentage
   - Top endpoints by call count (list)
   - Data sourced from `tRPC apiKeys.getUsageStats`

7. **Webhook management tab** -- Tab within the same page or a separate section:
   - Table of registered webhook endpoints: URL, subscribed events (badges), status, failure count, last delivered
   - Delete button per webhook (with tenant ownership verification on server)
   - **Re-enable button** per disabled webhook: when `isActive = false` and `failureCount >= 3`, show a "Re-enable" button that calls `tRPC apiKeys.reEnableWebhook({ webhookId })` — this resets `failureCount` to 0 and sets `isActive = true`
   - No "create webhook" UI here -- webhooks are created via the Public API (`POST /v1/webhooks`). The admin UI is for monitoring and cleanup only.

**Data fetching pattern** (follows existing codebase convention):

```typescript
// Use tRPC hooks from @tanstack/react-query integration
const { data: keys, isLoading } = trpc.apiKeys.list.useQuery();
const createMutation = trpc.apiKeys.create.useMutation({
  onSuccess: (data) => {
    // Show one-time key dialog with data.rawKey
    utils.apiKeys.list.invalidate();
  },
});
const revokeMutation = trpc.apiKeys.revoke.useMutation({
  onSuccess: () => {
    utils.apiKeys.list.invalidate();
  },
});
```

**UI components to use:** Import from `@/components/ui/` -- `Card`, `Table`, `Badge`, `Button`, `Dialog`, `AlertDialog`, `Input`, `Label`, `Checkbox` (Radix). Icons from `lucide-react`: `Key`, `Plus`, `Trash2`, `Copy`, `Activity`, `Shield`, `AlertTriangle`.

### 12.3 Route Registration

**File:** `apps/web/client/src/App.tsx`

Add the lazy import and route:

```typescript
const AdminApiKeys = lazy(() => import("./pages/AdminApiKeys"));
// ...
<Route path="/admin/api-keys" component={AdminApiKeys} />
```

Place this route alongside the other `/admin/*` routes (near line 166 in the current file, after `admin/audit-logs`).

**Admin sidebar navigation:**

The admin sidebar menu items are defined in the shared menu configuration. Add an entry for "API Keys" with the `Key` lucide icon, linking to `/admin/api-keys`. Position it in the "Integrations" or "Security" group alongside existing items. The exact file to modify depends on where the sidebar menu is configured -- look for the component that renders the admin navigation links (likely in a layout component or the shared menu config at `packages/shared/`).

### 12.2 Usage Dashboard Details

The usage dashboard is rendered as a detail view when clicking on a specific key's activity icon. It calls `trpc.apiKeys.getUsageStats.useQuery({ keyId, days })`.

The aggregation query on the server side queries `api_audit_events`:

```sql
-- Requests per day for a specific API key
SELECT
  date_trunc('day', "createdAt")::date::text AS date,
  count(*)::int AS count,
  count(*) FILTER (WHERE "statusCode" >= 400)::int AS errors,
  coalesce(sum("creditsUsed"), 0)::int AS credits_used
FROM api_audit_events
WHERE "apiKeyId" = $1
  AND "createdAt" > NOW() - INTERVAL '$2 days'
GROUP BY date_trunc('day', "createdAt")
ORDER BY date_trunc('day', "createdAt");

-- Top endpoints
SELECT "path", count(*)::int AS count
FROM api_audit_events
WHERE "apiKeyId" = $1
  AND "createdAt" > NOW() - INTERVAL '$2 days'
GROUP BY "path"
ORDER BY count(*) DESC
LIMIT 10;
```

Use Drizzle ORM query builder syntax (not raw SQL) following the pattern in `apps/web/server/routers/audit.ts` which uses `sql` tagged template for aggregate expressions.

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `apps/web/server/routers/apiKeys.ts` | **Create** | tRPC router with list, create, revoke, getUsageStats, listWebhooks, deleteWebhook |
| `apps/web/server/routers/__tests__/apiKeys.test.ts` | **Create** | Unit tests for tRPC router procedures |
| `apps/web/client/src/pages/AdminApiKeys.tsx` | **Rewrite** | Full admin UI page (replaces existing placeholder) |
| `apps/web/client/src/pages/__tests__/AdminApiKeys.test.tsx` | **Create** | React component tests |
| `apps/web/server/routers.ts` | **Modify** | Add `apiKeys: apiKeysRouter` to appRouter |
| `apps/web/client/src/App.tsx` | **Modify** | Add lazy import and `/admin/api-keys` route |

---

## ALLOWED_API_SCOPES Constant

The 15 scopes used in scope checkboxes and validation. This constant should be defined in `apps/web/shared/publicApiTypes.ts` (created by section 02). If it does not exist yet, define it locally in the router and re-export:

```typescript
export const ALLOWED_API_SCOPES = [
  'skills:list',
  'skills:execute',
  'agencies:list',
  'agencies:invoke',
  'presentations:create',
  'video_projects:create',
  'media:generate',
  'llm:chat',
  'mcp:read',
  'mcp:write',
  'jobs:create',
  'jobs:read',
  'webhooks:manage',
  'events:read',
  'api_keys:manage',
] as const;

export type ApiScope = (typeof ALLOWED_API_SCOPES)[number];
```

---

## Security Considerations

- The raw API key is returned exactly once during creation and never stored or logged on the server. The tRPC `list` procedure returns only `keyPrefix` for identification.
- The `getUsageStats` procedure is restricted to `adminProcedure` to prevent regular users from viewing analytics of other users' keys.
- The `revoke` procedure verifies tenant ownership via `apiKeyService.revokeKey(keyId, tenantId)` -- the service must check the key belongs to the caller's tenant.
- Webhook secrets (`secretEncrypted`) are never returned in `listWebhooks` responses.
- The `deleteWebhook` procedure verifies tenant ownership before deletion to prevent IDOR.

---

## Scope Bundle Recommendations

To simplify key creation for common use cases, the "Create API Key" dialog should include pre-defined scope bundles as quick-select buttons above the individual scope checkboxes:

| Bundle | Label | Scopes Included | Use Case |
|--------|-------|-----------------|----------|
| Read Only | "Read-only access" | `skills:list`, `agencies:list`, `jobs:read`, `events:read` | Monitoring dashboards, analytics integrations |
| Skill Runner | "Execute skills" | `skills:list`, `skills:execute`, `media:generate` | External apps that run skills and generate media |
| Agency Operator | "Invoke agencies" | `agencies:list`, `agencies:invoke`, `skills:list` | Agent-to-agent orchestration |
| Full Access | "All permissions" | All 15 scopes | Admin/development keys |
| MCP Client | "MCP integration" | `mcp:read`, `mcp:write`, `skills:list`, `skills:execute`, `agencies:list`, `agencies:invoke`, `media:generate` | AI assistants connecting via MCP |

Clicking a bundle button checks the corresponding scope checkboxes. Users can then add/remove individual scopes. The bundles are a UI convenience only — no special handling on the server side.
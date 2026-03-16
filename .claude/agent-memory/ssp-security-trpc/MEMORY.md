# CMD-6 tRPC Security Auditor — Persistent Memory

## Project Security Conventions

### Auth & Tenant Isolation Pattern
- All tRPC procedures use `protectedProcedure` from `../_core/trpc` (enforces JWT auth)
- Tenant isolation uses `ctx.tenantId` and `ctx.user.id` (both from JWT)
- Standard WHERE clause for tenant-scoped mutations:
  `and(eq(table.id, input.id), eq(table.tenantId, ctx.tenantId), eq(table.ownerUserId, ctx.user.id))`
- `resolveLibraryTenantId()` helper used in both gdrive and onedrive routers

### Internal Proxy Token Pattern
- `SMARTSPEC_PROXY_TOKEN` via `process.env.SMARTSPEC_PROXY_TOKEN` (not VITE_ prefixed — correct)
- Sent as `x-proxy-token` header to Python backend internal endpoints
- Module-level constant with startup `console.warn` if missing
- Python backend OAuth calls use short-lived signed JWTs (`signBearerToken`, 15m TTL) not PROXY_TOKEN

### Rate Limiting Pattern
- Rate limiters injected as tRPC `.use()` middleware before `.input()`
- Four limiter categories: search, read, sync, edit
- Both routers: `createGDriveRateLimitMiddleware` used for both GDrive and OneDrive

### VITE_ Env Vars in Server Code (Confirmed)
- `apps/web/server/_core/env.ts` lines 3, 35, 39 — reads `VITE_APP_ID`, `VITE_OAUTH_SERVER_URL`, `VITE_PYTHON_BACKEND_URL`
- `apps/web/server/_core/liveBrowserStreamProxy.ts` line 6 — reads `VITE_PYTHON_BACKEND_URL`
- `apps/web/server/_core/mcpRoutes.ts` line 36 — reads `VITE_PYTHON_BACKEND_URL`
- `apps/web/server/routes/webhooks.ts` line 17 — reads `VITE_PYTHON_BACKEND_URL`
- `apps/web/server/services/federatedSearch.ts` line 67 — reads `VITE_PYTHON_BACKEND_URL`
- `apps/web/server/services/presentationPlaybackExport.ts` line 186 — reads `VITE_PYTHON_BACKEND_URL`
- `apps/web/server/services/mediaGenerationService.ts` line 421 — reads `VITE_APP_URL`
- `apps/web/server/services/chatService.ts` line 28 — reads `VITE_PYTHON_BACKEND_URL`
- NOTE: These are FALLBACK reads (non-VITE_ var checked first). Still a naming risk — Vite bundles `VITE_*` into client JS if referenced via `import.meta.env`.

### Known Structural Issues (confirmed across audits)

#### GDrive/OneDrive routers
- `updateSyncSettings` UPDATE uses `eq(table.id, existing.id)` — missing tenantId/userId in the UPDATE WHERE clause (IDOR in update path even though SELECT was scoped)
- `listDriveFolders` accepts `parentFolderId: z.string()` with no regex/max-length validation
- `removeFromIndex` libraryChunks DELETE is scoped only by `libraryItemId`, not by tenantId
- `getDriveFilePreview` returns full `...payload` spread including driveFile metadata — unvalidated passthrough

#### scheduledMessages.ts
- `getAnalytics` — when `input.scheduleId` is provided, inserts it directly into `scheduleIds` array without verifying ownership; the query uses `inArray(scheduledMessageLogs.scheduledMessageId, scheduleIds)` — IDOR allows reading another user's execution logs (line ~688)

#### accountSecurity.ts
- `removeBlockedPattern` mutation — uses `eq(blockedPatterns.id, input.id)` with no tenantId scope; blocked patterns appear to be global admin-owned records but the WHERE clause has no secondary isolation guard (line 125)

#### users.ts (admin)
- `get` procedure — selects `db.select()` (all columns including `twoFactorSecret`, `recoveryCodes`, `passwordHash`) from `users` table; response mapping (lines 154-178) manually strips them, but `select()` without explicit column list is a risk if mapping code is ever modified

## Files Audited (Full Scan — 2026-03-16)
- `apps/web/server/routers/credits.ts` — CLEAN
- `apps/web/server/routers/users.ts` — partial secret exposure risk on admin `get`
- `apps/web/server/routers/llmProviders.ts` — CLEAN (no key returned, SSRF guard present)
- `apps/web/server/routers/apiKeys.ts` — CLEAN (assertKeyOwnership helper used consistently)
- `apps/web/server/routers/media.ts` — CLEAN (protectedProcedure throughout, rate limited)
- `apps/web/server/routers/chat.ts` — CLEAN (all service calls pass ctx.user.id)
- `apps/web/server/routers/artifact.ts` — CLEAN (ownership via service layer)
- `apps/web/server/routers/videoEditorProjects.ts` — CLEAN (and() + userId on all mutations)
- `apps/web/server/routers/usage.ts` — CLEAN (ownership check on getTransactionPayload)
- `apps/web/server/routers/audit.ts` — CLEAN (adminProcedure throughout)
- `apps/web/server/routers/accountSecurity.ts` — minor: removeBlockedPattern no tenantId scope
- `apps/web/server/routers/systemSettings.ts` — CLEAN (adminProcedure/domainAdminProcedure)
- `apps/web/server/routers/library.ts` — CLEAN (resolveLibraryTenantId + service-layer ownership)
- `apps/web/server/routers/agency.ts` — CLEAN (tenantId-scoped + ownership checks)
- `apps/web/server/routers/scheduledMessages.ts` — IDOR on getAnalytics scheduleId
- `apps/web/server/routers/mediaJobs.ts` — CLEAN (meta.userId ownership on getStatus/cancelJob)
- `apps/web/server/routers/presentation.ts` — service-layer ownership (not directly verified)
- `apps/web/server/routers/googleDrive.ts` — previously audited (see above)
- `apps/web/server/routers/oneDrive.ts` — previously audited (see above)
- `apps/web/server/_core/env.ts` — VITE_ fallback reads (MEDIUM risk)

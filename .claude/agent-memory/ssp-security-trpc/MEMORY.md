# CMD-6 tRPC Security Auditor — Persistent Memory

## Project Security Conventions

### Auth & Tenant Isolation Pattern
- All tRPC procedures use `protectedProcedure` from `../\_core/trpc` (enforces JWT auth)
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

### Known Structural Issues (confirmed across audits)
- `updateSyncSettings` UPDATE uses `eq(table.id, existing.id)` — missing tenantId/userId in the UPDATE WHERE clause (IDOR in update path even though SELECT was scoped)
- `listDriveFolders` in both routers accepts `parentFolderId: z.string()` with no regex/max-length validation
- `removeFromIndex` libraryChunks DELETE is scoped only by `libraryItemId`, not by tenantId — safe only because libraryItemId was verified tenant-scoped in the prior SELECT
- `getDriveFilePreview` returns full `...payload` spread including `driveFile` metadata from Python — unvalidated passthrough
- `getCreditUsageBreakdown` and `getRecentActivity` are NOT scoped by tenantId (only by userId) — acceptable if creditTransactions is user-owned, but worth flagging

## Files Audited
- `apps/web/server/routers/googleDrive.ts` — 1406 lines
- `apps/web/server/routers/oneDrive.ts` — 1327 lines

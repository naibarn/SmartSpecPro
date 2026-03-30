# Section 03 — Node.js Auth & Tenant Isolation Fixes

## Section ID
`section-03-nodejs-auth-tenant`

## Dependencies
- None (Wave 1 — parallel with section-01, section-02)

## Overview

Fixes 2 CRITICAL + 4 HIGH vulnerabilities in `mcp.ts` and `mcpRoutes.ts`: auth bypass when `GATEWAY_KEY` is unset (M16), `.env` files in read/write extension allowlists (M17/M18), tenant injection via `x-tenant-id` header (M01), opt-in write token (M02), extensionless file path traversal (M03), cross-user Python tools cache (M04), symlink containment bypass (M20), and duplicate route aliases (M26).

## Files to Modify

| File | Path | Fixes |
|------|------|-------|
| mcp.ts | `apps/web/server/_core/mcp.ts` | M16, M17, M18, M19, M20, M21 |
| mcpRoutes.ts | `apps/web/server/_core/mcpRoutes.ts` | M01, M02, M03, M04, M26 |

## Test File to Modify

| File | Path |
|------|------|
| mcpRoutes.test.ts | `apps/web/server/_core/mcpRoutes.test.ts` |

---

## TDD Specification

### Test: mcp.ts security fixes

```
# Test: requireGatewayKey returns 503 when GATEWAY_KEY is empty/unset (M16)
  - Set SMARTSPEC_WEB_GATEWAY_KEY to ""
  - Call requireGatewayKey middleware
  - Assert response status 503 with error "MCP gateway not configured"

# Test: .env excluded from DEFAULT_READ_EXTS (M17/M18)
  - Assert ".env" not in DEFAULT_READ_EXTS set
  - Assert ".env" not in DEFAULT_WRITE_EXTS set

# Test: reading .env file is rejected by assertExtAllowed
  - Call workspace_read_file with path "test/.env"
  - Assert error thrown about extension not allowed

# Test: sessionId must be UUID format (M19)
  - Call artifact_get_url with sessionId "../../admin"
  - Assert validation error, not URL construction

# Test: symlink resolved before containment check (M20)
  - (Conditional on test env supporting symlinks)
  - Create symlink inside workspace pointing to /tmp
  - Assert read via symlink path is rejected
```

### Test: mcpRoutes.ts security fixes

```
# Test: tenantId resolved from auth object, not x-tenant-id header (M01)
  - Send request with x-tenant-id: "evil-tenant" but auth.tenantId = "real-tenant"
  - Assert handler uses "real-tenant"

# Test: tenantId header ignored even when auth.tenantId is absent (M01)
  - Send request with x-tenant-id: "injected" and auth object without tenantId
  - Assert request fails or uses a safe fallback, not the header value

# Test: workspace write requires write token (M02)
  - Set MCP_REQUIRE_WRITE_TOKEN=1
  - Call workspace_write_file without x-mcp-write-token
  - Assert 403 Forbidden

# Test: extensionless files are rejected (M03)
  - Call workspace_read_file with path "Makefile" (no extension)
  - Assert error thrown

# Test: Python tools cache is per-user-per-tenant (M04)
  - Request tools as user 1 tenant A — cache populated
  - Request tools as user 2 tenant B — assert different cache entry used
  - Assert user 2 does not receive user 1's tools

# Test: /mcp/ alias routes removed or redirect to /api/mcp/ (M26)
  - POST /mcp/tools
  - Assert either 404 or 301 redirect to /api/mcp/tools

# Test: request with non-numeric x-user-id returns 400 (M06)
  - Set x-user-id: "abc" (no valid auth.userId)
  - Assert 400 Bad Request, not NaN propagation

# Test: request with absent x-user-id resolved from auth (M06)
  - No x-user-id header, auth.userId = 42
  - Assert userId used is 42, not 0 or NaN

# Test: catch blocks do not use console.error with raw error objects (M15)
  - Trigger error in MCP handler
  - Assert structured logger used, not console.error(err)
  - Assert error.stack and error.message not in raw stdout

# Test: audit log path construction rejects traversal in traceId (M21)
  - Call audit function with traceId "../../etc/cron.d/evil"
  - Assert error or traceId sanitized to filename-safe chars
  - Assert no file created outside audit log directory

# Test: security guards do not use NODE_ENV for enforcement (M25)
  - Set NODE_ENV=development
  - Call requireGatewayKey with empty key
  - Assert still returns 503 (same behavior as production)

# Test: trace ID sanitized — newlines and control chars removed (M27)
  - Send X-Trace-Id: "abc\nINFO fake-event-injection"
  - Assert logged traceId contains only [a-zA-Z0-9_-]
  - Assert no injected line in log output
```

---

## Implementation Guidance

### mcp.ts

#### M16: Deny access when GATEWAY_KEY unset
```typescript
export function requireGatewayKey(req: Request, res: Response, next: NextFunction) {
  if (!GATEWAY_KEY) {
    return res.status(503).json({ error: "MCP gateway not configured" });
  }
  // existing key comparison logic
}
```

#### M17/M18: Remove .env from allowlists
Remove `.env` from both `DEFAULT_READ_EXTS` and `DEFAULT_WRITE_EXTS` arrays.

#### M03: Deny extensionless files
```typescript
function assertExtAllowed(filePath: string, allowSet: Set<string>) {
  const ext = path.extname(filePath);
  if (!ext || !allowSet.has(ext)) {
    throw new Error(`Extension "${ext || '(none)'}" not allowed`);
  }
}
```

#### M19: Validate sessionId format
```typescript
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!UUID_RE.test(String(args.sessionId))) {
  throw new Error("Invalid session ID format");
}
```

#### M20: Resolve symlinks before containment check
```typescript
const resolved = fs.realpathSync(fullPath);
if (!resolved.startsWith(WORKSPACE_ROOT + path.sep)) {
  throw new Error("Path escapes workspace after symlink resolution");
}
```

### mcpRoutes.ts

#### M01: Resolve tenantId from auth only
```typescript
// BEFORE (vulnerable):
const tenantId = auth?.tenantId || String(req.headers["x-tenant-id"] || "");
// AFTER:
const tenantId = auth?.tenantId || auth?.user?.tenantId || "";
if (!tenantId) {
  return res.status(400).json({ error: "Missing tenant context" });
}
```

#### M04: Tenant-scoped Python tools cache
```typescript
// Change cache key from time-only to (userId, tenantId, time-bucket)
const cacheKey = `${userId}:${tenantId}:${Math.floor(Date.now() / 60000)}`;
```

#### M26: Remove /mcp/ aliases
Remove the duplicate route registrations at lines ~468-471 for `/mcp/tools` and `/mcp/call`.

### Security Considerations

1. **Gateway key bypass**: When `GATEWAY_KEY` is empty, returning `true` makes all workspace read/write endpoints fully unauthenticated. The fix fails closed (503) instead of failing open.
2. **Tenant injection**: The `x-tenant-id` header is user-controllable. Reading tenantId from the verified JWT/session auth object prevents cross-tenant access.
3. **Extension bypass**: Files without extensions (Makefile, Dockerfile, .gitignore) bypass the extension allowlist check when the guard is `if (ext && ...)`. Changing to `if (!ext || !allowSet.has(ext))` closes this gap.

I now have enough context. Let me produce the section content.

# Section 03 -- Auth Extension

## Overview

This section extends the existing `authorizeRequest()` function in `apps/web/server/_core/authz.ts` to detect `sk-ssp_` prefixed API keys and route them through the API key validation path built in section-02. It also introduces a `requireScopes()` middleware for per-route scope enforcement, a `publicApiFeatureGuard` middleware that checks the tenant `publicApi` feature flag, and the `AuthContext` type used by all downstream public API route handlers.

**Dependencies:** Section 01 (database schema with `api_keys` table, feature flag column), Section 02 (apiKeyService with `validateKey()`).

**Blocks:** Sections 04 through 11 -- every public API route depends on authentication working.

---

## Files to Create or Modify

| File | Action |
|------|--------|
| `apps/web/server/_core/authz.ts` | **Modify** -- add `api_key` mode to `AuthResult` union; add `sk-ssp_` detection before JWT path |
| `apps/web/shared/publicApiTypes.ts` | **Create** -- `AuthContext` type, `ALLOWED_API_SCOPES` constant |
| `apps/web/server/middleware/requireScopes.ts` | **Create** -- Express middleware factory for scope enforcement |
| `apps/web/server/middleware/publicApiFeatureGuard.ts` | **Create** -- Express middleware that checks tenant `publicApi` flag |
| `apps/web/shared/featureFlags.ts` | **Modify** -- add `publicApi` boolean to `TenantFeatureFlags` interface, defaults, and allowed set |
| `apps/web/server/services/tenantFeatureFlagService.ts` | **Modify** -- add `publicApi` to `REDIS_SYNCED_FLAGS` set |
| `apps/web/server/_core/llmRoutes.ts` | **Modify** -- update `getUserIdFromAuth` and `checkCredits` to handle `mode: "api_key"` |
| `apps/web/server/_core/agencyStreamProxy.ts` | **Modify** -- handle `mode: "api_key"` in auth result |
| `apps/web/server/_core/mcpRoutes.ts` | **Modify** -- handle `mode: "api_key"` in auth result |

---

## Tests

All tests use Vitest. Create the test file at `apps/web/server/__tests__/authExtension.test.ts`.

### Auth Extension Tests (authz.ts)

```
Test: authorizeRequest detects sk-ssp_ prefix and routes to API key validation
  - Mock apiKeyService.validateKey to return a valid result
  - Create a request with Authorization: Bearer sk-ssp_test_abc123
  - Call authorizeRequest with { allowBearer: true, allowSession: false }
  - Assert result has ok: true, mode: "api_key"

Test: authorizeRequest falls through to JWT for non-sk-ssp_ tokens
  - Create a request with Authorization: Bearer eyJhbGciOi...
  - Verify apiKeyService.validateKey is NOT called
  - Verify JWT verification path is attempted

Test: authorizeRequest returns mode='api_key' with correct AuthContext fields
  - Mock validateKey to return { userId: 42, tenantId: "tenant-uuid-abc", scopes: ["skills:execute"], apiKeyId: "key-id-123" }
  - Assert result contains: ok: true, mode: "api_key", sub: "42", tenantId: "tenant-uuid-abc", scopes: ["skills:execute"], apiKeyId: "key-id-123"

Test: authorizeRequest returns tenantId as string (varchar(36))
  - Mock validateKey with tenantId: "a1b2c3d4-..."
  - Assert typeof result.tenantId === "string"

Test: existing session auth still works after API key auth is added
  - Create request with session cookie (no Bearer header)
  - Call authorizeRequest with { allowBearer: true, allowSession: true }
  - Assert result has mode: "session"

Test: existing bearer (static token) auth still works
  - Create request with Bearer set to ENV.mcpServerToken
  - Assert result has mode: "bearer", sub: "static"

Test: authorizeRequest returns ok: false when API key is invalid
  - Mock validateKey to return null
  - Assert result has ok: false, error containing "Invalid API key"
```

### Scope Enforcement Tests (requireScopes.ts)

Create test file at `apps/web/server/__tests__/requireScopes.test.ts`.

```
Test: requireScopes middleware returns 403 for missing scope
  - Attach auth result with scopes: ["skills:list"] to req
  - Call requireScopes("skills:execute")
  - Assert res.status(403) with error code "insufficient_scopes"

Test: requireScopes middleware passes for matching scope
  - Attach auth result with scopes: ["skills:execute", "skills:list"]
  - Call requireScopes("skills:execute")
  - Assert next() is called

Test: requireScopes grants all scopes for session auth (web UI)
  - Attach auth result with mode: "session" (no scopes array needed)
  - Call requireScopes("skills:execute")
  - Assert next() is called

Test: requireScopes checks multiple scopes (AND logic)
  - Attach auth result with scopes: ["skills:execute"]
  - Call requireScopes("skills:execute", "agencies:invoke")
  - Assert res.status(403) because "agencies:invoke" is missing
```

### Feature Flag Guard Tests (publicApiFeatureGuard.ts)

Create test file at `apps/web/server/__tests__/publicApiFeatureGuard.test.ts`.

```
Test: API key auth rejected when tenant publicApi=false
  - Attach auth result with mode: "api_key" and tenantId
  - Mock tenant lookup to return publicApi: false
  - Assert res.status(403) with error code "feature_disabled"

Test: API key auth passes when tenant publicApi=true
  - Mock tenant lookup to return publicApi: true
  - Assert next() is called

Test: disabling publicApi immediately blocks existing keys
  - Same as rejection test; the guard checks the flag on every request, not cached

Test: session auth bypasses publicApi guard
  - Attach auth result with mode: "session"
  - Assert next() is called regardless of publicApi flag

Test: bearer (static token) auth bypasses publicApi guard
  - Attach auth result with mode: "bearer"
  - Assert next() is called
```

---

## Implementation Details

### 1. AuthResult Type Extension (authz.ts)

The existing `AuthResult` type at `/home/dev/projects/SmartSpecPro/apps/web/server/_core/authz.ts` is a discriminated union:

```typescript
export type AuthResult =
  | { ok: true; mode: "bearer"; sub: string; scopes: string[] }
  | { ok: true; mode: "session"; user: any; sub: string; scopes: string[] }
  | { ok: false; error: string };
```

Add a new variant for API key auth:

```typescript
  | { ok: true; mode: "api_key"; sub: string; scopes: string[]; tenantId: string; apiKeyId: string; userId: number }
```

Key fields:
- `sub` -- set to `String(userId)` for backward compatibility with `getUserIdFromAuth()`
- `tenantId` -- varchar(36), the tenant UUID from the API key record
- `apiKeyId` -- the API key record ID for audit logging
- `userId` -- the numeric user ID who owns the key (avoids DB lookup in hot path)
- `scopes` -- the scopes array from the API key record

### 2. Detection Logic in authorizeRequest()

In the `authorizeRequest()` function, insert the API key detection **after** `parseBearer()` extracts the token but **before** the static token check. The check is simple: if the token starts with `sk-ssp_`, route to API key validation.

The flow becomes:

1. Extract Bearer token
2. If token starts with `sk-ssp_` -- call `apiKeyService.validateKey(token)`
   - If valid: return `{ ok: true, mode: "api_key", ...fields }`
   - If invalid: return `{ ok: false, error: "Invalid API key" }`
3. Existing static token check (unchanged)
4. Existing JWT verification (unchanged)
5. Session cookie auth (unchanged)

The `apiKeyService` import should be a lazy/dynamic import or a direct import from `../services/apiKeyService`. The `validateKey` function (built in section-02) returns `{ userId, tenantId, scopes, apiKeyId }` on success or `null` on failure. It internally checks:
- HMAC hash lookup
- `isActive` flag
- Expiry date
- Tenant `publicApi` feature flag

**Important:** The feature flag check inside `validateKey` is the first line of defense. The `publicApiFeatureGuard` middleware (below) is the second line, applied per-route for defense-in-depth. Both must be present.

### 3. Downstream Compatibility Updates

Several call sites check `auth.mode` with strict equality. These need updating to handle the new `"api_key"` mode.

**`apps/web/server/_core/llmRoutes.ts` -- `getUserIdFromAuth()`:**

Currently handles `mode: "session"` (gets `auth.user.id`) and `mode: "bearer"` (looks up by openId). For `mode: "api_key"`, the `userId` is already on the auth result, so add:

```typescript
if (auth.mode === "api_key") {
  return auth.userId;
}
```

This avoids an unnecessary DB lookup in the hot path.

**`apps/web/server/_core/llmRoutes.ts` -- `checkCredits()`:**

Currently skips credit checks for `mode: "bearer"` with `sub: "static"`. API key auth should NOT skip credit checks. The existing logic handles this correctly because the `sub !== "static"` guard prevents the skip. No change needed here, but verify this during implementation.

**`apps/web/server/_core/agencyStreamProxy.ts`:**

Line 58 calls `authorizeRequest`. The downstream code extracts tenantId. For `mode: "api_key"`, tenantId is directly available on the auth result (unlike session/bearer where it must be looked up). Update the tenantId extraction to check for `auth.mode === "api_key"` first.

**`apps/web/server/_core/mcpRoutes.ts`:**

Similar pattern -- ensure `mode: "api_key"` is handled in the auth result switch/branch.

**`apps/web/server/_core/deviceAuthRoutes.ts`:**

Lines 585-587 check `auth.mode === "session"` and `auth.mode === "bearer"`. Device auth is browser-only, so API key mode can be rejected here. No special handling needed; the existing fallthrough returns an error.

### 4. AuthContext Type (publicApiTypes.ts)

Create `apps/web/shared/publicApiTypes.ts` with:

```typescript
/**
 * Unified auth context passed to service functions from both
 * tRPC procedures (session auth) and public API routes (API key auth).
 */
export interface AuthContext {
  userId: number;
  tenantId: string; // varchar(36) UUID -- NOT integer
  mode: "session" | "api_key";
  apiKeyId?: string;
  scopes?: string[];
}
```

Also define the full scope list:

```typescript
export const ALLOWED_API_SCOPES = [
  "skills:list",
  "skills:execute",
  "agencies:list",
  "agencies:invoke",
  "llm:chat",
  "media:generate",
  "presentations:create",
  "video_projects:create",
  "jobs:create",
  "jobs:read",
  "webhooks:manage",
  "events:read",
  "mcp:read",
  "mcp:write",
  "api_keys:manage",
] as const;

export type ApiScope = (typeof ALLOWED_API_SCOPES)[number];
```

This `AuthContext` type is used by later sections (05-10) when calling service functions. The refactor of `skillExecutor.executeSkill()`, `agencyBridge`, and other service functions to accept `AuthContext` is scoped to those downstream sections, not this one. This section only defines the type and ensures auth produces the right data.

### 5. requireScopes Middleware (requireScopes.ts)

Create `apps/web/server/middleware/requireScopes.ts`.

The middleware factory takes one or more scope strings and returns an Express middleware. It reads the auth result from `req` (attached by upstream auth middleware or by the route handler after calling `authorizeRequest()`).

Design decisions:
- For `mode: "session"` -- all scopes are implicitly granted. Session users are web UI users with full access.
- For `mode: "bearer"` -- check against the scopes from the static token or JWT claims.
- For `mode: "api_key"` -- check that every required scope is present in the key's scopes array.
- Uses AND logic: all listed scopes must be present.
- Returns 403 with OpenAI-compatible error format: `{ error: { code: "insufficient_scopes", message: "...", type: "auth_error" } }`

The auth result must be attached to `req` before this middleware runs. Use the typed `req.auth` property (see Express Request type extension below). The attachment is done by the `apiKeyAuthMiddleware` which calls `authorizeRequest()` and sets `req.auth = authResult`.

### 5a. Express Request Type Extension

Extend the Express `Request` type so all public API middleware and route handlers can access `req.auth` with type safety:

**File:** `apps/web/server/middleware/publicApiTypes.ts` (or add to `apps/web/shared/publicApiTypes.ts`)

```typescript
import type { AuthResult } from "../_core/authz";

declare global {
  namespace Express {
    interface Request {
      /** Populated by apiKeyAuthMiddleware for /v1/* routes */
      auth?: AuthResult;
    }
  }
}
```

The `apiKeyAuthMiddleware` (mounted globally for the `/v1` sub-router) calls `authorizeRequest(req)` and assigns the result to `req.auth`. All downstream middleware (`publicApiFeatureGuard`, `requireScopes`, route handlers) read from `req.auth`.

**Convention:** All section implementations (05-12) must use `req.auth` (not `(req as any).authResult` or other ad-hoc property names).

### 6. publicApiFeatureGuard Middleware (publicApiFeatureGuard.ts)

Create `apps/web/server/middleware/publicApiFeatureGuard.ts`.

This middleware checks whether the tenant has the `publicApi` feature flag enabled. It only applies to API key authenticated requests:

- If `auth.mode === "api_key"` -- look up tenant feature flags and check `publicApi === true`. If false, return 403 with error code `"feature_disabled"`.
- If `auth.mode === "session"` or `auth.mode === "bearer"` -- skip the check (pass through). These are internal/web-UI auth modes that do not require the feature flag.

The tenant feature flags are read from the database (or Redis cache if the flag is in `REDIS_SYNCED_FLAGS`). The lookup uses `tenantId` from the auth result.

### 7. Feature Flag Addition (featureFlags.ts)

Add to `apps/web/shared/featureFlags.ts`:

- In `TenantFeatureFlags` interface: `publicApi: boolean; // F19 -- Public API key access`
- In `ALLOWED_FEATURE_FLAGS` set: add `"publicApi"`
- In `FEATURE_FLAG_DEFAULTS`: `publicApi: false`

Add to `apps/web/server/services/tenantFeatureFlagService.ts`:

- In `REDIS_SYNCED_FLAGS` set: add `"publicApi"` (so disabling via admin UI takes effect immediately without waiting for DB cache expiry)

---

## How Auth Results Flow to Route Handlers

The pattern used by all public API routes (sections 05-12) is:

1. Route handler calls `authorizeRequest(req, { allowBearer: true, allowSession: true })`
2. If `!auth.ok`, return 401
3. Attach auth result to `req` for downstream middleware
4. `publicApiFeatureGuard` checks feature flag (only for `mode: "api_key"`)
5. `requireScopes("skills:execute")` checks scope permissions
6. Route handler builds `AuthContext` from auth result and passes to service function

This section establishes steps 1-5. Step 6 is implemented per-route in sections 05-12.

---

## AuthContext → userToken Bridge Pattern

Several existing service functions (e.g., `skillExecutor.executeSkill()`, `agencyBridge.executeRun()`, `mediaGenerationService.generateImageAsync()`, `triggerPresentationExport()`) accept a `userToken: string` parameter used for internal Python backend communication. The Public API uses `AuthContext` instead of a session-derived `userToken`.

### Shared Utility Location

**File:** `apps/web/server/_core/tokens.ts` -- add `createInternalTokenFromAuth` as an exported function alongside the existing `signBearerToken()`.

This MUST be a shared utility, NOT duplicated per-section. All downstream sections (05-08) import from `_core/tokens.ts`.

```typescript
// apps/web/server/_core/tokens.ts -- ADD this export

import crypto from "crypto";
import type { AuthContext } from "../../shared/publicApiTypes";

/**
 * Create a short-lived internal bearer token from an AuthContext.
 * Used to call service functions that still expect a userToken string
 * (e.g., Python backend communication via X-User-Token header).
 */
export function createInternalTokenFromAuth(auth: AuthContext, scopes?: string[]): string {
  return signBearerToken(
    {
      sub: String(auth.userId),
      type: "access",
      scopes: scopes ?? ["media:generate", "presentation:export"],
      jti: `api_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`,
    },
    "15m" // short TTL -- only used for the immediate downstream call
  );
}
```

**Key properties:**
- **15-minute TTL** -- the token is only used for the immediate service call, not stored
- **Unique `jti`** -- prevents replay across requests
- **Scoped** -- each section should pass only the scopes needed for that specific service call
- **Not the raw API key** -- the `userToken` must never be the raw `sk-ssp_` API key itself

**Per-section usage (all import from `_core/tokens.ts`):**
- **Section 05 (Skill API):** `createInternalTokenFromAuth(auth, ["skills:execute"])`
- **Section 06 (Agency API):** `createInternalTokenFromAuth(auth, ["agencies:invoke"])`
- **Section 07 (Presentation API):** `createInternalTokenFromAuth(auth, ["media:generate", "presentation:export"])`
- **Section 08 (Media API):** `createInternalTokenFromAuth(auth, ["media:generate"])`

### tenantId Type Bridge Note

**Important:** The existing codebase uses `number` for tenant IDs in some places (e.g., `LibraryActor.tenantId` in tRPC context) but `string` (varchar(36) UUID) in others. The `AuthContext.tenantId` is always `string`. When calling existing service functions that expect numeric tenant IDs, use `Number(auth.tenantId)` or refactor the service to accept both. The schema migration (section 01) uses varchar(36) for `api_keys.tenantId`, which aligns with the `tenants.id` column type.

### Migration Checklist

When implementing this section, verify these steps in order:
1. Add `api_key` variant to `AuthResult` union in `authz.ts`
2. Add `sk-ssp_` detection in `authorizeRequest()` flow
3. Create `publicApiTypes.ts` with `AuthContext` and `ALLOWED_API_SCOPES`
4. Create `requireScopes.ts` middleware
5. Create `publicApiFeatureGuard.ts` middleware
6. Add `createInternalTokenFromAuth` to `_core/tokens.ts`
7. Add Express `req.auth` type extension
8. Update downstream compatibility sites (`llmRoutes`, `agencyStreamProxy`, `mcpRoutes`)
9. Add `publicApi` feature flag to `featureFlags.ts` and `tenantFeatureFlagService.ts`

This bridge is a temporary pattern. A future refactor should update all service functions to accept `AuthContext` directly, eliminating the need for intermediate JWTs.

---

## Security Considerations

- **Timing-safe comparison:** The HMAC hash comparison in `apiKeyService.validateKey()` (section-02) must use `crypto.timingSafeEqual`. This section's auth extension simply calls that function.
- **No key leakage:** The auth result never includes the raw API key. Only `apiKeyId` and `keyPrefix` are propagated.
- **Defense-in-depth:** The `publicApi` flag is checked both inside `validateKey()` (section-02) and in `publicApiFeatureGuard` middleware (this section). Disabling the flag blocks all API key auth immediately.
- **Scope granularity:** 15 scopes provide fine-grained access control. The `requireScopes` middleware enforces AND logic -- requesting `skills:execute` requires the key to have that exact scope.

---

## Additional Edge Case Tests

These tests supplement the main test stubs above and cover boundary conditions discovered during plan review.

### Auth Edge Cases (`authExtension.test.ts` additions)

```
Test: authorizeRequest with empty Authorization header returns ok: false
  - req.headers.authorization = ""
  - Assert ok: false (not a crash or unhandled exception)

Test: authorizeRequest with "Bearer " (empty token after prefix) returns ok: false
  - req.headers.authorization = "Bearer "
  - Assert ok: false

Test: authorizeRequest with malformed sk-ssp_ key (too short) returns ok: false
  - req.headers.authorization = "Bearer sk-ssp_"
  - Mock validateKey to return null
  - Assert ok: false, error: "Invalid API key"

Test: req.auth is undefined for requests that bypass apiKeyAuthMiddleware
  - Direct request to a non-/v1/ route
  - Assert req.auth is undefined (middleware only runs on /v1/* sub-router)
```

### Feature Guard Edge Cases (`publicApiFeatureGuard.test.ts` additions)

```
Test: publicApiFeatureGuard handles missing tenantId gracefully
  - Attach auth result with mode: "api_key" but tenantId undefined
  - Assert res.status(500) with internal error (not crash)

Test: publicApiFeatureGuard handles Redis/DB lookup failure
  - Mock tenant flag lookup to throw
  - Assert res.status(500) with internal error, request does NOT proceed
```

### Full Middleware Chain Integration Test

Create a lightweight integration test in `apps/web/server/__tests__/publicApiMiddlewareChain.test.ts`:

```
Test: full middleware chain: CORS → headers → auth → featureGuard → rateLimit → audit
  - Mount the publicApiRouter on a test Express app
  - Add a test route: GET /v1/test that returns 200
  - Send request with valid API key
  - Assert: CORS headers present, X-Request-Id present, audit event logged
  - Send request with invalid API key → assert 401 before reaching route handler
  - Send request with valid key but publicApi=false → assert 403
  - Send request with valid key but missing required scope → assert 403
```
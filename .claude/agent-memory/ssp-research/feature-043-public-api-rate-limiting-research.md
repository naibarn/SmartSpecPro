---
name: Feature 043 — Public API Rate Limiting & Quota System Research
description: Complete analysis of existing API key, rate limiting, and quota infrastructure for feature-043 (Public API / External Agent Gateway)
type: reference
---

# Feature 043: Public API Rate Limiting & Quota System — Complete Research

## Executive Summary

SmartSpecPro has a **comprehensive but incomplete** API key and rate limiting system:
- ✅ **API keys**: Fully implemented with HMAC-SHA256 hashing, scope enforcement, expiration
- ✅ **Per-key rate limiting**: Sliding window (RPM) with tenant-level soft cap
- ✅ **Daily credit quotas**: Already implemented but NOT integrated into the middleware chain
- ✅ **Audit logging**: Complete request tracking with credits, latency, status codes
- ❌ **Quota enforcement**: Credit limit check exists but NOT being called in the middleware
- ❌ **Credit tracking**: Requests logged but no real-time credit consumption in request handlers

**Missing integration**: `checkDailyCreditLimit()` is implemented but the middleware doesn't call it before allowing requests through. Credit consumption is logged after the fact but not enforced.

---

## 1. Database Schema (apiKeys Table)

**File**: `apps/web/drizzle/schema.ts:5432-5452`

### API Keys Table Columns

```typescript
export const apiKeys = pgTable("api_keys", {
  id: varchar("id", { length: 36 }).primaryKey(),                    // UUID
  tenantId: varchar("tenantId", { length: 36 }).notNull(),           // FK to tenants.id
  userId: integer("userId").notNull(),                               // FK to users.id
  name: varchar("name", { length: 100 }).notNull(),                  // User-facing name
  keyPrefix: varchar("keyPrefix", { length: 16 }).notNull(),         // First 16 chars of key (shown to user)
  keyHash: varchar("keyHash", { length: 128 }).notNull(),            // HMAC-SHA256 hash
  scopes: json("scopes").$type<string[]>().notNull(),               // Array of scope strings
  rateLimit: integer("rateLimit").default(60).notNull(),             // Requests per minute
  creditLimit: integer("creditLimit"),                               // QUOTA: Credits per day (nullable)
  expiresAt: timestamp("expiresAt", { withTimezone: true }),        // Optional expiration
  lastUsedAt: timestamp("lastUsedAt", { withTimezone: true }),      // Fire-and-forget update
  isActive: boolean("isActive").default(true).notNull(),             // Soft delete flag
  metadata: json("metadata").$type<Record<string, unknown>>(),       // Extensible JSON
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("api_keys_key_hash_idx").on(t.keyHash),
  index("api_keys_tenant_idx").on(t.tenantId),
  index("api_keys_user_idx").on(t.userId),
]);
```

### Key Findings

| Field | Type | Purpose | Notes |
|-------|------|---------|-------|
| **rateLimit** | integer | RPM limit per key | Default: 60. Valid range: 1-10,000 |
| **creditLimit** | integer | Daily credit quota | NULL = unlimited. Currently NOT enforced |
| **scopes** | JSON array | Permission control | 14 defined scopes (see section 3) |
| **keyHash** | varchar(128) | Lookup key | HMAC-SHA256(raw_key, API_KEY_HMAC_SECRET) |
| **keyPrefix** | varchar(16) | User hint | First 16 chars: `sk-ssp_{tenantId}_...` |

---

## 2. Public API Audit Log (publicApiAuditLog Table)

**File**: `apps/web/drizzle/schema.ts:5463-5482`

```typescript
export const publicApiAuditLog = pgTable("public_api_audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  userId: integer("userId").notNull(),
  apiKeyId: varchar("apiKeyId", { length: 36 }).notNull(),
  traceId: varchar("traceId", { length: 36 }),                      // Request correlation ID
  method: varchar("method", { length: 10 }).notNull(),              // GET, POST, etc.
  path: varchar("path", { length: 255 }).notNull(),                 // /v1/skills, /v1/agencies, etc.
  statusCode: integer("statusCode"),                                 // HTTP status
  creditsUsed: integer("creditsUsed").default(0),                    // QUOTA: Credits consumed
  latencyMs: integer("latencyMs"),                                   // Request duration
  ip: varchar("ip", { length: 45 }),                                 // Client IP (not populated yet)
  userAgent: text("userAgent"),                                      // Client user agent (not populated yet)
  requestMeta: json("requestMeta").$type<Record<string, unknown>>(), // Error details, custom data
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("public_api_audit_log_tenant_created_idx").on(t.tenantId, t.createdAt),
  index("public_api_audit_log_api_key_idx").on(t.apiKeyId),
  index("public_api_audit_log_trace_idx").on(t.traceId),
]);
```

### Purpose

- Immutable event log (90-day retention enforced by cleanup job)
- Used for billing, analytics, and compliance
- NOT used for real-time rate limiting (Redis is used instead)
- Logs AFTER request completes (non-blocking via `res.on("finish")`)

---

## 3. API Key Service (apiKeyService.ts)

**File**: `apps/web/server/services/apiKeyService.ts`

### Core Functions

#### `createKey(tenantId, userId, name, scopes, options?)`

```typescript
export async function createKey(
  tenantId: string,
  userId: number,
  name: string,
  scopes: string[],
  options?: {
    expiresAt?: Date;
    rateLimit?: number;        // Default: 60
    creditLimit?: number;      // Default: null (unlimited)
    metadata?: Record<string, unknown>;
  },
): Promise<{ id: string; rawKey: string; keyPrefix: string }>
```

- Generates raw key: `sk-ssp_{tenantId-first-8-chars}_{24-bytes-base64url}`
- Computes HMAC-SHA256 hash (never stores raw key)
- Returns raw key exactly once (never retrievable later)
- Validates scopes against `ALLOWED_API_SCOPES`

#### `validateKey(rawKey)`

```typescript
export async function validateKey(rawKey: string): Promise<AuthContext | null>
```

- Hot path: called on every API request
- Returns `AuthContext` with `rateLimit` field populated from DB
- Fire-and-forget: updates `lastUsedAt` in DB (not awaited)
- Checks expiration, returns null if expired

#### `listKeys(tenantId, userId?)`

Returns all keys (or user's keys if `userId` provided):
- Never returns `keyHash`
- Returns: `keyPrefix`, `scopes`, `rateLimit`, `creditLimit`, `expiresAt`, `lastUsedAt`, `isActive`, `createdAt`

#### `revokeKey(keyId, tenantId)`

Soft delete: sets `isActive = false`

#### `getKeyUsageStats(keyId, tenantId)`

Queries `publicApiAuditLog` for last 30 days:
```typescript
{
  totalRequests: number,
  totalCreditsUsed: number,
  errorCount: number,
  dailyStats: Array<{ date: string; requests: number; credits: number }>
}
```

---

## 4. Rate Limiting System (apiKeyRateLimiter.ts)

**File**: `apps/web/server/services/apiKeyRateLimiter.ts`

### Two-Level Rate Limiting

#### Level 1: Per-Key Rate Limit (RPM)

```typescript
async function checkRateLimit(
  apiKeyId: string,
  tenantId: string,
  keyRateLimit: number = 60
): Promise<RateLimitResult>
```

**Algorithm**: Sliding window using Redis INCR with minute-granularity buckets

**Redis Keys**:
- `ratelimit:apikey:{apiKeyId}:{minuteTs}` — Per-key counter
- `ratelimit:tenant:api:{tenantId}:{minuteTs}` — Tenant soft cap counter

**Behavior**:
1. Calculate current minute timestamp: `Math.floor(Date.now() / 60000)`
2. INCR both buckets atomically
3. Set TTL = 120 seconds (window + 60-second buffer)
4. Compare count against key's `rateLimit` and tenant's `TENANT_RPM_LIMIT (600)`
5. If either exceeded: return 429, else allow

**Response Headers**:
```
X-RateLimit-Limit: {keyRateLimit}
X-RateLimit-Remaining: min(key_remaining, tenant_remaining)
X-RateLimit-Reset: {unix_timestamp_of_next_minute}
Retry-After: {seconds_until_next_minute} (if blocked)
```

#### Level 2: Daily Credit Limit (❌ NOT WIRED)

```typescript
async function checkDailyCreditLimit(
  apiKeyId: string,
  creditLimit: number | null
): Promise<DailyCreditResult>
```

**Redis Key**: `creditlimit:apikey:{apiKeyId}:{YYYY-MM-DD}` (UTC date string)

**Behavior**:
1. If `creditLimit === null`: allow (unlimited)
2. GET accumulated credits for today
3. If accumulated >= creditLimit: block with 429, return seconds until midnight UTC
4. Else: allow with `remaining` field

**⚠️ Problem**: This function is never called. Not in middleware chain.

### Middleware Integration

**File**: `apps/web/server/_core/index.ts:428-437`

```typescript
app.use(
  "/v1",
  publicApiCorsMiddleware,
  publicApiHeadersMiddleware,
  apiKeyAuthMiddleware,          // 1. Extract API key, populate req.auth
  publicApiFeatureGuard,         // 2. Check feature flag
  rateLimitMiddleware(),         // 3. Check RPM (✅ WORKS)
  idempotencyMiddleware(),       // 4. Idempotency-Key deduplication
  publicApiAuditMiddleware,      // 5. Log request to DB (non-blocking)
);
```

**Missing**: No call to `checkDailyCreditLimit()` in the chain.

---

## 5. Daily Credit Incrementing (apiKeyRateLimiter.ts)

**File**: `apps/web/server/services/apiKeyRateLimiter.ts:110-123`

```typescript
async function incrementDailyCredits(
  apiKeyId: string,
  amount: number
): Promise<void> {
  const redis = getRedisClient();
  const key = `creditlimit:apikey:{apiKeyId}:{todayUTC()}`;
  await redis.incrby(key, amount);
  // Auto-expire at midnight UTC + 1 day
  const midnightTomorrow = new Date();
  midnightTomorrow.setUTCHours(0, 0, 0, 0);
  midnightTomorrow.setUTCDate(midnightTomorrow.getUTCDate() + 1);
  redis.expireat(key, Math.floor(midnightTomorrow.getTime() / 1000)).catch(() => {});
}
```

**Currently called**: Nowhere. No route handler calls this.

**Expected flow** (for quota system):
1. Before executing request: `checkDailyCreditLimit()`
2. After execution: `incrementDailyCredits(creditsUsed)`
3. Log to DB: `publicApiAuditLog.creditsUsed`

---

## 6. Audit Logging (publicApiAuditLogger.ts)

**File**: `apps/web/server/services/publicApiAuditLogger.ts`

```typescript
async function logPublicApiRequest(entry: {
  tenantId: string;
  apiKeyId: string;
  userId?: number;
  method: string;
  path: string;
  statusCode: number;
  creditsUsed?: number;
  durationMs?: number;
  errorCode?: string | null;
}): Promise<void>
```

**Called by**: `publicApiAuditMiddleware` (line 25 in publicApiAudit.ts)

**Flow**:
1. Response 'finish' event fires (after response is sent)
2. Read `X-Credits-Used` header set by route handler
3. Insert into `public_api_audit_log`
4. Errors swallowed (never breaks the request)

**Current usage**:
- ✅ Logged: method, path, statusCode, durationMs, creditsUsed
- ❌ NOT logged: IP, userAgent, traceId

---

## 7. API Scope System

**File**: `apps/web/shared/publicApiTypes.ts`

### All Valid Scopes (14 total)

```typescript
export const ALLOWED_API_SCOPES = [
  // Skills
  "skills:list",      // GET /v1/skills
  "skills:execute",   // POST /v1/skills/{skillId}/execute

  // Agencies
  "agencies:list",    // GET /v1/agencies
  "agencies:invoke",  // POST /v1/agencies/{agencyId}/invoke

  // Presentations
  "presentations:create",  // POST /v1/presentations

  // Video
  "video_projects:create", // POST /v1/video-projects

  // Media
  "media:generate",   // POST /v1/media/generate

  // LLM
  "llm:chat",        // POST /v1/llm/chat

  // MCP
  "mcp:read",        // POST /v1/mcp (read)
  "mcp:write",       // POST /v1/mcp (write)

  // Jobs
  "jobs:create",     // POST /v1/jobs
  "jobs:read",       // GET /v1/jobs

  // Webhooks
  "webhooks:manage", // POST/DELETE /v1/webhooks

  // Events
  "events:read",     // GET /v1/events

  // API Keys
  "api_keys:manage", // POST/DELETE /trpc/apiKeys.* (internal)
];
```

### Scope Enforcement

**File**: `apps/web/server/middleware/requireScopes.ts`

```typescript
export function requireScopes(...requiredScopes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Session/bearer auth: implicit full access (web app users)
    if (auth.mode === "session" || auth.mode === "bearer") {
      next();
      return;
    }

    // API key auth: strict AND logic
    const missing = requiredScopes.filter(s => !auth.scopes?.includes(s));
    if (missing.length > 0) {
      res.status(403).json({
        error: {
          code: "insufficient_scopes",
          message: `Missing required scopes: ${missing.join(", ")}`,
          type: "auth_error",
        },
      });
    }
  };
}
```

**Used on route handlers**: E.g., `/v1/skills` uses `requireScopes("skills:list")`

---

## 8. Admin UI (AdminAPIKeys.tsx)

**File**: `apps/web/client/src/pages/AdminAPIKeys.tsx`

### Create API Key Dialog

**Form Fields**:
- **Name**: Required, max 100 chars
- **Expires (days)**: Number, optional (default: 365)
- **Credit limit/day**: Number, optional (default: unlimited)
- **Rate limit (RPM)**: Number, default: 60
- **Scopes**: Checkboxes grouped by category (6 groups)

**Scope Bundles** (quick-select buttons):
- Read-only: `["skills:list", "agencies:list", "jobs:read", "events:read"]`
- Skill Runner: `["skills:list", "skills:execute", "media:generate"]`
- Agency Operator: `["agencies:list", "agencies:invoke", "skills:list"]`
- MCP Client: `["mcp:read", "mcp:write", "skills:list", "skills:execute", "agencies:list", "agencies:invoke", "media:generate"]`
- Full Access: all 14 scopes

### Keys Table

Columns displayed:
- **Name**: User-facing name
- **Key Prefix**: `sk-ssp_...` (first 16 chars)
- **Scopes**: Badges (shows first 3, +N if more)
- **Rate Limit**: RPM (displays `key.rateLimit ?? 60`)
- **Status**: Active / Inactive badge
- **Last Used**: ISO date or "Never"
- **Actions**: View stats (Activity icon), Revoke (Trash icon)

### Usage Stats Dialog (7-day view)

**Metrics**:
- **Requests**: Total count
- **Credits**: Total used
- **Error Rate**: Percentage
- **Per-day breakdown**: Date, request count, error count
- **Top endpoints**: Path, count

**Data source**: `trpc.apiKeys.getUsageStats` (admin procedure, queries last 7-30 days from `publicApiAuditLog`)

### Webhooks Tab

**Columns**:
- **URL**: Webhook endpoint
- **Events**: Subscribed event types
- **Status**: Active / Disabled
- **Failures**: Failure count
- **Last Delivered**: ISO date or "Never"
- **Actions**: Re-enable (if inactive), Delete

---

## 9. tRPC Router (apiKeys.ts)

**File**: `apps/web/server/routers/apiKeys.ts`

### Endpoints

#### `apiKeys.list`

**Procedure**: `protectedProcedure` (authenticated web app user)

**Logic**:
- Admins see all tenant keys
- Regular users see only their own keys

**Returns**:
```typescript
{
  id, name, keyPrefix, scopes, rateLimit, creditLimit,
  expiresAt, lastUsedAt, isActive, createdAt
}[]
```

#### `apiKeys.create`

**Procedure**: `protectedProcedure`

**Input**:
```typescript
{
  name: string,                           // 1-100 chars
  scopes: string[],                       // At least 1
  expiresInDays?: number,                 // 1-3650
  creditLimit?: number | null,            // 0+ or null
  rateLimit?: number,                     // 1-10,000
}
```

**Returns**: `{ id, keyPrefix, rawKey, name, scopes }`

**⚠️ Note**: `rawKey` returned exactly once. Never stored/retrievable again.

#### `apiKeys.revoke`

**Procedure**: `protectedProcedure`

**Input**: `{ keyId: string }`

Sets `isActive = false`. Soft delete.

#### `apiKeys.getUsageStats`

**Procedure**: `adminProcedure`

**Input**: `{ keyId: string; days: 1-90, default 7 }`

**Returns**:
```typescript
{
  requestsPerDay: { date, count, errors, creditsUsed }[],
  totalRequests: number,
  totalCredits: number,
  errorRate: number,
  topEndpoints: { path, count }[]
}
```

#### `apiKeys.listWebhooks`

**Procedure**: `adminProcedure`

Lists all webhook endpoints for tenant (from `apiWebhookEndpoints` table)

#### `apiKeys.deleteWebhook` / `apiKeys.reEnableWebhook`

Soft delete or re-activate webhooks

---

## 10. API Key Format & Security

**Key Generation** (lines 22-29 in apiKeyService.ts):

```
sk-ssp_{tenantId-first-8-chars}_{24-bytes-base64url}

Example: sk-ssp_12345678_AbCdEfGhIjKlMnOpQrStUvWxYz
```

**Hashing** (lines 14-19):

```typescript
computeKeyHash(rawKey: string): string {
  return crypto
    .createHmac("sha256", ENV.apiKeyHmacSecret)
    .update(rawKey)
    .digest("hex");
}
```

**Security**:
- Raw key never stored (only hash)
- `API_KEY_HMAC_SECRET` must be ≥32 characters
- Asserted at startup: `assertHmacSecretConfigured()`
- No plaintext leakage in logs (audit middleware doesn't log keys)

---

## 11. Redis Key Naming Conventions

| Use Case | Redis Key Pattern | TTL | Bucket Granularity |
|----------|-------------------|-----|-------------------|
| **Rate Limiting (RPM)** | `ratelimit:apikey:{apiKeyId}:{minuteTs}` | 120s | Per minute |
| **Rate Limiting (RPM)** | `ratelimit:tenant:api:{tenantId}:{minuteTs}` | 120s | Per minute |
| **Daily Credits** | `creditlimit:apikey:{apiKeyId}:{YYYY-MM-DD}` | Until midnight UTC | Per day (UTC) |
| **Idempotency Lock** | `idempotency:lock:{tenantId}:{idempotencyKey}` | 60s | Per key |
| **Idempotency Cache** | `idempotency:{tenantId}:{idempotencyKey}` | 3600-86400s | Per key |

---

## 12. Missing Integrations (Gaps in Feature-043)

### Gap 1: Daily Credit Limit Not Enforced

**Current**: `checkDailyCreditLimit()` is implemented but never called.

**Impact**: Users can exceed their daily credit quota without rejection.

**Fix needed**:
1. Call `checkDailyCreditLimit()` in `/v1` middleware (after `rateLimitMiddleware()`)
2. Return 429 if exceeded
3. Set response header: `X-Daily-Credits-Remaining`

### Gap 2: Credit Consumption Not Tracked

**Current**: `incrementDailyCredits()` is implemented but never called.

**Impact**: Daily credit accumulation is never enforced (Gap 1 impact cascades).

**Fix needed**:
1. Route handlers must call `incrementDailyCredits(creditsUsed)` after execution
2. Or: Extract from audit log during request (requires cost estimation per endpoint)

### Gap 3: No Per-Endpoint Cost Definition

**Current**: No mechanism to define credit cost per endpoint.

**Impact**: Can't know what to pass to `incrementDailyCredits()` or pre-check sufficiency.

**Fix needed**:
- Define cost matrix: `POST /v1/skills/{id}/execute = 10 credits`
- OR: Use response-time based cost (e.g., seconds × rate)
- OR: Use LLM token consumption as proxy

### Gap 4: Missing Audit Log Fields

**Schema supports**: `ip`, `userAgent`, `traceId`

**Currently logged**: Only method, path, statusCode, creditsUsed, latencyMs

**Fix needed**: Populate IP, userAgent, traceId in `logPublicApiRequest()`

---

## 13. Middleware Execution Order

The `/v1` middleware chain (lines 428-437 in index.ts):

```
Request Flow:
  1. publicApiCorsMiddleware
     └─> Check Origin header, set CORS headers

  2. publicApiHeadersMiddleware
     └─> Ensure Content-Type: application/json, version headers

  3. apiKeyAuthMiddleware
     └─> Extract Bearer/API key, validate, populate req.auth
     └─> Return 401 if invalid

  4. publicApiFeatureGuard
     └─> Check FEATURE_PUBLIC_API_ENABLED flag
     └─> Return 403 if disabled

  5. rateLimitMiddleware()
     └─> Check per-key RPM (X-RateLimit-*)
     └─> Check tenant RPM soft cap
     └─> Return 429 if exceeded

  6. idempotencyMiddleware()
     └─> Check Idempotency-Key header
     └─> Return cached response if duplicate (409 if in-flight)

  7. publicApiAuditMiddleware
     └─> Register finish event listener
     └─> Log request to DB (non-blocking)

  → Route handler executes

  Response sent → publicApiAuditMiddleware logs entry
```

---

## 14. Tenant-Level Rate Limit Soft Cap

**Constant**: `TENANT_RPM_LIMIT = 600` (line 3 in apiKeyRateLimiter.ts)

**Purpose**: Prevent single tenant from monopolizing the platform

**Behavior**:
- All API key requests for a tenant share a 600 RPM bucket per minute
- If tenant exceeds 600 RPM, ALL keys for that tenant are blocked (429)
- Independent of individual key's `rateLimit` setting

**Example**:
- Tenant A has 3 keys: 60, 100, 200 RPM
- Total tenant quota: 600 RPM
- If tenant A makes 601 requests in a minute: all keys blocked for remaining minute

---

## 15. Summary Table: What Exists vs. Missing

| Feature | DB Schema | Service Function | Middleware | Admin UI | Router Endpoint | Status |
|---------|-----------|------------------|------------|----------|-----------------|--------|
| **API Key Management** | ✅ apiKeys table | ✅ createKey, listKeys, revokeKey | ❌ | ✅ | ✅ | **COMPLETE** |
| **Scope Enforcement** | ✅ scopes JSON | ✅ validateKey returns scopes | ✅ requireScopes | ✅ | ✅ | **COMPLETE** |
| **Per-Key RPM Limit** | ✅ rateLimit column | ✅ checkRateLimit | ✅ rateLimitMiddleware | ✅ (display only) | ❌ | **COMPLETE** |
| **Tenant RPM Soft Cap** | ❌ | ✅ TENANT_RPM_LIMIT=600 | ✅ rateLimitMiddleware | ❌ | ❌ | **COMPLETE** |
| **Daily Credit Quota** | ✅ creditLimit column | ✅ checkDailyCreditLimit | ❌ **MISSING** | ✅ (edit only) | ❌ | **PARTIAL** |
| **Credit Consumption** | ✅ creditsUsed column | ✅ incrementDailyCredits | ❌ **MISSING** | ❌ | ❌ | **PARTIAL** |
| **Audit Logging** | ✅ publicApiAuditLog | ✅ logPublicApiRequest | ✅ publicApiAuditMiddleware | ✅ (view in stats) | ✅ | **COMPLETE** |
| **Key Expiration** | ✅ expiresAt column | ✅ validateKey checks | ❌ | ✅ (display) | ❌ | **COMPLETE** |
| **Idempotency** | ❌ (Redis only) | ✅ checkRateLimit cache | ✅ idempotencyMiddleware | ❌ | ❌ | **COMPLETE** |

---

## 16. Critical Configuration

**Environment variables required**:

| Variable | Purpose | Required? | Example |
|----------|---------|-----------|---------|
| `API_KEY_HMAC_SECRET` | HMAC key for key hashing | ✅ YES | 32+ random chars |
| `DATABASE_URL` | PostgreSQL connection | ✅ YES | `postgresql://...` |
| `REDIS_URL` | Redis for rate limiting | ✅ YES | `redis://...` |
| `FEATURE_PUBLIC_API_ENABLED` | Feature flag (publicApiFeatureGuard) | ✅ YES | `true` |

**Asserted at startup** (line 96 in index.ts):
```typescript
assertHmacSecretConfigured();
```

If missing: server crash on start. Good security posture.

---

## 17. Implementation Roadmap for Quota System (Feature-043)

### Phase 1: Enable Daily Credit Limit Enforcement (2-3 hours)

1. **Middleware integration** (10 min)
   - Add `checkDailyCreditLimit()` call after `rateLimitMiddleware()`
   - Return 429 if exceeded
   - Set `X-Daily-Credits-Remaining` header

2. **Per-endpoint credit cost definition** (1 hour)
   - Create cost matrix (constant or DB)
   - Define costs: skill execution (10), agency run (50), media (100), etc.
   - Make easily updatable

3. **Pre-check before execution** (30 min)
   - Route handlers check `checkDailyCreditLimit()` before processing
   - Return 429 if insufficient for estimated cost

4. **Credit tracking post-execution** (30 min)
   - Route handlers call `incrementDailyCredits(actualCost)` after execution
   - Audit log captures actual credits used (via `X-Credits-Used` header)

### Phase 2: Quota Analytics & Admin Controls (1-2 hours)

1. **Enhanced usage stats** (30 min)
   - Add credit usage breakdown by endpoint
   - Add daily quota utilization chart
   - Show remaining credits for today

2. **Quota reset / adjustment** (30 min)
   - Add admin endpoint to manually reset daily counter
   - Add endpoint to adjust creditLimit on-the-fly

3. **Quota alerts** (30 min)
   - Webhook event: `quota.daily_exceeded`
   - Email notification (optional)

### Phase 3: Advanced Quota Features (Optional, 3-5 hours)

- Rolling 7-day/30-day quota windows (not just daily)
- Quota sharing pools (multi-key quotas)
- Burst allowance (temporary overage with penalty)
- Quota metrics in public API dashboard

---

## 18. Testing Considerations

### Unit Tests Needed

1. **Rate limit middleware**:
   - Key exceeds RPM: returns 429
   - Tenant exceeds RPM: all keys blocked
   - Reset after minute: counter resets

2. **Daily credit limit**:
   - Key at limit: blocks 429
   - Key under limit: allows
   - Midnight UTC: counter resets

3. **Credit incrementing**:
   - Increments correctly
   - Expires at midnight UTC

4. **Audit logging**:
   - Logs creditsUsed, statusCode, latencyMs
   - Non-blocking (no request delay)

### Integration Tests Needed

1. **Full flow: credit quota enforcement**:
   - Create key with 100-credit daily limit
   - Execute skill (cost = 50 credits)
   - Verify: `creditsUsed=50` in audit log
   - Execute again (cost = 50 credits)
   - Verify: `creditsUsed=100` accumulated
   - Execute third time: blocked 429

2. **Quota reset at midnight**:
   - Execute request at 23:59:59 UTC
   - Execute request at 00:00:01 UTC (next day)
   - Verify second request allowed

---

## 19. Key Questions for Implementation

1. **Credit cost model**:
   - Should costs be fixed per endpoint or variable (based on output size)?
   - Should LLM token consumption be a factor?
   - Who decides costs? Admin? Product team?

2. **Quota enforcement timing**:
   - Pre-check only (estimate)? Post-check only (actual)? Both?
   - What happens if actual > estimate? Charge difference? Reject?

3. **Soft vs. hard limits**:
   - Can a key go over quota if response is already started?
   - Should there be a burst allowance (e.g., 10% overage)?

4. **Tenant vs. key quotas**:
   - Is tenant-level quota separate from key-level?
   - Can tenant level be overridden by org admin?

5. **Dashboard and alerting**:
   - Should users see real-time quota usage in /admin/api-keys?
   - Should there be automated alerts at 80%, 100%?

---

## File Reference Index

| File | Purpose | Key Content |
|------|---------|-------------|
| `drizzle/schema.ts:5432-5452` | API Keys table | schema definition |
| `drizzle/schema.ts:5463-5482` | Audit log table | schema definition |
| `server/services/apiKeyService.ts` | Key creation, validation | `createKey`, `validateKey`, `listKeys`, `revokeKey` |
| `server/services/apiKeyRateLimiter.ts` | Rate limiting & quotas | `checkRateLimit`, `checkDailyCreditLimit`, `incrementDailyCredits` |
| `server/services/publicApiAuditLogger.ts` | Audit logging | `logPublicApiRequest` |
| `server/middleware/apiKeyAuth.ts` | Key extraction | `apiKeyAuthMiddleware` |
| `server/middleware/requireScopes.ts` | Scope enforcement | `requireScopes` |
| `server/middleware/publicApiAudit.ts` | Audit logging | `publicApiAuditMiddleware` |
| `server/_core/index.ts:428-437` | Middleware chain | `/v1` route setup |
| `server/routers/apiKeys.ts` | tRPC endpoints | `list`, `create`, `revoke`, `getUsageStats` |
| `client/src/pages/AdminAPIKeys.tsx` | Admin UI | Create, list, revoke, stats |
| `shared/publicApiTypes.ts` | Types & constants | `ALLOWED_API_SCOPES`, `AuthContext`, scope definitions |

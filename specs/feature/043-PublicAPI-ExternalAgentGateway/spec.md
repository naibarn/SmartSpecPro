# 043-PublicAPI-ExternalAgentGateway: Public API & External Agent Gateway

**Version:** 1.3.0
**Date:** 2026-03-14
**Status:** Draft (Post-Review Round 3)
**Builds on:** Spec 029 (ClawFeature — Webhooks, Channel Adapter), Spec 032 (Browser Automation Copilot — MCP Tools, Responses API), Spec 010 (GoogleDriveScope — MCP Server)
**Principle:** Expose SmartSpecPro's capabilities as a first-class public API that external AI agents (OpenClaw, Manus AI, custom agents) can consume — with proper authentication, credit billing, rate limiting, and audit logging.

**Review History:**
- v1.0.0 (2026-03-14): Initial draft
- v1.1.0 (2026-03-14): Incorporated 44 review findings (9 CRITICAL, 13 HIGH, 13 MEDIUM, 9 LOW) from Security Auditor, Architecture Reviewer, and Code Reviewer. See `review-findings.md` for raw findings.
- v1.2.0 (2026-03-14): Incorporated 28 Round 2 findings [R2-01..R2-28]. Fixed schema assumptions against actual codebase (credit system uses `users.credits` not `credit_balances`, `llmProviders.id` is serial integer not UUID, `sanitizeUri()` throws not returns). Added Feature 09 (Presentation API), Feature 10 (Video Project API with duration-based credits), Feature 11 (Media Generation API with detailed image/video/audio endpoints). See Appendix F for Round 2 cross-reference.
- v1.3.0 (2026-03-14): Incorporated 22 security findings [R3-CRIT-1..R3-LOW-4] + 5 codebase mismatches [CV-1..CV-5] + 15 architecture findings [R3-ARCH-1..R3-ARCH-23] from Round 3 review. Key changes: **CRITICAL** — fixed `agencyConversations` vs `conversations` table mismatch (ARCH-1), added `protectedProcedure` → service extraction scope for presentations/media (ARCH-5), signed download URLs for exports (CRIT-3), SSRF array validation for `reference_image_urls` (CRIT-4), promoted `CreditSourceType` TypeScript update to Phase 1 blocker (CRIT-1), added `tenantId` index to `video_project_exports` (CRIT-2). **HIGH** — added `events:read` scope (HIGH-7), updated MCP tool registry to 25+ tools (ARCH-6/7), fixed webhook FK to nullable ON DELETE SET NULL (ARCH-8/13), fixed phase numbering (ARCH-11). **MEDIUM** — fixed presentation path collision (ARCH-17), added `GET /v1/api-keys/:id` endpoint (ARCH-15). See Appendix G for full Round 3 cross-reference.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Feature 01: Public API Key Management](#2-feature-01-public-api-key-management)
3. [Feature 02: External Agent Gateway](#3-feature-02-external-agent-gateway)
4. [Feature 03: Public MCP Server](#4-feature-03-public-mcp-server)
5. [Feature 04: Job Automation API](#5-feature-04-job-automation-api)
6. [Feature 05: Skill Execution API](#6-feature-05-skill-execution-api)
7. [Feature 06: Agency Invocation API](#7-feature-06-agency-invocation-api)
8. [Feature 07: Webhook Callback & Event Streaming](#8-feature-07-webhook-callback--event-streaming)
9. [Feature 08: External Agent SDK & Documentation](#9-feature-08-external-agent-sdk--documentation)
10. [Feature 09: Presentation API](#10-feature-09-presentation-api)
11. [Feature 10: Video Project API](#11-feature-10-video-project-api)
12. [Feature 11: Media Generation API](#12-feature-11-media-generation-api)
13. [Credit Integration Matrix](#13-credit-integration-matrix)
14. [Database Schema Changes](#14-database-schema-changes)
15. [Security Requirements](#15-security-requirements)
16. [API Versioning & Lifecycle](#16-api-versioning--lifecycle)
17. [Migration & Rollout Strategy](#17-migration--rollout-strategy)

---

## 1. Executive Summary

### Background

SmartSpecPro currently has powerful internal infrastructure:
- **LLM Gateway** — multi-provider routing (OpenAI, Anthropic, Google, Groq, Kimi, etc.)
- **Responses API** — OpenAI-compatible `/v1/responses` endpoint (Spec 032)
- **Internal MCP Router** — tool registry for Google Drive, OneDrive, Browser, Sandbox (Spec 010, 032)
- **Skills Engine** — 50+ AI skills for content generation, prompt engineering, media creation
- **Agency Builder** — multi-agent orchestration with tools and workflows
- **Webhook Triggers** — inbound event-driven automation (Spec 029, F06)
- **Media Generation** — image, video, audio creation via Celery async tasks

**Problem:** All of this is accessible only through the web UI or internal service-to-service tokens. External AI platforms (OpenClaw, Manus AI, custom agents, Zapier, n8n) cannot programmatically consume these capabilities.

**Solution:** Create a comprehensive **Public API & External Agent Gateway** that:
1. Manages API keys per tenant with scoped permissions
2. Exposes a unified REST + SSE gateway for LLM, skills, agencies, and media
3. Provides a standards-compliant **MCP Server** (Model Context Protocol) for AI agents like Manus AI
4. Offers a **Job Automation API** for async task orchestration
5. Tracks credits, enforces rate limits, and audits all external access

### Design Principles

1. **Reuse existing infrastructure** — Every endpoint wraps existing services (creditService, skillExecutor, agencyService, etc.). No parallel systems.
2. **Credits for every call** — All external API calls deduct credits through `creditService.deductCredits()`.
3. **Tenant-scoped** — API keys belong to tenants. All operations respect multi-tenant isolation.
4. **OpenAI-compatible where possible** — LLM endpoints follow OpenAI API conventions for easy agent integration.
5. **MCP-native** — Full MCP protocol compliance so Manus AI and Claude Desktop can connect directly.
6. **Audit everything** — All API calls logged with `traceId` correlation to `providerUsageLog` and `apiAuditEvents`.
7. **Defense in depth** — HMAC key hashing, timing-safe auth, SSRF firewall, scope ceiling enforcement. [C-01..C-05]

### Existing Systems (Integration Points)

| System | Location | Role in This Feature |
|--------|----------|---------------------|
| **Auth (authz.ts)** | `server/_core/authz.ts` | Extend `authorizeRequest()` to support public API keys |
| **LLM Routes** | `server/_core/llmRoutes.ts` | Already has `guardWithCredits` + Bearer auth — extend for API keys |
| **Responses API** | `server/_core/responsesRoutes.ts` | Already OpenAI-compatible — expose publicly with API key auth |
| **MCP Routes (Node)** | `server/_core/mcpRoutes.ts` | File/artifact tools — wrap with public auth |
| **MCP Router (Python)** | `python-backend/app/api/internal_mcp.py` | Google Drive, OneDrive, Browser tools — expose via public MCP |
| **Skills Router** | `server/routers/skills.ts` | Skill CRUD + execution — create public REST wrapper |
| **Skill Executor** | `server/services/skillExecutor.ts` | Skill execution engine — called by public API |
| **Agency Bridge** | `server/services/agencyBridge.ts` | Agency invocation — expose via API |
| **Agency Stream Proxy** | `server/_core/agencyStreamProxy.ts` | SSE streaming for agencies — wrap for API access |
| **Credit Service** | `server/services/creditService.ts` | Credit deduction — all API calls use this |
| **Webhook Triggers** | `server/services/webhookTrigger.ts` | Inbound events — extend with callback URLs |
| **Media Generation** | `server/services/mediaGenerationService.ts` | Async media tasks — expose via Job API |
| **Audit Logger** | `server/services/auditLogger.ts` | JSONL audit — all API calls emit events |
| **Task Queue** | `server/_core/index.ts`, `server/services/redis.ts` | Job queues — powers async Job API. [CV-5] Codebase may use Cloud Tasks or BullMQ; verify active system at implementation time |

### Critical Integration Gap: `AuthContext` Refactor [C-07]

Both `skillExecutor.executeSkill()` and `agencyBridge.executeRun()` currently require a `userToken` (JWT). API keys do not have JWTs. **Resolution:** Refactor these functions to accept an `AuthContext` object:

```typescript
interface AuthContext {
  userId: number;
  tenantId: string;
  mode: "session" | "api_key";
  // JWT token only present for session mode
  userToken?: string;
  // API key ID only present for api_key mode
  apiKeyId?: string;
}
```

All callers of `executeSkill()` and `agencyBridge.executeRun()` must be updated to pass `AuthContext` instead of raw `userToken`. This is a prerequisite for Phase 2 (Skill API + Agency API).

**[R3-ARCH-5] Presentation & Media API refactor scope:** `autoGenerateDraft()` and `triggerPresentationExport()` are `protectedProcedure` tRPC mutations — they require a JWT session `ctx` that cannot be synthesized from an API key. Similarly, `generateImage()`/`generateVideo()`/`generateAudio()` accept `userToken: string`. **Resolution:** Extract the business logic from these tRPC procedures into standalone service functions that accept `AuthContext`:

**Additional callers requiring `AuthContext` refactor:**
- `server/routers/presentation.ts:670` — `autoGenerateDraft()` → extract to `presentationService.autoGenerateDraft(params, authContext)`
- `server/services/presentationPlaybackExport.ts:1158` — `triggerPresentationExport()` → accept `AuthContext`
- `server/services/mediaGenerationService.ts` — `generateImage()`, `generateVideo()`, `generateAudio()` → accept `AuthContext` instead of `userToken`

Affected callers:

**`executeSkill()` callers [R2-08]:**
- `server/routers/skills.ts` (tRPC skill execution)
- `server/routers/chat.ts:1683` (chat-triggered skill execution)
- `server/routes/tasks.ts:201` (task route)
- `server/services/scheduler.ts:133` (scheduled execution)
- New `publicSkillsApi.ts` routes

**`agencyBridge.executeRun()` callers [R2-09]:**
- `server/routers/agency.ts:1461` (tRPC agency invocation)
- `server/services/webhookTriggers.ts:342` (webhook-triggered runs)
- `server/services/webhookDispatchQueue.ts:91` (queued webhook dispatch)
- `server/services/channelGateway.ts:191,280` (channel adapter calls)
- `server/_core/agencyStreamProxy.ts` (agency streaming)
- New `publicAgencyApi.ts` routes

**`RunParams` interface update [R2-10]:** The `RunParams` interface in `agencyBridge.ts` must be extended:
```typescript
interface RunParams {
  agencyId: number;
  message: string;
  conversationId: number;
  // Replace:  userToken: string;
  // With:
  authContext: AuthContext;
  personaId?: number;
}
```

---

## 2. Feature 01: Public API Key Management

### Overview

Tenant-scoped API key management system. Each tenant can create multiple API keys with granular scope permissions. Keys are **HMAC-SHA256 hashed** at rest using a server-side pepper (only shown once at creation). Follows industry best practice (Stripe, OpenAI key format).

### Database

#### New Table: `api_keys`

```typescript
export const apiKeys = pgTable("api_keys", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  keyPrefix: varchar("key_prefix", { length: 12 }).notNull(), // "sk-ssp_xxxx" visible prefix
  keyHash: varchar("key_hash", { length: 64 }).notNull().unique(), // HMAC-SHA256 hash of full key [C-01]
  scopes: json("scopes").$type<string[]>().notNull().default([]),
  rateLimit: integer("rate_limit").default(60), // RPM per key
  creditLimit: integer("credit_limit"), // Max credits per day (null = unlimited per tenant balance)
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  ipAllowlist: json("ip_allowlist").$type<string[]>(), // Optional IP allowlist [M-10]
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  metadata: json("metadata").$type<Record<string, string>>(), // Custom tags (e.g., "agent": "manus", "env": "prod")
}, (table) => ({
  tenantIdx: index("idx_api_keys_tenant").on(table.tenantId),
  hashIdx: uniqueIndex("idx_api_keys_hash").on(table.keyHash),
  namePerTenant: uniqueIndex("idx_api_keys_name_tenant").on(table.tenantId, table.name), // [L-07]
}));
```

### API Key Format

```
sk-ssp_{tenantShortId}_{randomBase62(32)}
```

Example: `sk-ssp_t3x7_Ab9Kz2mP4qR8sT1uV3wX5yZ7aB9cD1eF3gH5`

- Prefix `sk-ssp_` — identifies as SmartSpecPro API key (compatible with OpenAI SDK expectations)
- `{tenantShortId}` — 4-char tenant identifier for quick routing
- `{random}` — 32 chars of cryptographic randomness (Base62)

### Scopes

| Scope | Description | Grants Access To |
|-------|-------------|-----------------|
| `llm:chat` | LLM chat completions | `/v1/chat/completions`, `/v1/responses` |
| `llm:models` | List available models | `/v1/models` |
| `skills:execute` | Execute skills | `/v1/skills/:id/execute` |
| `skills:list` | List available skills | `/v1/skills` |
| `agencies:invoke` | Invoke agencies | `/v1/agencies/:id/invoke` |
| `agencies:list` | List agencies | `/v1/agencies` |
| `jobs:create` | Create automation jobs | `/v1/jobs` |
| `jobs:read` | Read job status/results | `/v1/jobs/:id` |
| `jobs:cancel` | Cancel running jobs | `DELETE /v1/jobs/:id` [L-02] |
| `media:generate` | Generate media (images, video) | `/v1/media/generate` |
| `media:read` | Read media status/results | `/v1/media/:id` |
| `mcp:tools` | MCP tool listing and execution | `/v1/mcp/tools`, `/v1/mcp/tools/call` |
| `files:read` | Read files/artifacts | `/v1/files/:id` |
| `files:write` | Upload files | `/v1/files` |
| `presentations:generate` | Generate AI presentations | `/v1/presentations/generate` |
| `presentations:read` | Read presentation status/results | `/v1/presentations/:id` |
| `video_projects:export` | Export video projects | `/v1/video-projects/:id/export` |
| `video_projects:read` | Read video project export status | `/v1/video-projects/exports/:id` |
| `webhooks:manage` | Manage webhook endpoints | `/v1/webhooks` |
| `events:read` | Subscribe to SSE event stream | `/v1/events` | [R3-HIGH-7]
| `admin:keys` | Manage API keys (meta-scope) | `/v1/api-keys` |

#### Scope Ceiling Rule [C-05]

A key created via the API (using `admin:keys` scope) may only be granted a **subset of the creating key's own scopes**. The server enforces this at creation time:

```typescript
const allowedScopes = intersection(requestedScopes, creatingKeyScopes);
if (allowedScopes.length < requestedScopes.length) {
  return res.status(403).json({
    error: { code: "scope_escalation", message: "Cannot grant scopes not held by creating key" }
  });
}
```

Keys created via the admin UI (session auth) are **not** subject to this ceiling — session-authenticated admins can grant any scope.

**[R2-15] `admin:keys` delegation restriction:** API-created keys (created via the `POST /v1/api-keys` endpoint) **MUST NOT** be granted the `admin:keys` scope. Only session-authenticated (UI) admins can create keys with `admin:keys`. This prevents key escalation chains where an API key creates another key that creates another key indefinitely.

### Implementation

#### 2.1 Key Generation Service

**File:** `apps/web/server/services/apiKeyService.ts`

```typescript
interface CreateApiKeyInput {
  tenantId: string;
  userId: number;
  name: string;
  scopes: string[];
  rateLimit?: number;
  creditLimit?: number;
  expiresAt?: Date;
  metadata?: Record<string, string>;
  ipAllowlist?: string[];
  // For API-created keys: the creating key's scopes (for ceiling enforcement)
  creatingKeyScopes?: string[];
}

interface CreateApiKeyResult {
  id: string;
  key: string;        // Full key — shown ONCE, never stored
  keyPrefix: string;  // Visible prefix for identification
  name: string;
  scopes: string[];
  expiresAt: Date | null;
}
```

- Generate key: `sk-ssp_{shortId}_{crypto.randomBytes(24).toString('base62')}`
- Hash: **`HMAC-SHA256(API_KEY_HMAC_SECRET, fullKey)`** stored in `key_hash` [C-01]
  - `API_KEY_HMAC_SECRET` is a randomly generated 32-byte secret stored as env var
  - Separate from `LLM_ENCRYPTION_KEY` — compromise of one does not compromise the other
  - Even if the database is exfiltrated, API keys cannot be recovered without this secret
- Return full key only at creation time
- Validate scopes against `ALLOWED_API_SCOPES` allowlist
- Enforce scope ceiling rule when `creatingKeyScopes` is provided [C-05]

**Required env var:** `API_KEY_HMAC_SECRET` — random 32 bytes, hex-encoded. Add to `.env.example` and deployment docs.

#### 2.2 Key Authentication Middleware

**File:** `apps/web/server/_core/authz.ts` (extend existing)

Extend `AuthResult` union type [H-01]:

```typescript
export type AuthResult =
  | { ok: true; mode: "bearer"; sub: string; scopes: string[] }
  | { ok: true; mode: "session"; user: any; sub: string; scopes: string[] }
  | { ok: true; mode: "api_key"; sub: string; tenantId: string; userId: number; scopes: string[]; keyId: string }
  | { ok: false; error: string };
```

Add API key auth path to `authorizeRequest()`:

```typescript
// In authorizeRequest(), BEFORE static token check and JWT bearer check:
// [C-02, H-02, M-03]
if (token?.startsWith("sk-ssp_")) {
  // 1. Compute HMAC-SHA256 hash using server pepper [C-01]
  const hash = crypto.createHmac("sha256", process.env.API_KEY_HMAC_SECRET!)
    .update(token).digest("hex");

  // 2. DB lookup by hash
  const apiKey = await lookupApiKeyByHash(hash);

  // 3. Timing-safe comparison to prevent timing oracle [C-02]
  // Even if DB returns a row, verify the hash matches to prevent index timing leak
  if (!apiKey) {
    // Constant-time delay to match hit path timing [R2-07]
    // constantTimeDelay() definition (place in authz.ts or shared utils):
    // async function constantTimeDelay(targetMs: number): Promise<void> {
    //   const start = performance.now();
    //   // Do a dummy HMAC to consume similar CPU time as the hit path
    //   crypto.createHmac("sha256", "dummy").update("pad").digest();
    //   const elapsed = performance.now() - start;
    //   if (elapsed < targetMs) await new Promise(r => setTimeout(r, targetMs - elapsed));
    // }
    await constantTimeDelay(5); // ms
    return { ok: false, error: "invalid_api_key" }; // [M-04] Generic error for all auth failures
  }

  // Compare stored hash with computed hash using timing-safe comparison
  const hashBuffer = Buffer.from(hash, "hex");
  const storedBuffer = Buffer.from(apiKey.keyHash, "hex");
  if (!crypto.timingSafeEqual(hashBuffer, storedBuffer)) {
    return { ok: false, error: "invalid_api_key" };
  }

  // 4. Validate key state — return SAME error for all failure modes [M-04]
  if (!apiKey.isActive || (apiKey.expiresAt && apiKey.expiresAt < new Date())) {
    return { ok: false, error: "invalid_api_key" };
  }

  // 5. Check tenant feature flag
  const flags = await getTenantFlags(apiKey.tenantId);
  if (!flags.publicApi) {
    return { ok: false, error: "feature_disabled" };
  }

  // 6. Optional IP allowlist check [M-10, R2-13]
  // Supports both exact IPs and CIDR ranges (e.g., "10.0.0.0/24")
  if (apiKey.ipAllowlist?.length) {
    const clientIp = getClientIp(req);
    const allowed = apiKey.ipAllowlist.some(entry =>
      entry.includes("/") ? isIpInCidr(clientIp, entry) : clientIp === entry
    );
    if (!allowed) {
      return { ok: false, error: "invalid_api_key" };
    }
  }

  // 7. Update lastUsedAt (fire-and-forget, don't block request)
  updateLastUsedAt(apiKey.id).catch(() => {});

  // 8. Return with numeric userId directly [H-02]
  return {
    ok: true,
    mode: "api_key",
    sub: String(apiKey.userId), // Numeric userId as string — compatible with parseInt() in mcpRoutes
    tenantId: apiKey.tenantId,
    userId: apiKey.userId,
    scopes: apiKey.scopes,
    keyId: apiKey.id,
  };
}

// Startup assertions [M-03, R3-MED-1]:
// In server startup:
assert(!ENV.mcpServerToken?.startsWith("sk-ssp_"), "mcpServerToken must not use sk-ssp_ prefix");
assert(!ENV.webGatewayToken?.startsWith("sk-ssp_"), "webGatewayToken must not use sk-ssp_ prefix");
// [R3-MED-1] Verify API_KEY_HMAC_SECRET is set and has sufficient entropy:
assert(process.env.API_KEY_HMAC_SECRET, "API_KEY_HMAC_SECRET env var is required for API key auth");
assert(process.env.API_KEY_HMAC_SECRET.length >= 64, "API_KEY_HMAC_SECRET must be at least 32 bytes (64 hex chars)");
```

**Important:** All `auth.mode` switch statements in `llmRoutes.ts`, `mcpRoutes.ts`, `agencyStreamProxy.ts` must be audited to handle the new `"api_key"` case [H-01].

#### 2.3 Rate Limiting (per API key)

**File:** `apps/web/server/services/apiKeyRateLimiter.ts`

- Redis sliding window: `ratelimit:apikey:{keyId}:{minute}`
- Default: 60 RPM per key, configurable per key
- Global tenant limit: 600 RPM across all keys
- Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

#### 2.4 Daily Credit Limit (per API key) [H-07]

Atomic check-and-increment using Redis Lua script to prevent TOCTOU race:

```lua
-- creditlimit:apikey:{keyId}:{YYYY-MM-DD}
-- KEYS[1] = counter key, ARGV[1] = amount, ARGV[2] = limit
local current = redis.call('GET', KEYS[1]) or '0'
if tonumber(current) + tonumber(ARGV[1]) > tonumber(ARGV[2]) then
  return 0  -- Over limit
else
  redis.call('INCRBY', KEYS[1], ARGV[1])
  redis.call('EXPIRE', KEYS[1], 90000)  -- 25 hours TTL (covers timezone edge)
  return 1  -- OK
end
```

If script returns `0`, respond with `429 Too Many Requests` and `Retry-After: <seconds-until-midnight-UTC>`.

#### 2.5 Admin UI

**File:** `apps/web/client/src/pages/AdminApiKeys.tsx`

- List API keys (name, prefix, scopes, last used, created)
- Create new key (name, scopes checkboxes, rate limit, expiry, credit limit, IP allowlist)
- Copy key dialog (shown once after creation)
- Revoke key (soft delete — set `isActive: false`)
- View usage stats per key (requests, credits consumed, top endpoints) [M-11]
- **Deprecation indicator** — show warning badge for keys near expiry [L-04]

**Route:** `/admin/api-keys` (admin + domain_admin)

#### 2.6 tRPC Router

**File:** `apps/web/server/routers/apiKeys.ts`

```typescript
export const apiKeysRouter = router({
  list: protectedProcedure.query(...),              // List keys for current tenant
  create: protectedProcedure.input(z.object({...})).mutation(...),
  revoke: protectedProcedure.input(z.object({ id: z.string() })).mutation(...),
  getUsageStats: protectedProcedure.input(z.object({ id: z.string() })).query(...),
});
```

RBAC: `admin` and `domain_admin` only.

---

## 3. Feature 02: External Agent Gateway

### Overview

A unified REST API gateway at `/v1/` that external agents call with API keys. Wraps existing LLM, skill, and media services with proper auth, credit tracking, and audit logging.

### Base URL

```
https://smartaihub.app/v1/
```

All requests require `Authorization: Bearer sk-ssp_...` header.

**[R3-LOW-4] Route registration order:** Express routes with specific paths MUST be registered BEFORE parameterized routes to prevent greedy matching. For example:
```typescript
// CORRECT order:
router.get("/v1/video-projects/exports/:id", ...); // specific path first
router.get("/v1/video-projects/:id", ...);          // param route second

router.get("/v1/presentations/exports/:id", ...);   // specific path first
router.get("/v1/presentations/:taskId/progress", ...);
router.get("/v1/presentations/:deckId", ...);        // param route last
```

### CORS Configuration [H-03]

The `/v1/*` routes require a **dedicated CORS middleware** separate from the UI's `ALLOWED_SUFFIXES` whitelist. External agents (Manus AI, OpenClaw) will call from arbitrary origins or server-to-server (no origin):

```typescript
// For /v1/* routes only:
app.use("/v1", cors({
  origin: "*",                    // Server-to-server — no origin restriction
  methods: ["GET", "POST", "DELETE", "PATCH"],
  allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "X-Request-Id"],
  exposedHeaders: ["X-Request-Id", "X-Credits-Used", "X-Credits-Remaining",
                   "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
}));
```

**Note:** `/v1/*` endpoints are protected by API key auth, not CORS. The CORS `*` is safe because all state-changing operations require a valid Bearer token. The existing UI CORS restrictions (`ALLOWED_SUFFIXES` in `index.ts`) are not modified. [M-02: `/v1/` routes are explicitly outside CSRF middleware scope since they use Bearer tokens, not cookies.]

**[R3-MED-5] CORS security caveat:** `origin: "*"` means ANY browser page can make requests to `/v1/*` if the user's API key is leaked client-side. This is acceptable because: (1) API keys should only be used server-to-server, never embedded in browser JavaScript, (2) the SDK docs [L-01] explicitly warn against client-side usage, (3) IP allowlisting [M-10] provides an additional layer if needed. If a future use case requires browser-side API access, consider a separate OAuth flow with CORS origin restrictions.

### Auth Guard Extraction [H-04]

`guardWithCredits()` is currently a **local closure** inside `registerLLMRoutes()` and cannot be imported by new public API routes. **Resolution:** Extract it to a shared module:

**File:** `apps/web/server/_core/authGuards.ts`

```typescript
export async function guardWithCredits(
  req: Request,
  res: Response,
  options?: { requiredScope?: string }
): Promise<AuthResult & { ok: true } | null> { ... }

export async function requireScope(
  auth: AuthResult & { ok: true },
  scope: string
): boolean { ... }
```

All existing callers in `llmRoutes.ts` and `responsesRoutes.ts` updated to use the shared export.

### Common Response Format

```json
{
  "id": "req_abc123",
  "object": "chat.completion",
  "created": 1710000000,
  "model": "claude-sonnet-4-6",
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 320,
    "total_tokens": 470
  },
  "credits_used": 5,
  "credits_remaining": 995
}
```

All responses include `X-Request-Id` (traceId), `X-Credits-Used`, `X-Credits-Remaining` headers.

### Error Response Format

```json
{
  "error": {
    "code": "insufficient_credits",
    "message": "Not enough credits for this operation",
    "type": "billing_error"
  }
}
```

**Error codes are intentionally generic for auth failures** [M-04] — `invalid_api_key` is returned for invalid, expired, AND revoked keys to prevent information oracle. The specific reason may be included in response body for developer experience but is not guaranteed to be stable.

### Idempotency [H-10]

All `POST` endpoints accept an optional `Idempotency-Key: <uuid>` header:

- Redis `SET NX` with TTL 24 hours: `idempotency:{keyId}:{idempotency_key}`
- If key exists, return the cached response without re-executing
- If key doesn't exist, execute and cache the response
- **[R3-LOW-2]** Cache entries include a `status_code` field; if the original request failed (4xx/5xx), the cached error response is returned but the client can retry with a new idempotency key
- Prevents duplicate job creation, double skill execution, etc.

### Health Check [H-12]

```http
GET /v1/health
```

No authentication required. Returns:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2026-03-14T10:00:00Z"
}
```

### 3.1 LLM Chat Completions (OpenAI-compatible)

**Already exists:** `POST /v1/chat/completions` via `llmRoutes.ts`

**Changes needed:**
- Accept `sk-ssp_*` API keys via extended `authorizeRequest()`
- Resolve tenant and user from API key (not session)
- Scope check: requires `llm:chat`
- Add `credits_used` and `credits_remaining` to response body

### 3.2 Responses API (OpenAI-compatible)

**Already exists:** `POST /v1/responses` via `responsesRoutes.ts`

**Changes needed:**
- Accept API key auth (currently only session + internal token)
- Scope check: requires `llm:chat`
- Feature flag: `responsesApi` must be enabled on the tenant

### 3.3 Models List

**Already exists:** `GET /v1/models` via `llmRoutes.ts`

**Changes needed:**
- Accept API key auth
- Scope check: requires `llm:models`
- Filter models by tenant's enabled providers

### 3.4 Audit Events

Every API call emits to `apiAuditEvents`:
```typescript
{
  eventType: "public_api_call",
  apiKeyId: keyId,
  endpoint: "/v1/chat/completions",
  model: requestedModel,
  tokensUsed: totalTokens,
  creditsUsed: credits,
  latencyMs: duration,
  statusCode: 200,
  traceId: traceId,
  ip: normalizeIp(clientIp),        // [M-08] Normalized IPv4/IPv6 string only
  userAgent: truncate(req.headers["user-agent"], 256)
    .replace(/[^\x20-\x7E]/g, ""),  // [M-08] Truncate to 256 chars, strip non-printable ASCII
}
```

**Note [M-08]:** The `userAgent` and `ip` fields must NEVER be included in any LLM-readable context. A crafted User-Agent string could perform prompt injection if fed to an LLM for analysis.

### 3.5 Pagination [H-11]

All list endpoints use **cursor-based pagination** (OpenAI style):

```http
GET /v1/skills?limit=20&after=cursor_abc123
```

Response:
```json
{
  "object": "list",
  "data": [...],
  "has_more": true,
  "first_id": "skill_001",
  "last_id": "skill_020"
}
```

Parameters:
- `limit` — Max items per page (default 20, max 100)
- `after` — Cursor for next page (from `last_id`)
- `before` — Cursor for previous page (from `first_id`)

Applies to: `/v1/skills`, `/v1/agencies`, `/v1/jobs`, `/v1/webhooks`, `/v1/api-keys`

---

## 4. Feature 03: Public MCP Server

### Overview

Expose SmartSpecPro's tools as a standards-compliant **MCP Server** (Model Context Protocol, version 2025-03-26). This allows AI agents like Manus AI, Claude Desktop, and OpenClaw to discover and call SmartSpecPro tools natively.

### Architecture

```
External Agent (Manus AI / Claude Desktop / OpenClaw)
    │
    │  MCP Protocol (HTTP+SSE or stdio transport)
    │
    ▼
┌──────────────────────────────────────────────┐
│  Public MCP Server (Node.js)                 │
│  /v1/mcp/ (Express routes)                   │
│                                              │
│  ┌─ Auth ──────────────────────────────────┐ │
│  │ API Key → tenant/user resolution       │ │
│  │ Scope check: mcp:tools                 │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌─ Session State Machine ─────────────────┐ │
│  │ Mcp-Session-Id header (UUID)           │ │
│  │ Must call initialize before tools/call │ │
│  │ [M-05]                                 │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌─ SSRF Firewall ────────────────────────┐  │
│  │ sanitizeUri() on all URL tool args     │  │
│  │ DNS rebinding prevention               │  │
│  │ [C-04]                                 │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌─ Tool Registry ────────────────────────┐  │
│  │ Node tools (files, artifacts)          │  │
│  │ Python tools (Drive, Browser, Sandbox) │  │
│  │ SmartSpec tools (skills, agencies,     │  │
│  │   media, jobs)                         │  │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌─ Credit + Audit ──────────────────────┐  │
│  │ Per-call credit deduction              │  │
│  │ JSONL audit + providerUsageLog         │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
    │                    │
    ▼                    ▼
Node.js Services    Python Backend
(skills, media,     (Drive, Browser,
 agencies)           LLM proxy)
```

### MCP Protocol Implementation

#### 4.1 Transport: Streamable HTTP (primary)

**Endpoint:** `POST /v1/mcp`

Single endpoint handling all MCP JSON-RPC messages. Supports:
- `initialize` → capabilities negotiation (REQUIRED before any other method) [M-05]
- `tools/list` → list available tools
- `tools/call` → execute a tool
- `resources/list` → list available resources [M-12]
- SSE streaming for long-running tool calls

#### MCP Session State Machine [M-05]

The server maintains a session map keyed by `Mcp-Session-Id` response header (UUID, not incremental counter):

```typescript
// Session states:
// NONE → initialize → READY → tools/call, tools/list, resources/list
// Any method before initialize → JSON-RPC error -32002 "Session not initialized"

// [R2-12] Use Redis for session storage — in-memory Map is lost on restart
// and doesn't work with multiple Node.js instances
// Key: mcp:session:{sessionId} → JSON { tenantId, userId, initializedAt }
// TTL: 1 hour (auto-expire via Redis SETEX)

// On initialize:
const sessionId = crypto.randomUUID();
await redis.setex(
  `mcp:session:${sessionId}`,
  3600, // 1 hour TTL
  JSON.stringify({ tenantId, userId, initializedAt: new Date().toISOString() })
);
res.setHeader("Mcp-Session-Id", sessionId);

// On tools/call:
const sessionData = await redis.get(`mcp:session:${req.headers["mcp-session-id"]}`);
if (!sessionData) {
  return { jsonrpc: "2.0", error: { code: -32002, message: "Session not initialized" } };
}
```

```typescript
// Request (JSON-RPC 2.0)
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "smartspec.skills.execute",
        "description": "Execute a SmartSpecPro AI skill with given inputs",
        "inputSchema": {
          "type": "object",
          "properties": {
            "skillId": { "type": "string", "description": "Skill ID or slug" },
            "inputs": { "type": "object", "description": "Skill input parameters" },
            "model": { "type": "string", "description": "LLM model to use (optional)" }
          },
          "required": ["skillId", "inputs"]
        }
      },
      ...
    ]
  }
}
```

#### 4.2 Server Capabilities

```json
{
  "protocolVersion": "2025-03-26",
  "capabilities": {
    "tools": { "listChanged": true },
    "resources": { "subscribe": false, "listChanged": false }
  },
  "serverInfo": {
    "name": "smartspec-mcp-server",
    "version": "1.0.0"
  }
}
```

**Resources capability [M-12]:** At minimum, implement `resources/list` returning an empty list. This allows future resource additions without client updates.

#### 4.3 Tool Registry (Public MCP)

The public MCP server exposes these tool categories:

| Category | Tool Name | Description | Credit Cost |
|----------|-----------|-------------|-------------|
| **Skills** | `smartspec.skills.list` | List available skills | 0 |
| **Skills** | `smartspec.skills.execute` | Execute a skill | Varies by model |
| **Agencies** | `smartspec.agencies.list` | List available agencies | 0 |
| **Agencies** | `smartspec.agencies.invoke` | Invoke an agency with a message | Varies by model |
| **Media** | `smartspec.media.generate_image` | Generate an image | Model-based | [R3-ARCH-6]
| **Media** | `smartspec.media.generate_video` | Generate a video | Model-based |
| **Media** | `smartspec.media.generate_audio` | Generate audio (TTS/SFX) | Model-based |
| **Media** | `smartspec.media.task_status` | Check media task status | 0 |
| **Media** | `smartspec.media.models` | List available media models | 0 |
| **Presentations** | `smartspec.presentations.generate` | Generate AI presentation | Varies | [R3-ARCH-7]
| **Presentations** | `smartspec.presentations.progress` | Check generation progress | 0 |
| **Presentations** | `smartspec.presentations.export` | Export presentation to PDF/PNG/MP4 | Format-based |
| **Video Projects** | `smartspec.video_projects.list` | List user's video projects | 0 |
| **Video Projects** | `smartspec.video_projects.export` | Export video project to MP4 | Duration-based |
| **Video Projects** | `smartspec.video_projects.export_status` | Check export status | 0 |
| **Jobs** | `smartspec.jobs.create` | Create an automation job | Varies |
| **Jobs** | `smartspec.jobs.status` | Check job status | 0 |
| **Jobs** | `smartspec.jobs.result` | Get job result | 0 |
| **Browser** | `smartspec.browser.execute` | Execute browser automation | 20 credits (pre-reserve) |
| **Files** | `smartspec.files.read` | Read a file/artifact | 0 |
| **Files** | `smartspec.files.list` | List files in workspace | 0 |
| **Drive** | `smartspec.drive.search` | Search Google Drive files | 0 (OAuth required) |
| **Drive** | `smartspec.drive.read` | Read a Google Drive file | 0 (OAuth required) |
| **LLM** | `smartspec.llm.chat` | Send a chat completion | Varies by model |
| **LLM** | `smartspec.llm.models` | List available models | 0 |

#### 4.4 Tool Call Flow

```
Agent calls tools/call("smartspec.skills.execute", { skillId: "image-prompt-engineer", inputs: {...} })
  │
  ├─ 1. Session: verify Mcp-Session-Id is initialized [M-05]
  ├─ 2. Auth: validate API key + scope (mcp:tools)
  ├─ 3. SSRF check: sanitizeUri() on any URL arguments [C-04]
  ├─ 4. Rate limit: check per-key RPM
  ├─ 5. Credit check: verify tenant balance >= estimated cost
  ├─ 6. Dispatch: call skillExecutor.executeSkill(..., authContext) [C-07]
  ├─ 7. Credit deduct: deductCredits(actualCost)
  ├─ 8. Audit: emit public_mcp_tool_call event
  └─ 9. Return: MCP content blocks with result
```

#### 4.5 MCP Auth

API key is passed via HTTP header:
```
Authorization: Bearer sk-ssp_t3x7_Ab9Kz2mP...
```

The MCP server validates and resolves tenant/user from the API key before processing any request.

#### 4.6 SSRF Firewall Layer [C-04]

**Before dispatching any tool that accepts URL or hostname arguments**, the dispatcher MUST validate:

```typescript
import { sanitizeUri } from "@shared/types/mediaJobValidation";

// [R2-04] sanitizeUri() THROWS on invalid input — use try/catch, not {ok, error}
// In each tool dispatcher:
if (args.url) {
  try {
    sanitizeUri(args.url, "web_backend"); // throws if invalid
  } catch (err) {
    return [{ type: "text", text: JSON.stringify({ error: "Invalid URL", detail: (err as Error).message }) }];
  }
}
```

This prevents SSRF attacks where an external agent passes `http://169.254.169.254/latest/meta-data/` to `smartspec.browser.execute`. The existing `sanitizeUri()` from `shared/types/mediaJobValidation.ts` handles:
- Block `localhost`, `127.0.0.1`, `::1`, link-local `169.254.*`, private ranges
- HTTPS-only enforcement (except for development localhost)
- **Note [R2-05]:** `sanitizeUri()` does NOT perform DNS resolution. For full DNS rebinding prevention, a separate DNS pre-resolution check must be added before dispatching browser/fetch calls:

```typescript
// Additional DNS rebinding guard (NOT in sanitizeUri — must be added):
import { resolve4, resolve6 } from "dns/promises";
async function assertPublicIp(hostname: string): Promise<void> {
  // [R3-LOW-3] Check ALL A and AAAA records, not just the first one.
  // A hostname with multiple records could have one public and one private IP.
  const [ipv4s, ipv6s] = await Promise.all([
    resolve4(hostname).catch(() => []),
    resolve6(hostname).catch(() => []),
  ]);
  const allIps = [...ipv4s, ...ipv6s];
  if (allIps.length === 0) throw new Error(`DNS resolution failed for ${hostname}`);
  for (const ip of allIps) {
    if (isPrivateIp(ip)) throw new Error(`DNS resolved to private IP: ${ip}`);
  }
}
```

#### 4.7 Implementation

**File:** `apps/web/server/_core/mcpPublicServer.ts`

New file implementing MCP Streamable HTTP transport. Delegates tool execution to existing services:

```typescript
const TOOL_DISPATCHERS: Record<string, (args: any, ctx: AuthContext) => Promise<McpContent[]>> = {
  "smartspec.skills.execute": async (args, ctx) => {
    // [C-04] SSRF check on any URL inputs
    validateNoSsrfUrls(args.inputs);
    // [C-07] Use AuthContext instead of raw userToken
    const result = await skillExecutor.executeSkill(args.skillId, args.inputs, ctx);
    return [{ type: "text", text: JSON.stringify(result) }];
  },
  "smartspec.agencies.invoke": async (args, ctx) => {
    // [C-09] Auto-create conversation if needed
    const conversationId = args.conversationId ?? await autoCreateConversation(ctx);
    const result = await agencyBridge.executeRun({
      agencyId: args.agencyId,
      message: args.message,
      conversationId,
      authContext: ctx, // [C-07]
    });
    return [{ type: "text", text: result }];
  },
  "smartspec.browser.execute": async (args, ctx) => {
    // [C-04, R2-04] MANDATORY SSRF check before browser dispatch
    if (args.url) {
      try {
        sanitizeUri(args.url, "web_backend"); // throws on invalid
        await assertPublicIp(new URL(args.url).hostname); // [R2-05] DNS rebinding guard
      } catch (err) { throw new Error(`SSRF blocked: ${(err as Error).message}`); }
    }
    const result = await browserProxy.execute(args, ctx);
    return [{ type: "text", text: JSON.stringify(result) }];
  },
  "smartspec.media.generate": async (args, ctx) => {
    const job = await mediaGenerationService.createTask(args, ctx.userId, ctx.tenantId);
    return [{ type: "text", text: JSON.stringify({ jobId: job.id, status: "queued" }) }];
  },
  // ... more dispatchers
};
```

---

## 5. Feature 04: Job Automation API

### Overview

Async job API for long-running automation tasks. External agents submit jobs, poll for status, and retrieve results. Jobs are powered by the existing task queue infrastructure with credit pre-reservation and optimistic concurrency control.

**[CV-5] Queue architecture note:** The codebase comment in `server/_core/index.ts` indicates BullMQ has been "migrated to Cloud Tasks." The job automation service should use the **current active queue system** (verify which is live at implementation time — if Cloud Tasks is active, use that; if BullMQ is still in use for some job types, use BullMQ). The spec uses "task queue" generically; implementation must align with whichever system is currently operational. Key integration point: job worker registration must happen in `server/_core/index.ts` after the queue system initialization [R2-11].

### Endpoints

#### 5.1 Create Job

```http
POST /v1/jobs
Authorization: Bearer sk-ssp_...
Content-Type: application/json
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

{
  "type": "skill_execution",
  "params": {
    "skillId": "video-prompt-engineer",
    "inputs": { "topic": "AI future trends", "style": "cinematic" },
    "model": "claude-sonnet-4-6"
  },
  "callback_url": "https://my-app.com/webhooks/smartspec",
  "callback_secret": "whsec_..."
}
```

**Supported job types:**

| Type | Description | Typical Duration | Credit Cost | Max Items [M-09] |
|------|-------------|-----------------|-------------|----------|
| `skill_execution` | Execute an AI skill | 5-30s | Varies | 1 |
| `agency_run` | Run an agency conversation | 10-120s | Varies | 1 |
| `media_generation` | Generate image/video/audio | 10-300s | Varies | 1 |
| `browser_automation` | Run browser automation task | 30-600s | 20 max | 1 |
| `batch_skill` | Execute a skill on multiple inputs | Varies | Per-item | **100 max** [M-09, R3-HIGH-2] |
| `pipeline` | Chain multiple jobs sequentially | Varies | Sum of steps | **10 steps max** [H-13] |

#### Batch Skill Validation Schema [R3-HIGH-2]

`batch_skill` jobs MUST be validated with a strict Zod schema at the API boundary. Without this, malformed batch items could crash the worker or leak errors:

```typescript
const batchSkillParamsSchema = z.object({
  skillId: z.string().min(1).max(100),
  items: z.array(z.object({
    inputs: z.record(z.unknown()),
    model: z.string().optional(),
  })).min(1).max(100), // [M-09] Hard cap at 100
});

// In createJob():
if (input.type === "batch_skill") {
  const parsed = batchSkillParamsSchema.safeParse(input.params);
  if (!parsed.success) {
    return res.status(422).json({
      error: { code: "validation_error", message: parsed.error.issues[0].message }
    });
  }
}
```

#### 5.2 Get Job Status

```http
GET /v1/jobs/{jobId}
Authorization: Bearer sk-ssp_...
```

**IMPORTANT [H-08]:** Query MUST include `WHERE tenantId = ctx.tenantId` for tenant isolation. Return 404 (not 403) for cross-tenant misses.

Response:
```json
{
  "id": "job_abc123",
  "type": "skill_execution",
  "status": "completed",
  "progress": 100,
  "created_at": "2026-03-14T10:00:00Z",
  "started_at": "2026-03-14T10:00:01Z",
  "completed_at": "2026-03-14T10:00:15Z",
  "result": {
    "output": "Generated prompt: ...",
    "model_used": "claude-sonnet-4-6",
    "tokens_used": 450
  },
  "credits_used": 5,
  "credits_remaining": 995
}
```

**Job statuses:** `queued` → `running` → `completed` | `failed` | `cancelled`

#### 5.3 Cancel Job

```http
DELETE /v1/jobs/{jobId}
Authorization: Bearer sk-ssp_...
```

Scope: **`jobs:cancel`** [L-02] (separate from `jobs:create`)

Cancels a queued or running job. Refunds pre-reserved credits.

#### 5.4 List Jobs

```http
GET /v1/jobs?status=running&type=skill_execution&limit=20&after=cursor_xyz
Authorization: Bearer sk-ssp_...
```

Scope: `jobs:read`. Uses cursor-based pagination [H-11].

#### 5.5 Pipeline Jobs [C-03, H-13]

Chain multiple steps with restricted variable substitution:

```json
{
  "type": "pipeline",
  "params": {
    "steps": [
      {
        "id": "research",
        "type": "skill_execution",
        "params": { "skillId": "web-researcher", "inputs": { "query": "AI trends 2026" } }
      },
      {
        "id": "write",
        "type": "skill_execution",
        "params": { "skillId": "article-writer", "inputs": { "research": "{{steps.research.output}}" } }
      },
      {
        "id": "image",
        "type": "media_generation",
        "params": { "type": "image", "prompt": "{{steps.write.summary}}" }
      }
    ]
  }
}
```

#### Pipeline Template Substitution Rules [C-03]

Step outputs are available as `{{steps.<stepId>.<field>}}` template variables. **Strict rules apply:**

1. **Allowlisted fields only:** `output`, `summary`, `status`, `error.message`. No arbitrary JSON path traversal.
2. **Size cap:** Each substituted value is capped at **8KB**. Values exceeding this are truncated with a `_truncated: true` flag.
3. **Sanitization:** Control characters (`\x00`-`\x1F` except `\n`, `\t`) and null bytes are stripped.
4. **Placement:** All `{{...}}` substituted values MUST be placed in `HumanMessage` context when passed to LLM skills, **never** in system prompt content. (Reference: CLAUDE.md Rule 3)
5. **No nested templates:** `{{...}}` patterns within substituted values are escaped, not re-evaluated.

#### Pipeline Validation [H-13]

Before accepting a pipeline job:
- **Max 10 steps** — reject pipelines with more than 10 steps
- **DAG cycle detection** — topological sort to verify no circular dependencies in `{{steps.X.Y}}` references
- **Step result size cap** — Each step's `result` stored in `automation_jobs.result` is capped at **1MB** [M-07]. Results exceeding this limit are truncated and `result_truncated: true` is set.

### Database

#### New Table: `automation_jobs`

```typescript
export const automationJobs = pgTable("automation_jobs", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => `job_${crypto.randomUUID()}`),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id),
  apiKeyId: varchar("api_key_id", { length: 36 }).references(() => apiKeys.id, { onDelete: "set null" }), // [R3-ARCH-8] Jobs survive key revocation
  type: varchar("type", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("queued"),
  params: json("params").$type<Record<string, any>>().notNull(),
  result: json("result").$type<Record<string, any>>(),
  resultTruncated: boolean("result_truncated").default(false), // [M-07]
  error: json("error").$type<{ code: string; message: string }>(),
  progress: integer("progress").default(0),
  creditsReserved: integer("credits_reserved").default(0),
  creditsUsed: integer("credits_used").default(0),
  callbackUrl: text("callback_url"),
  callbackSecretEncrypted: text("callback_secret_encrypted"), // AES-256-GCM via crypto.ts
  parentJobId: varchar("parent_job_id", { length: 36 }), // For pipeline steps
  stepIndex: integer("step_index"), // Step order in pipeline
  traceId: varchar("trace_id", { length: 32 }),
  idempotencyKey: varchar("idempotency_key", { length: 64 }), // [H-10]
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }), // Auto-cleanup
}, (table) => ({
  tenantIdx: index("idx_jobs_tenant").on(table.tenantId),
  statusIdx: index("idx_jobs_status").on(table.status),
  parentIdx: index("idx_jobs_parent").on(table.parentJobId),
  apiKeyIdx: index("idx_jobs_api_key").on(table.apiKeyId), // [R3-MED-2] Partial index recommended: WHERE api_key_id IS NOT NULL (nullable column)
  idempotencyIdx: uniqueIndex("idx_jobs_idempotency").on(table.apiKeyId, table.idempotencyKey), // [H-10] — NULLs are distinct in unique indexes, so this is safe for non-API jobs
}));
```

#### Job Cleanup Scheduler [M-13]

A scheduled job (task queue repeatable or cron) runs every hour:
```typescript
// Delete completed/failed jobs older than expiresAt (default 30 days)
await db.delete(automationJobs)
  .where(and(
    inArray(automationJobs.status, ["completed", "failed", "cancelled"]),
    lt(automationJobs.expiresAt, new Date())
  ));
```

### Implementation

#### 5.6 Job Queue Service

**File:** `apps/web/server/services/jobAutomationService.ts`

```typescript
class JobAutomationService {
  // [CV-5] Task queue — use active queue system (BullMQ or Cloud Tasks)
  private queue: TaskQueue; // Abstract interface over BullMQ/Cloud Tasks

  async createJob(input: CreateJobInput, ctx: AuthContext): Promise<AutomationJob> {
    // 1. Validate job type against enum [R3-LOW-1]:
    //    const VALID_JOB_TYPES = ["skill_execution", "agency_run", "media_generation",
    //      "browser_automation", "batch_skill", "pipeline"] as const;
    //    if (!VALID_JOB_TYPES.includes(input.type)) return 422 "invalid job type"
    // 2. For batch_skill: enforce 100-item limit [M-09]
    // 3. For pipeline: validate DAG (max 10 steps, cycle detection) [H-13]
    // 4. Credit pre-reservation with optimistic concurrency [H-06, R2-01]:
    //    [R3-MED-3] Guard against integer overflow: cap estimated credit cost
    //    at MAX_SINGLE_JOB_CREDITS (10,000) before the SQL runs:
    //    if (estimatedCredits > MAX_SINGLE_JOB_CREDITS) return 400 "credit_estimate_too_high"
    //    UPDATE users SET credits = credits - :amount
    //    WHERE id = :userId AND credits >= :amount
    //    → 0 rows affected = 402 Payment Required
    //    NOTE: There is NO `credit_balances` table. Credits are stored as
    //    `users.credits` (integer column). Deduction is atomic via WHERE guard.
    // 5. For batch_skill: full batch pre-reservation (cost × items) [M-09]
    // 6. Insert into automation_jobs table
    // 7. Add to BullMQ queue
    // 8. Return job object with ID
  }

  async processJob(job: Job<AutomationJobData>): Promise<void> {
    // 1. Update status to "running"
    // 2. Dispatch to type-specific executor (using AuthContext, not userToken) [C-07]
    // 3. Cap result size to 1MB [M-07]
    // 4. On success: update result, deduct credits, refund excess
    // 5. On failure: update error, refund all reserved credits
    // 6. If callback_url: send webhook notification
  }
}
```

#### Credit Pre-Reservation (Optimistic Concurrency) [H-06, R2-01]

**IMPORTANT [R2-01]:** There is NO `credit_balances` table in the system. Credits are tracked via:
- `users.credits` — integer column on the `users` table (current balance)
- `creditTransactions` — log table for audit trail

```sql
-- Atomic deduction: prevents TOCTOU race between concurrent requests
-- This is the ACTUAL pattern used by creditService.deductCredits():
UPDATE users
SET credits = credits - :amount
WHERE id = :userId
  AND credits >= :amount
RETURNING credits;
-- 0 rows affected → 402 Payment Required

-- Then insert audit record:
INSERT INTO credit_transactions (user_id, amount, type, source_type, description)
VALUES (:userId, -:amount, 'usage', 'api_job', 'Job pre-reservation');
```

For long-running jobs that need pre-reserve + partial refund:
```sql
-- Pre-reserve (deduct estimated maximum)
UPDATE users SET credits = credits - :estimatedMax
WHERE id = :userId AND credits >= :estimatedMax;

-- On completion: refund unused portion [R3-HIGH-3]
-- CRITICAL: Refund MUST be wrapped in a transaction with the credit_transactions insert
-- to prevent orphaned refund records if either statement fails:
BEGIN;
UPDATE users SET credits = credits + (:estimatedMax - :actualUsed)
WHERE id = :userId;
INSERT INTO credit_transactions (user_id, amount, type, source_type, description)
VALUES (:userId, :refundAmount, 'refund', 'api_job', 'Job over-reservation refund');
COMMIT;
```

#### Audit Tracking for Non-LLM API Calls [C-08]

`providerUsageLog.providerId` is **NOT NULL** — non-LLM API calls (skill execution, job creation) don't have a provider. **Resolution:**

Option A (recommended): Add an **"API Gateway" sentinel row** in `llmProviders` seed data:
```sql
-- [R2-03] llmProviders.id is SERIAL (integer, auto-increment), not UUID
-- Column is "provider_type" (varchar 32), not "type"
INSERT INTO llm_providers (name, slug, provider_type, is_active)
VALUES ('API Gateway', 'api-gateway', 'internal', true)
ON CONFLICT (slug) DO NOTHING;
-- Use the returned serial ID as the sentinel providerId for non-LLM API tracking
```

Option B: Use `apiAuditEvents` table (not `providerUsageLog`) for non-LLM tracking. This is cleaner but requires separate query paths for usage dashboards.

#### Auto-Create Conversation for API [C-09, R3-ARCH-1]

**CRITICAL [R3-ARCH-1]:** Agency invocation uses the `agencyConversations` table (varchar(36) ID), NOT the `conversations` table (integer ID). The spec v1.2.0 incorrectly targeted `conversations` — corrected in v1.3.0.

**Two distinct conversation paths exist:**
- `/v1/agencies/:id/invoke` → uses `agencyConversations` (varchar(36) ID, FK to `agencies.id`)
- `/v1/chat/completions`, `/v1/skills/:id/execute` → uses `conversations` (integer ID)

```typescript
// For AGENCY invocation: uses `agencyConversations` table
async function getOrCreateAgencyApiConversation(
  ctx: AuthContext,
  agencyId: string,
  existingConversationId?: string
): Promise<string> { // Returns VARCHAR(36) ID, not number
  if (existingConversationId) {
    // [R3-ARCH-2] agencyConversations has NO tenantId — isolate via userId + agencyId
    const conv = await db.query.agencyConversations.findFirst({
      where: and(
        eq(agencyConversations.id, existingConversationId),
        eq(agencyConversations.userId, ctx.userId),
        eq(agencyConversations.agencyId, agencyId),
      )
    });
    if (!conv) throw new NotFoundError("Conversation not found");
    return conv.id;
  }

  // Auto-create a new agency conversation
  // [R2-02 CORRECTED] New columns go on `agencyConversations`, NOT `conversations`:
  //   ALTER TABLE agency_conversations ADD COLUMN source VARCHAR(20) DEFAULT 'web';
  //   ALTER TABLE agency_conversations ADD COLUMN api_key_id VARCHAR(36) REFERENCES api_keys(id);
  //   ALTER TABLE agency_conversations ADD COLUMN expires_at TIMESTAMPTZ;
  const [conv] = await db.insert(agencyConversations).values({
    id: crypto.randomUUID(),
    agencyId,
    userId: ctx.userId,
    title: "API conversation", // [R3-HIGH-4] Generic title
    source: "api",
    apiKeyId: ctx.apiKeyId,
    expiresAt: addDays(new Date(), 30),
  }).returning();
  return conv.id;
}

// For CHAT/SKILL invocation: uses `conversations` table
async function getOrCreateChatApiConversation(
  ctx: AuthContext,
  existingConversationId?: number
): Promise<number> {
  if (existingConversationId) {
    const conv = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, existingConversationId),
        eq(conversations.userId, ctx.userId)
      )
    });
    if (!conv) throw new NotFoundError("Conversation not found");
    return conv.id;
  }

  // [R2-02] conversations also needs source, apiKeyId, expiresAt columns for chat API:
  const [conv] = await db.insert(conversations).values({
    userId: ctx.userId,
    title: "API conversation",
    source: "api",
    apiKeyId: ctx.apiKeyId,
    expiresAt: addDays(new Date(), 30),
  }).returning();
  return conv.id;
}
```

**[R3-ARCH-2] Tenant isolation for agency conversations:** `agencyConversations` has NO `tenantId` column. Isolation requires:
1. `WHERE userId = ctx.userId` — direct ownership
2. `WHERE agencyId` → JOIN `agencies` → `WHERE agencies.tenantId = ctx.tenantId` — verify agency belongs to tenant

#### 5.7 Callback Webhook

When a job completes/fails, if `callback_url` is set, send:

```http
POST {callback_url}
Content-Type: application/json
X-SmartSpec-Signature: sha256=HMAC(callback_secret, body)
X-SmartSpec-Event: job.completed

{
  "event": "job.completed",
  "job_id": "job_abc123",
  "type": "skill_execution",
  "status": "completed",
  "result": { ... },
  "credits_used": 5,
  "timestamp": "2026-03-14T10:00:15Z"
}
```

HMAC signature verification using `callback_secret` (stored encrypted). Retry: 3 attempts with exponential backoff (5s, 30s, 300s).

**[R3-HIGH-1] Callback payload sanitization:** The webhook callback payload MUST NOT include the job's `params` field verbatim — it may contain API keys, secrets, or sensitive inputs passed by the caller. Strip `params` from callback payloads; include only: `job_id`, `type`, `status`, `result` (output only), `credits_used`, `timestamp`.

**[R3-MED-4] Webhook tenant check:** Webhook delivery MUST verify that the target webhook endpoint belongs to the same tenant as the job. Prevent cross-tenant webhook delivery by including `WHERE tenantId = job.tenantId` when looking up callback endpoints.

**Callback URL validation [C-04]:** `callback_url` MUST pass `sanitizeUri()` validation before storage — no localhost, no internal IPs, HTTPS only.

---

## 6. Feature 05: Skill Execution API

### Overview

REST API for listing and executing SmartSpecPro skills. External agents can discover available skills, see their input schemas, and execute them programmatically.

### Endpoints

#### 6.1 List Skills

```http
GET /v1/skills?category=prompt_enhancement&enabled=true&limit=20
Authorization: Bearer sk-ssp_...
```

Response:
```json
{
  "object": "list",
  "data": [
    {
      "id": "image-prompt-engineer",
      "name": "Image Prompt Engineer",
      "description": "Generate optimized image generation prompts",
      "category": "prompt_enhancement",
      "version": "1.0.0",
      "input_schema": { ... },
      "credit_multiplier": 1.0,
      "tags": ["image", "prompt"]
    }
  ],
  "has_more": false
}
```

Scope: `skills:list`. Cursor-based pagination [H-11].

#### 6.2 Get Skill Details

```http
GET /v1/skills/{skillId}
Authorization: Bearer sk-ssp_...
```

Returns full skill metadata including input schema, UI schema, and example inputs.

Scope: `skills:list`

#### 6.3 Execute Skill

```http
POST /v1/skills/{skillId}/execute
Authorization: Bearer sk-ssp_...
Content-Type: application/json
Idempotency-Key: optional-uuid

{
  "inputs": {
    "topic": "futuristic city",
    "style": "photorealistic",
    "aspect_ratio": "16:9"
  },
  "model": "claude-sonnet-4-6",
  "stream": false
}
```

Response (non-streaming):
```json
{
  "id": "exec_abc123",
  "skill_id": "image-prompt-engineer",
  "status": "completed",
  "output": "A breathtaking aerial view of a futuristic megalopolis...",
  "model_used": "claude-sonnet-4-6",
  "usage": { "prompt_tokens": 200, "completion_tokens": 500 },
  "credits_used": 5,
  "trace_id": "tr_xyz789"
}
```

Response (streaming, `stream: true`):
SSE stream identical to `/v1/chat/completions` streaming format.

Scope: `skills:execute`

### Implementation

**File:** `apps/web/server/routes/publicSkillsApi.ts`

Express routes that wrap `skillExecutor.executeSkill()` with:
- API key auth via `authorizeRequest()`
- Scope validation
- Input validation against skill's JSON Schema
- `AuthContext` (not raw `userToken`) passed to `executeSkill()` [C-07]
- Credit deduction
- Audit logging

---

## 7. Feature 06: Agency Invocation API

### Overview

REST + SSE API for invoking agencies externally. Agents can start conversations with SmartSpecPro agencies, receive streaming responses, and optionally maintain conversation context.

### Endpoints

#### 7.1 List Agencies

```http
GET /v1/agencies?limit=20
Authorization: Bearer sk-ssp_...
```

Returns agencies accessible to the API key's tenant. Scope: `agencies:list`. Cursor-based pagination [H-11].

#### 7.2 Invoke Agency

```http
POST /v1/agencies/{agencyId}/invoke
Authorization: Bearer sk-ssp_...
Content-Type: application/json

{
  "message": "Research the latest developments in quantum computing",
  "conversation_id": null,
  "stream": true,
  "persona_id": null,
  "max_credits": 100
}
```

**Conversation handling [C-09]:**
- If `conversation_id` is `null`: auto-create a new conversation for this API key's user (source: `"api"`, expires in 30 days)
- If `conversation_id` is provided: verify it belongs to the API key's user and tenant
- Return `conversation_id` in response for multi-turn usage

**Streaming response (SSE):**
```
data: {"type":"agent_start","agent":"Researcher","timestamp":"..."}
data: {"type":"content","text":"Based on my research...","agent":"Researcher"}
data: {"type":"tool_call","tool":"web_search","args":{"query":"quantum computing 2026"}}
data: {"type":"tool_result","tool":"web_search","result":"..."}
data: {"type":"content","text":"The latest developments include..."}
data: {"type":"agent_end","agent":"Researcher","credits_used":15}
data: {"type":"done","conversation_id":"conv_abc123","total_credits":15}
```

**Non-streaming response:**
```json
{
  "id": "invoke_abc123",
  "agency_id": "agency_xyz",
  "conversation_id": "conv_abc123",
  "messages": [
    { "role": "assistant", "content": "Based on my research...", "agent": "Researcher" }
  ],
  "tool_calls": [...],
  "credits_used": 15,
  "trace_id": "tr_xyz789"
}
```

Scope: `agencies:invoke`

#### 7.3 Continue Conversation

Use the returned `conversation_id` to continue:

```http
POST /v1/agencies/{agencyId}/invoke
Authorization: Bearer sk-ssp_...

{
  "message": "Can you go deeper on superconducting qubits?",
  "conversation_id": "conv_abc123",
  "stream": true
}
```

### Implementation

**File:** `apps/web/server/routes/publicAgencyApi.ts`

Wraps `agencyBridge.ts` and `agencyStreamProxy.ts`:
- Creates a conversation for the API key user if none exists [C-09]
- Uses `AuthContext` instead of raw `userToken` [C-07]
- Streams agency responses via SSE
- Tracks credits across multi-agent runs
- Enforces `max_credits` budget cap per invocation
- **Tenant isolation** — all conversation queries include `WHERE userId = ctx.userId` [H-08]

---

## 8. Feature 07: Webhook Callback & Event Streaming

### Overview

Two mechanisms for external agents to receive real-time updates:

1. **Webhook Callbacks** — HTTP POST to agent's URL when events occur
2. **Event Stream** — SSE endpoint for real-time event subscription

### 8.1 Webhook Endpoints (manage callback URLs)

```http
POST /v1/webhooks
Authorization: Bearer sk-ssp_...

{
  "url": "https://my-agent.com/webhooks/smartspec",
  "secret": "whsec_mySecret123",
  "events": ["job.completed", "job.failed", "media.ready", "agency.message"],
  "active": true
}
```

CRUD operations for managing webhook endpoints. Scope: `webhooks:manage`

**URL validation [C-04]:** `url` must pass `sanitizeUri()` — no localhost, no internal IPs, HTTPS only.

#### Webhook Secret Rotation [H-05]

```http
PATCH /v1/webhooks/{webhookId}
Authorization: Bearer sk-ssp_...

{
  "rotate_secret": true
}
```

Response includes the new secret (shown ONCE):
```json
{
  "id": "wh_abc123",
  "new_secret": "whsec_newRandomSecret456",
  "grace_period_ends_at": "2026-03-14T10:05:00Z"
}
```

During the 5-minute grace period, both old and new secrets are accepted for HMAC verification. After the grace period, only the new secret is valid.

#### Auto-Disable After Consecutive Failures [L-08]

If a webhook endpoint fails delivery **100 consecutive times**, it is automatically set to `isActive: false`. The tenant admin is notified via email. The webhook can be manually re-enabled via `PATCH /v1/webhooks/:id { "active": true }` after fixing the receiving endpoint.

### 8.2 Event Types

| Event | Trigger | Payload |
|-------|---------|---------|
| `job.completed` | Job finishes successfully | Job result + credits |
| `job.failed` | Job fails | Error details |
| `job.progress` | Job progress update | Progress percentage |
| `media.ready` | Media generation complete | Download URL |
| `agency.message` | Agency produces a message | Message content |
| `credits.low` | Credit balance below threshold | Current balance |
| `key.expiring` | API key near expiration | Days remaining |

### 8.3 Event Stream (SSE) [M-06]

```http
GET /v1/events?types=job.completed,media.ready
Authorization: Bearer sk-ssp_...
Accept: text/event-stream
Last-Event-ID: evt_12345
```

Scope: `events:read` [R3-HIGH-7] (separate from `webhooks:manage` — reading events is a different privilege than managing webhook endpoints)

SSE connection parameters and limits:
- **Max connection duration:** 24 hours — server sends `retry: 30000` and closes after 24h [M-06]
- **Heartbeat:** `ping` event every 30 seconds to detect dead connections [M-06]
- **Per-key connection limit:** Max 10 concurrent SSE connections per API key, enforced via Redis set `sse:connections:{keyId}` [M-06]
- **`Last-Event-ID` support:** Client can resume from last received event on reconnection [L-09]
- **Event format:**
```
id: evt_12345
event: job.completed
data: {"job_id":"job_abc","status":"completed","credits_used":5}

: heartbeat

id: evt_12346
event: media.ready
data: {"media_id":"media_xyz","url":"https://..."}
```

### Database

#### New Table: `api_webhook_endpoints`

```typescript
export const apiWebhookEndpoints = pgTable("api_webhook_endpoints", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  apiKeyId: varchar("api_key_id", { length: 36 }).references(() => apiKeys.id, { onDelete: "set null" }), // [R3-ARCH-13] Nullable — webhooks belong to tenant, survive key rotation
  url: text("url").notNull(),
  secretEncrypted: text("secret_encrypted").notNull(), // AES-256-GCM
  previousSecretEncrypted: text("previous_secret_encrypted"), // For rotation grace period [H-05]
  graceEndsAt: timestamp("grace_ends_at", { withTimezone: true }), // [H-05]
  events: json("events").$type<string[]>().notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastDeliveredAt: timestamp("last_delivered_at", { withTimezone: true }),
  failureCount: integer("failure_count").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index("idx_webhook_tenant").on(table.tenantId), // [R3-ARCH-9]
  apiKeyIdx: index("idx_webhook_api_key").on(table.apiKeyId),
}));
```

---

## 9. Feature 08: External Agent SDK & Documentation

### Overview

Provide client libraries and interactive documentation so agents can integrate quickly.

### 9.1 OpenAPI Specification

Auto-generated OpenAPI 3.1 spec at `/v1/openapi.json`. Covers all public endpoints with:
- Request/response schemas
- Authentication requirements
- Rate limit documentation
- Error code reference

### 9.2 Interactive API Docs

Swagger UI at `/v1/docs`.

**Note [L-03]:** This endpoint is **intentionally unauthenticated** for discoverability. Do not add authentication. The information exposed is intentionally public: the API schema and usage instructions. No credentials or tenant data are present.

### 9.3 MCP Server Manifest

```json
// https://smartaihub.app/.well-known/mcp.json
{
  "schema_version": "1.0",
  "name": "SmartSpecPro",
  "description": "AI-powered specification and media generation platform",
  "url": "https://smartaihub.app/v1/mcp",
  "authentication": {
    "type": "bearer",
    "token_url": null,
    "instructions": "Use your SmartSpecPro API key (sk-ssp_...) as the Bearer token"
  },
  "capabilities": ["tools", "resources"],
  "documentation_url": "https://smartaihub.app/v1/docs"
}
```

**Note [L-03]:** This endpoint is **intentionally unauthenticated** for MCP auto-discovery by AI agents. The manifest contains no credentials — only the endpoint URL and auth instructions.

### 9.4 Python SDK (pip package) [L-01]

**Package:** `smartspecpro` (published to internal PyPI or GitHub Packages)

```python
import os
from smartspecpro import SmartSpecClient

# [L-01] Always use environment variables for API keys — never hardcode
client = SmartSpecClient(api_key=os.environ["SMARTSPEC_API_KEY"])

# Execute a skill
result = client.skills.execute(
    skill_id="image-prompt-engineer",
    inputs={"topic": "sunset", "style": "oil painting"},
    model="claude-sonnet-4-6",
)
print(result.output)

# Invoke an agency
response = client.agencies.invoke(
    agency_id="research-agent",
    message="Analyze market trends for EVs",
    stream=True,
)
for event in response:
    print(event.content)

# Create an automation job
job = client.jobs.create(
    type="pipeline",
    params={
        "steps": [
            {"id": "research", "type": "skill_execution", ...},
            {"id": "write", "type": "skill_execution", ...},
        ]
    },
    callback_url="https://my-app.com/webhook",
)
print(f"Job {job.id} created, status: {job.status}")

# MCP tool call (for agent frameworks)
tools = client.mcp.list_tools()
result = client.mcp.call_tool("smartspec.media.generate", {
    "type": "image",
    "prompt": "A robot painting a landscape",
})
```

### 9.5 TypeScript/JavaScript SDK [L-01]

**Package:** `@smartspec/sdk` (npm)

```typescript
import { SmartSpecClient } from "@smartspec/sdk";

// [L-01] Always use environment variables for API keys — never hardcode
const client = new SmartSpecClient({ apiKey: process.env.SMARTSPEC_API_KEY! });

const result = await client.skills.execute("image-prompt-engineer", {
  inputs: { topic: "sunset" },
  stream: true,
});

for await (const chunk of result) {
  process.stdout.write(chunk.content);
}
```

### 9.6 OpenClaw Integration Guide

OpenClaw can connect to SmartSpecPro as a tool provider:

```yaml
# openclaw.yml
tools:
  - name: smartspec
    type: mcp
    url: https://smartaihub.app/v1/mcp
    auth:
      type: bearer
      token: ${SMARTSPEC_API_KEY}
```

### 9.7 Manus AI Integration Guide

Manus AI connects via the MCP manifest:

1. Manus discovers `https://smartaihub.app/.well-known/mcp.json`
2. Manus connects to `https://smartaihub.app/v1/mcp` with API key
3. Manus lists available tools via `tools/list`
4. Manus calls tools via `tools/call` (skill execution, media generation, etc.)

---

## 10. Feature 09: Presentation API

### Overview

REST API for generating AI-powered presentations and exporting existing presentations. External agents can request full AI-generated slide decks, poll progress, and download results.

### Endpoints

#### 10.1 Generate AI Presentation

```http
POST /v1/presentations/generate
Authorization: Bearer sk-ssp_...
Content-Type: application/json
Idempotency-Key: optional-uuid

{
  "topic": "AI Trends in Healthcare 2026",
  "slide_count": 10,
  "style": "professional",
  "language": "th",
  "include_images": true,
  "model": "claude-sonnet-4-6"
}
```

**Input validation [R3-MED-6]:**
```typescript
const presentationGenerateSchema = z.object({
  topic: z.string().min(3).max(1000), // [R3-MED-6] Bounded — matches tRPC autoGenerateDraft input
  slide_count: z.number().int().min(1).max(30),
  style: z.enum(["professional", "creative", "minimal", "bold"]).optional(),
  language: z.string().max(5).optional(),
  include_images: z.boolean().optional().default(true),
  model: z.string().max(100).optional(),
});
```

Response:
```json
{
  "id": "pres_gen_abc123",
  "task_id": "task_xyz789",
  "deck_id": 42,
  "library_item_id": 15,
  "status": "generating",
  "estimated_credits": 50,
  "trace_id": "tr_abc123"
}
```

**Implementation:** Wraps `presentation.ai.autoGenerateDraft()` tRPC procedure which is fire-and-forget. Returns `{ taskId, deckId, libraryItemId }` immediately. Credits deducted per image generated during AI generation.

Scope: `presentations:generate`

#### 10.2 Poll Generation Progress

```http
GET /v1/presentations/tasks/{taskId}/progress
Authorization: Bearer sk-ssp_...
```

Response:
```json
{
  "task_id": "task_xyz789",
  "status": "generating",
  "progress": 60,
  "current_step": "Generating slide 6 of 10",
  "deck_id": 42,
  "credits_used_so_far": 30
}
```

**Status values:** `generating` → `completed` | `failed`

**Implementation:** Wraps `presentation.ai.generateDraftProgress()` which reads from Redis key `ai_draft_progress:{taskId}`.

Scope: `presentations:read`

#### 10.3 Get Presentation

```http
GET /v1/presentations/decks/{deckId}
Authorization: Bearer sk-ssp_...
```

Returns presentation metadata (slide count, title, created date). Does NOT return full slide data (too large for API response).

Scope: `presentations:read`

#### 10.4 Export Presentation

```http
POST /v1/presentations/decks/{deckId}/export
Authorization: Bearer sk-ssp_...

{
  "format": "pdf",
  "quality": "standard"
}
```

Supported formats: `pdf`, `png`, `mp4`

Response:
```json
{
  "export_id": "exp_abc123",
  "status": "queued",
  "format": "pdf",
  "estimated_credits": 5
}
```

**Credit cost for exports:**
- `pdf` — 5 credits (flat)
- `png` — 3 credits (flat)
- `mp4` — Duration-based: `5 credits × ceil(duration_minutes)` (minimum 5 credits)

Scope: `presentations:generate`

#### 10.5 Poll Export Progress

```http
GET /v1/presentations/exports/{exportId}
Authorization: Bearer sk-ssp_...
```

Response:
```json
{
  "export_id": "exp_abc123",
  "status": "done",
  "format": "pdf",
  "output_url": "https://smartaihub.app/api/v1/presentations/export/download/exp_abc123",
  "output_bytes": 2456789,
  "credits_used": 5
}
```

**Export statuses:** `queued` → `processing` → `done` | `error`

Scope: `presentations:read`

#### 10.6 Download Export [R3-CRIT-3]

```http
GET /v1/presentations/exports/download/{exportId}
Authorization: Bearer sk-ssp_...
```

**CRITICAL [R3-CRIT-3]:** Export download URLs MUST NOT be unauthenticated. Two options:

**Option A (recommended): Bearer auth on download endpoint**
- The `output_url` returned in poll responses is a SmartSpecPro API endpoint (not a direct S3 link)
- Download requires `Authorization: Bearer sk-ssp_...` + scope `presentations:read`
- Server verifies ownership (`WHERE tenantId = ctx.tenantId AND userId = ctx.userId`) before streaming the file
- Content-Disposition: `attachment; filename="presentation-{deckId}.{format}"`

**Option B: Time-limited signed URL**
- Generate S3/R2 presigned URL with 1-hour expiry
- URL is unguessable (contains HMAC signature) but does not require Bearer auth
- Less secure — URL can be shared

**Implementation must use Option A** for consistency with the API key auth model. The `output_url` field in responses points to the authenticated endpoint, not directly to storage.

```typescript
// In publicPresentationApi.ts:
router.get("/v1/presentations/exports/download/:exportId", async (req, res) => {
  const auth = await guardWithCredits(req, res, { requiredScope: "presentations:read" });
  if (!auth) return;
  const exp = await db.query.presentationExports.findFirst({
    where: and(
      eq(presentationExports.id, req.params.exportId),
      eq(presentationExports.tenantId, auth.tenantId),
      eq(presentationExports.userId, auth.userId),
    ),
  });
  if (!exp || exp.status !== "done") return res.status(404).json({ error: { code: "not_found" } });
  // Stream file from storage
  const stream = await storageService.getFileStream(exp.outputPath);
  res.setHeader("Content-Type", formatToMime(exp.format));
  res.setHeader("Content-Disposition", `attachment; filename="presentation-${exp.deckId}.${exp.format}"`);
  stream.pipe(res);
});
```

### Implementation

**File:** `apps/web/server/routes/publicPresentationApi.ts`

Express routes wrapping existing tRPC procedures:
- `autoGenerateDraft()` for AI generation
- `generateDraftProgress()` for progress polling
- `triggerPresentationExport()` for export (with credit deduction — **[CV-2] note: `triggerPresentationExport()` does NOT deduct credits internally, credit deduction must be added in the API wrapper before calling it**)
- Uses `AuthContext` (not raw userToken)
- **[R3-HIGH-5] Presentation IDOR protection:** All deck queries MUST include `WHERE userId = ctx.userId` (or join through `libraryItems` ownership). The `presentationDecks` table may not have a direct `userId` column — verify ownership via `libraryItems.userId` FK. Return 404 for non-owned decks.
- Tenant isolation: all queries include `WHERE userId = ctx.userId`

---

## 11. Feature 10: Video Project API

### Overview

REST API for managing and exporting video editor projects. External agents can trigger video project exports (render timeline to MP4) with **duration-based credit deduction**. Video projects use the Konva.js timeline editor; exporting renders them to MP4 via FFmpeg.

### Credit Model: Duration-Based Pricing

Video project exports are charged based on **output video duration** and **quality**:

| Quality | Credit Cost Formula | Example (2-min video) |
|---------|-------------------|-----------------------|
| `draft` | `3 × ceil(duration_seconds / 60)` | 6 credits |
| `standard` | `5 × ceil(duration_seconds / 60)` | 10 credits |
| `high` | `10 × ceil(duration_seconds / 60)` | 20 credits |

**Minimum charge:** 1 minute (even for shorter videos).

**Implementation:** Credit deduction happens BEFORE queuing the Celery render task. Duration is read from `videoEditorProjects.duration` column (`numeric(10,2)`, stored in seconds).

```typescript
function calculateVideoExportCredits(durationSeconds: number, quality: "draft" | "standard" | "high"): number {
  const RATES = { draft: 3, standard: 5, high: 10 };
  const minutes = Math.max(1, Math.ceil(durationSeconds / 60));
  return RATES[quality] * minutes;
}
```

### Endpoints

#### 11.1 List Video Projects

```http
GET /v1/video-projects?limit=20&after=cursor_xyz
Authorization: Bearer sk-ssp_...
```

Response:
```json
{
  "object": "list",
  "data": [
    {
      "id": 42,
      "name": "Product Launch Video",
      "duration": 125.5,
      "resolution": "1920x1080",
      "track_count": 4,
      "clip_count": 12,
      "created_at": "2026-03-14T10:00:00Z",
      "updated_at": "2026-03-14T12:30:00Z"
    }
  ],
  "has_more": false
}
```

Scope: `video_projects:read`

#### 11.2 Get Video Project

```http
GET /v1/video-projects/{projectId}
Authorization: Bearer sk-ssp_...
```

Returns project metadata (NOT full projectData JSON — too large). Includes duration, resolution, track/clip counts.

Scope: `video_projects:read`

#### 11.3 Export Video Project

```http
POST /v1/video-projects/{projectId}/export
Authorization: Bearer sk-ssp_...
Idempotency-Key: optional-uuid

{
  "quality": "standard",
  "format": "mp4",
  "resolution": "1920x1080",
  "fps": 30
}
```

Response:
```json
{
  "export_id": "vexp_abc123",
  "project_id": 42,
  "status": "queued",
  "duration": 125.5,
  "estimated_credits": 15,
  "quality": "standard",
  "trace_id": "tr_xyz789"
}
```

**Credit flow:**
1. Read project duration from `videoEditorProjects.duration`
2. Calculate credits: `calculateVideoExportCredits(duration, quality)`
3. Pre-deduct: `UPDATE users SET credits = credits - :amount WHERE id = :userId AND credits >= :amount`
4. If insufficient → `402 Payment Required`
5. Queue Celery render task
6. On failure → refund pre-deducted credits

Scope: `video_projects:export`

#### 11.4 Poll Export Status

```http
GET /v1/video-projects/exports/{exportId}
Authorization: Bearer sk-ssp_...
```

Response:
```json
{
  "export_id": "vexp_abc123",
  "status": "done",
  "progress": 100,
  "output_url": "https://smartaihub.app/api/v1/video-projects/exports/download/vexp_abc123",
  "output_bytes": 45678901,
  "duration": 125.5,
  "credits_used": 15
}
```

**Export statuses:** `queued` → `processing` → `done` | `error`

Scope: `video_projects:read`

#### 11.5 Download Export [R3-CRIT-3]

```http
GET /v1/video-projects/exports/download/{exportId}
Authorization: Bearer sk-ssp_...
```

Same authenticated download pattern as Presentation API (Section 10.6). Requires Bearer auth + `video_projects:read` scope. Verifies ownership via `WHERE tenantId = ctx.tenantId AND userId = ctx.userId` before streaming. Return 404 for cross-tenant misses.

### Database Changes

#### New Table: `video_project_exports`

```typescript
export const videoProjectExports = pgTable("video_project_exports", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => `vexp_${crypto.randomUUID()}`),
  projectId: integer("project_id").notNull().references(() => videoEditorProjects.id),
  userId: integer("user_id").notNull().references(() => users.id),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  apiKeyId: varchar("api_key_id", { length: 36 }).references(() => apiKeys.id),
  quality: varchar("quality", { length: 20 }).notNull().default("standard"),
  format: varchar("format", { length: 10 }).notNull().default("mp4"),
  resolution: varchar("resolution", { length: 20 }),
  fps: integer("fps").default(30),
  duration: numeric("duration", { precision: 10, scale: 2 }), // seconds, from project
  status: varchar("status", { length: 20 }).notNull().default("queued"),
  progress: integer("progress").default(0),
  celeryTaskId: varchar("celery_task_id", { length: 64 }),
  outputUrl: text("output_url"),
  outputBytes: integer("output_bytes"),
  creditsReserved: integer("credits_reserved").default(0),
  creditsUsed: integer("credits_used").default(0),
  error: json("error").$type<{ code: string; message: string }>(),
  traceId: varchar("trace_id", { length: 32 }),
  idempotencyKey: varchar("idempotency_key", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => ({
  userIdx: index("idx_vpe_user").on(table.userId),
  tenantIdx: index("idx_vpe_tenant").on(table.tenantId), // [R3-CRIT-2] Required for tenant isolation queries
  projectIdx: index("idx_vpe_project").on(table.projectId),
  statusIdx: index("idx_vpe_status").on(table.status),
  idempotencyIdx: uniqueIndex("idx_vpe_idempotency").on(table.apiKeyId, table.idempotencyKey),
}));
```

### Implementation

**File:** `apps/web/server/routes/publicVideoProjectApi.ts`

Express routes wrapping existing video project + presentation export infrastructure:
- Read project metadata from `videoEditorProjects`
- Calculate duration-based credits
- Pre-deduct credits atomically
- Queue Celery render task (reuse `render_presentation` with video project data)
- Track export in `video_project_exports` table
- Poll via export ID
- **Tenant isolation [R3-01, R3-CRIT-2]:** `videoEditorProjects` has NO `tenantId` column — isolation is via `userId` only (`WHERE userId = ctx.userId`). The `tenantId` for the export record is derived from `AuthContext.tenantId`, not from the source table. **All `video_project_exports` queries MUST include `WHERE tenantId = ctx.tenantId AND userId = ctx.userId`** — the `tenantId` index (`idx_vpe_tenant`) exists specifically for this. Return 404 (not 403) for cross-tenant misses.

### MCP Tools

Add to public MCP tool registry:

| Tool Name | Description | Credit Cost |
|-----------|-------------|-------------|
| `smartspec.video_projects.list` | List user's video projects | 0 |
| `smartspec.video_projects.export` | Export video project to MP4 | Duration-based |
| `smartspec.video_projects.export_status` | Check export status | 0 |

---

## 12. Feature 11: Media Generation API

### Overview

Detailed REST API for generating images, videos, and audio. Provides separate endpoints for each media type with type-specific parameters and credit models.

### Endpoints

#### 12.1 Generate Image

```http
POST /v1/media/images/generate
Authorization: Bearer sk-ssp_...
Idempotency-Key: optional-uuid

{
  "prompt": "A futuristic city at sunset, photorealistic",
  "model": "google-nano-banana-pro",
  "size": "1024x1024",
  "aspect_ratio": "16:9",
  "negative_prompt": "blurry, low quality",
  "num_images": 1,
  "reference_image_urls": ["https://example.com/ref.jpg"]
}
```

Response (sync):
```json
{
  "id": "img_abc123",
  "status": "completed",
  "model": "google-nano-banana-pro",
  "images": [
    {
      "url": "https://smartaihub.app/uploads/generated/img_abc123.png",
      "width": 1024,
      "height": 1024
    }
  ],
  "credits_used": 10,
  "credits_remaining": 990,
  "trace_id": "tr_xyz789"
}
```

**Credit costs (per image):** Model-based pricing from `mediaModels` table. Examples:
- `google-nano-banana-pro`: 10 credits
- `flux-2.0`: 8 credits
- `z-image`: 5 credits
- `grok-imagine`: 12 credits
- `seedream-4-5`: 15 credits

Scope: `media:generate`

#### 12.2 Generate Image (Async)

```http
POST /v1/media/images/generate-async
Authorization: Bearer sk-ssp_...

{ ... same body as sync ... }
```

Response:
```json
{
  "task_id": "task_abc123",
  "status": "pending",
  "estimated_credits": 10
}
```

Poll via `GET /v1/media/tasks/{taskId}`.

Scope: `media:generate`

#### 12.3 Generate Video

```http
POST /v1/media/videos/generate
Authorization: Bearer sk-ssp_...

{
  "prompt": "A robot painting a landscape, cinematic",
  "model": "veo-3-1",
  "duration": 5,
  "aspect_ratio": "16:9",
  "fps": 24,
  "reference_image_urls": ["https://example.com/first-frame.jpg"]
}
```

Response (async — video generation is always async):
```json
{
  "task_id": "task_xyz789",
  "status": "pending",
  "model": "veo-3-1",
  "estimated_credits": 50,
  "estimated_duration_seconds": 120
}
```

**Credit costs (per video):** Model-based pricing. Examples:
- `veo-3-1`: 50 credits
- `sora-2`: 80 credits
- `kling-2.6`: 40 credits
- `seedance-1-0-pro-fast`: 20 credits

Scope: `media:generate`

#### 12.4 Generate Audio (TTS / SFX)

```http
POST /v1/media/audio/generate
Authorization: Bearer sk-ssp_...

{
  "text": "สวัสดีครับ ยินดีต้อนรับสู่ SmartSpecPro",
  "model": "elevenlabs-tts",
  "voice": "rachel",
  "speed": 1.0
}
```

Response (sync for TTS, async for long-form):
```json
{
  "id": "audio_abc123",
  "status": "completed",
  "model": "elevenlabs-tts",
  "audio_url": "https://smartaihub.app/uploads/generated/audio_abc123.mp3",
  "duration_seconds": 4.5,
  "credits_used": 5,
  "trace_id": "tr_xyz789"
}
```

**Credit costs:** Model-based. Examples:
- `elevenlabs-tts`: 5 credits
- `elevenlabs-sfx`: 3 credits
- `uvoice/tts-standard`: 150 credits
- `uvoice/tts-premium`: 300 credits

Scope: `media:generate`

#### 12.5 Get Task Status

```http
GET /v1/media/tasks/{taskId}
Authorization: Bearer sk-ssp_...
```

Response:
```json
{
  "task_id": "task_xyz789",
  "media_type": "video",
  "status": "completed",
  "model": "veo-3-1",
  "result_url": "https://smartaihub.app/uploads/generated/video_xyz789.mp4",
  "credits_used": 50,
  "created_at": "2026-03-14T10:00:00Z",
  "completed_at": "2026-03-14T10:02:15Z"
}
```

**Task statuses:** `pending` → `processing` → `completed` | `failed` | `cancelled`

Scope: `media:read`

#### 12.6 List Available Models

```http
GET /v1/media/models?type=image
Authorization: Bearer sk-ssp_...
```

Response:
```json
{
  "object": "list",
  "data": [
    {
      "id": "google-nano-banana-pro",
      "name": "Google Nano Banana Pro",
      "type": "image",
      "provider": "kie.ai",
      "credit_cost": 10,
      "supported_sizes": ["512x512", "1024x1024"],
      "supported_aspect_ratios": ["1:1", "16:9", "9:16"]
    }
  ]
}
```

Scope: `media:read`

### Implementation

**File:** `apps/web/server/routes/publicMediaApi.ts`

Express routes wrapping `mediaGenerationService`:
- `generateImage()` / `generateImageAsync()` for image generation
- `generateVideoAsync()` for video generation (always async)
- `generateAudio()` for audio generation
- `getTask()` for status polling
- Uses `AuthContext` for auth
- Wraps existing credit deduction flow in `media.ts` router
- All URLs in requests validated via `sanitizeUri()` (try/catch) [R2-04]
- **[R3-CRIT-4] `reference_image_urls` array SSRF validation:** When `reference_image_urls` is present (image/video generation), EVERY URL in the array must pass `sanitizeUri()` + `assertPublicIp()` individually:
  ```typescript
  if (body.reference_image_urls?.length) {
    if (body.reference_image_urls.length > 5) {
      return res.status(400).json({ error: { code: "invalid_request", message: "Max 5 reference images" } });
    }
    for (const url of body.reference_image_urls) {
      try {
        sanitizeUri(url, "web_backend"); // throws on invalid
        await assertPublicIp(new URL(url).hostname); // DNS rebinding guard
      } catch (err) {
        return res.status(400).json({ error: { code: "ssrf_blocked", message: `Invalid reference URL: ${(err as Error).message}` } });
      }
    }
  }
  ```

### MCP Tools (updated)

| Tool Name | Description | Credit Cost |
|-----------|-------------|-------------|
| `smartspec.media.generate_image` | Generate an image | Model-based |
| `smartspec.media.generate_video` | Generate a video | Model-based |
| `smartspec.media.generate_audio` | Generate audio (TTS/SFX) | Model-based |
| `smartspec.media.task_status` | Check task status | 0 |
| `smartspec.media.models` | List available models | 0 |

---

## 13. Credit Integration Matrix

| API Endpoint | Credit Source Type | Estimation | Billing |
|-------------|-------------------|------------|---------|
| `/v1/chat/completions` | `api_chat` | Model-based token estimate | Actual tokens used |
| `/v1/responses` | `api_chat` | Model-based estimate | Actual + web_search cost |
| `/v1/skills/:id/execute` | `api_skill` | Skill credit_multiplier × model cost | Actual tokens |
| `/v1/agencies/:id/invoke` | `api_agency` | `max_credits` pre-reserve | Actual across agents |
| `/v1/jobs` (all types) | `api_job` | Type-dependent estimate | Actual on completion |
| `/v1/media/images/generate` | `api_media` | Model fixed price | Model price |
| `/v1/media/videos/generate` | `api_media` | Model fixed price | Model price |
| `/v1/media/audio/generate` | `api_media` | Model fixed price | Model price |
| `/v1/presentations/generate` | `api_presentation` | Per-image estimate | Actual per-image |
| `/v1/presentations/:id/export` | `api_presentation` | Format-based | Format + duration |
| `/v1/video-projects/:id/export` | `api_video_export` | Duration × quality | Duration × quality |
| `/v1/mcp/tools/call` | `api_mcp` | Tool-specific | Tool-specific |

### New `creditSourceType` Enum Values (8) [R2-06]

**Note:** The credit matrix above uses 8 distinct `creditSourceType` values (not 6 as in v1.1.0). All 8 must be added to the PostgreSQL enum:

- `api_chat` — LLM chat/responses
- `api_skill` — Skill execution
- `api_agency` — Agency invocation
- `api_job` — Job automation (all sub-types)
- `api_mcp` — MCP tool calls
- `api_media` — Image/video/audio generation
- `api_presentation` — Presentation generation + export
- `api_video_export` — Video project export

### PostgreSQL Enum Migration [C-06]

`creditSourceTypeEnum` is a **real PostgreSQL enum** — `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block. Drizzle-kit does not handle this automatically. **Explicit raw SQL migration required:**

```sql
-- Must be run OUTSIDE a transaction block
-- File: drizzle/0071_api_credit_source_types.sql
-- [R2-06] 8 values (not 6) — aligned with credit matrix above

ALTER TYPE credit_source_type ADD VALUE IF NOT EXISTS 'api_chat';
ALTER TYPE credit_source_type ADD VALUE IF NOT EXISTS 'api_skill';
ALTER TYPE credit_source_type ADD VALUE IF NOT EXISTS 'api_agency';
ALTER TYPE credit_source_type ADD VALUE IF NOT EXISTS 'api_job';
ALTER TYPE credit_source_type ADD VALUE IF NOT EXISTS 'api_mcp';
ALTER TYPE credit_source_type ADD VALUE IF NOT EXISTS 'api_media';
ALTER TYPE credit_source_type ADD VALUE IF NOT EXISTS 'api_presentation';
ALTER TYPE credit_source_type ADD VALUE IF NOT EXISTS 'api_video_export';
```

This migration file must be applied manually via `psql` (not through `drizzle-kit migrate`) because `ALTER TYPE ... ADD VALUE` cannot be inside a transaction.

---

## 14. Database Schema Changes

### New Tables (4)

1. `api_keys` — API key management (Section 2)
2. `automation_jobs` — Job automation queue (Section 5)
3. `api_webhook_endpoints` — Webhook callback URLs (Section 8)
4. `video_project_exports` — Video project export tracking (Section 11)

### Columns Added to Existing Tables (8) [R2-02, R3-ARCH-1]

1. `providerUsageLog.apiKeyId` — VARCHAR(36) nullable, track which API key made the request
2. `apiAuditEvents.apiKeyId` — VARCHAR(36) nullable, track API key in audit events
3. `conversations.source` — VARCHAR(20) DEFAULT 'web', distinguishes API vs UI conversations [R2-02]
4. `conversations.apiKeyId` — VARCHAR(36) nullable FK to `api_keys(id)` ON DELETE SET NULL [R2-02, R3-ARCH-8]
5. `conversations.expiresAt` — TIMESTAMPTZ nullable, auto-cleanup for API conversations [R2-02]
6. `agencyConversations.source` — VARCHAR(20) DEFAULT 'web' [R3-ARCH-1] — **corrected from `conversations`**
7. `agencyConversations.apiKeyId` — VARCHAR(36) nullable FK to `api_keys(id)` ON DELETE SET NULL [R3-ARCH-1]
8. `agencyConversations.expiresAt` — TIMESTAMPTZ nullable, auto-cleanup [R3-ARCH-1]

**[R3-ARCH-1] Table split:** Columns 3-5 serve chat/skill API conversations. Columns 6-8 serve agency API conversations. Both tables need the same columns because the API creates conversations in both tables depending on the endpoint.

### Sentinel Provider Row [C-08, R2-03]

Insert "API Gateway" sentinel row in `llmProviders` for non-LLM API call tracking:
```sql
-- [R2-03] llmProviders.id is SERIAL (integer), not UUID. Column is "provider_type", not "type".
INSERT INTO llm_providers (name, slug, provider_type, is_active)
VALUES ('API Gateway', 'api-gateway', 'internal', true)
ON CONFLICT (slug) DO NOTHING;
```

### New Enum Values

- `creditSourceType`: **8** new values via `ALTER TYPE` (see Section 13) [C-06, R2-06]
- `AuthResult.mode`: add `"api_key"` option [H-01]

### Feature Flag [M-01]

Add to `TenantFeatureFlags` — **3 locations must be updated** in `shared/featureFlags.ts`:

1. `TenantFeatureFlags` interface: add `publicApi?: boolean`
2. `ALLOWED_FEATURE_FLAGS` Set: add `"publicApi"`
3. `FEATURE_FLAG_DEFAULTS` map: add `publicApi: false`

```typescript
publicApi: boolean; // F043 — Public API & External Agent Gateway
```

Default: `false` (opt-in per tenant)

**[R2-14] Feature flag drain mode:** When `publicApi` is toggled from `true` → `false`, existing in-flight requests should complete but new requests should be rejected. Implementation: check flag at request entry, not mid-execution.

### TypeScript Type Updates [L-06, R3-CRIT-1] ⚠️ Phase 1 Blocker

**CRITICAL [R3-CRIT-1]:** This is a **Phase 1 blocker**, not a low-priority afterthought. If the TypeScript `CreditSourceType` union and `VALID_SOURCE_TYPES` set are not updated BEFORE any API endpoint code is written, all `api_*` credit deductions will fail at runtime with a type error or be silently rejected by validation.

**Files to update (3):**
1. `apps/web/server/services/creditService.ts` — `CreditSourceType` union type: add the 8 new `api_*` values
2. `apps/web/server/services/creditService.ts` — `VALID_SOURCE_TYPES` set: add the 8 new values
3. `apps/web/shared/featureFlags.ts` — if `CreditSourceType` is re-exported here

**Must be done in the same migration commit as the PostgreSQL `ALTER TYPE` (Section 13).**

---

## 15. Security Requirements

### 15.1 Authentication & Authorization [C-01, C-02, C-05]

- **API keys are secrets** — HMAC-SHA256 hashed at rest using server pepper (`API_KEY_HMAC_SECRET` env var), shown only once at creation [C-01]
- **Timing-safe verification** — All hash comparisons use `crypto.timingSafeEqual()` + constant-time delay on failure [C-02]
- **Scope enforcement** — Every endpoint checks required scope against key's granted scopes
- **Scope ceiling** — API-created keys can only have scopes ⊆ creator's scopes [C-05]
- **Tenant isolation** — API key resolves to a specific tenant. All queries are tenant-scoped
- **No cross-tenant access** — API key for tenant A cannot access tenant B's resources. All resource queries include `WHERE tenantId = ctx.tenantId`. Return 404 (not 403) for cross-tenant misses. [H-08]
- **Key rotation** — Create new key → keep old key active 24h → revoke after confirming zero traffic [L-04]
- **Expiry enforcement** — Expired keys rejected immediately, no grace period
- **Generic auth errors** — All auth failure states return `invalid_api_key`, not distinct codes [M-04]
- **Static token guard** — `ENV.mcpServerToken` and `ENV.webGatewayToken` must not start with `sk-ssp_` (startup assertion) [M-03]
- **HMAC secret validation** — `API_KEY_HMAC_SECRET` must be present and ≥ 32 bytes at startup; server refuses to start without it [R3-MED-1]
- **Signed download URLs** — Export download endpoints (`/v1/presentations/exports/download/`, `/v1/video-projects/exports/download/`) require Bearer auth + ownership verification. No unauthenticated download URLs. [R3-CRIT-3]
- **Separate SSE scope** — `events:read` scope for SSE event stream, separate from `webhooks:manage` [R3-HIGH-7]

### 15.2 Rate Limiting

- **Per-key RPM** — Redis sliding window, configurable per key (default 60)
- **Per-tenant global** — 600 RPM across all keys for a tenant
- **Burst allowance** — 2x RPM for 10 seconds max
- **429 response** — includes `Retry-After` header
- **Separate from UI rate limits** — API limits are independent of web UI limits

### 15.3 Credit Protection [H-06, H-07, R2-01]

- **Pre-reservation with optimistic concurrency** — `UPDATE users SET credits = credits - :amount WHERE id = :userId AND credits >= :amount` prevents TOCTOU race [H-06, R2-01]. There is NO `credit_balances` table — credits are stored as `users.credits` integer column.
- **Insufficient balance** — Returns `402 Payment Required` with current balance
- **Daily limits per key** — Atomic Redis Lua script (check + increment) prevents concurrent bypass [H-07]
- **Batch pre-reservation** — `batch_skill` reserves full cost (items × estimated per-item cost) before queuing [M-09]
- **Atomic refund transactions** — Credit refund (on job failure/cancellation) MUST be wrapped in a DB transaction with the `credit_transactions` insert to prevent orphaned records [R3-HIGH-3]
- **Credit overflow guard** — Reject jobs with estimated cost > 10,000 credits before attempting deduction [R3-MED-3]

### 15.4 Input Validation [C-03, C-04]

- **Request body size** — Max 2MB (configurable via `MAX_API_BODY_BYTES`)
- **JSON Schema validation** — Skill inputs validated against skill's input schema
- **Pipeline template injection** — Substitution restricted to allowlisted fields, 8KB cap, no system prompt injection [C-03]
- **Pipeline DAG validation** — Max 10 steps, cycle detection, 1MB result cap per step [H-13]
- **SSRF prevention** — ALL URLs validated via `sanitizeUri()`: callback URLs, MCP tool URL args, webhook endpoints. Blocks localhost, internal IPs, cloud metadata endpoints. HTTPS only. [C-04]
- **Prompt injection** — Skill inputs pass through existing persona sanitization. Substituted values placed in HumanMessage, never system prompt [C-03]
- **UserAgent sanitization** — Truncated to 256 chars, non-printable ASCII stripped before storage [M-08]
- **Batch limits** — `batch_skill` max 100 items per request, validated via Zod schema [M-09, R3-HIGH-2]
- **Reference image URL validation** — `reference_image_urls` array: max 5 URLs, each must pass `sanitizeUri()` + `assertPublicIp()` [R3-CRIT-4]
- **Presentation topic length** — Bounded to 3-1000 chars via Zod schema [R3-MED-6]
- **Job type enum validation** — Only accept values from `VALID_JOB_TYPES` set [R3-LOW-1]
- **Credit overflow guard** — Cap single job estimated credits at `MAX_SINGLE_JOB_CREDITS` (10,000) [R3-MED-3]

### 15.5 Audit & Monitoring

- **Every API call logged** — `apiAuditEvents` with apiKeyId, endpoint, status, latency, credits
- **JSONL audit** — Existing audit infrastructure extended for API calls
- **Key usage dashboard** — Admin can see per-key usage, top endpoints, cost breakdown [M-11]
- **Per-tenant API usage dashboard** — Aggregate API metrics per tenant [M-11]
- **Anomaly detection** — Alert when key usage spikes >10x normal (future enhancement)
- **Callback payload sanitization** — Webhook callbacks MUST NOT include raw `params` from job requests (may contain secrets) [R3-HIGH-1]

### 15.6 MCP Security [C-04, M-05]

- **Session state machine** — `initialize` required before `tools/call`; session tracked via `Mcp-Session-Id` header [M-05]
- **SSRF firewall** — `sanitizeUri()` called on ALL tool args containing URLs before dispatch [C-04]
- **No `allow-same-origin`** — MCP responses never include executable code
- **Tool result sanitization** — All tool outputs pass through `sanitizeHtml`
- **Resource limits** — Max 100KB per tool result, max 60s execution timeout
- **No eval/exec** — Tool results are data only, never code execution

### 15.7 Webhook Security [H-05]

- **HMAC-SHA256 signatures** — All callback deliveries signed with webhook secret
- **HTTPS only** — Callback URLs must use HTTPS (except localhost for development)
- **Secret storage** — Webhook secrets encrypted with AES-256-GCM via `crypto.ts`
- **Secret rotation** — `PATCH /v1/webhooks/:id` with 5-minute dual-secret grace period [H-05]
- **Replay protection** — Include timestamp in signature, reject if >5min old
- **Delivery retry** — 3 attempts with exponential backoff, then mark as failed
- **Auto-disable** — After 100 consecutive delivery failures, webhook is deactivated [L-08]

### 15.8 SSE Security [M-06]

- **Max connection duration** — 24 hours, then server closes with `retry:` field for reconnect
- **Heartbeat** — `ping` event every 30 seconds to detect dead connections
- **Per-key connection limit** — Max 10 concurrent SSE connections per API key
- **Reconnection support** — `Last-Event-ID` header for resuming from last event [L-09]

---

## 16. API Versioning & Lifecycle [H-09]

### URL-Based Versioning

All public API endpoints use URL-based versioning: `/v1/`, `/v2/`, etc.

### Deprecation Policy

- **Sunset header** — When a version is deprecated, all responses include `Sunset: <date>` header
- **Minimum support period** — Each API version is supported for at least **6 months** after the next version is released
- **Deprecation timeline:**
  1. New version released → old version gets `Sunset` header
  2. +3 months → old version returns `X-Deprecation-Warning` header
  3. +6 months → old version returns `410 Gone`

### Breaking Change Policy

Breaking changes (removing fields, changing behavior, removing endpoints) are only introduced in new major versions. Non-breaking additions (new optional fields, new endpoints) can be added to existing versions.

---

## 17. Migration & Rollout Strategy

### Phase 1: Foundation (Week 1-2) [R3-ARCH-11: numbering corrected]

1. **Database migration** — Create `api_keys`, `automation_jobs`, `api_webhook_endpoints`, `video_project_exports` tables
2. **Conversations migration** — Add `source`, `api_key_id`, `expires_at` columns to BOTH `conversations` AND `agencyConversations` tables [R2-02, R3-ARCH-1]
3. **Enum migration** — `ALTER TYPE credit_source_type ADD VALUE` for 8 new values [C-06, R2-06]
4. **TypeScript type updates** — `CreditSourceType` union + `VALID_SOURCE_TYPES` set: add 8 new `api_*` values [R3-CRIT-1] ⚠️ **BLOCKER** — must be in same commit as enum migration
5. **Sentinel provider** — Insert "API Gateway" row in `llmProviders` [C-08]
6. **API Key Service** — Key generation, HMAC-SHA256 hashing, validation, CRUD [C-01]
7. **Auth extension** — Extend `authorizeRequest()` for API key mode with timing-safe comparison [C-02]
8. **Auth guard extraction** — Extract `guardWithCredits()` to shared module [H-04]
9. **AuthContext refactor** — Refactor `executeSkill()`, `agencyBridge.executeRun()`, `autoGenerateDraft()`, `triggerPresentationExport()`, `generateImage/Video/Audio()` to accept `AuthContext` [C-07, R3-ARCH-5]
10. **Feature flag** — `publicApi` flag (default off) with 3-location update in `apps/web/shared/featureFlags.ts` [M-01, R3-ARCH-20]
11. **Admin UI** — API key management page with usage dashboard [M-11]
12. **Health check** — `GET /v1/health` [H-12]
13. **CORS middleware** — Dedicated CORS for `/v1/*` routes [H-03]

### Phase 2: Core API (Week 3-4)

14. **LLM endpoints** — Extend existing `/v1/chat/completions`, `/v1/responses`, `/v1/models` for API key auth
15. **Skill API** — New `/v1/skills` routes with pagination [H-11]
16. **Agency API** — New `/v1/agencies` routes with auto-create `agencyConversations` [C-09, R3-ARCH-1]
17. **Media Generation API** — New `/v1/media/images`, `/v1/media/videos`, `/v1/media/audio` routes (Feature 11)
18. **Presentation API** — New `/v1/presentations/generate`, `/v1/presentations/:id/export` routes with authenticated download [R3-CRIT-3] (Feature 09)
19. **Video Project API** — New `/v1/video-projects/:id/export` with duration-based credits and authenticated download [R3-CRIT-3] (Feature 10)
20. **Credit tracking** — Optimistic concurrency [H-06, R2-01], atomic daily limits [H-07], atomic refund transactions [R3-HIGH-3]
21. **Idempotency** — `Idempotency-Key` header support [H-10]

### Phase 3: MCP & Jobs (Week 5-6)

22. **Public MCP Server** — `/v1/mcp` with Streamable HTTP transport (on distinct path from existing internal MCP routes)
23. **MCP session state** — Redis-backed `Mcp-Session-Id` tracking + `initialize` requirement [M-05, R2-12]
24. **MCP SSRF firewall** — `sanitizeUri()` (try/catch [R2-04]) + DNS rebinding guard on ALL records [R2-05, R3-LOW-3] on all URL tool args [C-04]
25. **MCP tool registry** — Register all 25+ SmartSpec tools (skills, agencies, media, presentations, video projects, browser, files, drive, LLM) [R3-ARCH-7]
26. **Job Automation API** — `/v1/jobs` with task queue processing [CV-5]
27. **Job worker registration** — Register job worker in `server/_core/index.ts` after queue init [R2-11, CV-5]
28. **Pipeline jobs** — Multi-step chains with restricted substitution [C-03] + DAG validation [H-13]
29. **Callback webhooks** — Webhook delivery for job events with payload sanitization [R3-HIGH-1]
30. **Job cleanup scheduler** — Cron for expired job cleanup [M-13]

### Phase 4: SDK & Polish (Week 7-8)

31. **Webhook secret rotation** — `PATCH /v1/webhooks/:id` [H-05]
32. **SSE event stream** — With `events:read` scope [R3-HIGH-7], connection limits, heartbeat, Last-Event-ID [M-06, L-09]
33. **Webhook auto-disable** — After 100 consecutive failures [L-08]
34. **OpenAPI spec** — Auto-generated from route definitions
35. **API docs** — Swagger UI at `/v1/docs` [L-03]
36. **MCP manifest** — `/.well-known/mcp.json` [L-03]
37. **Python SDK** — `smartspecpro` package with Presentation/Video/Media examples [L-01, R3-ARCH-18]
38. **TypeScript SDK** — `@smartspec/sdk` package with Presentation/Video/Media examples [L-01, R3-ARCH-18]
39. **Integration guides** — OpenClaw + Manus AI setup docs

### Phase 5: Security Audit (Week 9)

40. **Security review** — Full audit of all public endpoints
41. **Penetration testing** — OWASP top 10 against API
42. **Rate limit tuning** — Adjust defaults based on load testing
43. **Monitoring dashboards** — Grafana/admin metrics for API usage

### Rollout Controls

- **Feature flag gated** — `publicApi` must be enabled per tenant
- **Admin-only key creation** — Only admin/domain_admin can create API keys
- **Gradual rollout** — Enable for internal tenants first, then selected partners
- **Kill switch** — Disable `publicApi` flag to immediately block all API key access

---

## Appendix A: API Endpoint Summary

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/v1/health` | (public) | Health check [H-12] |
| `GET` | `/v1/models` | `llm:models` | List available LLM models |
| `POST` | `/v1/chat/completions` | `llm:chat` | Chat completion (OpenAI-compatible) |
| `POST` | `/v1/responses` | `llm:chat` | Responses API (OpenAI-compatible) |
| `GET` | `/v1/skills` | `skills:list` | List skills |
| `GET` | `/v1/skills/:id` | `skills:list` | Get skill details |
| `POST` | `/v1/skills/:id/execute` | `skills:execute` | Execute a skill |
| `GET` | `/v1/agencies` | `agencies:list` | List agencies |
| `POST` | `/v1/agencies/:id/invoke` | `agencies:invoke` | Invoke an agency |
| `POST` | `/v1/jobs` | `jobs:create` | Create a job |
| `GET` | `/v1/jobs` | `jobs:read` | List jobs |
| `GET` | `/v1/jobs/:id` | `jobs:read` | Get job status |
| `DELETE` | `/v1/jobs/:id` | `jobs:cancel` | Cancel a job [L-02] |
| `POST` | `/v1/media/images/generate` | `media:generate` | Generate image (sync) |
| `POST` | `/v1/media/images/generate-async` | `media:generate` | Generate image (async) |
| `POST` | `/v1/media/videos/generate` | `media:generate` | Generate video (async) |
| `POST` | `/v1/media/audio/generate` | `media:generate` | Generate audio |
| `GET` | `/v1/media/tasks/:id` | `media:read` | Get media task status |
| `GET` | `/v1/media/models` | `media:read` | List available models |
| `POST` | `/v1/presentations/generate` | `presentations:generate` | Generate AI presentation |
| `GET` | `/v1/presentations/tasks/:taskId/progress` | `presentations:read` | Poll generation progress [R3-ARCH-17] |
| `GET` | `/v1/presentations/decks/:deckId` | `presentations:read` | Get presentation metadata [R3-ARCH-17] |
| `POST` | `/v1/presentations/decks/:deckId/export` | `presentations:generate` | Export presentation [R3-ARCH-17] |
| `GET` | `/v1/presentations/exports/:id` | `presentations:read` | Poll export progress |
| `GET` | `/v1/presentations/exports/download/:id` | `presentations:read` | Download export file [R3-CRIT-3] |
| `GET` | `/v1/video-projects` | `video_projects:read` | List video projects |
| `GET` | `/v1/video-projects/:id` | `video_projects:read` | Get video project metadata |
| `POST` | `/v1/video-projects/:id/export` | `video_projects:export` | Export video project |
| `GET` | `/v1/video-projects/exports/:id` | `video_projects:read` | Poll export status |
| `GET` | `/v1/video-projects/exports/download/:id` | `video_projects:read` | Download export file [R3-CRIT-3] |
| `POST` | `/v1/mcp` | `mcp:tools` | MCP JSON-RPC endpoint |
| `POST` | `/v1/files` | `files:write` | Upload a file |
| `GET` | `/v1/files/:id` | `files:read` | Read a file |
| `POST` | `/v1/webhooks` | `webhooks:manage` | Create webhook endpoint |
| `GET` | `/v1/webhooks` | `webhooks:manage` | List webhook endpoints |
| `PATCH` | `/v1/webhooks/:id` | `webhooks:manage` | Update/rotate webhook [H-05] |
| `DELETE` | `/v1/webhooks/:id` | `webhooks:manage` | Delete webhook endpoint |
| `GET` | `/v1/events` | `events:read` | SSE event stream [R3-HIGH-7] |
| `POST` | `/v1/api-keys` | `admin:keys` | Create API key |
| `GET` | `/v1/api-keys` | `admin:keys` | List API keys |
| `DELETE` | `/v1/api-keys/:id` | `admin:keys` | Revoke API key |
| `GET` | `/v1/api-keys/:id` | `admin:keys` | Get key metadata + usage stats [R3-ARCH-15] |
| `GET` | `/v1/openapi.json` | (public) | OpenAPI specification |
| `GET` | `/v1/docs` | (public) | Swagger UI documentation [L-03] |
| `GET` | `/.well-known/mcp.json` | (public) | MCP server manifest (root path, not versioned) [R3-ARCH-23] |

## Appendix B: Error Codes

| HTTP Status | Error Code | Description |
|------------|------------|-------------|
| 400 | `invalid_request` | Malformed request body or params |
| 401 | `invalid_api_key` | Invalid, expired, or revoked API key [M-04] |
| 402 | `insufficient_credits` | Not enough credits for this operation |
| 403 | `insufficient_scope` | API key doesn't have required scope |
| 403 | `scope_escalation` | Cannot grant scopes not held by creating key [C-05] |
| 403 | `feature_disabled` | Feature flag not enabled for this tenant |
| 404 | `not_found` | Resource not found (also returned for cross-tenant access) [H-08] |
| 409 | `job_already_cancelled` | Job was already cancelled |
| 422 | `validation_error` | Input validation failed |
| 429 | `rate_limit_exceeded` | Rate limit exceeded (check `Retry-After` header) |
| 429 | `daily_credit_limit` | Daily credit limit for this key exceeded |
| 500 | `internal_error` | Internal server error |
| 502 | `upstream_error` | LLM provider or external service error |
| 503 | `service_unavailable` | Service temporarily unavailable |

**Note [M-04]:** Auth failures intentionally return a generic `invalid_api_key` 401 for all states (invalid, expired, revoked) to prevent information oracle. The distinction between `expired_api_key` and `revoked_api_key` from v1.0.0 has been removed.

## Appendix C: OpenClaw → SmartSpecPro Mapping

| OpenClaw Capability | SmartSpecPro API | Notes |
|--------------------|--------------------|-------|
| Text generation | `/v1/chat/completions` | OpenAI-compatible, drop-in |
| Web search | `/v1/responses` (with `web_search` tool) | GPT-5.x Responses API |
| Tool calling | `/v1/mcp` → `smartspec.skills.execute` | MCP protocol |
| Browser automation | `/v1/mcp` → `smartspec.browser.execute` | Sandboxed Playwright |
| Image generation | `/v1/media/images/generate` or MCP `smartspec.media.generate_image` | Multi-provider |
| Video generation | `/v1/media/videos/generate` or MCP `smartspec.media.generate_video` | Multi-provider |
| Audio generation | `/v1/media/audio/generate` or MCP `smartspec.media.generate_audio` | TTS + SFX |
| Presentation gen | `/v1/presentations/generate` or MCP `smartspec.presentations.generate` | AI slides |
| Video export | `/v1/video-projects/:id/export` or MCP `smartspec.video_projects.export` | Duration-based credits |
| File operations | `/v1/files` or `/v1/mcp` → `smartspec.files.*` | Workspace files |
| Multi-agent | `/v1/agencies/:id/invoke` | Agency orchestration |

## Appendix D: Manus AI → SmartSpecPro MCP Flow

```
Manus AI
  │
  ├─ 1. GET /.well-known/mcp.json → discovers SmartSpecPro
  ├─ 2. POST /v1/mcp { method: "initialize" } → capabilities + Mcp-Session-Id header [M-05]
  ├─ 3. POST /v1/mcp { method: "tools/list" } → 25+ tools (with Mcp-Session-Id) [R3-ARCH-7]
  ├─ 4. User says: "Research AI trends and create an infographic"
  ├─ 5. Manus plans: use smartspec.skills.execute + smartspec.media.generate_image
  ├─ 6. POST /v1/mcp { method: "tools/call", params: { name: "smartspec.skills.execute", ... } }
  │     → SmartSpecPro runs skill → returns research output
  ├─ 7. POST /v1/mcp { method: "tools/call", params: { name: "smartspec.media.generate_image", ... } }
  │     → SmartSpecPro generates infographic → returns download URL [R3-ARCH-6]
  └─ 8. Manus returns combined result to user
```

## Appendix E: Review Finding Cross-Reference

All 44 review findings from `review-findings.md` have been incorporated into this spec (v1.1.0):

| Finding | Severity | Section(s) Updated |
|---------|----------|-------------------|
| C-01: HMAC-SHA256 key hash | CRITICAL | 2, 2.1, 12.1 |
| C-02: Timing attack fix | CRITICAL | 2.2, 12.1 |
| C-03: Pipeline template injection | CRITICAL | 5.5, 12.4 |
| C-04: MCP SSRF firewall | CRITICAL | 4.6, 5.7, 8.1, 12.4, 12.6 |
| C-05: Scope ceiling rule | CRITICAL | 2 (Scopes), 2.1, 12.1 |
| C-06: ALTER TYPE migration | CRITICAL | 10, 14 |
| C-07: AuthContext refactor | CRITICAL | 1 (Integration Gap), 4.7, 5.6, 6, 7 |
| C-08: providerUsageLog sentinel | CRITICAL | 5.6, 11 |
| C-09: Auto-create conversation | CRITICAL | 5.6, 7.2, 7 |
| H-01: AuthResult union | HIGH | 2.2 |
| H-02: parseInt NaN fix | HIGH | 2.2 |
| H-03: CORS for /v1/ | HIGH | 3 |
| H-04: guardWithCredits extraction | HIGH | 3 |
| H-05: Webhook secret rotation | HIGH | 8.1, 8 (DB), 12.7 |
| H-06: Credit TOCTOU | HIGH | 5.6, 12.3 |
| H-07: Atomic daily limit | HIGH | 2.4, 12.3 |
| H-08: Cross-tenant IDOR | HIGH | 5.2, 7, 12.1 |
| H-09: API versioning | HIGH | 13 (new section) |
| H-10: Idempotency key | HIGH | 3, 5 (DB) |
| H-11: Pagination | HIGH | 3.5, 5.4, 6.1, 7.1 |
| H-12: Health check | HIGH | 3 |
| H-13: Pipeline DAG validation | HIGH | 5.5, 12.4 |
| M-01: featureFlags 3 locations | MEDIUM | 11 |
| M-02: CSRF note | MEDIUM | 3 (CORS) |
| M-03: sk-ssp_ guard | MEDIUM | 2.2, 12.1 |
| M-04: Generic auth error | MEDIUM | 2.2, 3, Appendix B |
| M-05: MCP session state | MEDIUM | 4.1, 12.6 |
| M-06: SSE connection limits | MEDIUM | 8.3, 12.8 |
| M-07: Step output size cap | MEDIUM | 5.5, 5 (DB) |
| M-08: userAgent truncation | MEDIUM | 3.4, 12.4 |
| M-09: batch_skill item cap | MEDIUM | 5.1, 5.6, 12.3 |
| M-10: IP allowlist | MEDIUM | 2 (DB), 2.2 |
| M-11: Usage dashboard | MEDIUM | 2.5, 12.5 |
| M-12: resources/list | MEDIUM | 4.2, 9.3 |
| M-13: Job cleanup scheduler | MEDIUM | 5 (DB section) |
| L-01: SDK env vars | LOW | 9.4, 9.5 |
| L-02: jobs:cancel scope | LOW | 2 (Scopes), 5.3, Appendix A |
| L-03: Intentionally unauthenticated | LOW | 9.2, 9.3 |
| L-04: Key rotation guidance | LOW | 12.1 |
| L-05: MCP routes coexistence | LOW | 14 (noted in Phase 3) |
| L-06: TypeScript type updates | LOW | 11 |
| L-07: Name UNIQUE per tenant | LOW | 2 (DB) |
| L-08: Webhook auto-disable | LOW | 8.1, 12.7 |
| L-09: Last-Event-ID | LOW | 8.3, 12.8 |

## Appendix F: Round 2 Finding Cross-Reference (v1.2.0)

28 findings from Round 2 review + 3 new features added. All incorporated into this spec (v1.2.0):

| Finding | Severity | Description | Section(s) Updated |
|---------|----------|-------------|-------------------|
| R2-01 | CRITICAL | Credit system uses `users.credits` not `credit_balances` | 5.6, 13, 15.3 |
| R2-02 | CRITICAL | `conversations` table missing `source`, `apiKeyId`, `expiresAt` columns | 5.6, 14 |
| R2-03 | CRITICAL | `llmProviders.id` is serial integer not UUID; column is `provider_type` not `type` | 5.6, 14 |
| R2-04 | CRITICAL | `sanitizeUri()` throws on invalid input, does not return `{ok, error}` | 4.6, 4.7 |
| R2-05 | CRITICAL | `sanitizeUri()` does NOT do DNS resolution — need separate guard | 4.6, 15.4 |
| R2-06 | HIGH | Credit type mismatch: matrix has 8 types but enum only declared 6 | 13 |
| R2-07 | HIGH | `constantTimeDelay()` function not defined anywhere | 2.2 |
| R2-08 | HIGH | Missing `executeSkill()` callers: `tasks.ts:201`, `scheduler.ts:133` | 1 (Integration Gap) |
| R2-09 | HIGH | Missing `agencyBridge.executeRun()` callers: webhookTriggers, webhookDispatchQueue, channelGateway | 1 (Integration Gap) |
| R2-10 | HIGH | `RunParams` interface needs `authContext` field replacement | 1 (Integration Gap) |
| R2-11 | HIGH | Job worker must be registered in `server/_core/index.ts` after BullMQ init | 17 (Phase 3) |
| R2-12 | MEDIUM | MCP sessions should use Redis, not in-memory Map (lost on restart) | 4.1 |
| R2-13 | MEDIUM | IP allowlist should support CIDR ranges (e.g., `10.0.0.0/24`) | 2.2 |
| R2-14 | MEDIUM | Feature flag drain mode: in-flight requests complete when toggled off | 14 |
| R2-15 | MEDIUM | `admin:keys` must be forbidden for API-created keys | 2 (Scope Ceiling) |
| R2-16 | NEW FEATURE | Feature 09: Presentation API — AI auto-generate + progress polling + export | 10 |
| R2-17 | NEW FEATURE | Feature 10: Video Project API — export with duration-based credits | 11 |
| R2-18 | NEW FEATURE | Feature 11: Media Generation API — detailed image/video/audio endpoints | 12 |

## Appendix G: Round 3 Finding Cross-Reference (v1.3.0)

22 security findings + 5 codebase mismatches from Round 3 review. All incorporated into this spec (v1.3.0):

### Security Findings

| Finding | Severity | Description | Section(s) Updated |
|---------|----------|-------------|-------------------|
| R3-CRIT-1 | CRITICAL | `CreditSourceType` union + `VALID_SOURCE_TYPES` missing 8 new values — must be Phase 1 blocker | 14, 17 (Phase 1) |
| R3-CRIT-2 | CRITICAL | `video_project_exports` missing `tenantId` index + `WHERE tenantId` clause | 11 (DB), 11 (Implementation) |
| R3-CRIT-3 | CRITICAL | Export download URLs unauthenticated — need Bearer auth + ownership check | 10.6, 11.5, 15.1, Appendix A |
| R3-CRIT-4 | CRITICAL | `reference_image_urls` array SSRF — each URL must pass `sanitizeUri()` + `assertPublicIp()` in loop | 12 (Implementation), 15.4 |
| R3-HIGH-1 | HIGH | Job callback payload leaks raw `params` (may contain secrets) — strip from callbacks | 5.7 |
| R3-HIGH-2 | HIGH | `batch_skill` job type has no Zod schema validation at API boundary | 5.1 (new subsection) |
| R3-HIGH-3 | HIGH | Credit refund not wrapped in DB transaction — orphaned records possible | 5.6, 15.3 |
| R3-HIGH-4 | HIGH | Auto-created conversation title leaks `agencyId` — use generic title | 5.6 |
| R3-HIGH-5 | HIGH | Presentation export IDOR — deck ownership not verified via `libraryItems` FK | 10 (Implementation) |
| R3-HIGH-6 | HIGH | Video project access via export endpoint bypasses `userId` ownership check | 11 (Implementation) — already addressed by R3-CRIT-2 |
| R3-HIGH-7 | HIGH | SSE `/v1/events` uses `webhooks:manage` scope — too broad; needs separate `events:read` | 2 (Scopes), 8.3, 15.1, Appendix A |
| R3-MED-1 | MEDIUM | No startup assertion for `API_KEY_HMAC_SECRET` — server starts without it and crashes on first API key auth | 2.2 |
| R3-MED-2 | MEDIUM | `automation_jobs.apiKeyId` nullable — index should be partial (`WHERE api_key_id IS NOT NULL`) | 5 (DB) |
| R3-MED-3 | MEDIUM | Integer overflow on credit pre-reservation — cap at `MAX_SINGLE_JOB_CREDITS` (10,000) | 5.6, 15.3, 15.4 |
| R3-MED-4 | MEDIUM | Webhook callback delivery must verify target endpoint belongs to same tenant as job | 5.7 |
| R3-MED-5 | MEDIUM | CORS `origin: "*"` security caveat — document that API keys are server-to-server only | 3 (CORS) |
| R3-MED-6 | MEDIUM | Presentation `topic` field unbounded — add Zod validation `.min(3).max(1000)` | 10.1, 15.4 |
| R3-MED-7 | MEDIUM | Media task scope already uses `media:read` — no change needed (confirmed correct) | — |
| R3-LOW-1 | LOW | Job `type` field not validated against enum — add `VALID_JOB_TYPES` check | 5.6 |
| R3-LOW-2 | LOW | Idempotency cache should store `status_code` — failed requests can be retried with new key | 3 (Idempotency) |
| R3-LOW-3 | LOW | `assertPublicIp()` checks only first DNS record — must check ALL A/AAAA records | 4.6 |
| R3-LOW-4 | LOW | Express route ordering — specific paths before parameterized paths | 3 (Base URL) |

### Codebase Verification Mismatches

| Finding | Description | Resolution |
|---------|-------------|------------|
| CV-1 | `videoEditorProjects` has NO `tenantId` column | Already noted in spec (R3-01). Isolation via `userId` only. Export record gets `tenantId` from `AuthContext`. |
| CV-2 | `triggerPresentationExport()` does NOT deduct credits internally | Credit deduction must be added in the API wrapper (`publicPresentationApi.ts`), not in the service. Noted in Section 10 Implementation. |
| CV-3 | `autoGenerateDraft()` EXISTS as tRPC mutation at `presentation.ts:670` | Corrected false negative from codebase verifier. Function is confirmed present. |
| CV-4 | `generateImage/Video/Audio` use `userToken` not `AuthContext` | Expected — the `AuthContext` refactor (C-07) is a prerequisite. Spec already documents this as Phase 1 work. |
| CV-5 | BullMQ comment says "migrated to Cloud Tasks" | Spec updated to use queue-agnostic language ("task queue"). Implementation must verify which queue system is active. See Sections 5, 5.6, 17 (Phase 3). |

### Architecture Review Findings (26)

| Finding | Severity | Description | Section(s) Updated |
|---------|----------|-------------|-------------------|
| R3-ARCH-1 | CRITICAL | Agency invoke uses `agencyConversations` (varchar ID), NOT `conversations` (integer ID) — all auto-create logic and migration columns fixed | 5.6, 14, 17 |
| R3-ARCH-2 | CRITICAL | `agencyConversations` has no `tenantId` — tenant isolation via `userId` + `agencies.tenantId` JOIN | 5.6, 7 |
| R3-ARCH-3 | CRITICAL | `agencyStreamProxy.ts` AuthContext propagation to Python backend not specified | 1 (Integration Gap) — noted, Python bridge needs AuthContext forwarding |
| R3-ARCH-5 | CRITICAL | Presentation API wraps `protectedProcedure` — can't call without session ctx; business logic must be extracted to service functions | 1 (Integration Gap), 10, 17 (Phase 1) |
| R3-ARCH-6 | HIGH | MCP tool `smartspec.media.generate` is stale — replaced with `.generate_image`, `.generate_video`, `.generate_audio` | 4.3, Appendix D |
| R3-ARCH-7 | HIGH | Presentation + video project MCP tools missing from Section 4.3 registry — added 11 new tools (total 25+) | 4.3, Appendix D |
| R3-ARCH-8 | HIGH | `apiKeyId` FK in `automation_jobs`, `video_project_exports`, `api_webhook_endpoints` — added `ON DELETE SET NULL` | 5 (DB), 8 (DB), 11 (DB), 14 |
| R3-ARCH-9 | HIGH | `api_webhook_endpoints` missing `tenantIdx` index | 8 (DB) |
| R3-ARCH-11 | HIGH | Phase numbering duplicates across Phase 3/4 — renumbered 1-43 sequentially | 17 |
| R3-ARCH-13 | HIGH | Webhook `apiKeyId` was NOT NULL — changed to nullable so webhooks survive key rotation | 8 (DB) |
| R3-ARCH-15 | MEDIUM | No `GET /v1/api-keys/:id` endpoint — added to Appendix A | Appendix A |
| R3-ARCH-17 | MEDIUM | Presentation path collision (`/:taskId/progress` vs `/:deckId`) — split into `/tasks/:taskId/progress` and `/decks/:deckId` | 10.2, 10.3, 10.4, Appendix A |
| R3-ARCH-18 | MEDIUM | SDK examples missing Features 09-11 | 17 (Phase 4) — noted as SDK requirement |
| R3-ARCH-20 | MEDIUM | Feature flag file path should use full monorepo path `apps/web/shared/featureFlags.ts` | 17 (Phase 1) |
| R3-ARCH-23 | LOW | `/.well-known/mcp.json` not in Appendix A | Appendix A |

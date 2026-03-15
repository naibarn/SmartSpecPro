# Implementation Plan — 043-PublicAPI-ExternalAgentGateway

## 1. Background & Goals

SmartSpecPro has powerful internal infrastructure — LLM gateway, skills engine, agency builder, media generation — but all of it is accessible only through the web UI or internal service tokens. External AI platforms (Manus AI, OpenClaw, custom agents, Zapier, n8n) cannot programmatically consume these capabilities.

This plan builds a **Public API & External Agent Gateway** that:
1. Manages API keys per tenant with scoped permissions (15 scopes)
2. Exposes a unified REST + SSE gateway for LLM, skills, agencies, media, presentations, and video projects
3. Provides an MCP Server (Model Context Protocol v2025-03-26) for AI agents
4. Offers a Job Automation API for async task orchestration with webhook callbacks
5. Tracks credits, enforces rate limits, and audits all external access

**Scale:** Low initially (<100 API keys, <1K req/day). Infrastructure kept simple.
**Consumers:** All external agent platforms treated equally — no priority ordering.
**Admin UI:** Full key management, usage dashboard, and webhook management included.

## 2. Architecture Overview

### Request Flow

```
External Agent
    │
    ▼
Nginx (:443) → Express (:3000)
    │
    ├─── apiKeyAuthMiddleware (detect sk-ssp_ prefix)
    │       ├── HMAC-SHA256 hash → lookup api_keys table
    │       ├── Validate: active, not expired, publicApi flag
    │       ├── Rate limit check (Redis sliding window)
    │       └── Return AuthContext { userId, tenantId, mode: 'api_key', apiKeyId, scopes }
    │
    ├─── /v1/skills/*         → publicSkillsApi.ts     → skillExecutor
    ├─── /v1/agencies/*       → publicAgencyApi.ts      → agencyBridge
    ├─── /v1/presentations/*  → publicPresentationsApi.ts → presentationService
    ├─── /v1/video-projects/* → publicVideoApi.ts       → videoProjectService
    ├─── /v1/media/*          → publicMediaApi.ts       → mediaGenerationService
    ├─── /v1/mcp              → mcpPublicServer.ts      → tool registry
    ├─── /v1/jobs/*           → publicJobsApi.ts        → jobAutomationService
    ├─── /v1/webhooks/*       → publicWebhooksApi.ts    → webhookService
    ├─── /v1/events           → publicEventsApi.ts      → SSE stream
    ├─── /v1/api-keys/*       → publicApiKeysApi.ts     → apiKeyService (or tRPC)
    │
    └─── Existing endpoints (already work with unified auth):
         ├── /v1/chat/completions  → llmRoutes.ts
         ├── /v1/responses         → responsesRoutes.ts
         └── /v1/models            → llmRoutes.ts
```

### Key Design Decisions

1. **Unified auth layer** — new API keys work on ALL endpoints through a single `authorizeRequest()` extension. No separate namespaces.
2. **HMAC-SHA256 with server pepper** — keys stored as `HMAC(API_KEY_HMAC_SECRET, rawKey)`, not plain SHA-256. This prevents rainbow table attacks even if DB is compromised.
3. **AuthContext struct** — replaces raw `userToken: string` across service functions with a typed context object. This is a cross-cutting refactor that must happen in Phase 1.
4. **Domain-based organization** — implementation is organized by functional domain, not by a linear phase sequence.
5. **Configurable webhook retry** — each webhook endpoint can choose between retry-with-backoff (default) or fire-and-forget.

---

## 3. Domain 1: Database Schema & Foundation

### 3.1 New Tables

**`api_keys`** — Central API key registry
- PK: `id` varchar(36), generated UUID
- `tenantId` FK → tenants.id (varchar(36)) — tenant IDs are UUIDs, NOT integers
- `userId` FK → users.id (integer) — key creator/owner
- `name` varchar(100) — human-readable label
- `keyPrefix` varchar(16) — first 16 chars of key for identification (e.g., `sk-ssp_abc12...`)
- `keyHash` varchar(128) UNIQUE — HMAC-SHA256 hash of full key
- `scopes` json — array of scope strings
- `rateLimit` integer default 60 — requests per minute
- `creditLimit` integer nullable — daily credit cap (null = unlimited)
- `expiresAt` timestamp nullable
- `lastUsedAt` timestamp nullable
- `isActive` boolean default true
- `metadata` json nullable — freeform key metadata
- `createdAt`, `updatedAt` timestamps

Indexes: `keyHash` (unique), `tenantId`, `userId`

**`api_audit_events`** — Audit trail for all API calls
- PK: `id` bigserial
- `tenantId` varchar(36), `userId` integer, `apiKeyId` varchar(36)
- `traceId` varchar(36) — correlation ID
- `method` varchar(10), `path` varchar(255)
- `statusCode` integer
- `creditsUsed` integer
- `latencyMs` integer
- `ip` varchar(45), `userAgent` text
- `requestMeta` json — sanitized request summary (no secrets)
- `createdAt` timestamp

Indexes: `tenantId + createdAt`, `apiKeyId`, `traceId`

**Retention:** 90-day retention policy. Scheduled cleanup job (daily cron) deletes rows older than 90 days. Consider partitioning by `createdAt` month if table exceeds 1M rows.

**`api_webhook_endpoints`** — Outbound webhook registration
- PK: `id` varchar(36)
- `tenantId`, `apiKeyId` (nullable, ON DELETE SET NULL)
- `url` varchar(2048) — HTTPS only, SSRF-validated
- `secretEncrypted` text — AES-256-GCM encrypted webhook signing secret
- `events` json — array of event types to subscribe to
- `retryPolicy` varchar(20) default 'exponential' — 'exponential' | 'none'
- `isActive` boolean default true
- `lastDeliveredAt` timestamp nullable
- `failureCount` integer default 0
- `createdAt`, `updatedAt`

Indexes: `tenantId`, `apiKeyId`

**`api_webhook_deliveries`** — Delivery log with retry tracking
- PK: `id` bigserial
- `webhookEndpointId` FK
- `eventType` varchar(50)
- `payload` json
- `statusCode` integer nullable
- `attempt` integer default 1
- `deliveredAt` timestamp nullable
- `error` text nullable
- `createdAt` timestamp

**`automation_jobs`** — Async job queue records
- PK: `id` varchar(36) — format `job_{uuid}`
- `tenantId` varchar(36), `userId` integer, `apiKeyId` varchar(36)
- `type` varchar(50) — validated against `VALID_JOB_TYPES`
- `status` varchar(20) — pending, running, completed, failed, cancelled
- `params` json, `result` json, `error` json
- `progress` integer default 0
- `creditsReserved` integer, `creditsUsed` integer
- `callbackUrl` varchar(2048) nullable
- `callbackSecretEncrypted` text nullable
- `parentJobId` varchar(36) nullable — for pipeline steps
- `stepIndex` integer nullable
- `traceId` varchar(36)
- `idempotencyKey` varchar(64) nullable UNIQUE
- `startedAt`, `completedAt`, `createdAt`, `expiresAt`

Indexes: `tenantId + status`, `apiKeyId`, `idempotencyKey` (unique), `parentJobId`

### 3.2 Columns Added to Existing Tables

Add to **`conversations`**:
- `source` varchar(20) default 'web' — 'web' | 'api' | 'widget'
- `apiKeyId` varchar(36) nullable, ON DELETE SET NULL
- `expiresAt` timestamp nullable — auto-expire API-created conversations

Add to **`agencyConversations`**:
- `source` varchar(20) default 'web'
- `apiKeyId` varchar(36) nullable, ON DELETE SET NULL
- `expiresAt` timestamp nullable

Add to **`providerUsageLog`**:
- `apiKeyId` varchar(36) nullable

### 3.3 Feature Flag

Add `publicApi: boolean` (default false) to the tenant feature flags system in `shared/featureFlags.ts`. This is the kill switch — disabling it immediately blocks all API key auth for that tenant.

### 3.4 CreditSourceType Extension

Add new source types to the TypeScript union (this is a Phase 1 BLOCKER since it's used across the credit deduction call chain):
- `api_chat`, `api_skill`, `api_agency`, `api_job`, `api_mcp`, `api_media`, `api_presentation`, `api_video_project`

### 3.5 Migration Execution

All schema changes go into a single Drizzle migration. Run `pnpm db:push` in `apps/web/` after editing `drizzle/schema.ts`. Follow the Database Safety Protocol: backup affected tables before migration, verify row counts after.

---

## 4. Domain 2: Authentication & Authorization

### 4.1 API Key Service

New file: `apps/web/server/services/apiKeyService.ts`

**Key generation:**
- Generate: `sk-ssp_{tenantShortId}_{crypto.randomBytes(24).toString('base62')}`
- Hash: `HMAC-SHA256(API_KEY_HMAC_SECRET, rawKey)` using Node.js `crypto.createHmac`
- Store hash only. Return raw key to client exactly once.

**Key validation (hot path — must be fast):**
- Extract `sk-ssp_` prefix from Bearer token
- Compute HMAC hash
- Look up in `api_keys` WHERE `keyHash = hash AND isActive = true`
- Check expiry, tenant `publicApi` flag
- Fire-and-forget `lastUsedAt` UPDATE (non-blocking)
- Return `AuthContext` struct

**CRUD operations:**
- `createKey(tenantId, userId, name, scopes, options?)` — validates scopes against `ALLOWED_API_SCOPES`
- `listKeys(tenantId, userId?)` — returns keys without hash
- `revokeKey(keyId, tenantId)` — sets `isActive = false`
- `getKeyUsageStats(keyId, tenantId)` — aggregates from `api_audit_events`

**Startup assertion:**
On server boot, assert `API_KEY_HMAC_SECRET` env var exists and has ≥32 bytes. Throw fatal error if missing — the server must not start without it.

### 4.2 Auth Extension (authz.ts)

Modify `authorizeRequest()` in `apps/web/server/_core/authz.ts`:

Before JWT verification, check if Bearer token starts with `sk-ssp_`. If so:
1. Call `apiKeyService.validateKey(token)`
2. If valid, return `{ ok: true, mode: 'api_key', sub: userId, tenantId, scopes, apiKeyId }`
3. If invalid, return `{ ok: false, error: 'Invalid API key' }`

The existing JWT and session auth paths remain unchanged. This is additive.

**AuthResult backward compatibility:** The current `AuthResult` type has `mode: "bearer"` for bearer tokens. Adding `mode: "api_key"` is a breaking change to the discriminated union. All call sites of `authorizeRequest()` must be enumerated and updated to handle the new mode. Key call sites include: `llmRoutes.ts` (`guardWithCredits`), `responsesRoutes.ts`, `mcpRoutes.ts`, `agencyStreamProxy.ts`. For backward compatibility, API key auth can set both `mode: "api_key"` AND include all fields expected by the `"bearer"` mode (e.g., `sub` as string). Downstream code that checks `mode === "bearer"` should be updated to `mode === "bearer" || mode === "api_key"` or use a helper `isAuthenticated(result)`.

### 4.3 AuthContext Refactor

Define a new `AuthContext` type in `apps/web/shared/publicApiTypes.ts`:

```typescript
type AuthContext = {
  userId: number;
  tenantId: string;  // varchar(36) — NOT integer
  mode: 'session' | 'api_key';
  apiKeyId?: string;
  scopes?: string[];
};
```

**IMPORTANT:** `tenantId` is `string` (varchar(36)), NOT `number`. The `tenants` table uses varchar PK.

Refactor these service functions to accept `AuthContext` instead of raw `userToken: string`:
- `skillExecutor.executeSkill()`
- `agencyBridge.executeRun()`
- `autoGenerateDraft()` — extract from tRPC protectedProcedure to standalone service function
- `triggerPresentationExport()` — extract from tRPC protectedProcedure
- `generateImage()`, `generateVideo()`, `generateAudio()` — media generation functions

For each, the refactor is:
1. Create a new service function that accepts `AuthContext`
2. The existing tRPC mutation calls the new service function, building `AuthContext` from session
3. The new public API route calls the same service function, building `AuthContext` from API key

### 4.4 Scope Enforcement Middleware

New middleware: `requireScopes(...scopes: string[])`

Applied per-route, checks that the authenticated API key has all required scopes. Returns 403 if missing. For session auth (web UI users), all scopes are implicitly granted.

### 4.5 Rate Limiter

New file: `apps/web/server/services/apiKeyRateLimiter.ts`

Redis sliding window counter:
- Per-key: `ratelimit:apikey:{keyId}:{minuteTimestamp}` — INCR + EXPIRE 120s
- Per-tenant: `ratelimit:tenant:api:{tenantId}:{minuteTimestamp}` — INCR + EXPIRE 120s
- Check key limit (default 60 RPM, configurable per key) + tenant limit (600 RPM global)
- Set response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- Return 429 if exceeded

**Daily credit limit:**
- Redis key: `creditlimit:apikey:{keyId}:{YYYY-MM-DD}` — INCRBY amount on each deduction
- Check against `api_keys.creditLimit` (null = unlimited)
- Return 429 with `Retry-After: <seconds-until-midnight-UTC>`

### 4.6 Audit Logging Middleware

Every API key request emits an audit event to `api_audit_events`:
- Capture: method, path, statusCode, creditsUsed, latencyMs, ip, userAgent, traceId
- Sanitize: strip Bearer tokens, connection strings, file paths from requestMeta
- Insert async (don't block response)

### 4.7 Idempotency

Middleware for POST endpoints: read `Idempotency-Key` header.
- Redis key: `idempotency:{tenantId}:{key}` — store `{ statusCode, body }`, TTL 24h
- If key exists, return cached response (including cached status code for failed requests)
- If not, proceed with request and cache result
- **Size limit:** Skip caching if response body > 1MB to avoid Redis memory pressure. Use shorter TTL (1h) for responses > 100KB.

---

## 5. Domain 3: Skill Execution API

### 5.1 Route File

New file: `apps/web/server/routes/publicSkillsApi.ts`

Mount at `/v1/skills` on the Express app.

### 5.2 Endpoints

**`GET /v1/skills`** — List available skills
- Scope: `skills:list`
- Query params: `category`, `tags`, `search`, `page`, `limit`
- Calls `skillRegistry.getSkills()` filtered by tenant
- Returns: `{ skills: [{ id, name, category, description, tags, inputSchema }], pagination }`

**`GET /v1/skills/:skillId`** — Get skill detail
- Scope: `skills:list`
- Calls `skillRegistry.getSkillById()`
- Returns full skill metadata including JSON Schema for inputs

**`POST /v1/skills/:skillId/execute`** — Execute skill
- Scope: `skills:execute`
- Body: `{ inputs: {...}, model?: string, stream?: boolean }`
- Validates inputs against skill's JSON Schema (use Ajv or Zod)
- Calls `skillExecutor.executeSkill()` with `AuthContext`
- Deducts credits with source type `api_skill`
- If `stream: true`, returns SSE with `data: { chunk }` events
- Response headers: `X-Credits-Used`, `X-Credits-Remaining`

**`POST /v1/skills/detect`** — Auto-detect skill from prompt
- Scope: `skills:execute`
- Body: `{ prompt: string }`
- Calls skill detection logic
- Returns: `{ skill: { id, name, confidence }, suggested_inputs }`

### 5.3 Error Format

All errors follow OpenAI-compatible format:
```json
{ "error": { "code": "insufficient_credits", "message": "...", "type": "billing_error" } }
```

---

## 6. Domain 4: Agency Invocation API

### 6.1 Route File

New file: `apps/web/server/routes/publicAgencyApi.ts`

Mount at `/v1/agencies`.

### 6.2 Endpoints

**`GET /v1/agencies`** — List agencies
- Scope: `agencies:list`
- Returns agencies visible to the tenant (JOIN `agencies` on `tenantId`)

**`POST /v1/agencies/:agencyId/invoke`** — Invoke agency
- Scope: `agencies:invoke`
- Body: `{ message: string, conversation_id?: string, max_credits?: number, stream?: boolean }`
- Validates agency belongs to tenant (CRITICAL: JOIN through `agencies.tenantId`)
- Auto-creates conversation if no `conversation_id` provided

**`GET /v1/agencies/:agencyId/runs/:runId`** — Poll run status
- Scope: `agencies:invoke`
- Returns: `{ status, messages, credits_used }`

**`GET /v1/agencies/:agencyId/runs/:runId/stream`** — SSE streaming
- Scope: `agencies:invoke`
- Proxies `agencyStreamProxy.ts` SSE events

### 6.3 Conversation Management (CRITICAL)

Two separate functions for conversation auto-creation:

**`getOrCreateAgencyApiConversation(agencyId, userId)`**
- Uses `agencyConversations` table (varchar(36) ID)
- No `tenantId` column — tenant isolation via `agencies.tenantId` JOIN
- Sets `source: 'api'`, `apiKeyId`, `expiresAt: NOW + 30 days`
- Returns existing conversation or creates new one

**`getOrCreateChatApiConversation(userId)`**
- Uses `conversations` table (integer ID)
- **No `tenantId` column** on conversations table — tenant isolation is via `userId` (user belongs to a tenant)
- Sets `source: 'api'`, `apiKeyId`, `expiresAt`
- Used by skill execution and chat endpoints, NOT agencies
- Tenant is derived from the user's tenant assignment, not a direct column

These MUST NOT be confused. The `agencyConversations` table has a completely different schema from `conversations`.

### 6.4 Credit Budget

If `max_credits` is provided, wrap the agency invocation with a credit pre-reservation:
1. Reserve `max_credits` via `creditService`
2. Execute agency run
3. Refund unused credits atomically

If `max_credits` not provided, deduct incrementally per LLM call (existing behavior).

---

## 7. Domain 5: Presentation API

### 7.1 Route File

New file: `apps/web/server/routes/publicPresentationsApi.ts`

Mount at `/v1/presentations`.

### 7.2 Endpoints

**`POST /v1/presentations/generate`** — Create presentation from topic
- Scope: `presentations:create`
- Body: `{ topic: string, style?: string, slide_count?: number }`
- Topic validation: Zod string, 3-1000 chars
- Extract business logic from existing tRPC `protectedProcedure` into a service function
- Deducts credits with source `api_presentation`
- Returns: `{ task_id, status: 'pending' }`

**`GET /v1/presentations/tasks/:taskId/progress`** — SSE progress
- Scope: `presentations:create`
- SSE stream with progress events: `{ stage, progress_pct, message }`
- Closes when complete or failed

**`GET /v1/presentations/decks/:deckId`** — Get completed deck
- Scope: `presentations:create`
- IDOR protection: verify deck ownership via `libraryItems` table
- Returns deck metadata + slide data

**`POST /v1/presentations/decks/:deckId/export`** — Trigger export
- Scope: `presentations:create`
- Body: `{ format: 'pptx' | 'pdf' }`
- Extract `triggerPresentationExport()` from tRPC to service function
- Returns: `{ export_id, status: 'processing' }`

**`GET /v1/presentations/decks/:deckId/export/download`** — Download export
- Scope: `presentations:create`
- Authenticated download: Bearer auth + ownership verification
- Returns file stream with `Content-Disposition: attachment`
- NOT unauthenticated — signed download URLs are NOT public URLs

### 7.3 Route Ordering

Register `/v1/presentations/tasks/:taskId/progress` BEFORE `/v1/presentations/decks/:deckId` to avoid path collision (Express matches first registered route).

---

## 8. Domain 6: Video Project & Media APIs

### 8.1 Video Project API

New file: `apps/web/server/routes/publicVideoApi.ts`, mount at `/v1/video-projects`.

**`POST /v1/video-projects`** — Create video project
- Scope: `video_projects:create`
- Body: `{ title, description, duration_minutes, quality: 'draft' | 'standard' | 'high' }`
- Duration-based credits: 3/5/10 per minute for draft/standard/high
- Credit overflow guard: `MAX_SINGLE_JOB_CREDITS = 10,000`

**`GET /v1/video-projects/:id`** — Get project status

**`GET /v1/video-projects/:id/export/download`** — Authenticated download
- Same pattern as presentation export download

### 8.2 Media Generation API

New file: `apps/web/server/routes/publicMediaApi.ts`, mount at `/v1/media`.

**`POST /v1/media/images/generate`** — Image generation
- Scope: `media:generate`
- Body: `{ prompt, model?, width?, height?, reference_image_urls?: string[] }`
- **SSRF validation for `reference_image_urls`**: loop through each URL, call `sanitizeUri()` + `assertPublicIp()`. Max 5 URLs. `assertPublicIp()` must check ALL A/AAAA DNS records.

**`POST /v1/media/videos/generate`** — Video generation
- Body: `{ prompt, model?, duration_seconds?, quality? }`

**`POST /v1/media/audio/generate`** — Audio generation (TTS)
- Body: `{ text, voice?, model? }`

**`GET /v1/media/:taskId/status`** — Poll async task status
- Returns: `{ status, result_url?, progress_pct }`

All media endpoints deduct credits with source `api_media`.

---

## 9. Domain 7: MCP Server

### 9.1 Implementation

New file: `apps/web/server/_core/mcpPublicServer.ts`

Single endpoint: `POST /v1/mcp`
Auth: API key with `mcp:read` and/or `mcp:write` scope.

### 9.2 Protocol

MCP Streamable HTTP (v2025-03-26):
- Request: JSON-RPC 2.0 body `{ jsonrpc: "2.0", method, params, id }`
- Response: JSON-RPC 2.0 result or SSE stream for long-running calls
- Methods: `initialize`, `tools/list`, `tools/call`

### 9.3 Session Management

Redis-backed session state machine:
- Key: `mcp:session:{sessionId}` — TTL 30 min
- States: `initializing` → `ready` → `closed` | `error`
- Session ID returned in `initialize` response, sent as `Mcp-Session-Id` header
- **Error handling:** If `initialize` fails, session transitions to `error` state. If a tool call crashes, session remains `ready` (tool call fails, session persists). Stale sessions auto-expire after 30 min TTL — no explicit `closed` transition needed for abandoned sessions.

### 9.4 Tool Registry

25+ tools organized by namespace:

| Namespace | Tools | Scope Required |
|-----------|-------|----------------|
| `smartspec.skills` | list, execute, detect | skills:list / skills:execute |
| `smartspec.agencies` | list, invoke, status | agencies:list / agencies:invoke |
| `smartspec.llm` | chat, embed, models | llm:chat |
| `smartspec.media` | generate_image, generate_video, generate_audio, status | media:generate |
| `smartspec.presentations` | create, list, export, download | presentations:create |
| `smartspec.video_projects` | create, list, export | video_projects:create |
| `smartspec.jobs` | submit, status, cancel | jobs:create / jobs:read |
| `smartspec.files` | read, list | mcp:read |
| `smartspec.drive` | search, read | mcp:read |
| `smartspec.browser` | execute_actions | mcp:write |

Each tool has an `inputSchema` (JSON Schema) for parameter validation. Tool calls that exceed 60s timeout or 100KB result size are terminated with an error.

### 9.5 MCP Discovery

`GET /.well-known/mcp.json` — Public discovery manifest:
```json
{
  "name": "SmartSpecPro",
  "url": "https://smartaihub.app/v1/mcp",
  "auth": { "type": "bearer" },
  "capabilities": { "tools": true },
  "docs": "https://smartaihub.app/v1/docs"
}
```

---

## 10. Domain 8: Job Automation

### 10.1 Job Service

New file: `apps/web/server/services/jobAutomationService.ts`

**Job lifecycle:**
1. Validate job type against `VALID_JOB_TYPES` enum
2. Check credit overflow guard: if estimated credits > `MAX_SINGLE_JOB_CREDITS` (10,000), reject
3. Reserve credits via `creditService.deductCredits()` with `idempotencyKey`
4. Enqueue to job queue. **Note:** BullMQ is partially migrated — some queues (Chat Bridge, Webhook Dispatch) still use BullMQ while LLM/scheduler use Cloud Tasks. For job automation, use BullMQ (it's still available in the runtime for non-LLM queues). Create a new `automation-jobs` queue.
5. Worker picks up job, executes via appropriate service
6. On success: update job record, set `creditsUsed`, refund excess reservation atomically
7. On failure: update job record with error, refund ALL reserved credits atomically
8. If `callbackUrl` set: dispatch webhook delivery

**Job types and their execution:**
- `skill_execution` → `skillExecutor.executeSkill()`
- `media_generation` → media task submission (Celery bridge)
- `agency_run` → `agencyBridge.executeRun()`
- `batch_skill` → iterate array of skill inputs, execute each (Zod validated)
- `presentation_create` → presentation generation service
- `video_project_create` → video project service

### 10.2 Pipeline Support

Pipeline jobs (`type: 'pipeline'`) have `params.steps[]`:
- Each step references a job type + params
- Template variables: `{{steps.stepId.field}}` for inter-step data passing
- Restricted substitution: only dot-notation path access, no code execution
- **Max depth:** 5 levels of template variable resolution
- **Cycle detection:** Before resolving variables, build dependency graph and reject circular references
- Steps execute sequentially, each creating a child job (`parentJobId` + `stepIndex`)

### 10.3 REST Endpoints

New file: `apps/web/server/routes/publicJobsApi.ts`, mount at `/v1/jobs`.

- `POST /v1/jobs` — Create job (scope: `jobs:create`)
- `GET /v1/jobs` — List jobs with pagination + status filter (scope: `jobs:read`)
- `GET /v1/jobs/:jobId` — Get job detail (scope: `jobs:read`)
- `DELETE /v1/jobs/:jobId` — Cancel pending/running job (scope: `jobs:create`)

---

## 11. Domain 9: Webhooks & Event Streaming

### 11.1 Webhook Management

New file: `apps/web/server/routes/publicWebhooksApi.ts`, mount at `/v1/webhooks`.

- `POST /v1/webhooks` — Register endpoint (scope: `webhooks:manage`)
  - SSRF validate URL: HTTPS only, `sanitizeUri()` + `assertPublicIp()`
  - Generate signing secret, encrypt with AES-256-GCM, store
  - Return secret once (same pattern as API keys)
- `GET /v1/webhooks` — List registered endpoints
- `DELETE /v1/webhooks/:id` — Deactivate endpoint
  - Verify tenant ownership before deletion

### 11.2 Webhook Delivery

Delivery service (can be in `jobAutomationService.ts` or separate):

**Configurable retry policy per endpoint:**
- `retryPolicy: 'exponential'` (default): 3 attempts with backoff (1s, 5s, 25s), then dead-letter
- `retryPolicy: 'none'`: single attempt, log failure, no retry

**Delivery flow:**
1. Serialize event payload as JSON
2. Compute HMAC-SHA256 signature: `X-SmartSpec-Signature: sha256=HMAC(secret, body)`
3. POST to endpoint URL with signature header
4. Log delivery to `api_webhook_deliveries`
5. On failure: increment `failureCount`, schedule retry per policy
6. After 3 consecutive failures: disable endpoint, set `isActive = false`

**Retry infrastructure:** Use BullMQ delayed jobs for retry scheduling (the existing Webhook Dispatch queue already uses BullMQ). Add the delivery to the queue with a calculated delay for each retry attempt.

**Security:**
- Never include API key secrets, raw tokens, or internal paths in webhook payloads
- Webhook tenant check: verify endpoint belongs to same tenant as the event source

### 11.3 SSE Event Stream

New endpoint: `GET /v1/events`
- Scope: `events:read`
- Query param: `types` — comma-separated event types to filter
- Long-lived SSE connection with heartbeat every 30s
- Events: `job.completed`, `job.failed`, `job.progress`, `media.ready`, `agency.message`, `credits.low`, `key.expiring`

Implementation: Redis Pub/Sub channel per tenant. API key auth, scope check, then subscribe to `events:{tenantId}` channel and filter by requested types.

**Delivery semantics:** At-most-once. Redis Pub/Sub is fire-and-forget — if the client disconnects, events during disconnection are lost. `Last-Event-Id` reconnection support is deferred to v2 (would require Redis Streams instead of Pub/Sub). Document this limitation in the API docs.

---

## 12. Domain 10: Admin UI

### 12.1 API Key Management Page

New file: `apps/web/client/src/pages/AdminApiKeys.tsx`

**Components:**
- Key list table: name, prefix (`sk-ssp_abc12...`), scopes (badges), created date, last used, status
- Create key dialog: name input, scope checkboxes (15 scopes), optional expiry date, optional daily credit limit, optional rate limit override
- One-time key display dialog: show raw key with copy button, warning that it won't be shown again
- Revoke confirmation dialog

**Route:** `/admin/api-keys` — add to admin sidebar navigation

### 12.2 Usage Dashboard

Add to the key management page (or as a detail view per key):
- Requests over time (chart from `api_audit_events` aggregation)
- Credits consumed per day
- Top endpoints by call count
- Error rate
- Rate limit hit count

### 12.3 Webhook Management

Add a tab or section to the admin area:
- List registered webhook endpoints
- Show delivery log with success/failure status
- Retry failed deliveries manually

### 12.4 tRPC Router

New file: `apps/web/server/routers/apiKeys.ts`

Procedures:
- `list` — list keys for tenant (admin) or own keys (user)
- `create` — create new key
- `revoke` — deactivate key
- `getUsageStats` — aggregate audit events
- `listWebhooks`, `deleteWebhook` — webhook management

RBAC: admin/domain_admin can see all tenant keys; regular users see only their own.

---

## 13. Domain 11: SDK & Documentation

### 13.1 OpenAPI Spec

Generate OpenAPI 3.0 spec at `GET /v1/openapi.json`:
- Use `swagger-jsdoc` or manual JSON construction
- Cover all `/v1/*` endpoints with request/response schemas
- Include auth scheme (Bearer API key)

### 13.2 Swagger UI

Mount Swagger UI at `GET /v1/docs`:
- Use `swagger-ui-express` package
- Reference the OpenAPI spec
- Include "Try it out" functionality

### 13.3 MCP Manifest

Already covered in Domain 7 (section 9.5).

### 13.4 SDKs (Future)

Python and TypeScript SDKs are documented in the spec but can be deferred to a follow-up. The REST API + OpenAPI spec is sufficient for v1 — SDK generation can be automated from OpenAPI.

---

## 14. Cross-Cutting Concerns

### 14.0 CORS Policy

All `/v1/*` endpoints set CORS headers for external API access:
- `Access-Control-Allow-Origin: *` — permissive for server-to-server and browser-based agents
- `Access-Control-Allow-Headers: Authorization, Content-Type, Idempotency-Key, Mcp-Session-Id`
- `Access-Control-Expose-Headers: X-Request-Id, X-Credits-Used, X-Credits-Remaining, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset`
- **Security caveat:** `origin: "*"` means browser-based apps can call the API with any origin. This is acceptable because authentication is via API key (not cookies), so CSRF is not a concern. However, document this in the API docs so consumers understand the trust model.

### 14.1 Common Response Headers

All public API responses include:
- `X-Request-Id: {traceId}` — for debugging
- `X-Credits-Used: N` — credits consumed by this request
- `X-Credits-Remaining: N` — user's remaining credit balance

### 14.2 Common Error Format

OpenAI-compatible error responses:
```json
{
  "error": {
    "code": "insufficient_credits",
    "message": "Your account has insufficient credits for this request",
    "type": "billing_error"
  }
}
```

Error codes: `invalid_api_key`, `insufficient_scopes`, `rate_limit_exceeded`, `insufficient_credits`, `daily_credit_limit`, `invalid_request`, `not_found`, `internal_error`, `feature_disabled`

### 14.3 Request Routing

In `apps/web/server/_core/index.ts`, mount public API routes:
- Ensure `/v1/presentations/tasks/:taskId/progress` is registered BEFORE `/v1/presentations/decks/:deckId` (path collision prevention)
- All `/v1/*` routes go through `apiKeyAuthMiddleware` (which falls through to existing auth for non-API-key tokens)

### 14.4 Feature Flag Guard

Middleware that checks tenant `publicApi` feature flag. If disabled, return 403 for API key auth. This is the kill switch.

---

## 15. File Change Summary

### New Files (~15)
| File | Domain |
|------|--------|
| `server/services/apiKeyService.ts` | Auth |
| `server/services/apiKeyRateLimiter.ts` | Auth |
| `server/services/jobAutomationService.ts` | Jobs |
| `server/routes/publicSkillsApi.ts` | Skills |
| `server/routes/publicAgencyApi.ts` | Agencies |
| `server/routes/publicPresentationsApi.ts` | Presentations |
| `server/routes/publicVideoApi.ts` | Video |
| `server/routes/publicMediaApi.ts` | Media |
| `server/routes/publicJobsApi.ts` | Jobs |
| `server/routes/publicWebhooksApi.ts` | Webhooks |
| `server/routes/publicEventsApi.ts` | Events |
| `server/_core/mcpPublicServer.ts` | MCP |
| `server/routers/apiKeys.ts` | Admin |
| `client/src/pages/AdminApiKeys.tsx` | Admin UI |
| `shared/publicApiTypes.ts` | Shared |

### Modified Files (~10)
| File | Change |
|------|--------|
| `drizzle/schema.ts` | 5 new tables + 3 column additions |
| `server/_core/authz.ts` | API key auth detection |
| `server/_core/index.ts` | Mount public API routes |
| `server/_core/llmRoutes.ts` | Credit response headers |
| `server/_core/responsesRoutes.ts` | Accept API key auth |
| `shared/featureFlags.ts` | Add `publicApi` flag |
| `server/services/creditService.ts` | New source types |
| `server/services/skillExecutor.ts` | Accept AuthContext |
| `server/services/agencyBridge.ts` | Accept AuthContext |
| `client/src/App.tsx` or router config | Add admin route |

---

## 16. Security Checklist

- [ ] API keys HMAC-SHA256 hashed with server pepper, never stored plaintext
- [ ] Startup assertion: `API_KEY_HMAC_SECRET` ≥32 bytes
- [ ] Scope enforcement on every endpoint via `requireScopes()` middleware
- [ ] Tenant isolation — all queries scoped to API key's tenant
- [ ] Rate limiting: per-key (60 RPM) + per-tenant (600 RPM)
- [ ] Daily credit limit per key (optional)
- [ ] SSRF validation on callback URLs and `reference_image_urls` arrays
- [ ] `assertPublicIp()` checks ALL A/AAAA DNS records
- [ ] Webhook secrets encrypted with AES-256-GCM via `crypto.ts`
- [ ] HMAC-SHA256 signature on all webhook deliveries
- [ ] No secret leakage in webhook payloads
- [ ] Authenticated download for presentation/video exports (not public URLs)
- [ ] Credit overflow guard: MAX_SINGLE_JOB_CREDITS = 10,000
- [ ] Atomic credit refunds on job failure
- [ ] MCP tool: 60s timeout, 100KB result limit
- [ ] Pipeline templates: restricted variable substitution only
- [ ] Audit logging: all API calls → `api_audit_events`
- [ ] Feature flag kill switch: disable `publicApi` → immediate block
- [ ] `agencyConversations` tenant isolation via agencies JOIN (not direct tenantId)
- [ ] Idempotency key cache includes status_code for failed requests

I now have enough context. Let me produce the section content.

# Section 06: Agency Invocation API

## Overview

This section adds a public REST API for listing and invoking agencies, polling run status, and streaming run output via SSE. It creates a new Express route file mounted at `/v1/agencies` that wraps the existing `agencyBridge` service and `agencyStreamProxy` SSE infrastructure with API-key authentication, scope enforcement, and credit budget support.

**Dependencies:**
- Section 01 (database schema) -- `agencyConversations` columns `source`, `apiKeyId`, `expiresAt` must exist
- Section 03 (auth extension) -- `authorizeRequest()` must handle `sk-ssp_` API keys, `AuthContext` type must be defined, `requireScopes()` middleware must be available
- Section 04 (rate limiter & audit) -- rate limiting middleware, audit logging, common error format, CORS headers, `X-Request-Id` / `X-Credits-Used` / `X-Credits-Remaining` response headers

## Key Files

| File | Action |
|------|--------|
| `apps/web/server/routes/publicAgencyApi.ts` | **CREATE** -- All `/v1/agencies/*` endpoints |
| `apps/web/server/routes/__tests__/publicAgencyApi.test.ts` | **CREATE** -- Tests |
| `apps/web/server/_core/index.ts` | **MODIFY** -- Mount the new route file |
| `apps/web/server/services/agencyBridge.ts` | **MODIFY** -- Accept `AuthContext` (if not already done by section 03) |
| `apps/web/server/_core/agencyStreamProxy.ts` | **MODIFY** -- Expose a helper that the public API can call for SSE proxying |

## Tests

Create the test file at `apps/web/server/routes/__tests__/publicAgencyApi.test.ts`. All tests use Vitest. Mock the database, `agencyBridge`, `agencyStreamProxy`, `creditService`, and `authorizeRequest`.

### Test Stubs

```typescript
// apps/web/server/routes/__tests__/publicAgencyApi.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Public Agency API", () => {
  // -- GET /v1/agencies --

  describe("GET /v1/agencies", () => {
    it("returns agencies for the authenticated tenant", async () => {
      // Mock authorizeRequest to return api_key mode with agencies:list scope
      // Mock DB query on agencies table filtered by tenantId
      // Assert response is { agencies: [...], pagination: {...} }
    });

    it("requires agencies:list scope", async () => {
      // Auth context with no agencies:list scope
      // Assert 403 with { error: { code: "insufficient_scopes" } }
    });

    it("returns only agencies belonging to the API key tenant", async () => {
      // Insert agencies for 2 tenants, auth as tenant A
      // Assert only tenant A agencies returned
    });
  });

  // -- POST /v1/agencies/:agencyId/invoke --

  describe("POST /v1/agencies/:agencyId/invoke", () => {
    it("creates a conversation and invokes agency", async () => {
      // No conversation_id in body
      // Assert getOrCreateAgencyApiConversation called
      // Assert agencyBridge.executeRun called with correct params
      // Assert response includes run_id, conversation_id, status
    });

    it("reuses existing conversation when conversation_id provided", async () => {
      // Body includes conversation_id
      // Assert existing conversation is fetched (not created)
      // Assert agencyBridge.executeRun called with that conversation_id
    });

    it("requires agencies:invoke scope", async () => {
      // Auth with agencies:list but not agencies:invoke
      // Assert 403
    });

    it("rejects agency from a different tenant", async () => {
      // Auth as tenant A, request agency belonging to tenant B
      // Assert 404 (not 403, to avoid information leakage)
    });

    it("enforces max_credits budget cap", async () => {
      // Body includes max_credits: 50
      // Assert creditService.reserveCredits called with 50
      // Assert run executes, then refund of unused credits
    });

    it("refunds credits when invocation uses less than max_credits", async () => {
      // Reserve 100, run uses 30
      // Assert refundCredits called with 70
    });

    it("deducts credits with source type api_agency", async () => {
      // No max_credits (incremental deduction)
      // Assert credit deduction uses sourceType "api_agency"
    });

    it("returns X-Credits-Used header", async () => {
      // After successful invoke
      // Assert X-Credits-Used in response headers
    });

    it("validates agencyId format to prevent path traversal", async () => {
      // agencyId = "../../../etc/passwd"
      // Assert 400
    });
  });

  // -- GET /v1/agencies/:agencyId/runs/:runId --

  describe("GET /v1/agencies/:agencyId/runs/:runId", () => {
    it("returns run status with messages and credits_used", async () => {
      // Mock agencyBridge.getRun or equivalent
      // Assert response shape { status, messages, credits_used }
    });

    it("requires agencies:invoke scope", async () => {
      // Assert 403 without scope
    });

    it("returns 404 for run belonging to different tenant", async () => {
      // Tenant isolation check
    });
  });

  // -- GET /v1/agencies/:agencyId/runs/:runId/stream --

  describe("GET /v1/agencies/:agencyId/runs/:runId/stream", () => {
    it("returns SSE events from agency stream proxy", async () => {
      // Mock the SSE proxy
      // Assert Content-Type: text/event-stream
    });

    it("requires agencies:invoke scope", async () => {
      // Assert 403
    });
  });

  // -- Conversation Management --

  describe("getOrCreateAgencyApiConversation", () => {
    it("uses agencyConversations table (not conversations)", async () => {
      // Assert INSERT into agencyConversations
    });

    it("sets source to 'api' and apiKeyId from auth context", async () => {
      // Assert inserted row has source='api', apiKeyId set
    });

    it("returns existing conversation for same agency+user pair", async () => {
      // Insert existing, call again with same params
      // Assert same ID returned (no duplicate created)
    });

    it("sets expiresAt to 30 days from now", async () => {
      // Assert expiresAt is approximately NOW + 30 days
    });

    it("achieves tenant isolation via agencies JOIN (no direct tenantId)", async () => {
      // agencyConversations has no tenantId column
      // Assert the query JOINs through agencies.tenantId for isolation
    });
  });
});
```

## Implementation Details

### 1. Route File: `apps/web/server/routes/publicAgencyApi.ts`

Create an Express Router with the following endpoints. All endpoints are guarded by the API key auth middleware (from section 03) and the `requireScopes()` middleware (from section 04).

#### GET /v1/agencies

- **Scope:** `agencies:list`
- Query the `agencies` table filtered by `tenantId` matching the authenticated API key's tenant
- Return shape:
  ```json
  {
    "agencies": [
      {
        "id": "...",
        "name": "...",
        "slug": "...",
        "description": "...",
        "default_model": "...",
        "created_at": "..."
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 5 }
  }
  ```
- Support query params: `page` (default 1), `limit` (default 20, max 100)

#### POST /v1/agencies/:agencyId/invoke

- **Scope:** `agencies:invoke`
- **Request body:**
  ```json
  {
    "message": "Research the latest AI trends",
    "conversation_id": "optional-uuid",
    "max_credits": 100,
    "stream": false
  }
  ```
- **Validation:**
  - `message` is required, string, 1-10000 chars
  - `agencyId` must match `/^[a-zA-Z0-9_-]+$/` (reuse existing `AGENCY_ID_PATTERN`)
  - Verify agency exists AND belongs to the authenticated tenant via `agencies.tenantId` JOIN -- return 404 (not 403) if tenant mismatch to avoid information leakage
- **Conversation management:**
  - If `conversation_id` is provided, verify it exists and belongs to the same user + agency
  - If not provided, call `getOrCreateAgencyApiConversation()` to create one
- **Credit budget (`max_credits`):**
  - If provided, call `creditService.reserveCredits(userId, maxCredits, "api_agency")` before execution
  - After execution completes, refund unused credits: `reservedAmount - actualCreditsUsed`
  - If not provided, credits are deducted incrementally by the agency service (existing behavior)
- **Execution:**
  - If `stream: true`, set up SSE response and proxy through the agency stream proxy (see SSE streaming section below)
  - If `stream: false` (default), call `agencyBridge.executeRun()` and return the result synchronously
- **Response:**
  ```json
  {
    "run_id": "...",
    "conversation_id": "...",
    "status": "completed",
    "response": "Here are the latest AI trends...",
    "credits_used": 12.5
  }
  ```

#### GET /v1/agencies/:agencyId/runs/:runId

- **Scope:** `agencies:invoke`
- Proxy to `agencyBridge` to fetch run status from the Python backend
- Validate tenant ownership (agency must belong to authenticated tenant)
- **Response:**
  ```json
  {
    "run_id": "...",
    "status": "completed",
    "messages": [...],
    "credits_used": 12.5,
    "duration_ms": 4500,
    "started_at": "...",
    "completed_at": "..."
  }
  ```

#### GET /v1/agencies/:agencyId/runs/:runId/stream

- **Scope:** `agencies:invoke`
- Validate tenant ownership
- Set SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`)
- Proxy SSE events from the Python backend's agency stream endpoint
- Reuse the helper logic in `agencyStreamProxy.ts` -- extract the upstream fetch and SSE piping into a reusable function that both the existing internal route and this public route can call
- Send heartbeat comments (`:heartbeat`) every 15 seconds to keep connections alive through proxies
- Clean up on client disconnect

### 2. Conversation Management Helper

Implement `getOrCreateAgencyApiConversation` as a helper function within `publicAgencyApi.ts` or as a small utility in the services directory.

**Critical schema facts:**
- The `agencyConversations` table uses `varchar(36)` for its primary key `id`
- It has columns: `id`, `agencyId`, `userId`, `title`, `totalCreditsUsed`, `createdAt`, `updatedAt`
- After section 01 migration, it gains: `source` (varchar(20) default 'web'), `apiKeyId` (varchar(36) nullable), `expiresAt` (timestamp nullable)
- There is **no `tenantId` column** on `agencyConversations` -- tenant isolation is achieved by JOINing through `agencies.tenantId`

**Tenant Isolation via JOIN:** Since `agencyConversations` has no `tenantId` column, tenant isolation MUST be achieved by JOINing through the `agencies` table. The query pattern:

```sql
-- Tenant-safe conversation lookup
SELECT ac.*
FROM agency_conversations ac
JOIN agencies a ON ac."agencyId" = a.id
WHERE ac."agencyId" = :agencyId
  AND ac."userId" = :userId
  AND ac."source" = 'api'
  AND a."tenantId" = :tenantId  -- critical: tenant isolation via JOIN
  AND (ac."expiresAt" IS NULL OR ac."expiresAt" > NOW());
```

In Drizzle ORM:
```typescript
const conv = await db.select()
  .from(agencyConversations)
  .innerJoin(agencies, eq(agencyConversations.agencyId, agencies.id))
  .where(and(
    eq(agencyConversations.agencyId, agencyId),
    eq(agencyConversations.userId, auth.userId),
    eq(agencyConversations.source, "api"),
    eq(agencies.tenantId, auth.tenantId),  // tenant isolation
  ))
  .limit(1);
```

**Logic:**
1. Query `agencyConversations` with tenant-safe JOIN (as above)
2. If found, return the existing conversation
3. If not found, INSERT a new row with:
   - `id`: generated UUID (varchar(36))
   - `agencyId`: validated agency ID
   - `userId`: from AuthContext
   - `title`: `"API Conversation"`
   - `source`: `'api'`
   - `apiKeyId`: from AuthContext
   - `expiresAt`: `NOW() + 30 days`

**Important:** This is separate from `getOrCreateChatApiConversation` (used by the skill API in section 05). Agency conversations use a different table with a different schema. Do NOT mix them up.

### 3. SSE Streaming Integration

The existing `agencyStreamProxy.ts` at `/home/dev/projects/SmartSpecPro/apps/web/server/_core/agencyStreamProxy.ts` handles SSE proxying for the internal `/api/v1/agency/stream` endpoint. For the public API:

- Extract the core SSE proxying logic (upstream fetch to Python, response piping, heartbeat) into a reusable function
- The public route (`POST /v1/agencies/:agencyId/invoke` with `stream: true` and `GET /v1/agencies/:agencyId/runs/:runId/stream`) calls this shared function
- The reusable function should accept parameters for: `agencyId`, `conversationId`, `message`, auth headers, and the Express `Response` object
- Keep the existing internal route working unchanged

The existing proxy uses:
- `PYTHON_BACKEND_URL` (default `http://localhost:8000`) as the upstream
- `GATEWAY_TOKEN` env var for upstream authorization
- `X-User-Token`, `X-Tenant-Id`, `X-User-Id` headers for user context
- `AbortController` for client disconnect cleanup
- 15-second heartbeat interval

### 4. Mounting Routes

In `apps/web/server/_core/index.ts`, import and mount the public agency API router:

```typescript
import { publicAgencyRouter } from "../routes/publicAgencyApi";
// Mount after auth middleware, rate limiter, and audit logging
app.use("/v1/agencies", publicAgencyRouter);
```

### 5. agencyBridge Modifications

The `agencyBridge.ts` service currently accepts `userToken: string` as part of `RunParams`. Per the AuthContext refactor (section 03), this should be updated to accept `AuthContext`. If section 03 has not yet made this change, this section should:

- Add an overload or wrapper function that accepts `AuthContext` and maps it to the existing `RunParams` format
- For API key auth, generate a short-lived bearer token via `signBearerToken()` to pass to the Python backend (the Python backend expects a bearer token for user identification)
- The existing internal callers continue to work unchanged

The `makeHeadersWithMeta(userToken, tenantId, userId)` function in agencyBridge already sends `X-Tenant-Id` and `X-User-Id` headers alongside the bearer token, which is exactly what the public API needs.

### 6. Error Handling

All errors follow the OpenAI-compatible format established in section 04:

```json
{ "error": { "code": "error_code", "message": "Human-readable message", "type": "error_type" } }
```

Error codes used by this section:
- `invalid_request` -- missing/invalid `message`, bad `agencyId` format
- `not_found` -- agency does not exist or does not belong to tenant
- `insufficient_credits` -- not enough credits for the run or budget cap exceeded
- `insufficient_scopes` -- API key lacks required scope
- `internal_error` -- upstream agency service failure

### 7. Security Considerations

- **Tenant isolation:** Every query for agencies and conversations MUST filter by the API key's tenant. For agencies, use `agencies.tenantId`. For conversations, JOIN through `agencies.tenantId` since `agencyConversations` has no direct tenant column.
- **IDOR prevention:** Run status queries verify both agency ownership (tenant) and conversation ownership (userId).
- **Path traversal:** Agency IDs are validated against `/^[a-zA-Z0-9_-]+$/` before being used in any URL construction or database query.
- **Credit budget atomicity:** When `max_credits` is used, the reservation and refund must be atomic. If the run fails, ALL reserved credits must be refunded.

### 8. Event Emission

After an agency invocation completes, emit a public API event for webhook delivery and SSE consumers:

```typescript
import { emitPublicApiEvent } from "../services/webhookDeliveryService";

// After agencyBridge.executeRun() completes
await emitPublicApiEvent(auth.tenantId, "agency.message", {
  agency_id: agencyId,
  run_id: runResult.runId,
  conversation_id: conversationId,
  status: runResult.status,
  credits_used: runResult.creditsUsed,
});
```

This enables consumers who registered webhooks for `agency.message` events (section 11) to receive notifications when agency runs complete.
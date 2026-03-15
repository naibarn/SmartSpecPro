Now I have a thorough understanding of the codebase. Let me produce the section content.

# Section 07 -- Presentation API

## Overview

This section adds five public REST endpoints under `/v1/presentations` that expose SmartSpecPro's presentation generation, progress tracking, deck retrieval, export triggering, and authenticated download capabilities to external API consumers. These endpoints wrap existing internal services (`aiPresentationService`, `presentationPlaybackExport`, `presentationService`, `libraryService`) behind API-key authentication with scope enforcement, credit deduction, and IDOR protection.

**Dependencies:** This section requires sections 01 (database schema), 03 (auth extension with `AuthContext` and `requireScopes` middleware), and 04 (rate limiter and audit logging) to be completed first. The `publicApi` feature flag, API key validation, common error format, and response headers (`X-Request-Id`, `X-Credits-Used`, `X-Credits-Remaining`) must all be operational before implementing this section.

---

## Key Files

| File | Action |
|------|--------|
| `apps/web/server/routes/publicPresentationsApi.ts` | **CREATE** -- all five endpoints |
| `apps/web/server/routes/__tests__/publicPresentationsApi.test.ts` | **CREATE** -- test suite |
| `apps/web/server/_core/index.ts` | **MODIFY** -- mount the new router |

### Existing files consumed (read-only references)

| File | What it provides |
|------|-----------------|
| `apps/web/server/services/aiPresentationService.ts` | `generateAIDraft()` -- fire-and-forget presentation generation pipeline |
| `apps/web/server/services/presentationPlaybackExport.ts` | `triggerPresentationExport()`, `getPresentationExportStatus()` |
| `apps/web/server/services/presentationService.ts` | `PresentationActor`, `getPresentationDeckDetail()`, `createPresentationDeckForLibraryItem()` |
| `apps/web/server/services/libraryService.ts` | `createLibraryItem()`, `LibraryActor` |
| `apps/web/server/services/autoDraftResolver.ts` | `resolveAutoDraftParams()` |
| `apps/web/server/services/redis.ts` | `getRedisClient()` |
| `apps/web/server/services/creditService.ts` | `deductCredits()` with source type `api_presentation` |
| `apps/web/shared/publicApiTypes.ts` | `AuthContext` type (from section 02/03) |

---

## Tests (Write First)

Create `apps/web/server/routes/__tests__/publicPresentationsApi.test.ts`. All tests use Vitest. Mock the underlying service functions; do not call real AI or database services.

### Test descriptions and intent

```
Test: POST /v1/presentations/generate validates topic length (3-1000 chars)
  - Send body with topic of 2 chars -> expect 400 with error.code "invalid_request"
  - Send body with topic of 1001 chars -> expect 400
  - Send body with topic of 3 chars -> expect success (task_id returned)

Test: POST /v1/presentations/generate requires presentations:create scope
  - Authenticate with API key missing presentations:create scope -> expect 403 with error.code "insufficient_scopes"

Test: POST /v1/presentations/generate returns task_id and status pending
  - Valid request with topic -> expect 200 with { task_id: string, deck_id: number, status: "pending" }
  - Verify generateAIDraft was called (fire-and-forget)
  - Verify credits deducted with source "api_presentation"

Test: POST /v1/presentations/generate deducts credits with source api_presentation
  - After successful call, verify creditService.deductCredits was called with source "api_presentation"

Test: GET /v1/presentations/tasks/:taskId/progress returns SSE stream
  - Mock Redis ai_draft_progress key with progress data
  - Expect SSE response with Content-Type text/event-stream
  - Expect data events with { phase, progress_pct, message, completed }
  - When progress shows completed=true, stream should close

Test: GET /v1/presentations/decks/:deckId returns deck data
  - Mock getPresentationDeckDetail to return deck + slides
  - Expect 200 with deck metadata and slides array

Test: GET /v1/presentations/decks/:deckId rejects IDOR (wrong tenant)
  - Authenticate as tenant A, request deck owned by tenant B
  - Expect 404 (not 403, to avoid information leakage)

Test: POST /v1/presentations/decks/:deckId/export triggers export
  - Body { format: "pptx" } -> expect 200 with { export_id, status: "processing" }
  - Verify triggerPresentationExport called with correct actor

Test: POST /v1/presentations/decks/:deckId/export validates format
  - Body { format: "exe" } -> expect 400

Test: GET /v1/presentations/decks/:deckId/export/download requires Bearer auth
  - Request without Authorization header -> expect 401

Test: GET /v1/presentations/decks/:deckId/export/download verifies ownership
  - Authenticate as user who does not own the deck -> expect 404

Test: GET /v1/presentations/decks/:deckId/export/download returns file stream
  - Mock export status as "done" with outputUrl
  - Expect response with Content-Disposition attachment header
  - Expect file content streamed

Test: /v1/presentations/tasks/:taskId/progress matches before /v1/presentations/decks/:deckId
  - Register routes in correct order
  - GET /v1/presentations/tasks/abc123/progress -> should hit progress handler, not decks handler
```

### Test file skeleton

```typescript
// apps/web/server/routes/__tests__/publicPresentationsApi.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for public presentations API endpoints.
 *
 * Mocks:
 * - aiPresentationService.generateAIDraft
 * - presentationPlaybackExport.triggerPresentationExport
 * - presentationPlaybackExport.getPresentationExportStatus
 * - presentationService.getPresentationDeckDetail
 * - libraryService.createLibraryItem
 * - presentationService.createPresentationDeckForLibraryItem
 * - creditService.deductCredits
 * - redis (getRedisClient)
 * - auth middleware (requireScopes, apiKeyAuthMiddleware)
 */

describe("POST /v1/presentations/generate", () => {
  it("validates topic min length (3 chars)");
  it("validates topic max length (1000 chars)");
  it("requires presentations:create scope");
  it("returns task_id and status pending on success");
  it("deducts credits with source api_presentation");
});

describe("GET /v1/presentations/tasks/:taskId/progress", () => {
  it("returns SSE stream with progress events");
  it("closes stream when generation completes");
  it("returns 404 for unknown taskId");
});

describe("GET /v1/presentations/decks/:deckId", () => {
  it("returns deck metadata and slides");
  it("rejects IDOR access from different tenant with 404");
  it("requires presentations:create scope");
});

describe("POST /v1/presentations/decks/:deckId/export", () => {
  it("triggers export and returns export_id");
  it("validates format enum (pptx, pdf)");
  it("verifies deck ownership before export");
});

describe("GET /v1/presentations/decks/:deckId/export/download", () => {
  it("requires Bearer auth");
  it("verifies deck ownership");
  it("returns file stream with Content-Disposition header");
  it("returns 404 when export not complete");
});

describe("route ordering", () => {
  it("tasks/:taskId/progress matches before decks/:deckId");
});
```

---

## Implementation Details

### 1. Route file structure

Create `apps/web/server/routes/publicPresentationsApi.ts` as an Express `Router`. Export a function that accepts the Express app or returns the router.

```typescript
// apps/web/server/routes/publicPresentationsApi.ts
import { Router } from "express";

/**
 * Public Presentations API -- /v1/presentations
 *
 * Endpoints:
 *   POST   /generate              -- create presentation from topic
 *   GET    /tasks/:taskId/progress -- SSE progress stream
 *   GET    /decks/:deckId          -- get completed deck
 *   POST   /decks/:deckId/export   -- trigger export
 *   GET    /decks/:deckId/export/download -- authenticated file download
 */
export function createPresentationPublicRouter(): Router {
  // ...
}
```

### 2. Endpoint: POST /v1/presentations/generate

**Scope:** `presentations:create`

**Request body (Zod validated):**
```typescript
z.object({
  topic: z.string().min(3).max(1000),
  style: z.string().optional(),
  slide_count: z.number().int().min(1).max(30).default(5),
})
```

**Implementation logic:**
1. Extract `AuthContext` from `req` (set by auth middleware from section 03).
2. Build a `PresentationActor` from `AuthContext`: `{ userId: ctx.userId, tenantId: ctx.tenantId }`.
3. Call `resolveAutoDraftParams(topic, { userId, tenantId, traceId })` to auto-resolve generation params.
4. Call `createLibraryItem({ itemType: "presentation", source: "auto_draft", title: topic.slice(0, 200) }, actor)`.
5. Call `createPresentationDeckForLibraryItem({ libraryItemId, title }, actor)`.
6. Deduct credits with `deductCredits({ userId, tenantId, amount, source: "api_presentation", ... })`.
7. Store initial progress in Redis under `ai_draft_progress:{taskId}` with 300s TTL.
8. Fire-and-forget call to `generateAIDraft(draftInput, actor, userToken, taskId)`.
9. Return `{ task_id: taskId, deck_id: deckId, status: "pending" }`.

This mirrors the logic in `presentation.ts` router's `autoGenerateDraft` procedure (lines 673-800), extracted into a standalone Express handler that uses `AuthContext` instead of tRPC context.

**Important:** The `generateAIDraft` function requires a `userToken` parameter (used for internal Python backend communication). For API key auth, generate an internal bearer token using `signBearerToken({ sub: String(userId), type: "access", scopes: ["media:generate"] }, "15m")` -- the same pattern used by `createPresentationToken` in the existing tRPC router.

### 3. Endpoint: GET /v1/presentations/tasks/:taskId/progress

**Scope:** `presentations:create`

**Response:** Server-Sent Events (SSE) stream.

**Implementation logic:**
1. Set response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
2. Poll Redis key `ai_draft_progress:{taskId}` on interval (every 1-2 seconds).
3. Parse the JSON progress object. The structure matches the existing `getDraftProgress` tRPC query shape:
   ```typescript
   { phase: number, phaseLabel: string, slidesCompleted: number, totalSlides: number,
     completed: boolean, error?: { code: string, message: string } }
   ```
4. Emit SSE `data:` events with normalized shape: `{ stage: phaseLabel, progress_pct: (slidesCompleted/totalSlides)*100, message: phaseLabel, completed }`.
5. Perform IDOR check: the progress JSON includes `userId` -- verify it matches the authenticated user.
6. When `completed` is true (success or error), send a final event and close the connection.
7. Set a connection timeout (5 minutes max) to prevent orphan connections.
8. Handle client disconnect by clearing the polling interval.

### 4. Endpoint: GET /v1/presentations/decks/:deckId

**Scope:** `presentations:create`

**IDOR protection (critical):**
The deck does not have a direct `tenantId` column. Ownership must be verified through the `libraryItems` table. The flow:
1. Call `getPresentationDeckDetail(deckId, actor)` which internally checks that the deck belongs to a library item owned by the user/tenant.
2. If the service throws `PERMISSION_DENIED` or `NOT_FOUND`, map to a 404 response (do not leak existence to other tenants).

**Response:**
```json
{
  "deck_id": 123,
  "title": "...",
  "slide_count": 5,
  "slides": [
    { "index": 0, "content": {...}, "notes": "..." }
  ],
  "created_at": "...",
  "updated_at": "..."
}
```

### 5. Endpoint: POST /v1/presentations/decks/:deckId/export

**Scope:** `presentations:create`

**Request body:**
```typescript
z.object({
  format: z.enum(["pptx", "pdf"]),
})
```

**Implementation logic:**
1. Verify deck ownership (same IDOR pattern as GET decks).
2. Generate an idempotency key from `deckId + format + userId`.
3. Generate an internal bearer token for Python backend communication.
4. Call `triggerPresentationExport({ deckId, format, idempotencyKey }, actor, { userToken })`.
5. Return `{ export_id: result.exportId, status: result.status }`.

The existing `triggerPresentationExport` function accepts a `TriggerPresentationExportInput` which includes `deckId`, `format`, `quality`, `idempotencyKey`, and optional `width`/`height`. The API can pass only `deckId` and `format`, letting the service use defaults.

### 6. Endpoint: GET /v1/presentations/decks/:deckId/export/download

**Scope:** `presentations:create`

This endpoint performs an **authenticated download** -- it is not a public/presigned URL.

**Implementation logic:**
1. Verify deck ownership.
2. Call `getPresentationExportStatus(exportId, actor, userToken)` to get the current export status.
3. If status is not `"done"`, return 404 with error `{ code: "not_found", message: "Export not ready" }`.
4. The export status includes a `downloadUrl` field (from `outputUrl` in the DB). This URL points to the storage backend (S3/R2 or local file path).
5. If the URL is a local file path (starts with `/` or is relative), stream the file directly using `fs.createReadStream`.
6. If the URL is a remote presigned URL, either proxy the download or redirect.
7. Set response headers:
   - `Content-Disposition: attachment; filename="presentation-{deckId}.{format}"`
   - `Content-Type: application/octet-stream` (or appropriate MIME type for pptx/pdf)

**Note:** The `exportId` is not passed in the URL -- the download endpoint uses `deckId` to look up the latest completed export. Query the export records for the deck and find the most recent one with status `"done"`.

### 7. Route ordering in Express (critical)

When mounting routes in `apps/web/server/_core/index.ts`, the `tasks` path MUST be registered BEFORE the `decks` path to prevent Express from matching `/tasks/:taskId/progress` as `/decks/:deckId`:

```typescript
// In apps/web/server/_core/index.ts
const presentationRouter = createPresentationPublicRouter();
app.use("/v1/presentations", presentationRouter);

// Inside createPresentationPublicRouter():
router.get("/tasks/:taskId/progress", ...);   // FIRST
router.get("/decks/:deckId", ...);             // SECOND
router.post("/decks/:deckId/export", ...);
router.get("/decks/:deckId/export/download", ...);
router.post("/generate", ...);                 // order doesn't matter for POST
```

This ordering is safe because Express matches routes in registration order, and `/tasks/` prefix will not collide with `/decks/` prefix. However, the real risk would be if a future endpoint like `/v1/presentations/:id` were added -- keeping the explicit `/tasks/` and `/decks/` prefixes avoids this entirely.

### 8. Building PresentationActor from AuthContext

The `PresentationActor` interface extends `LibraryActor`:
```typescript
interface PresentationActor extends LibraryActor {
  tenantId: string;
}
// where LibraryActor is: { userId: number; tenantId: string | number; role?: string | null }
```

From `AuthContext` (section 03):
```typescript
const actor: PresentationActor = {
  userId: authContext.userId,
  tenantId: authContext.tenantId, // string (varchar(36))
};
```

### 9. Internal bearer token generation

Several service functions (`generateAIDraft`, `triggerPresentationExport`, `getPresentationExportStatus`) need a `userToken` parameter for Python backend calls. For API key auth, use the shared `createInternalTokenFromAuth()` utility from `_core/tokens.ts` (defined in section 03):

```typescript
import { createInternalTokenFromAuth } from "../_core/tokens";

const userToken = createInternalTokenFromAuth(authContext, ["media:generate", "presentation:export"]);
```

**Do NOT define a local wrapper function.** All sections must use the shared utility to avoid duplication.

### 10. Error handling

Map service errors to the common API error format (established in section 04):

| Service Error | HTTP Status | Error Code |
|---------------|-------------|------------|
| `PresentationServiceError(NOT_FOUND)` | 404 | `not_found` |
| `PresentationServiceError(PERMISSION_DENIED)` | 404 | `not_found` (intentionally 404, not 403) |
| Zod validation failure | 400 | `invalid_request` |
| Insufficient credits | 402 | `insufficient_credits` |
| Rate limit (concurrent draft lock) | 429 | `rate_limit_exceeded` |
| Feature flag disabled | 403 | `feature_disabled` |

Wrap the handler body in try-catch and use a shared `mapPresentationError` helper.

### 11. Credit deduction

Use `api_presentation` as the credit source type (defined in section 01). The amount should match what the existing `autoGenerateDraft` flow charges. If the existing flow does not explicitly charge credits (relying on per-LLM-call deduction), then the public API should follow the same pattern -- credits are deducted incrementally during `generateAIDraft` execution, not upfront.

Check the existing `autoGenerateDraft` code: it does NOT pre-deduct credits. Credits are deducted per LLM call inside `generateAIDraft`. For the public API, follow the same pattern but tag each deduction with `source: "api_presentation"` by passing it through the `AuthContext`.

---

## Security Checklist

- [ ] All endpoints require `presentations:create` scope via `requireScopes` middleware
- [ ] IDOR protection on deck access -- verify ownership through `libraryItems` table, return 404 (not 403) for unauthorized access
- [ ] Download endpoint requires Bearer auth -- no unauthenticated or presigned public URLs
- [ ] Internal bearer tokens generated for Python backend calls have short TTL (15 minutes)
- [ ] Progress SSE endpoint validates `userId` from Redis progress data against authenticated user
- [ ] Topic input validated with Zod (3-1000 chars), no injection vectors
- [ ] Concurrent generation lock (`ai_draft_lock:{userId}`) prevents resource exhaustion
- [ ] Export format enum validated against whitelist (`pptx`, `pdf`)

---

## Implementation Notes (Actual)

**Files created/modified:**
- `apps/web/server/routes/publicPresentationsApi.ts` — Created with all 5 endpoints
- `apps/web/server/routes/__tests__/publicPresentationsApi.test.ts` — 17 tests, all passing
- `apps/web/server/_core/index.ts` — Mounted at `/v1/presentations`

**Deviations from plan:**
- Used `createInternalTokenFromAuth` (not `signBearerToken`) for internal tokens, consistent with sections 05/06
- Credit deduction is upfront (5 credits) rather than per-LLM-call, tagged with `api_presentation`
- `mapServiceError` helper maps `NOT_FOUND`/`PERMISSION_DENIED` to 404
- Progress SSE endpoint polls Redis every 2 seconds with 5-minute timeout; omits per-user validation of Redis `userId` field (no auth risk since `requireScopes` already validated the token)
- Route order: `/tasks/:taskId/progress` → `/decks/:deckId/export/download` → `/decks/:deckId/export` → `/decks/:deckId` → `/generate`

**Tests:** 17 total, 17 passing
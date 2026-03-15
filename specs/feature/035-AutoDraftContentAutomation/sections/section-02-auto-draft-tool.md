# Section 2: builtin-auto-draft Tool (Node.js Handler)

## Overview

This section implements the HTTP endpoint at `POST /api/internal/tools/auto-draft` that wraps the existing `generateAIDraft()` pipeline for programmatic use by the Auto Draft Agent (Python/AgencySwarm). The handler validates the incoming request, resolves skill slugs to database IDs, mints a scoped JWT, constructs a `PresentationActor`, calls the blocking `generateAIDraft()` function, then gathers post-completion data from Redis and the database to build the response.

**File to create:** `apps/web/server/routers/autoDraftTool.ts`
**Test file to create:** `apps/web/server/routers/autoDraftTool.test.ts`

**Dependencies:**
- Section 01 (shared infrastructure) must be completed first. This section uses `AutoDraftRequestSchema`, `AutoDraftResponseSchema`, and the `contentAutomationGate` middleware from `apps/web/shared/contentAutomation/types.ts` and `apps/web/server/middleware/contentAutomationGate.ts`.

## Background and Existing Patterns

### Internal Endpoint Authentication

Existing internal endpoints (e.g., `/api/internal/credits/charge` at `apps/web/server/_core/index.ts:443`) authenticate via a Bearer token matched against `ENV.webGatewayToken` (sourced from `SMARTSPEC_WEB_GATEWAY_TOKEN` env var). The auto-draft tool follows this same pattern: extract `Authorization: Bearer <token>` header, compare against `ENV.webGatewayToken`, reject with 401 if missing/mismatched.

The `userId` and `tenantId` are extracted from the request body (set by the Python agent which already has this context from its own auth flow).

### Scoped JWT Minting

The `signBearerToken` function at `apps/web/server/_core/tokens.ts:47` accepts `TokenClaims` and an expiry string. The agency stream proxy (`apps/web/server/_core/agencyStreamProxy.ts:117-118`) already mints scoped tokens like:

```typescript
signBearerToken(
  { sub: auth.sub, type: "access", scopes: ["agency:run"] },
  "15m",
);
```

The auto-draft tool mints a similar token with scope `["auto-draft:execute"]` and an additional `origin: "auto-draft-agent"` claim.

### PresentationActor

Defined at `apps/web/server/services/presentationService.ts:103`:

```typescript
export interface PresentationActor extends LibraryActor {
  tenantId: string;
}
```

Where `LibraryActor` has `{ userId: number; role: string }`. The handler must construct this from the user's database record.

### generateAIDraft Signature

At `apps/web/server/services/aiPresentationService.ts:4282`:

```typescript
export async function generateAIDraft(
  input: GenerateAIDraftInput,
  actor: PresentationActor,
  userToken: string,
  taskId: string,
): Promise<void>
```

It returns `void`. Progress is stored in Redis at `ai_draft_progress:{taskId}`. The existing tRPC mutation at `apps/web/server/routers/presentation.ts:269-355` fires-and-forgets this call, but the auto-draft tool must await it (blocking) because the agent needs the result synchronously.

### GenerateAIDraftInput

Defined at `apps/web/shared/presentation/aiTypes.ts:172-227`. Key fields include: `deckId`, `expectedVersion`, `prompt`, `numSlides`, `language`, `draftSkillId`, `articleSkillId`, `imageSkillId`, `imageModel`, `canvasWidth`, `canvasHeight`, `stylePresetId`, `referenceImageUrls`, and various skill params.

### Audit Logging

Use the existing `auditLogger` from `apps/web/server/services/auditLogger.ts` (singleton exported at line 477). Import pattern: `import { auditLogger } from "../services/auditLogger"`.

## Tests First

**File:** `apps/web/server/routers/autoDraftTool.test.ts`

The test file should mock external dependencies (`generateAIDraft`, `skillRegistry`, `redis`, `db`, `signBearerToken`, `auditLogger`) and test the handler function in isolation.

### Test Cases

```
describe("autoDraftTool handler")
  describe("authentication")
    # Test: returns 401 when Authorization header is missing
    # Test: returns 401 when Bearer token does not match webGatewayToken
    # Test: returns 503 when feature flag is disabled

  describe("request validation")
    # Test: returns 400 when request body is invalid (missing topic)
    # Test: returns 400 when request body has topic shorter than 3 chars

  describe("user verification")
    # Test: returns 403 when user is deactivated
    # Test: returns 403 when user not found in database

  describe("skill slug resolution")
    # Test: resolves article_skill_slug to database skill ID via skillRegistry
    # Test: falls back to general-article-writer when slug not found, adds warning to response
    # Test: resolves media_skill_slug to database skill ID

  describe("canvas preset mapping")
    # Test: maps canvas_preset "16:9" to canvasWidth=1280, canvasHeight=720
    # Test: maps canvas_preset "9:16" to canvasWidth=720, canvasHeight=1280
    # Test: rejects unknown canvas_preset with 400

  describe("JWT minting")
    # Test: mints scoped JWT with origin claim "auto-draft-agent"
    # Test: minted JWT has scope ["auto-draft:execute"]
    # Test: minted JWT expires in 15 minutes (passes "15m" to signBearerToken)

  describe("source override")
    # Test: overrides source field regardless of what the request input contains

  describe("post-completion data gathering")
    # Test: reads Redis progress key ai_draft_progress:{taskId} for result data
    # Test: queries deck record from database for deck_id and slide_count
    # Test: returns AutoDraftResponse with correct deck_id, slide_count, credits_used

  describe("audit logging")
    # Test: emits audit log event auto_draft.started at beginning of request
    # Test: emits audit log event auto_draft.completed on success
    # Test: emits audit log event auto_draft.failed on error

  describe("rate limiting")
    # Test: returns 429 when rate limit exceeded
```

### Test Structure

Tests should use Vitest's `vi.mock()` to mock the following modules:
- `../services/aiPresentationService` (mock `generateAIDraft`)
- `../services/skillRegistry` (mock `getSkillByIdAsync` / `getByIdOrType`)
- `../services/redis` (mock `getRedisClient`)
- `../db` (mock `getDb`)
- `../_core/tokens` (mock `signBearerToken`)
- `../services/auditLogger` (mock `auditLogger`)

Create a helper function `buildMockRequest(overrides?)` that returns a mock Express `Request` object with valid defaults (correct auth header, valid body with topic, userId, tenantId).

Create a helper function `buildMockResponse()` that returns a mock Express `Response` object with chainable `status()` and `json()` methods.

## Implementation Details

### File: `apps/web/server/routers/autoDraftTool.ts`

This file exports a function `registerAutoDraftToolRoute(app: Express)` that registers the Express route. This follows the same pattern as existing internal endpoint registrations in `apps/web/server/_core/index.ts`.

### Handler Flow (step by step)

1. **Authenticate** via `Authorization: Bearer <token>` matched against `ENV.webGatewayToken`. Return 401 if invalid.

2. **Validate request body** against `AutoDraftRequestSchema` (from Section 01's shared types). Return 400 with Zod error details if invalid.

3. **Extract `userId` and `tenantId`** from the validated request body. These are set by the Python agent.

4. **Verify user is active**: Query `users` table via Drizzle for the given `userId`. If user not found or `status === "deactivated"`, return 403. This prevents zombie scheduled drafts from executing for deleted users.

5. **Check rate limit**: Use the rate limiter from Section 01. Return 429 if exceeded.

6. **Resolve `article_skill_slug`**: Call `getSkillByIdAsync(slug)` from `apps/web/server/services/skillRegistry.ts`. If not found, fall back to the slug `"general-article-writer"` and append a warning string to the response warnings array.

7. **Resolve `media_skill_slug`** similarly.

8. **Resolve `image_model_id`** via existing model registry functions.

9. **Map `canvas_preset`** string to pixel dimensions using the mapping from Section 01:
   - `"16:9"` -> `{ canvasWidth: 1280, canvasHeight: 720 }`
   - `"4:3"` -> `{ canvasWidth: 1024, canvasHeight: 768 }`
   - `"1:1"` -> `{ canvasWidth: 1080, canvasHeight: 1080 }`
   - `"9:16"` -> `{ canvasWidth: 720, canvasHeight: 1280 }`

10. **Emit `auto_draft.started` audit log** with userId, tenantId, topic.

11. **Mint a scoped internal JWT**: Call `signBearerToken` with claims `{ sub: String(userId), type: "access", scopes: ["auto-draft:execute"], origin: "auto-draft-agent" }` and expiry `"15m"`.

12. **Construct `PresentationActor`** from the user DB record: `{ userId, tenantId, role: user.role }`.

13. **Create a new deck + library item + task record**: This mirrors what the tRPC mutation does. Generate a `taskId` via `crypto.randomUUID()`. Create a library item, then a deck for that library item, then initialize the Redis progress key.

14. **Acquire auto-draft lock**: Use Redis key `ai_draft_lock:auto:{userId}` (distinct from `ai_draft_lock:{userId}` used by manual drafts) with `SET ... EX 300 NX`. If lock not acquired, return 409 (conflict).

15. **Call `generateAIDraft(input, actor, jwt, taskId)` with `await`** (blocking). The input must be constructed as a `GenerateAIDraftInput` object by mapping from the `AutoDraftRequest` fields to the `GenerateAIDraftInput` fields. Key mappings:
    - `topic` -> `prompt`
    - `article_skill_slug` resolved ID -> `articleSkillId` or `draftSkillId`
    - `media_skill_slug` resolved ID -> `imageSkillId`
    - `image_model_id` -> `imageModel`
    - Canvas dimensions from preset -> `canvasWidth`, `canvasHeight`
    - `num_slides` -> `numSlides`
    - `language` -> `language`
    - `style_preset` -> `stylePresetId`
    - `reference_image_urls` -> `referenceImageUrls`

16. **Post-completion data gathering** (since `generateAIDraft()` returns `void`):
    - Read Redis key `ai_draft_progress:{taskId}` and parse the JSON to get completion status, slide previews, and any warnings.
    - Query the `presentationDecks` table for the deck created during generation to get `deck_id` and count slides for `slide_count`.
    - Query `creditTransactions` or `providerUsageLog` filtered by the `traceId` (which equals the `taskId`) to sum up `credits_used`.

17. **Release the lock**: Delete the Redis lock key `ai_draft_lock:auto:{userId}`.

18. **Override `source`** in the response: Set it to `"agency_auto_draft:{agency_run_id}"` where `agency_run_id` comes from the request body. This ensures audit trails correctly attribute the generation.

19. **Emit `auto_draft.completed` audit log** with deck_id, credits_used, duration_ms.

20. **Return `AutoDraftResponse`** with `{ success: true, deck_id, slide_count, credits_used, warnings }`.

### Error Handling

- Wrap the `generateAIDraft()` call in try/catch.
- On error: release the Redis lock, emit `auto_draft.failed` audit log with error_type and sanitized error message (strip URLs, limit to 200 chars following existing pattern at `apps/web/server/routers/presentation.ts:324`), return `{ success: false, error: { code, message } }`.
- Sanitize error messages before including in responses: `errMsg.replace(/https?:\/\/[^\s]+/g, "[redacted]").slice(0, 200)`.

### Timeout Consideration

This is a blocking call that may take 30-180 seconds for large decks. The internal HTTP client from the Python agent should use a 300-second timeout. The handler itself does not need a timeout -- the existing lock TTL (300s auto-expire) and the `ai_draft_cancel:{taskId}` mechanism handle cleanup if the process dies mid-execution.

### Route Registration

The route should be registered in `apps/web/server/_core/index.ts` or through a dedicated registration function called from there. The pattern follows existing internal endpoints:

```typescript
// In autoDraftTool.ts, export:
export function registerAutoDraftToolRoute(app: Express): void {
  app.post("/api/internal/tools/auto-draft",
    contentAutomationGate,  // Feature flag middleware from Section 01
    async (req, res) => { /* handler logic */ }
  );
}
```

Then in `apps/web/server/_core/index.ts`, import and call `registerAutoDraftToolRoute(app)` alongside other internal route registrations.

### Key Imports

The handler file needs these imports:

- `signBearerToken` from `../_core/tokens`
- `generateAIDraft` from `../services/aiPresentationService`
- `getSkillByIdAsync` from `../services/skillRegistry`
- `getRedisClient` from `../services/redis`
- `getDb` from `../db`
- `auditLogger` from `../services/auditLogger`
- `type PresentationActor` from `../services/presentationService`
- `AutoDraftRequestSchema` from `@shared/contentAutomation/types` (Section 01)
- `contentAutomationGate` from `../middleware/contentAutomationGate` (Section 01)
- `ENV` from `../_core/env`
- `users, presentationDecks` from `../../drizzle/schema`
- `eq` from `drizzle-orm`

### Security Notes

- The handler authenticates via `ENV.webGatewayToken` matching, NOT via session cookies. This is an internal-only endpoint called by the Python backend.
- The minted JWT is short-lived (15 min) and scoped to `auto-draft:execute` only.
- All error messages are sanitized before returning to prevent information leakage.
- User verification prevents execution for deactivated accounts.
- The `source` field is always overridden server-side -- never trust the caller's value.

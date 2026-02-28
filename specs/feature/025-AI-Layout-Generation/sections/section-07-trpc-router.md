Now I have all the context I need. Let me produce the section content.

# Section 07: tRPC Router -- AI Draft Procedures

## Overview

This section adds three new tRPC procedures to the presentation router for AI draft generation: `ai.generateDraft` (mutation), `ai.getDraftProgress` (query), and `ai.cancelDraft` (mutation). These procedures form the API layer between the frontend modal (section-08) and the 6-phase orchestrator (section-06). The router validates input, manages Redis lock acquisition, initializes progress tracking, launches the background pipeline, and exposes polling/cancellation endpoints.

## Dependencies

- **Section 04 (error-codes-feature-flag):** Provides `isPresentationAIGenerationEnabled()` function and three new AI error codes (`AI_GENERATION_FAILED`, `AI_INSUFFICIENT_CREDITS`, `AI_INVALID_RESPONSE`) in `shared/presentation/constants.ts`.
- **Section 06 (orchestrator):** Provides the `generateAIDraft()` function from `server/services/aiPresentationService.ts` that runs the 6-phase pipeline.
- **Section 01 (shared-types-presets):** Provides `GenerateAIDraftInputSchema`, `AIDraftProgressSchema`, and `GenerateAIDraftOutputSchema` from `shared/presentation/aiTypes.ts`.

## Files to Modify

- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/presentation.ts` -- Add the `ai` sub-router with three new procedures.

## Files to Create

- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/presentation.ai.test.ts` -- Tests for the AI sub-router procedures.

## Existing Code Patterns

The test file and router follow established patterns already used in the codebase. Key reference files:

- **Router pattern:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/presentation.ts` -- The existing presentation router uses `protectedProcedure`, `ensureFeatureEnabled()`, `toPresentationActor()`, `resolvePresentationTenantId()`, and `mapPresentationServiceError()`. The AI procedures reuse these helpers.
- **Sub-router pattern:** The router is registered in `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts` as `presentation: presentationRouter`. The `ai` sub-router is added as a nested `router()` within the `presentationRouter` definition, accessible as `presentation.ai.generateDraft`, etc.
- **Test mock pattern:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/presentation.test.ts` uses `vi.mock("../_core/trpc", ...)` with a simplified mock that returns route handlers directly. The AI tests follow the same pattern.
- **Context shape:** `TrpcContext` (from `/home/dev/projects/SmartSpecPro/apps/web/server/_core/context.ts`) includes `user`, `userToken`, `tenantId`, and `publicUrl`. The `userToken` field is the JWT string from the bearer token or session cookie -- the orchestrator needs this for authenticated calls to `invokeLLM()` and `mediaGenerationService`.
- **Redis usage:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/redis.ts` exports `getRedisClient()` which returns an `ioredis` instance.

## Context: Availability Endpoint Extension

The existing `presentation.availability` query returns `{ enabled: boolean, errorCode?, message? }`. This section extends it to include an optional `aiGenerationEnabled` field so the frontend can check whether to show the "Draft with AI" button. This is done by modifying the `getAvailability()` helper function in `presentation.ts` to add `aiGenerationEnabled: isPresentationAIGenerationEnabled()` to the returned object.

The `presentationAvailabilitySchema` in `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/contracts.ts` needs a minor extension to accept the optional `aiGenerationEnabled` field. Making it optional (not required) preserves backward compatibility -- older clients simply ignore it.

## Architecture: How the Background Pipeline Works

The `ai.generateDraft` mutation does NOT run the pipeline synchronously. Instead:

1. The mutation validates input, checks the feature flag, acquires a Redis lock, and generates a `taskId`.
2. It initializes a Redis progress object at `ai_draft_progress:{taskId}`.
3. It calls `generateAIDraft(input, actor, userToken, taskId)` as a fire-and-forget background promise (`.catch()` to capture errors into Redis).
4. It immediately returns `{ taskId }` to the client.
5. The client polls `ai.getDraftProgress({ taskId })` every 2 seconds to get progress updates.
6. The client can call `ai.cancelDraft({ taskId })` to request cancellation.

### Redis Keys Used

| Key | TTL | Purpose |
|-----|-----|---------|
| `ai_draft_lock:{userId}` | 300s | Prevents concurrent drafts per user. Acquired with `SET key value NX EX 300`. |
| `ai_draft_progress:{taskId}` | 300s | JSON progress object updated by the orchestrator after each phase. |
| `ai_draft_cancel:{taskId}` | 300s | Set by `cancelDraft`. Checked by the orchestrator before each phase. |

---

## Tests

**Test file:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/presentation.ai.test.ts`

The tests mock the tRPC infrastructure, the orchestrator service, and Redis. They follow the same mock pattern as the existing `presentation.test.ts`.

### Mocks Required

- `../_core/trpc` -- Simplified mock: `router(routes) => routes`, `protectedProcedure` returns a chainable `.input().mutation()` / `.input().query()` mock.
- `../../services/aiPresentationService` -- Mock `generateAIDraft` as a `vi.fn()`.
- `../../services/redis` -- Mock `getRedisClient()` returning an object with `set`, `get`, `del` methods.
- Feature flag -- `process.env.PRESENTATION_AI_GENERATION_ENABLED` manipulated directly.

### Test Cases

#### E.1 ai.generateDraft

```typescript
describe("ai.generateDraft", () => {
  /**
   * Test: Returns { taskId } on valid input
   * - Set feature flag ON, mock Redis lock SET to return "OK", mock generateAIDraft
   * - Call the mutation with valid input (deckId, expectedVersion, prompt, articleSkillId)
   * - Assert returned object has a string taskId
   */

  /**
   * Test: Rejects when AI generation feature flag is OFF
   * - Set process.env.PRESENTATION_AI_GENERATION_ENABLED = "false"
   * - Call the mutation
   * - Assert throws TRPCError with code "FORBIDDEN"
   */

  /**
   * Test: Rejects when slide count would exceed PRESENTATION_LIMITS.maxSlidesPerDeck
   * - The mutation should check that existing slide count + numSlides <= 200
   * - Mock getDeck to return a deck with 195 slides, request numSlides=10
   * - Assert throws with appropriate error
   */

  /**
   * Test: Rejects when Redis lock exists (concurrent draft in progress)
   * - Mock Redis SET NX to return null (lock already held)
   * - Call the mutation
   * - Assert throws TRPCError with message about concurrent draft
   */

  /**
   * Test: Passes userToken from ctx to generateAIDraft
   * - Call the mutation with ctx.userToken = "jwt-abc"
   * - Assert generateAIDraft was called with userToken = "jwt-abc" as the third argument
   */

  /**
   * Test: Starts background pipeline (fire-and-forget)
   * - Call the mutation
   * - Assert generateAIDraft was called (but the mutation does not await its result)
   * - The mutation returns immediately with { taskId }
   */

  /**
   * Test: Initializes Redis progress object
   * - Call the mutation
   * - Assert Redis SET was called for "ai_draft_progress:{taskId}" with initial progress JSON
   */
});
```

#### E.2 ai.getDraftProgress

```typescript
describe("ai.getDraftProgress", () => {
  /**
   * Test: Returns progress object for existing taskId
   * - Mock Redis GET to return a JSON progress string with phase=3, slidesCompleted=2
   * - Call the query with { taskId }
   * - Assert returned object matches the stored progress
   */

  /**
   * Test: Returns { completed: false, error: "not_found" } for unknown taskId
   * - Mock Redis GET to return null
   * - Call the query
   * - Assert returned object has completed=false and error contains "not_found"
   */
});
```

#### E.3 ai.cancelDraft

```typescript
describe("ai.cancelDraft", () => {
  /**
   * Test: Sets Redis cancel flag for valid taskId
   * - Mock Redis GET for progress key to return a progress JSON with userId matching ctx.user.id
   * - Call the mutation with { taskId }
   * - Assert Redis SET was called for "ai_draft_cancel:{taskId}" with TTL 300
   * - Assert returns { success: true }
   */

  /**
   * Test: Returns { success: false } for unknown taskId
   * - Mock Redis GET for progress key to return null
   * - Call the mutation
   * - Assert returns { success: false }
   */

  /**
   * Test: Returns { success: false } for already-completed task
   * - Mock Redis GET to return progress JSON with completed=true
   * - Call the mutation
   * - Assert returns { success: false }
   */

  /**
   * Test: Rejects when taskId belongs to different user
   * - Mock Redis GET to return progress JSON with userId=999 (different from ctx.user.id=1)
   * - Call the mutation as user id=1
   * - Assert returns { success: false } or throws appropriate error
   */
});
```

#### E.4 Error Mapping

```typescript
describe("AI error mapping", () => {
  /**
   * Test: AI_GENERATION_FAILED maps to INTERNAL_SERVER_ERROR
   * - Throw a PresentationServiceError with code AI_GENERATION_FAILED from generateAIDraft
   *   (simulated at the router level)
   * - Assert mapPresentationServiceError produces TRPCError with code INTERNAL_SERVER_ERROR
   */

  /**
   * Test: AI_INSUFFICIENT_CREDITS maps to PRECONDITION_FAILED
   * - Throw a PresentationServiceError with code AI_INSUFFICIENT_CREDITS
   * - Assert mapPresentationServiceError produces TRPCError with code PRECONDITION_FAILED
   */
});
```

---

## Implementation Details

### 1. Extend `mapPresentationServiceError` in `presentation.ts`

Add two new error code mappings to the existing `mapPresentationServiceError` function.

**Location:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/presentation.ts`, inside the `mapPresentationServiceError` function (currently around line 141).

Add these cases before the final fallback `return`:

```typescript
if (error.code === PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED
    || error.code === PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE) {
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
}

if (error.code === PRESENTATION_ERROR_CODE.AI_INSUFFICIENT_CREDITS) {
  return new TRPCError({ code: "PRECONDITION_FAILED", message: error.message });
}
```

This requires that section-04 has already added `AI_GENERATION_FAILED`, `AI_INSUFFICIENT_CREDITS`, and `AI_INVALID_RESPONSE` to the `PRESENTATION_ERROR_CODE` object.

### 2. Add `ensureAIGenerationEnabled` helper

Add a new helper function near the existing `ensureFeatureEnabled()`:

```typescript
function ensureAIGenerationEnabled(): void {
  if (isPresentationAIGenerationEnabled()) {
    return;
  }
  throw new PresentationServiceError(
    PRESENTATION_ERROR_CODE.FEATURE_DISABLED,
    `${PRESENTATION_ERROR_CODE.FEATURE_DISABLED}: AI presentation generation is disabled`,
  );
}
```

This requires importing `isPresentationAIGenerationEnabled` from `@shared/presentation/constants` (added by section-04).

### 3. Extend `getAvailability` helper

Modify the existing `getAvailability()` function to include the AI generation flag status:

```typescript
function getAvailability(): PresentationAvailability {
  if (!isPresentationFeatureEnabled()) {
    return {
      enabled: false,
      errorCode: PRESENTATION_ERROR_CODE.FEATURE_DISABLED,
      message: "Presentation editor is currently disabled.",
    };
  }

  return {
    enabled: true,
    aiGenerationEnabled: isPresentationAIGenerationEnabled(),
  };
}
```

This also requires extending `presentationAvailabilitySchema` in `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/contracts.ts` to accept the optional field:

```typescript
export const presentationAvailabilitySchema = z.object({
  enabled: z.boolean(),
  errorCode: z.enum(PRESENTATION_ERROR_CODE_VALUES).optional(),
  message: z.string().optional(),
  aiGenerationEnabled: z.boolean().optional(),
});
```

And updating the `PresentationAvailability` type export (already derived from the schema via `z.infer`).

### 4. Add the `ai` sub-router to `presentationRouter`

Add new imports at the top of `presentation.ts`:

```typescript
import crypto from "node:crypto";
import { getRedisClient } from "../services/redis";
import { generateAIDraft } from "../services/aiPresentationService";
import {
  GenerateAIDraftInputSchema,
  AIDraftProgressSchema,
} from "@shared/presentation/aiTypes";
import {
  isPresentationAIGenerationEnabled,
} from "@shared/presentation/constants";
import { PRESENTATION_LIMITS } from "@shared/presentation/constants";
```

Then add the `ai` sub-router as a nested router within the `presentationRouter` definition:

```typescript
export const presentationRouter = router({
  availability: protectedProcedure.query(() => {
    return presentationAvailabilitySchema.parse(getAvailability());
  }),

  ai: router({
    generateDraft: protectedProcedure
      .input(GenerateAIDraftInputSchema)
      .mutation(async ({ input, ctx }) => {
        // 1. Check both feature flags
        // 2. Resolve actor and tenant
        // 3. Check slide count limit (existing + requested <= maxSlidesPerDeck)
        // 4. Acquire Redis lock: SET ai_draft_lock:{userId} taskId NX EX 300
        // 5. Generate taskId via crypto.randomUUID()
        // 6. Initialize Redis progress: SET ai_draft_progress:{taskId} {initial JSON} EX 300
        // 7. Capture userToken from ctx.userToken
        // 8. Fire-and-forget: generateAIDraft(input, actor, userToken, taskId).catch(...)
        // 9. Return { taskId }
      }),

    getDraftProgress: protectedProcedure
      .input(z.object({ taskId: z.string().min(1).max(128) }))
      .query(async ({ input }) => {
        // 1. GET ai_draft_progress:{taskId} from Redis
        // 2. If null, return { completed: false, error: "not_found" }
        // 3. Parse and return progress object
      }),

    cancelDraft: protectedProcedure
      .input(z.object({ taskId: z.string().min(1).max(128) }))
      .mutation(async ({ input, ctx }) => {
        // 1. GET ai_draft_progress:{taskId} from Redis
        // 2. If null or already completed: return { success: false }
        // 3. Verify userId matches ctx.user.id (ownership check)
        // 4. SET ai_draft_cancel:{taskId} "1" EX 300
        // 5. Return { success: true }
      }),
  }),

  // ... all existing procedures unchanged ...
});
```

### 5. generateDraft Procedure Logic Detail

The mutation handler follows this sequence:

1. **Feature flag check:** Call `ensureFeatureEnabled()` (main editor flag) and `ensureAIGenerationEnabled()` (AI-specific flag). Both must pass.

2. **Actor resolution:** Call `toPresentationActor(ctx)` to get `{ userId, tenantId, role }`.

3. **Slide count check:** Query the current deck to get existing slide count. Verify `existingSlideCount + input.numSlides <= PRESENTATION_LIMITS.maxSlidesPerDeck`. If it exceeds the limit, throw `PresentationServiceError` with code `SLIDE_LIMIT_EXCEEDED`.

4. **Redis lock acquisition:** Use `getRedisClient()` to call `SET ai_draft_lock:{actor.userId} taskId NX EX 300`. If the result is `null` (lock exists), throw a TRPCError with message "AI draft already in progress for this user".

5. **Task ID:** Generate via `crypto.randomUUID()`.

6. **Initialize progress:** Store the initial progress JSON in Redis at `ai_draft_progress:{taskId}` with `EX 300`:
   ```json
   {
     "userId": 77,
     "phase": 0,
     "phaseLabel": "Starting...",
     "slidesCompleted": 0,
     "totalSlides": 5,
     "slidePreview": [],
     "completed": false
   }
   ```
   Note: `userId` is stored in the progress object so `cancelDraft` can verify ownership.

7. **Capture userToken:** Read `ctx.userToken` (the JWT from the authenticated request). This is passed to the orchestrator for downstream authenticated calls.

8. **Fire-and-forget pipeline:**
   ```typescript
   generateAIDraft(input, actor, ctx.userToken!, taskId).catch(async (err) => {
     // On uncaught error, update Redis progress with error state
     const redis = getRedisClient();
     const errorProgress = JSON.stringify({
       ...initialProgress,
       completed: true,
       error: { code: "AI_GENERATION_FAILED", message: err.message },
     });
     await redis.set(`ai_draft_progress:${taskId}`, errorProgress, "EX", 300);
     // Release lock
     await redis.del(`ai_draft_lock:${actor.userId}`);
   });
   ```

9. **Return:** `{ taskId }`.

### 6. getDraftProgress Procedure Logic Detail

1. Read `ai_draft_progress:{taskId}` from Redis via `GET`.
2. If the value is `null`, return `{ completed: false, phase: 0, phaseLabel: "Unknown", slidesCompleted: 0, totalSlides: 0, slidePreview: [], error: { code: "not_found", message: "Draft progress not found" } }`.
3. Parse the JSON string and return it. The orchestrator (section-06) keeps this object updated after each phase.

### 7. cancelDraft Procedure Logic Detail

1. Read `ai_draft_progress:{taskId}` from Redis.
2. If `null`: return `{ success: false }`.
3. Parse the progress JSON. If `progress.completed === true`: return `{ success: false }`.
4. If `progress.userId !== ctx.user.id`: return `{ success: false }` (ownership check -- prevents users from cancelling other users' drafts).
5. Set the cancel flag: `SET ai_draft_cancel:{taskId} "1" EX 300`.
6. Return `{ success: true }`.

### 8. Contracts Extension (Minor)

In `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/contracts.ts`, extend the availability schema to accept the optional `aiGenerationEnabled` boolean:

```typescript
export const presentationAvailabilitySchema = z.object({
  enabled: z.boolean(),
  errorCode: z.enum(PRESENTATION_ERROR_CODE_VALUES).optional(),
  message: z.string().optional(),
  aiGenerationEnabled: z.boolean().optional(),
});
```

This is a backward-compatible change -- existing consumers that do not read `aiGenerationEnabled` are unaffected.

### 9. Non-Empty Deck Warning

The tRPC mutation intentionally does NOT block non-empty decks. If the deck already has slides, the AI-generated slides are appended at the end. The **client** (section-08) shows a warning dialog before calling the mutation if `currentSlideCount > 0`. The server simply appends.

---

## TODO Checklist

1. Write test file `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/presentation.ai.test.ts` with all test cases described above.
2. Extend `presentationAvailabilitySchema` in `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/contracts.ts` to add `aiGenerationEnabled: z.boolean().optional()`.
3. In `/home/dev/projects/SmartSpecPro/apps/web/server/routers/presentation.ts`:
   a. Add imports for `crypto`, `getRedisClient`, `generateAIDraft`, `GenerateAIDraftInputSchema`, `isPresentationAIGenerationEnabled`.
   b. Add `ensureAIGenerationEnabled()` helper function.
   c. Modify `getAvailability()` to include `aiGenerationEnabled`.
   d. Extend `mapPresentationServiceError()` with AI error code mappings.
   e. Add the `ai` sub-router with `generateDraft`, `getDraftProgress`, and `cancelDraft` procedures.
4. Run tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run server/routers/__tests__/presentation.ai.test.ts`.
5. Run the existing presentation router tests to verify no regressions: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run server/routers/presentation.test.ts`.
6. Run typecheck: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check`.
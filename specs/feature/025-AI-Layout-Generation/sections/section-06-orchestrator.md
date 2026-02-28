I now have sufficient context to write the section. Let me compose the complete section-06 content.

# Section 06: 6-Phase Pipeline Orchestrator

## Overview

This section implements the central orchestration service for AI presentation generation. The service coordinates a 6-phase pipeline that transforms a user topic into a complete slide deck with AI-generated content, images, and styled layouts. It runs as a background task (fire-and-forget from the tRPC mutation in section-07), updating Redis progress at each step so the frontend can poll for status.

**New file:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationService.ts`
**Test file:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/aiPresentationService.test.ts`

## Dependencies on Other Sections

This section depends on artifacts from sections 01, 02, 03, and 05. You do not need to read those sections, but the following interfaces must exist before implementing this section:

- **Section 01 (shared types):** `GenerateAIDraftInput`, `AIPresentationSlide`, `AIDraftProgress`, `AI_LAYOUT_TEMPLATE_IDS` from `@shared/presentation/aiTypes.ts`; `getBuiltInPreset()` from `@shared/presentation/aiStylePresets.ts`; `pickRandomSvgFromCategory()` from `@shared/presentation/svgGraphicsCatalog.ts`
- **Section 02 (callLLMStructured):** `callLLMStructured()` from `server/services/callLLMStructured.ts`
- **Section 03 (layout engine):** `generateSlide()` (the layout engine function) from `server/services/aiPresentationLayoutEngine.ts`
- **Section 05 (built-in skills):** Article-writer skill.md files in `apps/web/skills/` (needed for E2E testing, not for unit tests since skillRegistry is mocked)

## Background: Pipeline Architecture

```
User Input (topic, articleSkillId, imageSkillId, stylePresetId)
    |
    v
Phase 1: skillRegistry.getSkillByIdAsync(articleSkillId) -> invokeLLM(systemPrompt, topic) -> article text
    |
    v
Phase 2: callLLMStructured(splitPrompt, article) -> AIPresentationSlide[]
    |
    v
Phase 3+4: Per-slide concurrent (max concurrency 3):
  Phase 3: skillRegistry.getSkillByIdAsync(imageSkillId) -> invokeLLM(systemPrompt, keywords) -> enhanced prompt
           (fallback: raw keywords on LLM failure)
  Phase 4: mediaGenerationService.generateImageAsync({prompt}) -> poll getTask() -> imageUrl
           (fallback: null on timeout -> placeholder rect in layout)
    |
    v
Phase 5: layoutEngine.generateSlide(slideData, imageUrl, svg, stylePreset) x N slides
    |
    v
Phase 6: DB transaction { addSlideToDeck(deckId, slideContent, version++) x N } (sequential)
```

Cancellation is checked before each phase and between slides in the Phase 3+4 loop via a Redis key `ai_draft_cancel:{taskId}`.

## Existing Services Used

The orchestrator integrates with these existing services. All are mocked in tests.

**`invokeLLM`** (from `server/_core/llm.ts`): Low-level LLM call. Accepts `InvokeParams` with `messages` array. Returns `InvokeResult` with `choices[0].message.content` (string) and `usage` (token counts). This is the raw gateway -- it does NOT handle credits or provider routing on its own. The plan references `invokeLLM` with `userId` and `tenantId` parameters, but the actual `invokeLLM` in `server/_core/llm.ts` only accepts `InvokeParams` (messages, tools, etc.). Credit deduction must be handled separately using `deductCreditsForModel` from `creditService.ts`, or the orchestrator can use the higher-level routing in `llmRouter.ts` via `executeWithFallback()`. The implementation should choose the approach that correctly tracks credits.

**`skillRegistry`** (from `server/services/skillRegistry.ts`): `getSkillByIdAsync(id)` returns a `SkillDefinition` with `systemPrompt`, `executionMode`, `name`, etc. The key insight: for `llm-only` execution mode, `executeSkill()` does NOT call the LLM -- it echoes back the prompt. The orchestrator must call `invokeLLM` directly after loading the skill's system prompt.

**`MediaGenerationService`** (from `server/services/mediaGenerationService.ts`): Singleton `mediaGenerationService`. Key methods:
- `generateImageAsync(request, userToken)` -> `Promise<MediaTask>` (returns task with `id` and `status`)
- `getTask(taskId, userToken)` -> `Promise<MediaTask>` (poll for status; check `status === "completed"` and read `resultUrl`)

**`addSlideToDeck`** (from `server/services/presentationService.ts`): Inserts a slide into a deck with optimistic locking via `expectedVersion`. Accepts optional `dbClient` parameter to run inside an existing transaction. Signature: `addSlideToDeck(input: AddPresentationSlideInput, actor: PresentationActor, dbClient?: DbClient)`.

**`PresentationActor`** (from `server/services/presentationService.ts`): `{ userId: number; tenantId: string; role: string }`.

**`hasEnoughCredits`** (from `server/services/creditService.ts`): `hasEnoughCredits(userId, amount)` -> `Promise<boolean>`.

**`getRedisClient`** (from `server/services/redis.ts`): Returns an `ioredis` Redis instance.

**`auditLogger`** (from `server/services/auditLogger.ts`): `auditLogger.log(entry: AuditLogEntry)` for structured JSONL logging.

**`getDb`** (from `server/db.ts`): Returns the Drizzle DB client. Supports `db.transaction(async (tx) => { ... })`.

## Tests

All tests go in `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/aiPresentationService.test.ts`.

### Mock Setup

The test file must mock all external dependencies using `vi.hoisted()` + `vi.mock()`. Each test uses `vi.clearAllMocks()` in `beforeEach`. The mocks include:

- `invokeLLM` from `../../_core/llm` -- mock to return a valid `InvokeResult`
- `callLLMStructured` from `../callLLMStructured` -- mock to return parsed slide data
- `getSkillByIdAsync` from `../skillRegistry` -- mock to return a `SkillDefinition` with a `systemPrompt`
- `mediaGenerationService` from `../mediaGenerationService` -- mock `generateImageAsync` and `getTask`
- `addSlideToDeck` from `../presentationService` -- mock to resolve successfully
- `getRedisClient` from `../redis` -- mock the Redis client methods (`set`, `get`, `del`, `expire`)
- `hasEnoughCredits` from `../creditService` -- mock to return `true`
- `auditLogger` from `../auditLogger` -- mock `log` as a no-op
- `getDb` from `../../db` -- mock to return a db object with a `transaction` method
- `getBuiltInPreset` from `@shared/presentation/aiStylePresets` -- mock to return a valid preset
- `pickRandomSvgFromCategory` from `@shared/presentation/svgGraphicsCatalog` -- mock to return a valid SVG
- `generateSlide` (the layout engine) from `../aiPresentationLayoutEngine` -- mock to return valid slide content

Create a `buildMockInput()` helper that returns a valid `GenerateAIDraftInput` with default values (deckId: 1, expectedVersion: 0, prompt: "Test topic", numSlides: 3, language: "en", articleSkillId: "general-article-writer", stylePresetId: "dark-professional").

Create a `buildMockActor()` helper that returns a valid `PresentationActor` (userId: 1, tenantId: "test-tenant", role: "user").

### D.1 Happy Path

```typescript
describe("generateAIDraft - happy path", () => {
  // Test: Full pipeline (3 slides) completes successfully -- all 6 phases run in order
  // Assert: invokeLLM called for Phase 1 (article), callLLMStructured called for Phase 2,
  //   invokeLLM called N times for Phase 3 (image enhancement), generateImageAsync called N times,
  //   generateSlide called N times, addSlideToDeck called N times inside a transaction
  // Assert: Redis progress updated to completed=true with correct slidesAdded count

  // Test: Redis progress is updated after each phase
  // Assert: Redis SET called with progress JSON containing phase=1, then phase=2, etc.

  // Test: Final progress shows completed=true with correct slidesAdded count
  // Assert: Final Redis SET includes { completed: true, result: { slidesAdded: 3, newDeckVersion: 3 } }
});
```

### D.2 Phase 1 (Article Generation)

```typescript
describe("generateAIDraft - Phase 1", () => {
  // Test: Loads skill definition via getSkillByIdAsync(articleSkillId)
  // Assert: getSkillByIdAsync called with "general-article-writer"

  // Test: Calls invokeLLM with skill's system prompt + user topic
  // Assert: invokeLLM called with messages containing systemPrompt from the loaded skill
  //   and a user message built from input.prompt + input.language + input.numSlides

  // Test: Fails immediately when invokeLLM throws -- sets Redis error, returns
  // Setup: invokeLLM.mockRejectedValueOnce(new Error("LLM unavailable"))
  // Assert: Redis progress set with error, no Phase 2+ calls made

  // Test: Does NOT call executeSkill()
  // Assert: no import or call to executeSkill anywhere in the function
});
```

### D.3 Phase 2 (Split)

```typescript
describe("generateAIDraft - Phase 2", () => {
  // Test: Calls callLLMStructured with article text
  // Assert: callLLMStructured called with the article text from Phase 1 output

  // Test: Slide 1 templateId is forced to hero_center even if LLM returns different
  // Setup: callLLMStructured returns slides where slide[0].templateId = "split_right_image"
  // Assert: After processing, slide[0].templateId === "hero_center"

  // Test: Validates split output with AIPresentationSchema
  // Assert: callLLMStructured called with zodSchema that matches AIPresentationSlide array
});
```

### D.4 Phase 3+4 (Image Enhancement + Generation)

```typescript
describe("generateAIDraft - Phase 3+4", () => {
  // Test: Runs slides concurrently with max concurrency of 3
  // Assert: For 5 slides, generateImageAsync called 5 times total;
  //   verify concurrency behavior through timing or mock call ordering

  // Test: Loads image skill via getSkillByIdAsync when imageSkillId provided
  // Setup: input.imageSkillId = "image-prompt-engineer"
  // Assert: getSkillByIdAsync called with "image-prompt-engineer"

  // Test: Calls invokeLLM for image prompt enhancement
  // Assert: invokeLLM called with image skill system prompt + slide.imagePromptKeywords

  // Test: Falls back to raw keywords when image skill LLM call fails
  // Setup: invokeLLM rejects for image enhancement
  // Assert: generateImageAsync still called with raw slide.imagePromptKeywords as prompt

  // Test: Calls generateImageAsync for each slide
  // Assert: mediaGenerationService.generateImageAsync called N times with prompt and "16:9" aspect ratio

  // Test: Polls MediaTask status until completion
  // Setup: getTask returns status="processing" then "completed" with resultUrl
  // Assert: getTask called multiple times for the same task

  // Test: Sets imageUrl=null on MediaTask timeout (15s)
  // Setup: getTask always returns status="processing"
  // Assert: After timeout, imageUrl is null; pipeline continues with remaining slides

  // Test: Updates Redis slidesCompleted after each slide
  // Assert: Redis SET called with incrementing slidesCompleted values
});
```

### D.5 Phase 6 (Insertion)

```typescript
describe("generateAIDraft - Phase 6", () => {
  // Test: All slides inserted within a single database transaction
  // Assert: getDb().transaction called once; addSlideToDeck called inside tx callback

  // Test: Version increments sequentially starting from current deck version
  // Assert: addSlideToDeck called with expectedVersion 0, 1, 2 for 3 slides

  // Test: Transaction rolls back on version conflict -- no partial slides
  // Setup: addSlideToDeck throws PresentationServiceError("VERSION_CONFLICT") on slide 2
  // Assert: Transaction rejects, Redis progress set with error

  // Test: Redis progress updated with final result on success
  // Assert: Redis SET with completed=true, result.slidesAdded matching slide count
});
```

### D.6 Error Handling

```typescript
describe("generateAIDraft - error handling", () => {
  // Test: Phase 1 failure stops entire pipeline immediately
  // Setup: invokeLLM rejects on first call (article generation)
  // Assert: callLLMStructured never called, generateImageAsync never called

  // Test: Phase 3 failure for one slide uses raw keywords (continues)
  // Setup: invokeLLM rejects on second call (image enhancement for slide 1)
  // Assert: generateImageAsync still called for that slide with raw keywords

  // Test: Phase 4 failure for one slide uses placeholder (continues)
  // Setup: getTask returns status="failed" for slide 1
  // Assert: generateSlide called with imageUrl=null for that slide

  // Test: Credit pre-check fails before pipeline starts
  // Setup: hasEnoughCredits returns false
  // Assert: Redis progress set with error code AI_INSUFFICIENT_CREDITS, no LLM calls made

  // Test: Mid-pipeline credit exhaustion reports partial results
  // Setup: invokeLLM succeeds for Phase 1, then rejects with credit error for Phase 3
  // Assert: Pipeline continues with fallback for affected slides
});
```

### D.7 Cancellation

```typescript
describe("generateAIDraft - cancellation", () => {
  // Test: Pipeline stops when ai_draft_cancel:{taskId} is set before Phase 2
  // Setup: Redis GET for cancel key returns "1" after Phase 1 completes
  // Assert: callLLMStructured never called

  // Test: Pipeline stops between slides in Phase 3+4 loop
  // Setup: Cancel key set after first slide image completes
  // Assert: Remaining slides not processed

  // Test: Cancelled progress shows completed=true, cancelled=true
  // Assert: Final Redis SET includes { completed: true, cancelled: true, phaseLabel: "Cancelled" }

  // Test: Redis lock is released on cancellation
  // Assert: Redis DEL called for ai_draft_lock:{userId}
});
```

### D.8 Concurrency Control

```typescript
describe("generateAIDraft - concurrency control", () => {
  // Test: Redis lock acquired at start, released on completion
  // Assert: Redis SET with NX EX called at start, DEL called at end

  // Test: Redis lock acquired at start, released on error
  // Setup: Pipeline fails mid-way
  // Assert: DEL called for lock key in finally block

  // Test: Second concurrent request rejected when lock exists
  // Setup: Redis SET NX returns null (lock already held)
  // Assert: Function rejects/sets error without starting pipeline

  // Test: Lock heartbeat renews TTL every 30s
  // Assert: setInterval created; Redis EXPIRE called for lock key
  //   (use vi.useFakeTimers + vi.advanceTimersByTime to verify heartbeat)
});
```

### D.9 Credit Estimation

```typescript
describe("generateAIDraft - credit estimation", () => {
  // Test: Pre-check estimate includes 20% buffer
  // Assert: hasEnoughCredits called with amount = (30 + 10 + 75*N + 40*N) * 1.2

  // Test: Pre-check uses correct formula: article(30) + split(10) + imageSkill*N(75) + imageGen*N(40)
  // Setup: input.numSlides = 5
  // Assert: hasEnoughCredits called with (30 + 10 + 75*5 + 40*5) * 1.2 = 738
});
```

## Implementation Details

### File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationService.ts`

#### Exports

The module exports one main function and several helpers:

```typescript
/**
 * Runs the 6-phase AI presentation generation pipeline as a background task.
 * Called from the tRPC mutation (section-07). Updates Redis progress at each step.
 * Does NOT return a value -- writes results to Redis progress key.
 */
export async function generateAIDraft(
  input: GenerateAIDraftInput,
  actor: PresentationActor,
  userToken: string,
  taskId: string,
): Promise<void>
```

```typescript
/**
 * Estimates total credit cost for the pipeline.
 * Formula: (article:30 + split:10 + imageSkill*N:75 + imageGen*N:40) * 1.2 buffer
 */
export function estimateCreditCost(numSlides: number): number
```

```typescript
/**
 * Builds the article generation prompt from user input.
 */
export function buildArticlePrompt(
  topic: string,
  language: string,
  numSlides: number,
): string
```

#### Internal Structure

The `generateAIDraft` function follows this structure:

1. **Credit pre-check:** Call `hasEnoughCredits(actor.userId, estimateCreditCost(input.numSlides))`. If insufficient, set Redis progress with `error: { code: "AI_INSUFFICIENT_CREDITS", message: "..." }` and return.

2. **Redis lock acquisition:** Call `redis.set("ai_draft_lock:" + actor.userId, taskId, "NX", "EX", 300)`. If the result is null (lock exists), set Redis progress error "Draft already in progress" and return.

3. **Heartbeat setup:** Start a `setInterval` every 30 seconds that calls `redis.expire("ai_draft_lock:" + actor.userId, 300)` to renew the lock TTL.

4. **try/catch/finally:** The entire pipeline runs inside a try block. The finally block always:
   - Clears the heartbeat interval
   - Deletes the Redis lock key
   
5. **Cancellation check helper:**
   ```typescript
   async function isCancelled(): Promise<boolean> {
     const val = await redis.get(`ai_draft_cancel:${taskId}`);
     return val !== null;
   }
   ```
   Called before each phase and before each slide in the Phase 3+4 loop.

6. **Progress update helper:**
   ```typescript
   async function updateProgress(progress: Partial<AIDraftProgress>): Promise<void> {
     const current = /* merge with existing progress */;
     await redis.set(
       `ai_draft_progress:${taskId}`,
       JSON.stringify(current),
       "EX",
       300,
     );
   }
   ```

#### Phase 1 -- Article Generation

```typescript
// 1. Load skill
const articleSkill = await getSkillByIdAsync(input.articleSkillId);
if (!articleSkill?.systemPrompt) {
  throw new Error(`Skill not found: ${input.articleSkillId}`);
}

// 2. Build messages
const messages: Message[] = [
  { role: "system", content: articleSkill.systemPrompt },
  { role: "user", content: buildArticlePrompt(input.prompt, input.language, input.numSlides) },
];

// 3. Call LLM (30s timeout via AbortController or Promise.race)
const result = await invokeLLM({ messages });

// 4. Extract article text
const articleText = extractTextContent(result.choices[0].message.content);
```

Key point: The `invokeLLM` in this codebase (`server/_core/llm.ts`) is a raw gateway. It does not accept `userId`/`tenantId`. Credit deduction for the article call must happen separately -- either by calling `deductCreditsForModel()` after `invokeLLM`, or by using `executeWithFallback()` from `llmRouter.ts` which integrates with the credit system. The implementation should use the approach that correctly integrates with audit logging and credits. A practical approach: call `invokeLLM` for the raw LLM call, then call `deductCreditsForModel` with the token usage from the response. Alternatively, keep credit management simple for the MVP by just tracking the total credits used across the pipeline.

If `invokeLLM` throws, catch the error, set Redis progress to `{ completed: true, error: { code: "AI_GENERATION_FAILED", message: error.message } }`, and return immediately (no Phase 2+).

#### Phase 2 -- Article to Slide Split

```typescript
const splitResult = await callLLMStructured({
  systemPrompt: SLIDE_SPLIT_SYSTEM_PROMPT, // hardcoded prompt instructing the LLM
  userMessage: articleText,
  zodSchema: z.array(AIPresentationSlideSchema),
  userId: actor.userId,
  tenantId: actor.tenantId,
});

let slides: AIPresentationSlide[] = splitResult.data;

// Force slide 1 to hero_center
if (slides.length > 0 && slides[0].templateId !== "hero_center") {
  slides[0] = { ...slides[0], templateId: "hero_center" };
}
```

The `SLIDE_SPLIT_SYSTEM_PROMPT` is a constant string defined in the same file. It instructs the LLM to split an article into N slides, producing JSON with fields: `templateId`, `title`, `body` (array of strings), `graphicCategory`, `imagePromptKeywords`. It should reference the allowed template IDs from `AI_LAYOUT_TEMPLATE_IDS`.

Truncate the article to 2000 words before sending to Phase 2 to prevent token overflow.

#### Phase 3+4 -- Image Enhancement and Generation (Concurrent)

Use a manual concurrency limiter (since `p-map` is not in the project dependencies). A simple approach is to process slides in batches of 3, or implement a semaphore-based concurrency limiter.

For each slide (concurrent, max 3 at a time):

```typescript
// Phase 3: Image prompt enhancement (optional)
let imagePrompt = slide.imagePromptKeywords;
if (input.imageSkillId) {
  try {
    const imageSkill = await getSkillByIdAsync(input.imageSkillId);
    if (imageSkill?.systemPrompt) {
      const enhanceResult = await invokeLLM({
        messages: [
          { role: "system", content: imageSkill.systemPrompt },
          { role: "user", content: slide.imagePromptKeywords },
        ],
      });
      imagePrompt = extractTextContent(enhanceResult.choices[0].message.content);
    }
  } catch {
    // Fallback: use raw keywords, add warning
    warnings.push(`Slide ${i+1}: image prompt enhancement failed, using raw keywords`);
  }
}

// Phase 4: Image generation
let imageUrl: string | null = null;
try {
  const mediaTask = await mediaGenerationService.generateImageAsync(
    { prompt: imagePrompt, model: input.imageModel || "flux-2.0", aspectRatio: "16:9" },
    userToken,
  );
  // Poll for completion (2s interval, 15s timeout)
  imageUrl = await pollMediaTask(mediaTask.id, userToken, 15000);
} catch {
  // Fallback: null imageUrl (layout engine will use placeholder rect)
  warnings.push(`Slide ${i+1}: image generation failed`);
}
```

The `pollMediaTask` helper:

```typescript
async function pollMediaTask(
  mediaTaskId: string,
  userToken: string,
  timeoutMs: number,
): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const task = await mediaGenerationService.getTask(mediaTaskId, userToken);
    if (task.status === "completed" && task.resultUrl) {
      return task.resultUrl;
    }
    if (task.status === "failed" || task.status === "cancelled") {
      return null;
    }
    await sleep(2000);
  }
  return null; // timeout
}
```

#### Phase 5 -- Layout Compilation

```typescript
const preset = getBuiltInPreset(input.stylePresetId);
if (!preset) {
  throw new Error(`Unknown style preset: ${input.stylePresetId}`);
}

// Override footer custom text if provided
if (input.footerCustomText && preset.footer) {
  preset.footer.customText = input.footerCustomText;
  preset.footer.showCustomText = true;
}

const compiledSlides: PresentationSlideContent[] = [];
for (let i = 0; i < slides.length; i++) {
  const svg = pickRandomSvgFromCategory(slides[i].graphicCategory);
  const { slideContent, warnings: layoutWarnings } = generateSlide({
    slideData: slides[i],
    imageUrl: imageUrls[i],
    svgGraphic: svg,
    stylePreset: preset,
    deckTitle: input.prompt.slice(0, 50),
    slideIndex: i,
    totalSlides: slides.length,
  });
  compiledSlides.push(slideContent);
  warnings.push(...layoutWarnings);
}
```

#### Phase 6 -- Deck Insertion (Transaction)

Follow the same transaction pattern used by `presentationImportService.ts`:

```typescript
const db = await getDb();
if (!db) throw new Error("Database not available");

await db.transaction(async (tx) => {
  let expectedVersion = input.expectedVersion;
  for (const slideContent of compiledSlides) {
    await addSlideToDeck(
      { deckId: input.deckId, expectedVersion, slideContent },
      actor,
      tx as any, // PgTransaction is compatible with DbClient
    );
    expectedVersion++;
  }
});
```

On success, update Redis progress:
```typescript
await updateProgress({
  phase: 6,
  phaseLabel: "Complete",
  completed: true,
  slidesCompleted: compiledSlides.length,
  totalSlides: compiledSlides.length,
  result: {
    slidesAdded: compiledSlides.length,
    newDeckVersion: input.expectedVersion + compiledSlides.length,
    articlePreview: articleText.slice(0, 200),
    warnings,
  },
});
```

On version conflict or other DB error, update Redis with error and re-throw (the finally block will clean up the lock).

#### Audit Events

Emit audit events via `auditLogger.log()` at key points:

- `ai_draft_request` -- when the pipeline starts (include input summary, skillIds, presetId)
- `ai_draft_article_done` -- after Phase 1 (article length, skill used, latency)
- `ai_draft_split_done` -- after Phase 2 (slide count, latency)
- `ai_draft_image_enhance` -- per slide in Phase 3 (raw vs enhanced prompt)
- `ai_draft_image_done` / `ai_draft_image_failed` -- per slide in Phase 4
- `ai_draft_complete` / `ai_draft_failed` -- final status

Since the `AuditEventType` union in `auditLogger.ts` does not include these new event types, the implementation should either:
1. Add the new event types to the `AuditEventType` union in `auditLogger.ts`, or
2. Use a generic event type like `"skill_execute"` with distinguishing metadata

The cleaner approach is option 1 -- extend the union. This is a minor modification to `/home/dev/projects/SmartSpecPro/apps/web/server/services/auditLogger.ts` (add the new string literals to the `AuditEventType` type).

#### Concurrency Limiter

Since `p-map` is not a project dependency, implement a simple concurrency limiter:

```typescript
async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  /** Process items with bounded concurrency using a semaphore pattern */
  // ...implementation using Promise-based semaphore or chunked batches
}
```

Alternatively, install `p-map` as a dependency. The section leaves this as an implementation choice -- either is acceptable.

#### Redis Progress Schema

The progress object stored in Redis follows `AIDraftProgress` from section-01:

```typescript
{
  phase: number;           // 1-6
  phaseLabel: string;      // e.g. "Writing article...", "Generating images..."
  slidesCompleted: number;
  totalSlides: number;
  slidePreview: Array<{
    title: string;
    imageStatus: "pending" | "generating" | "done" | "failed";
  }>;
  completed: boolean;
  cancelled?: boolean;
  result?: {
    slidesAdded: number;
    newDeckVersion: number;
    articlePreview: string;
    warnings: string[];
  };
  error?: {
    code: string;
    message: string;
  };
  userId: number;          // stored for ownership verification by cancelDraft
}
```

The `userId` field is included so the tRPC `cancelDraft` mutation (section-07) can verify the task belongs to the requesting user.

#### Error Handling Summary

| Error Source | Behavior |
|---|---|
| Credit pre-check fails | Stop before pipeline starts. Set error `AI_INSUFFICIENT_CREDITS`. |
| Redis lock acquisition fails | Stop before pipeline starts. Set error "Draft already in progress". |
| Phase 1 invokeLLM throws | Stop immediately. Set error `AI_GENERATION_FAILED`. |
| Phase 2 callLLMStructured throws | Stop immediately. Set error `AI_INVALID_RESPONSE`. |
| Phase 3 image enhancement fails (per slide) | Continue with raw keywords. Add warning. |
| Phase 4 image generation fails/times out (per slide) | Continue with `imageUrl=null`. Layout engine uses placeholder. Add warning. |
| Phase 5 layout engine fails (per slide) | Layout engine returns fallback minimal slide. Add warning. |
| Phase 6 DB transaction fails | Stop. Set error `AI_GENERATION_FAILED` with version conflict details. |
| Cancellation detected | Stop at next checkpoint. Set `completed: true, cancelled: true`. |

#### Constants

Define these constants within the service file:

```typescript
const ARTICLE_MAX_WORDS = 2000;
const IMAGE_POLL_INTERVAL_MS = 2000;
const IMAGE_POLL_TIMEOUT_MS = 15000;
const PHASE1_TIMEOUT_MS = 30000;
const PHASE3_TIMEOUT_MS = 10000;
const LOCK_TTL_SECONDS = 300;
const HEARTBEAT_INTERVAL_MS = 30000;
const MAX_IMAGE_CONCURRENCY = 3;

// Credit cost estimates per operation
const CREDIT_ARTICLE = 30;
const CREDIT_SPLIT = 10;
const CREDIT_IMAGE_SKILL = 75;
const CREDIT_IMAGE_GEN = 40;
const CREDIT_BUFFER_MULTIPLIER = 1.2;
```

#### The Slide Split System Prompt

Define as a constant in the service file:

```typescript
const SLIDE_SPLIT_SYSTEM_PROMPT = `You are a presentation content structurer...
[Instructions to split an article into slides, outputting JSON array with fields:
templateId (one of: hero_center, split_left_image, split_right_image, feature_boxes_right),
title (string), body (string[]), graphicCategory (one of the AI_SVG_CATEGORIES),
imagePromptKeywords (string)]
...
Output ONLY valid JSON array. No markdown fencing.`;
```

The exact prompt text should be crafted during implementation, but it must:
1. Reference the allowed `templateId` values from `AI_LAYOUT_TEMPLATE_IDS`
2. Reference the allowed `graphicCategory` values from `AI_SVG_CATEGORIES`
3. Instruct the LLM to output a JSON array matching `AIPresentationSlideSchema`
4. Specify the number of slides to produce (from `input.numSlides`)

## Implementation Checklist

1. Create the test file with all test stubs described above
2. Create `/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationService.ts`
3. Implement `estimateCreditCost()` and `buildArticlePrompt()` (pure functions, test first)
4. Implement the `mapWithConcurrency` helper (or add `p-map` dependency)
5. Implement `pollMediaTask` helper
6. Implement the `generateAIDraft` main function with all 6 phases
7. Add new audit event types to `AuditEventType` union in `/home/dev/projects/SmartSpecPro/apps/web/server/services/auditLogger.ts`
8. Run tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run server/services/__tests__/aiPresentationService.test.ts`
9. Run type check: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check`
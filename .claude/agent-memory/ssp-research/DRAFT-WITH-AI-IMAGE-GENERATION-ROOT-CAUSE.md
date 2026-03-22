---
name: Draft with AI Image Generation Incomplete
description: Root cause analysis - only some slides receive images due to stopOnError early termination
type: project
---

## Problem Statement

User reports 7-slide presentation where only 3 slides have images. Expected behavior: all slides should have images generated or should fail explicitly with user-facing error.

## Root Cause (CONFIRMED)

**Location**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationService.ts:10208-10210`

The image generation loop uses `mapWithConcurrency()` with `stopOnError: true`:

```typescript
await mapWithConcurrency(
  slides,
  async (slide, index) => {
    // Image generation for each slide
    // ...
  },
  MAX_IMAGE_CONCURRENCY,  // = 3
  { stopOnError: true },  // ← THIS IS THE PROBLEM
);
```

**Impact**: When ANY slide's image generation throws an error (including `BillingChargeError`), the entire concurrent batch stops immediately. No subsequent slides are processed.

### Why This Happens

1. **Concurrency model**: `MAX_IMAGE_CONCURRENCY = 3` means images are generated 3 at a time
2. **Early termination**: `stopOnError: true` means the first error halts all workers
3. **No error recovery**: Unlike individual image generation errors (which are caught at line 10175-10186 and logged as warnings), errors that escape the inner try-catch block will halt the entire phase

### Error Paths That Trigger Halt

Two error types can escape and trigger `stopOnError`:

1. **BillingChargeError** (lines 10179-10181):
   - Thrown when credit deduction fails during `chargeMediaCreditsForAIDraftTask()`
   - Deliberately re-thrown after `setPhase4AbortError()` to halt processing
   - Example: User runs out of credits mid-generation

2. **Cancellation errors** (lines 10176-10177):
   - Thrown when user cancels the operation
   - Deliberately re-thrown without being caught

3. **Any unhandled error in the loop**:
   - Timeouts that escape `withTimeout()` wrapper
   - Promise rejection from `awaitUntilCancellable()`
   - Edge cases in `deriveMediaGenerationPlanForSlide()` if `mediaGenerationPlan` is somehow invalid

## Current Architecture

### Image Generation Pipeline (Phase 4)

```
generateAIDraft()
├─ Phase 1: Article generation (LLM) → slides[]
├─ Phase 2: Layout assignment + media plan
├─ Phase 3: Image prompt enhancement (LLM skill)
└─ Phase 4: Media generation (THIS IS WHERE STOPPING OCCURS)
   ├─ mapWithConcurrency(slides, generateImageForSlide, MAX_IMAGE_CONCURRENCY=3, stopOnError=true)
   │  ├─ Slide 1: ✓ image generated
   │  ├─ Slide 2: ✓ image generated
   │  ├─ Slide 3: ✗ ERROR → ALL WORKERS STOP
   │  ├─ Slide 4: ⛔ not processed (worker already stopped)
   │  ├─ Slide 5: ⛔ not processed (worker already stopped)
   │  ├─ Slide 6: ⛔ not processed (worker already stopped)
   │  └─ Slide 7: ⛔ not processed (worker already stopped)
   └─ Error caught, entire generation fails with error message
```

### Image Generation Per Slide (inside loop)

```typescript
for (const [variantIndex, mediaPlanEntry] of mediaGenerationPlan.entries()) {
  try {
    // Prompt enhancement (LLM skill)
    // Image generation (API call)
    // Credit charging
  } catch (err) {
    if (isCancellationError(err)) {
      throw err;  // ← ESCAPES, triggers stopOnError
    }
    if (err instanceof BillingChargeError) {
      setPhase4AbortError(err);
      throw err;  // ← ESCAPES, triggers stopOnError
    }
    // All other errors are caught and logged as warnings
    // This slide continues to next variant
  }
}
```

### Why Only Some Slides Have Images

With `MAX_IMAGE_CONCURRENCY = 3`:

- **First batch** (slides 0-2): All succeed → 3 images generated
- **Second batch (slides 3-6)**: Slide 3 throws error → halt immediately
- **Result**: 3/7 slides with images, the rest empty

This matches the user's report exactly: "out of 7 slides, only 3 have images."

## Code Locations

| File | Line | Issue |
|------|------|-------|
| `apps/web/server/services/aiPresentationService.ts` | 233 | `MAX_IMAGE_CONCURRENCY = 3` constant |
| `apps/web/server/services/aiPresentationService.ts` | 9939-10210 | `mapWithConcurrency()` call with `stopOnError: true` |
| `apps/web/server/services/aiPresentationService.ts` | 11377-11416 | `mapWithConcurrency()` implementation |
| `apps/web/server/services/aiPresentationService.ts` | 10175-10186 | Error handling in image generation loop |
| `apps/web/server/services/aiPresentationService.ts` | 10179-10181 | `BillingChargeError` re-throw |

## Related Error Scenarios

### Scenario A: User Runs Out of Credits

1. Slide 1-3 images generated successfully
2. Slide 4 needs 500 credits, user has 200
3. `chargeMediaCreditsForAIDraftTask()` throws `BillingChargeError`
4. Error caught, `setPhase4AbortError()` called
5. Error re-thrown → `stopOnError` halts all workers
6. Slides 5-7 never process
7. User sees error: "Media generation failed: Media credit deduction failed for task..."

### Scenario B: Timeout or API Failure on Slide 4

1. Slide 1-3 images generated
2. Slide 4: Network timeout during `generateImageAsync()`
3. If timeout escapes `withTimeout()` wrapper → error propagates
4. `stopOnError` halts workers
5. Slides 5-7 never process

### Scenario C: Invalid Media Generation Plan

1. Slide 4's `deriveMediaGenerationPlanForSlide()` returns empty array
2. Loop doesn't execute, but some other error in setup could escape
3. Unlikely but possible edge case

## Why This Design Exists

The `stopOnError: true` option is intentional for `BillingChargeError` — if a user runs out of credits, we want to stop immediately rather than charge them for the remaining slides. However, the implementation conflates:

- **Intentional halts** (billing errors, cancellation) with
- **Unintended halts** (unhandled Promise rejections, edge cases)

And it prevents graceful degradation where some slides succeed and others show "image generation failed" with a warning.

## Design Problems

1. **No per-slide error boundaries**: Individual slide errors should not block other slides
2. **Conflates error types**: Same mechanism for user cancellation and unexpected failures
3. **Silent loss of processing**: Users don't see a clear reason why slides 4-7 have no images
4. **Credit system interaction**: If credits run out mid-batch, remaining slides should either:
   - Fall back to placeholder images
   - Show explicit "insufficient credits" message per slide
   - Not start generation if credits insufficient upfront

## Recommended Fixes (Priority Order)

### Fix 1: Remove `stopOnError: true` (Quick Win)

Change concurrency call to NOT stop on error:

```typescript
await mapWithConcurrency(
  slides,
  async (slide, index) => { /* ... */ },
  MAX_IMAGE_CONCURRENCY,
  { stopOnError: false },  // ← Allow all slides to attempt processing
);
```

**Benefit**: Slides 4-7 will be attempted even if slide 3 fails
**Trade-off**: If user runs out of credits, we charge for attempts on all 7 slides instead of just 3

### Fix 2: Add Upfront Credit Check

Before Phase 4, estimate total credits needed and validate before starting:

```typescript
const estimatedCreditsNeeded = slides.length * ESTIMATED_IMAGE_CREDIT_COST;
const userCredits = await getUserCredits(userId);
if (userCredits < estimatedCreditsNeeded) {
  throw new Error(`Insufficient credits. Need ~${estimatedCreditsNeeded}, have ${userCredits}`);
}
```

**Benefit**: Fail fast with clear messaging instead of partial generation
**Trade-off**: May over-estimate; some slides might succeed with fewer credits

### Fix 3: Per-Slide Graceful Degradation

Wrap each slide's image generation in its own error boundary:

```typescript
for (const [index, slide] of slides.entries()) {
  try {
    mediaUrlsPerSlide[index] = await generateImageForSlide(slide, index);
  } catch (err) {
    warnings.push(`Slide ${index + 1}: Image generation failed: ${err.message}`);
    mediaUrlsPerSlide[index] = [];  // Empty but not errored
  }
}
```

**Benefit**: Presentation completes with mixed content (some slides have images, others have placeholders)
**Trade-off**: More verbose error messages; may hide systematic issues

### Fix 4: Separate Credit Errors from Process Errors

```typescript
try {
  await mapWithConcurrency(slides, generateImageForSlide, MAX_IMAGE_CONCURRENCY);
} catch (err) {
  if (err instanceof BillingChargeError) {
    // User intentionally can't afford more slides
    await updateProgress({
      phase: 4,
      error: {
        code: PRESENTATION_ERROR_CODE.INSUFFICIENT_CREDITS,
        message: `Generated images for ${mediaSlidesFinalized} of ${slides.length} slides before running out of credits.`,
      },
    });
    return;
  }
  // Other errors are unexpected and should still fail
  throw err;
}
```

**Benefit**: Clear distinction between "ran out of credits" and "something broke"
**Trade-off**: More nuanced error handling required

## Open Questions

1. **How often does this happen?**
   - Is it specific to billing errors or broader?
   - Does it occur with large slide counts (10+ slides)?

2. **What error caused the user's presentation?**
   - Need to check audit logs with their task ID
   - Is it `BillingChargeError`, timeout, or something else?

3. **Is `MAX_IMAGE_CONCURRENCY = 3` sufficient?**
   - With 7 slides, 3 at a time means 3 batches
   - Could increase to 4-5 without degrading API performance

4. **Should deferred media jobs be affected?**
   - Currently, if image generation fails but goes deferred, it's queued for later fetch
   - But with early halt, these deferred jobs may not be properly stored

## Audit Log Query

To diagnose the user's specific issue:

```sql
SELECT
  "traceId",
  "eventType",
  "stage",
  "slideIndex",
  "errorMessage",
  "createdAt"
FROM apiAuditEvents
WHERE "deckId" = ${usersDeckId}
  AND "source" = 'ai_draft.generateAIDraft'
  AND "stage" LIKE 'phase_4_%'
ORDER BY "createdAt" DESC
LIMIT 50;
```

Check JSONL audit logs:

```bash
grep '"phase_4_' apps/web/logs/audit/audit-2026-03-*.jsonl | jq '.[] | {stage, slideIndex, error: .errorMessage}' | head -20
```

## Summary

**Root Cause**: `stopOnError: true` in `mapWithConcurrency()` halts all pending slide processing when ANY slide fails, resulting in incomplete image generation.

**Why It Manifests as "3 of 7 images"**: With 3 concurrent workers, the first 3 slides usually succeed before the 4th fails and halts the batch.

**Fix Complexity**: Low (change one option) to Medium (implement per-slide error boundaries), depending on desired robustness.

**Timeline**: Can be fixed in < 2 hours with proper testing.

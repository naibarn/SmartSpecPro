---
name: Draft with AI Image Generation - Quick Fix Options
description: Three recommended fixes ranked by impact vs effort
type: project
---

## Quick Summary

**Problem**: Slides 4-7 don't get images because image generation stops after slide 3 fails
**Root Cause**: `stopOnError: true` in concurrent batch processor
**Fix Effort**: 30 minutes to 2 hours depending on chosen approach

---

## Option 1: Disable stopOnError (FASTEST, MODERATE RISK)

### Code Change
**File**: `apps/web/server/services/aiPresentationService.ts:10209`

```diff
  await mapWithConcurrency(
    slides,
    async (slide, index) => { /* ... */ },
    MAX_IMAGE_CONCURRENCY,
-   { stopOnError: true },
+   { stopOnError: false },
  );
```

### Effect
- Slides 4-7 **will** be attempted
- If slide 3 fails due to timeout/API error, slides 4-7 proceed independently
- If slide 3 fails due to insufficient credits, user charged for all 7 attempts

### Testing Required
```bash
cd apps/web
pnpm test -- aiPresentationService.test.ts

# Manual test:
# 1. Create 7-slide presentation
# 2. Inject credit limit of 2000 (enough for slides 1-3, not 4-7)
# 3. Verify all 7 slides attempt generation
# 4. Check that slides 4-7 show "image generation failed" not "skipped"
```

### Risks
- **Billing Risk**: If user has limited credits, ALL slides attempt generation before failure
  - Could overcharge by 4x if user's credits run out on slide 3
  - Current behavior: stops at slide 3 (only charges for 3)
  - New behavior: attempts 7, fails on slide 4+, charges 7x cost
- **Upside**: User sees clear "insufficient credits for slides 4-7" instead of silent skip

### When to Use
- If the primary issue is non-billing errors (timeouts, API failures)
- If users have sufficient credits
- If you want to see the real error for slides 4-7

---

## Option 2: Upfront Credit Validation (SAFEST, MEDIUM EFFORT)

### Code Changes

**Location 1**: Before Phase 4 starts (around line 9900)

```typescript
// Estimate total media generation cost
const estimatedImageCreditsPerSlide = 250; // Adjust based on actual costs
const estimatedTotalCredits = slides.length * estimatedImageCreditsPerSlide;
const userBalance = await getUserCreditBalance(actor.userId);

if (userBalance < estimatedTotalCredits) {
  await updateProgress({
    completed: true,
    error: {
      code: PRESENTATION_ERROR_CODE.INSUFFICIENT_CREDITS,
      message: `Insufficient credits. Need ~${estimatedTotalCredits} credits to generate images for ${slides.length} slides, but you have ${userBalance}. ` +
        `Try reducing slide count or purchasing more credits.`,
    },
  });
  return;
}
```

**Location 2**: Keep `stopOnError: false` (from Option 1)

### Effect
- Fail **before** attempting any image generation if credits insufficient
- All slides attempt generation if credits check passes
- Clear, upfront error message

### Testing Required
```typescript
// Add test case
it("should fail upfront if insufficient credits for full deck", async () => {
  const slides = Array(7).fill({...defaultSlide});
  const actor = { ...defaultActor, userId: "low-credit-user" };

  const result = await generateAIDraft({ slides, ... }, actor);

  expect(result.completed).toBe(true);
  expect(result.error?.code).toBe(PRESENTATION_ERROR_CODE.INSUFFICIENT_CREDITS);
});
```

### Risks
- **Over-estimation**: May estimate 1750 credits but only need 1200 (wasted budget opportunity)
- **Accuracy**: Depends on accurate per-slide cost estimates (varies by slide complexity, model)

### When to Use
- When you want to prevent "partial deck" scenarios entirely
- When credit limits are strict or user is budget-conscious
- When upfront clarity matters more than attempting max work

---

## Option 3: Per-Slide Error Boundaries (MOST ROBUST, MOST EFFORT)

### Code Changes

**Location**: Replace the concurrent loop (lines 9939-10210)

```typescript
// Process slides sequentially or in batches, with per-slide error handling
const mediaUrlsPerSlide: Array<string | null>[] = [];
let mediaSlidesFinalized = 0;
let anyBillingError: BillingChargeError | null = null;

for (let slideIndex = 0; slideIndex < slides.length; slideIndex++) {
  const slide = slides[slideIndex];

  try {
    // All the existing image generation logic (deriveMediaGenerationPlanForSlide, etc.)
    const mediaUrls = [];
    for (const [variantIndex, mediaPlanEntry] of mediaGenerationPlan.entries()) {
      try {
        // generateImageAsync, chargeMediaCredits, etc.
        // ... existing code ...
      } catch (err) {
        // Existing catch block - warnings but don't rethrow
      }
    }
    mediaUrlsPerSlide[slideIndex] = mediaUrls;
  } catch (billingErr) {
    if (billingErr instanceof BillingChargeError) {
      anyBillingError = billingErr;
      // Continue to next slide, but mark this one as failed
      mediaUrlsPerSlide[slideIndex] = [];
      warnings.push(`Slide ${slideIndex + 1}: ${billingErr.message}`);
    } else {
      throw billingErr;
    }
  }

  mediaSlidesFinalized++;
  await updateProgress({
    phase: 4,
    phaseLabel: `Images: ${mediaSlidesFinalized}/${slides.length}`,
    slidesCompleted: mediaSlidesFinalized,
    totalSlides: slides.length,
    slidePreview,
  });
}

// After all slides processed
if (anyBillingError) {
  await updateProgress({
    completed: true,
    error: {
      code: PRESENTATION_ERROR_CODE.PARTIAL_GENERATION_BILLING_ERROR,
      message: `Generated images for ${mediaSlidesFinalized} slides before insufficient credits: ${anyBillingError.message}`,
    },
  });
  return;
}
```

### Effect
- Each slide independently attempts image generation
- Billing error on slide 4 doesn't block slides 5-7
- Presentation completes with mix of successful/failed slides
- User sees clear per-slide errors in the warnings

### Testing Required
```typescript
it("should generate images for slides before and after billing error", async () => {
  const slides = Array(7).fill({...defaultSlide});
  const actor = { ...defaultActor, userId: "limited-credit-user" };

  // Mock creditService to fail on 4th slide
  jest.spyOn(creditService, 'deductCredits')
    .mockResolvedValueOnce({ success: true }) // Slide 1
    .mockResolvedValueOnce({ success: true }) // Slide 2
    .mockResolvedValueOnce({ success: true }) // Slide 3
    .mockRejectedValueOnce(new BillingChargeError('Insufficient credits')) // Slide 4
    .mockResolvedValueOnce({ success: true }) // Slide 5 should still try
    .mockResolvedValueOnce({ success: true }) // Slide 6
    .mockResolvedValueOnce({ success: true }); // Slide 7

  const result = await generateAIDraft({ slides, ... }, actor);

  expect(result.completed).toBe(true);
  expect(result.warnings).toContain(/Slide 4.*billing/i);
  expect(result.warnings.length).toBeGreaterThan(0);
  // Check that slides 5-7 at least attempted (have some result, even if failed)
});
```

### Risks
- **Complexity**: More code, more edge cases
- **Slower**: Sequential processing instead of 3-at-a-time concurrency
- **Ambiguous completion**: Is a deck with 3/7 images "successful"? (Handled via warnings)

### When to Use
- When you want maximum resilience and graceful degradation
- When users care about "something is better than nothing"
- When providing mixed success/failure states is acceptable

---

## Recommendation

| Scenario | Recommended Fix |
|----------|---|
| **User's primary issue is credit exhaustion** | Option 2 (upfront check) |
| **User's issue is intermittent API failures/timeouts** | Option 1 (disable stopOnError) |
| **You want production-grade robustness** | Option 3 (per-slide boundaries) |
| **You want to ship fastest** | Option 1 (one-line change) |

---

## Debugging the Specific Issue

To know which fix to apply, first diagnose what caused the halt:

```bash
# Check audit logs for the user's failed presentation
DECK_ID="<user's deck id from AIDraftModal>"
grep -r "$DECK_ID" apps/web/logs/audit/audit-*.jsonl | \
  jq '.[] | select(.stage | contains("phase_4")) | {stage, slideIndex, errorMessage}' | \
  head -20
```

Look for pattern:
- **"timeout"** in errorMessage → Option 1 (API timeouts, not billing)
- **"insufficient credits" or "billing"** → Option 2 (credit issue, need upfront check)
- **"variant X failed" warnings** → Option 3 (each variant failing independently, need boundaries)

---

## Testing All Options

Create a test file to verify each scenario:

```bash
cat > apps/web/server/__tests__/aiPresentationService.image-generation.test.ts << 'EOF'
describe("Draft with AI - Image Generation", () => {
  describe("stopOnError behavior", () => {
    it("should generate images for all slides when stopOnError is false", async () => {
      // Test with Option 1
    });

    it("should fail upfront with insufficient credits check", async () => {
      // Test with Option 2
    });

    it("should gracefully degrade with per-slide error boundaries", async () => {
      // Test with Option 3
    });
  });
});
EOF
```

---

## Implementation Checklist

### For Option 1 (Quickest):
- [ ] Change `stopOnError: true` to `stopOnError: false`
- [ ] Run `pnpm test -- aiPresentationService.test.ts`
- [ ] Test with 7-slide deck
- [ ] Verify error logs show attempts for all 7 slides

### For Option 2 (Recommended):
- [ ] Calculate accurate `estimatedImageCreditsPerSlide` (check DB for recent costs)
- [ ] Add upfront credit check before Phase 4
- [ ] Add new error code to `PRESENTATION_ERROR_CODE` enum
- [ ] Update error messaging for user clarity
- [ ] Test with low-credit user account
- [ ] Verify audit logs show early failure

### For Option 3 (Production-Grade):
- [ ] Refactor loop structure for sequential processing
- [ ] Add per-slide try-catch around billing errors
- [ ] Track partial success in progress updates
- [ ] Update client to handle mixed results
- [ ] Add comprehensive tests for all failure scenarios
- [ ] Update error codes and messaging


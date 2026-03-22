---
name: Media Queue System Quick Reference
description: Fast lookup for concurrency limits, rate limiter configs, file locations, scaling estimates
type: reference
---

# Media Queue System Quick Reference

## Code Locations

| What | File | Lines | What to Know |
|------|------|-------|--------------|
| Image submission in draft | `aiPresentationService.ts` | 10040-10296 (Phase 4) | mapWithConcurrency loop; stopOnErrorFilter at 10295 |
| MAX_IMAGE_CONCURRENCY | `aiPresentationService.ts` | 234 | = 5 slides in parallel |
| Concurrent image submission | `mediaGenerationService.ts` | 1109-1217 (generateImageAsync) | Calls submitTaskWithRetry → scheduleMediaWithLimiter |
| Rate limiting core | `llmRateLimiter.ts` | 591-659 (scheduleMediaWithLimiter) | Bottleneck + Redis; Redis fallback if down |
| Error halt logic | `aiPresentationService.ts` | 11582-11625 (mapWithConcurrency) | fatalError set → all workers exit |
| kie.ai config | `llmRateLimiter.ts` | 104-113 | maxConcurrent=50, 20 per 10s |
| Billing charge catch | `aiPresentationService.ts` | 10265-10267 | BillingChargeError → setPhase4AbortError |

## Rate Limiter Configurations

### kie.ai (Default Image Provider)

```typescript
{
  maxConcurrent: 50,              // Max 50 simultaneous HTTP requests
  minTime: 200,                   // At least 200ms between requests
  reservoir: 20,                  // Max 20 requests per interval
  reservoirRefreshInterval: 10000, // 10-second window
  timeout: 300000,                // 5 min max wait in queue
  videoMultiplier: 2,             // Video: 2x minTime
  audioMultiplier: 1.5,           // Audio: 1.5x minTime
}
```

### Other Providers

| Provider | Max Concurrent | Min Time | Reservoir | Interval |
|----------|----------------|----------|-----------|----------|
| replicate | 5 | 1000 | 50 | 60000 |
| stability | 5 | 500 | 60 | 60000 |
| elevenlabs | 3 | 1000 | 30 | 60000 |
| uvoice | 5 | 600 | 100 | 60000 |
| byteplus_modelark | 5 | 1000 | 30 | 60000 |
| default-media | 3 | 2000 | 30 | 60000 |

## Concurrency Flow

```
User submits generateAIDraft(7 slides, 1 image variant each)
  ↓
Phase 1: Article outline (sequential LLM)
Phase 2: Slide layouts (sequential DSL generation)
Phase 3: Image prompt enhancement (mapWithConcurrency × 5 slides)
Phase 4: Media generation
  ↓
mapWithConcurrency(
  slides=[0-6],
  fn=async(slide, index) => {
    for (variantIndex in mediaGenerationPlan) {
      mediaTask = await generateImageAsync()
        → scheduleMediaWithLimiter("kie.ai", "image", submitToBackend)
          → Bottleneck checks: running < 50? lastReq > 200ms? reservoir > 0?
          → If yes: POST /api/v1/media/async/image → Python backend → kie.ai task ID
          → If no: enqueue in Bottleneck (max wait 5 min)
        → Return task ID (no polling)
    }
  },
  MAX_IMAGE_CONCURRENCY=5,
  { stopOnErrorFilter: (err) => isCancellationError(err) || err instanceof BillingChargeError }
)
  ↓
If any error matches stopOnErrorFilter:
  → fatalError = err
  → All workers exit early
  → Remaining slides never submitted
  → INCOMPLETE DRAFT
```

## Key Variables

```typescript
// In aiPresentationService.ts
const MAX_IMAGE_CONCURRENCY = 5;           // Line 234
const MEDIA_SUBMIT_TIMEOUT_MS = 45000;     // Line 235-240, 45 seconds
const IMAGE_POLL_INTERVAL_MS = 2000;       // Line 129, for frontend
const IMAGE_POLL_BASE_TIMEOUT_MS = 120000; // Line 130-135, 2 minutes

// In mediaGenerationService.ts
const MEDIA_SUBMIT_RETRY_DELAY_MS = 250;   // Line 46
const MEDIA_SUBMIT_MAX_ATTEMPTS = 2;       // Line 47
```

## Scaling Table

| Metric | 1 Draft | 5 Drafts | 10 Drafts | 20 Drafts | 50 Drafts |
|--------|---------|----------|-----------|-----------|-----------|
| Total image requests | 7 | 35 | 70 | 140 | 350 |
| vs kie.ai limit (20/10s) | ✅ OK | ✅ OK | ⚠️ Marginal | ❌ Queue backs up | ❌ 70s+ timeout |
| Time to submit all | ~1s | ~2s | ~5s | ~10s | ~25s |
| Queue drain time (at 2 req/sec) | - | - | - | 40s | 100s |
| vs timeout (300s) | - | - | - | ✅ OK | ✅ OK |
| vs session expiry | ✅ OK | ✅ OK | ✅ OK | ⚠️ 10min token refresh | ⚠️ JWT may expire |

## Failure Modes

### 1. stopOnError Filter Halts Remaining Slides

```typescript
// Line 10295 in aiPresentationService.ts
await mapWithConcurrency(slides, ..., 5, {
  stopOnErrorFilter: (err) =>
    isCancellationError(err) || err instanceof BillingChargeError
});
```

**Trigger**: Slide 3 fails with BillingChargeError (credits exhausted)
**Result**: All remaining workers exit → Slides 4-7 never submitted
**Impact**: User sees 3 images instead of 7; incomplete presentation

### 2. Rate Limiter Timeout

**When**: 20+ drafts running simultaneously
**Why**: Kie.ai allows 20 requests per 10 seconds; 140 requests from 20 drafts exceed this
**Queue fills up**: 100+ requests waiting in Bottleneck queue
**Timeout**: After 5 minutes, requests still waiting fail
**Impact**: Some images don't generate; frontend waits 5 min then fails

### 3. Redis Connection Exhausted

**When**: Multiple Bottleneck limiters (image, video, audio) all try to acquire Redis connection
**Why**: Redis pool may be undersized
**Fallback**: Bottleneck falls back to in-memory (logs warning)
**Problem**: In-memory state not shared across Node.js processes → rate limiting breaks

### 4. Python Backend Overload

**When**: 50 concurrent image submissions from Node.js
**Why**: Python backend capacity unknown; may not handle 50 simultaneous API calls
**Result**: 500 errors from Python → Node.js retries → exponential backoff → timeouts
**Impact**: All image generation fails; user sees error

## Debugging Checklist

- [ ] Check audit logs for error count and timing: `grep '"phase": 4' logs/audit/audit-$(date +%Y-%m-%d).jsonl | jq '.errorType' | sort | uniq -c`
- [ ] Check rate limiter stats: Add logging to `scheduleMediaWithLimiter()` → log queue depth every 10 requests
- [ ] Check if Redis is available: `redis-cli ping` on production server
- [ ] Check Python backend logs for `/api/v1/media/async/image` request count and errors
- [ ] Check kie.ai queue depth via their API (if available)
- [ ] Monitor mapWithConcurrency error collection: Add logging when `stopOnErrorFilter` matches
- [ ] Check token expiry: Do errors cluster around 10-minute mark? (token refresh)

## Quick Fix Options

### 1. Remove stopOnErrorFilter (5 min)
```typescript
// Current
{ stopOnErrorFilter: (err) => isCancellationError(err) || err instanceof BillingChargeError }

// Change to
{ stopOnError: false }  // Non-fatal errors don't halt other slides
```
**Pro**: Slides don't block each other
**Con**: Billing errors still stop early (desired behavior)

### 2. Add upfront credit check (30 min)
```typescript
// In generateAIDraft Phase 1
const requiredCredits = estimateMediaCreditsForDraft(slides.length, selectedImageModel);
const balance = await hasEnoughCredits(actor.userId, requiredCredits);
if (!balance) {
  throw new PresentationServiceError(
    "INSUFFICIENT_CREDITS",
    `Requires ${requiredCredits} credits; user has ${balance}`
  );
}
```
**Pro**: Fail fast before any images submitted
**Con**: Must estimate accurately (what if user has 100 credits, we estimate 120?)

### 3. Add per-provider circuit breaker (2 hours)
```typescript
// In scheduleMediaWithLimiter
if (errorRate > 0.2) {  // >20% errors
  throw new Error(`${providerName} circuit breaker open: too many errors`);
}
```
**Pro**: Prevent cascading failures
**Con**: Adds state tracking and requires reset logic

## Common Patterns

### Getting rate limiter status
```typescript
import { getMediaProviderLimiter } from './llmRateLimiter';

const limiter = getMediaProviderLimiter('kie.ai');
const counts = limiter.counts();  // { EXECUTING, QUEUED }
console.log(`Queue depth: ${counts.QUEUED}, Running: ${counts.EXECUTING}`);
```

### Adding retry logic
```typescript
// Already done in submitTaskWithRetry (line 618-662)
// But if needed in new code:
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    return await scheduleMediaWithLimiter(...);
  } catch (err) {
    if (!isRetryableError(err) || attempt >= MAX_ATTEMPTS) throw err;
    await sleep(RETRY_DELAY_MS * attempt);  // Exponential backoff
  }
}
```

### Monitoring queue depth
```typescript
// Add to generateAIDraft Phase 4 start
const limiter = getMediaProviderLimiter('kie.ai');
const initialCounts = limiter.counts();
console.log(`[Phase 4] Starting with ${initialCounts.QUEUED} queued, ${initialCounts.EXECUTING} executing`);

// In mapWithConcurrency worker loop
if (index % 5 === 0) {
  const counts = limiter.counts();
  console.log(`[Phase 4] After slide ${index}: ${counts.QUEUED} queued, ${counts.EXECUTING} executing`);
}
```

## Related Systems

- **Python backend media endpoint**: `/api/v1/media/async/image` (unknown concurrency)
- **Frontend media status polling**: `/api/v1/media/status/{taskId}` every 2 seconds
- **Credit deduction**: `chargeMediaCreditsForAIDraftTask()` at line 10211 (immediate, before image completes)
- **Pending media jobs**: Stored in slide.slideContent.elements as SlidePendingMediaJob
- **Kie.ai callback**: Updates media job status when image completes (webhook or polling)

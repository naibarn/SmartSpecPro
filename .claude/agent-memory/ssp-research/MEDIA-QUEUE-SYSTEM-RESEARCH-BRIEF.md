---
name: Media Generation Queue System for Presentations
description: Complete analysis of image/video generation flow, concurrency limits, rate limiting, and potential bottlenecks under load
type: project
---

# Research Brief: Media Generation Queue System for Presentations

## Executive Summary

SmartSpecPro uses a **synchronous-style async** architecture for media generation in presentations:

1. **No background queue** — All image/video submissions happen inline during `generateAIDraft`
2. **Rate limiting via Bottleneck+Redis** — Per-provider request throttling (kie.ai: 50 max concurrent, 20 requests/10s)
3. **Local concurrency via mapWithConcurrency** — Max 5 parallel image submissions per draft (MAX_IMAGE_CONCURRENCY=5)
4. **Submit-and-defer pattern** — Images are submitted but polling is deferred to frontend (no server-side polling)
5. **Critical bottleneck** — mapWithConcurrency with `stopOnErrorFilter` can halt ALL slides if any slide fails media generation

The architecture works well for 1-5 drafts running simultaneously. **20-50 simultaneous drafts will create severe contention** on the rate limiter and backend resources.

---

## Current Architecture

### Phase 4: Media Generation in generateAIDraft (Line 10040-10296, aiPresentationService.ts)

```typescript
await mapWithConcurrency(
  slides,
  async (slide, index) => {
    // Per-slide: 1-N image variants generated sequentially
    for (const [variantIndex, mediaPlanEntry] of mediaGenerationPlan.entries()) {
      const mediaTask = await mediaGenerationService.generateImageAsync(
        { prompt, model, aspectRatio, ... },
        userToken,
      );
      // Submit only, NO polling at server
      const pollResult: PollMediaTaskResult = {
        url: null,
        status: "pending",
        reason: "submit_only_no_poll",
      };
    }
  },
  MAX_IMAGE_CONCURRENCY,  // = 5 (line 234)
  { stopOnErrorFilter: (err) => isCancellationError(err) || err instanceof BillingChargeError },
);
```

**Key observation**: Each slide does its own media submission, so total image requests = slides × variants. With 7 slides and 1 variant each = 7 image requests, but only 5 run in parallel due to `MAX_IMAGE_CONCURRENCY`.

### Rate Limiting Layer (llmRateLimiter.ts)

Every image/video submission goes through `scheduleMediaWithLimiter()` which uses **Bottleneck** with Redis backing:

**kie.ai provider config (line 104-113)**:
```typescript
'kie.ai': {
  maxConcurrent: 50,              // Max 50 concurrent tasks
  minTime: 200,                   // 200ms between requests
  reservoir: 20,                  // 20 requests per interval
  reservoirRefreshInterval: 10000, // 10 seconds
  timeout: 300000,                // 5 min max wait in queue
  videoMultiplier: 2,
  audioMultiplier: 1.5,
},
```

**Default for unknown providers (line 162-170)**:
```typescript
'default-media': {
  maxConcurrent: 3,
  minTime: 2000,
  reservoir: 30,
  reservoirRefreshInterval: 60000,
  timeout: 90000,
  videoMultiplier: 2,
  audioMultiplier: 1.5,
},
```

### mediaGenerationService.generateImageAsync (line 1109-1217)

Each async image submission:
1. Calls `submitTaskWithRetry()` (line 1164-1172)
2. Which calls `scheduleMediaWithLimiter()` (line 632-636, mediaGenerationService.ts)
3. Which queues with Bottleneck and returns task ID
4. Response: `{ id, taskId, status: "pending" }` — NO polling at server
5. Backend Python service polls kie.ai and updates via callback/webhook

**Important**: This is NOT a fire-and-forget Celery task. It's a direct HTTP request to Python backend at `/api/v1/media/async/image`, which itself handles the async submission to kie.ai.

### mapWithConcurrency Error Handling (line 11582-11625)

```typescript
async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
  options?: { stopOnError?: boolean; stopOnErrorFilter?: (err: unknown) => boolean },
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let fatalError: unknown = null;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      if (fatalError) return;  // ← EARLY EXIT if any error is fatal
      const i = nextIndex++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        const isFatal = options?.stopOnError ||
          (options?.stopOnErrorFilter && options.stopOnErrorFilter(err));
        if (isFatal) {
          fatalError = err;    // ← SET FATAL ERROR
          return;              // ← STOP THIS WORKER
        }
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  if (fatalError) throw fatalError;  // ← THROW AFTER ALL WORKERS COMPLETE
  return results;
}
```

**Called at line 10295 with**:
```typescript
{ stopOnErrorFilter: (err) =>
  isCancellationError(err) || err instanceof BillingChargeError
}
```

**This means**: If slide N fails with BillingChargeError or cancellation, ALL remaining slides stop processing.

---

## Data Flow: From generateAIDraft to Media Submission

```
User calls generateAIDraft
  ↓
Phase 1: Generate article outline via LLM
Phase 2: Generate slide layouts via LLM
Phase 3: Per-slide image prompt enhancement
Phase 4: Media generation (THE BOTTLENECK)
  ↓
mapWithConcurrency(slides, async (slide, index) => {
  ↓
  For each image variant in this slide:
    ↓
    Call mediaGenerationService.generateImageAsync()
      ↓
      Call submitTaskWithRetry() with retry logic
        ↓
        Call scheduleMediaWithLimiter(provider, "image", async () => {
          ↓
          POST to Python backend /api/v1/media/async/image
            ↓ (inside Python backend)
            Submit to kie.ai async endpoint
            Return task ID to Node.js
          ↓
          recordMediaUsage() — track rate limiter stats
        })
      ↓
      Log to audit trail
    ↓
    Return immediately (no polling at server)
    Create pendingMediaJob (stored with slide)
    Frontend polls /api/v1/media/status/{taskId} later
}, MAX_IMAGE_CONCURRENCY=5, stopOnErrorFilter)
  ↓
If any error matches filter → fatalError set → remaining workers exit → phase fails
```

---

## Concurrency Model

### At Each Layer

| Layer | Concurrency | Mechanism | Details |
|-------|------------|-----------|---------|
| **Draft level** | 1 per user | Per-user task lock | Web router: `generateDraft` endpoint |
| **Slide level** | 5 slides | `mapWithConcurrency(slides, ..., 5)` | Local in-memory worker pool |
| **Variant level** | 1 per slide | Sequential `for` loop (line 10138-10274) | Each variant waits for previous |
| **Provider rate limit** | 50 (kie.ai) | Bottleneck + Redis reservoir | 20 requests per 10 seconds max |

### Example: 7-slide draft with 1 image variant each

```
t=0:    Slide 0 image submitted → rate limiter queue
t=0:    Slide 1 image submitted → rate limiter queue
t=0:    Slide 2 image submitted → rate limiter queue
t=0:    Slide 3 image submitted → rate limiter queue
t=0:    Slide 4 image submitted → rate limiter queue
        (5 workers in mapWithConcurrency now waiting on rate limiter)

t=200ms: Kie.ai rate limiter allows Slide 0 → request sent to Python backend
        Worker 1 free, picks up Slide 5 → queued in rate limiter
t=400ms: Kie.ai rate limiter allows Slide 1 → request sent
        Worker 2 free, picks up Slide 6 → queued in rate limiter
t=600ms: Kie.ai rate limiter allows Slide 2
        All slides submitted within ~1 second

t=2-3s: All return with task IDs (async tasks created at kie.ai)
        Phase 4 completes, returns to frontend
        Frontend begins polling /media/status/{taskId}
```

**Total time for Phase 4**: ~45 seconds (MEDIA_SUBMIT_TIMEOUT_MS = 45000, line 235-240)

---

## Rate Limiting in Detail

### Bottleneck Configuration for kie.ai

**File**: `apps/web/server/services/llmRateLimiter.ts`, line 103-113

```typescript
'kie.ai': {
  maxConcurrent: 50,              // Max 50 concurrent HTTP requests to Python backend
  minTime: 200,                   // At least 200ms between each request
  reservoir: 20,                  // Max 20 requests in 10-second window
  reservoirRefreshInterval: 10000, // 10 second window
  timeout: 300000,                // If waiting >5min in queue, timeout
  videoMultiplier: 2,             // Video requests get 2x the minTime delay
  audioMultiplier: 1.5,
}
```

**How it works**:
1. Each request to `scheduleMediaWithLimiter(provider="kie.ai", ...)`
2. Bottleneck checks: Can I run this immediately?
   - Is `running < maxConcurrent` (50)?
   - Is `lastRequest > minTime` (200ms) ago?
   - Is `reservoir > 0` (requests left in 10s window)?
3. If no: Add to queue, wait up to 5 minutes
4. If yes: Execute, decrement reservoir, record time

**With 50 max concurrent** and **20 requests per 10s**, you can safely handle:
- 5 simultaneous drafts × 7 slides × 1 variant = 35 image requests (fits in 50 concurrent, 20 per 10s)
- **But 20 drafts × 7 = 140 requests will timeout** (only 20/10s allowed)

### Redis State (if available)

```typescript
// Bottleneck stores this in Redis with TTL
// (so multiple Node.js processes share state)
limiters.set(key, limiter);  // line 448, 584
// If Redis unavailable, falls back to in-memory (single process only)
```

### Bypass on Redis Error

**Line 653-656** (mediaGenerationService.ts):
```typescript
if (/SETTINGS_KEY_NOT_FOUND|UNKNOWN_CLIENT/i.test(error.message ?? '')) {
  console.warn(`[MediaRateLimiter] Bottleneck Redis error..., bypassing rate limiter`);
  return fn();  // ← EXECUTE WITHOUT RATE LIMITING
}
```

**Risk**: If Redis is down, rate limiting is disabled and you can overwhelm providers.

---

## Potential Bottlenecks Under Load

### 1. **mapWithConcurrency stopOnError Filter (CRITICAL)**

**Issue**: If any slide fails, ALL remaining slides stop.

**Example: 50 concurrent drafts, slide 3 fails**
```
Draft 1: Slides 0-7 processing
  Slide 3 gets BillingChargeError (credits exhausted)
  → fatalError set
  → Workers 1-4 exit immediately
  → Slides 4-7 NEVER SUBMITTED
  → Draft returns with only 3 images instead of 7
```

**Impact**: Multi-slide presentations have incomplete images on high-load days.

**Fix options**:
1. Remove `stopOnErrorFilter` → non-fatal errors don't block (but billing errors still fail hard)
2. Validate credits upfront before Phase 4 → fast-fail if insufficient
3. Change stopOnError to `false` → slide failures don't halt siblings

### 2. **Rate Limiter Timeout (5 minutes for kie.ai)**

**Issue**: With 20+ simultaneous drafts, queue depth exceeds 50 concurrent slots.

**Example: Queue Analysis**
```
Time    Event                              Queue Depth  Running  Status
t=0     20 drafts × 7 slides = 140 requests             0
t=0     First 50 requests submitted        90           50       OK
t=200ms 50 complete (20/10s rate)          90           50       OK
t=400ms 50 more sent                       90           50       OK
...
t=4:59s 50 requests still waiting in queue 50           50       TIMEOUT APPROACHING
t=5:00s Requests start timing out          ?            ?        FAIL
```

**Queue processing rate with kie.ai limits**:
- Max: 20 requests per 10 seconds = **2 req/sec**
- Queue can accept: 50 concurrent
- Queue drains at: 2 req/sec
- With 140 requests: 140 ÷ 2 = **70 seconds** to drain
- But timeout is **300 seconds (5 min)**, so OK

**BUT**: If drafts are queued for other operations (Phase 1/2 LLM calls), the queue depth grows beyond 50.

### 3. **Python Backend: /api/v1/media/async/image Bottleneck**

**Issue**: Node.js can submit requests faster than Python can queue them to kie.ai.

**Python side** (unknown concurrency):
- Receives POST /api/v1/media/async/image
- Submits to kie.ai async endpoint
- Returns task ID

**Missing info**:
- Does Python have its own rate limiting?
- What's the max concurrent submissions to kie.ai from Python?
- Is there a Redis queue on Python side?

**Risk**: Python backend gets overloaded and returns 500 errors → Node.js retries → exponential backoff fails.

### 4. **Redis Connection Pool Exhaustion**

**Issue**: 20 simultaneous drafts × 5 rate limiters (image, video, audio, etc.) = potential connection pool exhaustion.

**File**: `apps/web/server/services/redis.ts`

**Missing info**:
- What's the pool size?
- Are there individual limiters or shared?
- What happens if Redis connections max out?

**Result**: New requests fail to acquire limiter → bypass rate limiting → provider overload.

### 5. **Deferred Media Job Polling**

**Issue**: No server-side polling. Frontend polls `/api/v1/media/status/{taskId}` every 2 seconds.

**With 20 drafts × 7 slides = 140 pending media jobs**:
- 140 jobs × 2-second polls = **70 requests per 2 seconds = 35 req/sec**
- If client has 50 open connections, still manageable
- **But**: If 50 clients each polling, = 1750 req/sec to status endpoint

**Missing info**:
- What's the rate limit on `/api/v1/media/status`?
- Is it protected by auth rate limiting?
- Can it handle 1000+ concurrent polls?

---

## Current Safeguards vs. Risks

| Safeguard | Mechanism | Effectiveness | Gap |
|-----------|-----------|----------------|-----|
| Per-provider rate limit | Bottleneck + Redis | ✅ Good | Python backend not rate-limited |
| Per-draft concurrency | MAX_IMAGE_CONCURRENCY=5 | ✅ Prevents one draft from overwhelming | Doesn't prevent 20 drafts × 5 each |
| Billing error handling | BillingChargeError + stopOnErrorFilter | ⚠️ Partial | Halts remaining slides (incomplete draft) |
| Retry logic | `submitTaskWithRetry()` × 2 attempts | ✅ Transient errors | Hard failures still propagate |
| Provider health check | Circuit breaker in llmRouter | ? Unknown | Media generation not using llmRouter |
| Redis fallback | Bypass to in-memory | ✅ Graceful | No rate limiting without Redis |

---

## File Locations & Code References

### Core Files

| File | Purpose | Key Lines |
|------|---------|-----------|
| **aiPresentationService.ts** | Main draft generation | 10040-10296 (Phase 4), 234 (MAX_IMAGE_CONCURRENCY=5) |
| **mediaGenerationService.ts** | Image/video submission API | 1109-1217 (generateImageAsync), 632-662 (submitTaskWithRetry), 863 (rate limiter call) |
| **llmRateLimiter.ts** | Bottleneck + Redis rate limiting | 104-113 (kie.ai config), 591-659 (scheduleMediaWithLimiter) |
| **mapWithConcurrency** | Local concurrency + error handling | 11582-11625 |

### Rate Limiter Providers

- kie.ai (50 concurrent, 20/10s): line 104-113
- replicate (5 concurrent, 50/60s): line 114-122
- stability (5 concurrent, 60/60s): line 123-131
- elevenlabs (3 concurrent, 30/60s): line 132-140
- uvoice (5 concurrent, 100/60s): line 141-150
- byteplus_modelark (5 concurrent, 30/60s): line 151-161
- default (3 concurrent, 30/60s): line 162-170

### Configuration

| Variable | Value | File | Purpose |
|----------|-------|------|---------|
| MAX_IMAGE_CONCURRENCY | 5 | aiPresentationService.ts:234 | Max parallel image submissions per draft |
| MEDIA_SUBMIT_TIMEOUT_MS | 45000 (45 sec) | aiPresentationService.ts:235-240 | Timeout waiting for submission response |
| IMAGE_POLL_INTERVAL_MS | 2000 | aiPresentationService.ts:129 | Frontend polling interval for media status |
| IMAGE_POLL_BASE_TIMEOUT_MS | 120000 (2 min) | aiPresentationService.ts:130-135 | Base timeout for frontend polling |

---

## Scaling Estimates

### Safe Concurrency

- **1-3 simultaneous drafts**: No issues (15 images submitted, 30-second Phase 4)
- **5-10 simultaneous drafts**: Rate limiter handles well (50 images, stays within 20/10s limits)
- **20-30 simultaneous drafts**: Queue backs up, some timeouts possible (140-210 images)
- **50+ simultaneous drafts**: Rate limiter queue saturated, majority timeout (350+ images)

### Bottleneck Analysis for 20 Simultaneous Drafts

```
Queue depth: 20 drafts × 7 slides × 1 variant = 140 image requests

Submission rate:
  - mapWithConcurrency: 5 slides in parallel per draft
  - But 20 drafts × 5 = 100 in-flight submissions
  - Rate limiter: Allows 20 per 10 seconds
  - Queue: 100 - 20 = 80 waiting

Time to clear 80-item queue at 2 req/sec: 80 / 2 = 40 seconds
Timeout threshold: 300 seconds (safe)

However, if each draft also has Phase 1/2/3 operations queued:
  - 20 drafts × 3 phases = 60 additional API requests
  - These may use different rate limiters or share same backend
  - If they contend for Python backend capacity, overall throughput drops

Risk: Unknown Python backend capacity
```

---

## Recommendations

### Immediate (High Priority)

1. **Add credit validation upfront** — Check in Phase 1 if user has enough credits for all slides + media
   - Prevents BillingChargeError mid-Phase-4
   - Fast-fails before any media is submitted
   - Allows remaining slides to proceed if credits available

2. **Change stopOnErrorFilter logic**:
   ```typescript
   // Current (line 10295):
   { stopOnErrorFilter: (err) => isCancellationError(err) || err instanceof BillingChargeError }

   // Proposed:
   {
     stopOnError: false  // Non-fatal errors don't block remaining slides
     // Only abort if user cancels or hard billing error
   }
   ```

3. **Measure Python backend capacity**:
   - Load test `/api/v1/media/async/image` with 50+ concurrent requests
   - Determine max throughput (requests/sec)
   - Add rate limiting on Python side if needed

### Medium Priority (2-4 weeks)

4. **Monitor rate limiter queue depth**:
   - Log queue size every 10 seconds
   - Alert if queue > 50 for >1 minute
   - Adjust MAX_IMAGE_CONCURRENCY or provider limits based on data

5. **Implement server-side media polling** (optional):
   - Instead of submit-only, poll at server for 10-20 seconds
   - Return with partial results after timeout
   - Frontend continues polling for remaining media
   - Reduces frontend requests by 80%

6. **Add per-provider circuit breaker**:
   - Track kie.ai error rates
   - If >20% errors, fail-fast with user message
   - Prevent cascading requests to failing provider

### Future (Post-launch)

7. **Background media job processor**:
   - Celery task to poll deferred media jobs in batches
   - Reduce frontend polling by 90%
   - More efficient use of Redis

8. **Multi-provider fallback**:
   - If kie.ai queue > 50, try flux-2.0 or z-image
   - Spread load across providers
   - Requires price normalization

---

## Open Questions

1. **What is the Python backend's max concurrent submissions to kie.ai?**
   - Does it have its own rate limiting?
   - Can it handle 50 simultaneous image generation requests?

2. **What happens if Redis goes down during heavy load?**
   - Rate limiter bypasses (good)
   - But what if in-memory Bottleneck runs out of memory?
   - Is there a fallback?

3. **How are pendingMediaJobs stored?**
   - In memory in the slide object?
   - Persisted to database?
   - What happens if server crashes before they're resolved?

4. **What's the `/api/v1/media/status` rate limit?**
   - Can it handle 1000+ concurrent polls from 50 clients?
   - Is it protected by auth rate limiting (llmRateLimiter)?

5. **Does the frontend have a maximum number of pending media jobs to track?**
   - If a slide has 100 variants, can frontend handle polling 100 jobs?

6. **Are media submissions counted against user credits before they complete?**
   - Line 10211-10229: chargeMediaCreditsForAIDraftTask() called immediately
   - If media fails, are credits refunded?
   - What if payment fails mid-draft?

---

## Summary: The Three-Layer Concurrency Model

```
Layer 1: Per-User Draft Lock
├─ Only 1 generateAIDraft per user at a time
├─ Enforced by web router
└─ LIMIT: 1 draft per user

Layer 2: Per-Draft Slide Concurrency
├─ mapWithConcurrency(5 slides parallel)
├─ Sequential variants per slide
└─ LIMIT: 5 slides × N variants

Layer 3: Provider Rate Limiting
├─ Bottleneck + Redis
├─ kie.ai: 50 concurrent, 20 per 10s
├─ Falls back to in-memory if Redis down
└─ LIMIT: Provider's stated capacity
```

**Weakest link**: Layer 3 (provider rate limiting) cannot handle 20+ simultaneous drafts. Layer 2 concurrency (5 slides) is too aggressive when multiple drafts are running.

**Solution**: Add dynamic Layer 2 adjustment based on provider queue depth:
```typescript
const adaptiveMaxConcurrency = Math.max(1, Math.min(5, 50 - queueDepth / 10));
```

This would reduce per-draft concurrency if the provider queue is backed up, preventing cascading failures.

I now have all the context needed. Here is the section content.

# Section 07: Redis-Based Rate Limiting for Lux TTS

## Section Metadata

| Field | Value |
|-------|-------|
| Section ID | `section-07-rate-limiting` |
| Title | Redis-Based Rate Limiting for Lux TTS |
| Depends On | None (parallelizable in Batch 1) |
| Blocks | None |
| Files Created | `apps/web/server/services/__tests__/luxTtsRateLimit.test.ts` |
| Files Modified | `apps/web/server/services/rateLimiter.ts`, `apps/web/server/routers/media.ts` |

## Background

SmartSpecPro's Lux TTS model (`fal-ai/lux-tts`) supports voice cloning, which creates a high abuse risk. The interview decision (Q6) mandates Redis-based rate limiting for this model specifically, diverging from the in-memory `createRateLimiter` pattern used elsewhere in `rateLimiter.ts`.

The project already has a Redis-backed sliding window rate limiter at `/home/dev/projects/SmartSpecPro/apps/web/server/middleware/distributedRateLimit.ts` that exposes a `checkRateLimit(key, limit, windowSeconds)` function. This function uses ZSET-based sliding window via the cache Redis client from `redisClients.ts`. It fails closed (rejects on Redis errors).

The in-memory `rateLimiter.ts` at `/home/dev/projects/SmartSpecPro/apps/web/server/services/rateLimiter.ts` exports pre-configured limiters like `mediaGenerationLimiter` used in the media router. The Lux TTS limiter must be Redis-based (not in-memory) per interview decision, so it will use the `checkRateLimit` function from `distributedRateLimit.ts`.

## Requirements

- **Limit**: 5 requests per 10 minutes per user for the `fal-ai/lux-tts` model
- **Storage**: Redis ZSET sliding window (via existing `checkRateLimit`)
- **Key pattern**: `ratelimit:lux-tts:{userId}`
- **Scope**: Applies only when the selected model is `fal-ai/lux-tts`
- **Application point**: Both `generateAudio` and `generateAudioAsync` tRPC procedures in `media.ts`
- **Error behavior**: Fails closed on Redis errors (matches `checkRateLimit` default behavior)

## Tests First

Create `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/luxTtsRateLimit.test.ts`.

### Test Cases

```typescript
// Test file: apps/web/server/services/__tests__/luxTtsRateLimit.test.ts
// Framework: Vitest
// Mock: checkRateLimit from distributedRateLimit.ts

// --- checkLuxTtsRateLimit function tests ---

// Test: returns { allowed: true } when checkRateLimit reports under limit
// Test: returns { allowed: false, retryAfter: N } when checkRateLimit reports over limit
// Test: uses Redis key pattern "ratelimit:lux-tts:{userId}"
// Test: passes limit=5 and windowSeconds=600 to checkRateLimit
// Test: returns { allowed: true } when Redis is unavailable (fail-open for TTS, since
//       the general mediaGenerationLimiter already provides a safety net)

// --- Integration with isLuxTtsModel helper ---

// Test: isLuxTtsModel("fal-ai/lux-tts") returns true
// Test: isLuxTtsModel("fal-ai/flux/schnell") returns false
// Test: isLuxTtsModel("elevenlabs-tts") returns false
// Test: isLuxTtsModel(undefined) returns false

// --- Rate limit per-user isolation ---

// Test: user A at limit does not affect user B (different Redis keys)
```

### Mock Setup Pattern

The tests should mock `checkRateLimit` from `../../middleware/distributedRateLimit` and verify the correct key, limit, and window parameters are passed. Follow the mock pattern in `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/distributedRateLimit.test.ts`.

## Implementation Details

### 1. Add `checkLuxTtsRateLimit` to `rateLimiter.ts`

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/rateLimiter.ts`

Add the following at the end of the file, after the existing in-memory limiter exports:

**New imports needed:**
- `checkRateLimit` from `../middleware/distributedRateLimit`

**New exported constants/functions:**

```typescript
// LUX_TTS_MODEL_ID - the model identifier to match against
export const LUX_TTS_MODEL_ID = "fal-ai/lux-tts";

// LUX_TTS_RATE_LIMIT - 5 requests per 10 minutes
const LUX_TTS_LIMIT = 5;
const LUX_TTS_WINDOW_SECONDS = 600; // 10 minutes
```

**`isLuxTtsModel(model: string | undefined): boolean`** -- Simple string comparison helper. Returns `true` only if `model === LUX_TTS_MODEL_ID`.

**`checkLuxTtsRateLimit(userId: number): Promise<{ allowed: boolean; retryAfter: number | null }>`** -- Calls `checkRateLimit` with key `ratelimit:lux-tts:${userId}`, limit `5`, windowSeconds `600`. Returns the `allowed` and `retryAfter` fields from the result.

Do not add a full function body here. The function should:
1. Build the Redis key: `ratelimit:lux-tts:${userId}`
2. Call `checkRateLimit(key, LUX_TTS_LIMIT, LUX_TTS_WINDOW_SECONDS)`
3. Return `{ allowed: result.allowed, retryAfter: result.retryAfter }`

### 2. Wire Rate Limit Check into Media Router

File: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/media.ts`

**New import:**
- `{ isLuxTtsModel, checkLuxTtsRateLimit }` from `../services/rateLimiter`

**Modification points (2 procedures):**

#### a) `generateAudio` procedure (~line 1300)

After the existing `mediaGenerationLimiter.isAllowed()` check (line ~1303) and before the abuse guard check (line ~1311), add a conditional block:

```
If isLuxTtsModel(input.model):
  Call checkLuxTtsRateLimit(ctx.user.id)
  If not allowed:
    Throw TRPCError with code "TOO_MANY_REQUESTS"
    Message: "Lux TTS rate limit exceeded (5 requests per 10 minutes). Try again in {retryAfter} seconds."
```

#### b) `generateAudioAsync` procedure (~line 1413)

Same pattern -- after the `mediaGenerationLimiter.isAllowed()` check (line ~1415) and before the abuse guard check (line ~1422), add the same conditional `isLuxTtsModel` + `checkLuxTtsRateLimit` block with identical error messaging.

### Key Design Decisions

1. **Reuse `checkRateLimit` from `distributedRateLimit.ts`** rather than creating a new Redis sliding window implementation. This avoids code duplication and uses the tested ZSET algorithm.

2. **Place the function in `rateLimiter.ts`** (not `distributedRateLimit.ts`) because `rateLimiter.ts` is the canonical import location for all rate limiters in the media router. The `distributedRateLimit.ts` file is middleware-oriented (Express middleware factory); the Lux TTS check is called directly in a tRPC procedure.

3. **Check placement order in the procedure**: The Lux TTS rate limit check runs after the general `mediaGenerationLimiter` (which catches high-volume abuse across all media types) but before credit checks (which are more expensive DB operations). This short-circuits early for TTS-specific abuse.

4. **Fail-closed behavior**: The underlying `checkRateLimit` fails closed (rejects when Redis is unavailable). This is acceptable for the TTS limiter since voice cloning abuse is a high-severity risk per the interview decision.

### File Paths Summary

| File | Action |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/luxTtsRateLimit.test.ts` | Create -- test suite |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/rateLimiter.ts` | Modify -- add `checkLuxTtsRateLimit`, `isLuxTtsModel`, `LUX_TTS_MODEL_ID` |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/media.ts` | Modify -- wire rate limit into `generateAudio` and `generateAudioAsync` |

### Dependencies on Other Sections

- **section-03-python-provider**: Defines `fal-ai/lux-tts` as a model ID in `FalAIProvider.AUDIO_MODELS`. The model ID string `"fal-ai/lux-tts"` must match exactly.
- **section-02-seed-script**: Seeds the `fal-ai/lux-tts` model row in the database. The rate limiter works independently of whether the model is seeded (it checks model ID from the request input).

No other sections depend on this section.
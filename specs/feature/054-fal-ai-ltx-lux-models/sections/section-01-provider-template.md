Now I have all the context needed. Let me produce the section content.

# Section 01 -- Provider Template & testFalAI Fix

## Overview

This section updates the fal.ai provider template in both `PROVIDER_TEMPLATES` (runtime) and `DEFAULT_PROVIDERS` (seed) to include the 7 LTX-2.3 video models and 1 Lux TTS audio model. It also fixes `testFalAI()` to use an authenticated POST probe instead of the broken OPTIONS request.

**Files modified:**
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaProviders.ts`
- `/home/dev/projects/SmartSpecPro/apps/web/scripts/seed-media-providers.ts`

**Depends on:** Nothing (Batch 1, parallelizable)
**Blocks:** section-02-seed-script

---

## Tests First

### Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/__tests__/testFalAI.test.ts`

```typescript
// testFalAI.test.ts
//
// Tests for the fixed testFalAI() function and provider template completeness.
// Uses Vitest with fetch mocking.

// --- testFalAI authentication probe ---
// Test: testFalAI sends POST to https://queue.fal.run/fal-ai/flux/schnell with Authorization: Key {apiKey}
// Test: testFalAI returns { success: true } when API responds with 422 (bad input = key valid)
// Test: testFalAI returns { success: false } when API responds with 401 (key invalid)
// Test: testFalAI returns { success: false } when API responds with 403 (key forbidden)
// Test: testFalAI handles network errors gracefully (returns { success: false })
// Test: testFalAI never sends the actual API key in the response message

// --- Provider template completeness ---
// Test: PROVIDER_TEMPLATES fal_ai entry contains all 7 LTX-2.3 video models
// Test: PROVIDER_TEMPLATES fal_ai entry contains Lux TTS audio model
// Test: PROVIDER_TEMPLATES fal_ai entry retains existing 4 Flux image models
// Test: Each model entry has id, name, type, and description fields
// Test: Video model IDs match expected fal-ai/ltx-2.3/* pattern
// Test: Lux TTS model ID is "fal-ai/lux-tts" with type "audio"
```

Implementation notes for tests:
- Mock `global.fetch` using `vi.fn()` to intercept the POST request
- Import `PROVIDER_TEMPLATES` directly from the router module (it is exported as a named constant)
- For template completeness tests, filter the templates array for `providerName === "fal_ai"` and assert on the `availableModels` array

---

## Implementation Details

### 1. Update `PROVIDER_TEMPLATES` in `mediaProviders.ts`

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaProviders.ts`

**Location:** The `fal_ai` entry in the `PROVIDER_TEMPLATES` array (currently at approximately line 34-50).

**Changes:**

1. Update the `description` field to mention LTX-2.3 and Lux TTS:
   ```
   "Fast inference platform for generative AI - LTX-2.3 video generation, Lux TTS voice synthesis, and Flux image generation"
   ```

2. Add 7 LTX-2.3 video model entries to the `availableModels` array (keep existing image and video entries):

   | id | name | type | description |
   |---|---|---|---|
   | `fal-ai/ltx-2.3/text-to-video` | LTX-2.3 Text to Video | video | Text-to-video generation (standard quality) |
   | `fal-ai/ltx-2.3/text-to-video/fast` | LTX-2.3 Text to Video (Fast) | video | Fast text-to-video generation |
   | `fal-ai/ltx-2.3/image-to-video` | LTX-2.3 Image to Video | video | Image-to-video generation (standard quality) |
   | `fal-ai/ltx-2.3/image-to-video/fast` | LTX-2.3 Image to Video (Fast) | video | Fast image-to-video generation |
   | `fal-ai/ltx-2.3/audio-to-video` | LTX-2.3 Audio to Video | video | Audio-driven video generation |
   | `fal-ai/ltx-2.3/extend-video` | LTX-2.3 Extend Video | video | Extend existing video clips |
   | `fal-ai/ltx-2.3/retake-video` | LTX-2.3 Retake Video | video | Re-generate video with modified parameters |

3. Add 1 Lux TTS audio model entry:

   | id | name | type | description |
   |---|---|---|---|
   | `fal-ai/lux-tts` | Lux TTS | audio | Text-to-speech with voice cloning |

4. Keep all existing entries (`fal-ai/flux/schnell`, `fal-ai/flux/dev`, `fal-ai/flux-pro`, `fal-ai/stable-diffusion-v3-medium`, `fal-ai/minimax-video-01`, `fal-ai/kling-video/v1/standard/image-to-video`).

The final `availableModels` array for fal_ai should have **14 entries total**: 4 Flux image + 2 existing video + 7 LTX-2.3 video + 1 Lux TTS audio.

### 2. Update `DEFAULT_PROVIDERS` in `seed-media-providers.ts`

**File:** `/home/dev/projects/SmartSpecPro/apps/web/scripts/seed-media-providers.ts`

**Location:** The `fal_ai` entry in the `DEFAULT_PROVIDERS` array (currently at approximately line 52-68).

**Changes:** Mirror the exact same changes made to `PROVIDER_TEMPLATES`:

1. Update `description` to match the updated template description.
2. Add the same 7 LTX-2.3 video models and 1 Lux TTS audio model to `availableModels`.
3. Keep existing entries (note: the seed file currently has `fal-ai/minimax-video-01` but lacks the kling entry; add LTX-2.3 and Lux TTS entries alongside whatever currently exists).

**Critical:** The `availableModels` arrays in `PROVIDER_TEMPLATES` and `DEFAULT_PROVIDERS` must match exactly in terms of model IDs, names, types, and descriptions. The seed script controls what is stored in the `media_providers` table, while `PROVIDER_TEMPLATES` controls what the admin UI shows when adding a new provider. Mismatches cause confusion.

### 3. Fix `testFalAI()` function

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaProviders.ts`

**Location:** The `testFalAI` function (currently at line 478-494).

**Current problem:** Uses `OPTIONS` HTTP method which is a CORS preflight that bypasses authentication entirely. The function always returns success regardless of whether the API key is valid.

**New implementation approach:**

```typescript
async function testFalAI(apiKey: string): Promise<{ success: boolean; message: string }> {
    // Send an authenticated POST to the queue endpoint with minimal payload.
    // A valid key returns 422 (validation error for missing required fields).
    // An invalid key returns 401.
}
```

Key details:
- **URL:** `https://queue.fal.run/fal-ai/flux/schnell`
- **Method:** `POST`
- **Headers:**
  - `Authorization: Key ${apiKey}`
  - `Content-Type: application/json`
- **Body:** `JSON.stringify({})` (empty object -- triggers 422 for valid keys)
- **Response handling:**
  - `422` (Unprocessable Entity) -> `{ success: true, message: "API key validated (inference endpoint reachable)" }`
  - `401` -> `{ success: false, message: "Invalid API key" }`
  - `403` -> `{ success: false, message: "API key forbidden" }`
  - `429` -> `{ success: true, message: "API key valid (rate limited)" }` -- rate limit implies valid auth
  - Any other non-2xx -> `{ success: false, message: "fal.ai error (HTTP ${response.status})" }`
  - `200`/`201` (unexpected success) -> `{ success: true, message: "Connection successful" }`
  - Network error (catch block) -> `{ success: false, message: "Connection failed: ${error.message}" }`
- **Security:** Never include the API key value or response body in the returned `message` string. Never log the API key.

### 4. Consistency checklist

After implementation, verify:
- [ ] `PROVIDER_TEMPLATES` fal_ai `availableModels` has 14 entries
- [ ] `DEFAULT_PROVIDERS` fal_ai `availableModels` has matching entries (same IDs, names, types)
- [ ] `testFalAI()` uses POST, not OPTIONS
- [ ] `testFalAI()` checks for 422 (valid key) vs 401 (invalid key)
- [ ] All LTX-2.3 model IDs use the `fal-ai/ltx-2.3/` prefix
- [ ] Lux TTS model ID is `fal-ai/lux-tts`
- [ ] No API key or response body content is leaked in test result messages
- [ ] TypeScript compilation passes (`pnpm check` from `apps/web/`)

---

## Interface Contracts

This section defines the model IDs that are referenced throughout all subsequent sections. The following model ID constants are authoritative:

**Video models (used by section-03 `FalAIProvider.VIDEO_MODELS`, section-05 Celery polling):**
- `fal-ai/ltx-2.3/text-to-video`
- `fal-ai/ltx-2.3/text-to-video/fast`
- `fal-ai/ltx-2.3/image-to-video`
- `fal-ai/ltx-2.3/image-to-video/fast`
- `fal-ai/ltx-2.3/audio-to-video`
- `fal-ai/ltx-2.3/extend-video`
- `fal-ai/ltx-2.3/retake-video`

**Audio models (used by section-03 `FalAIProvider.AUDIO_MODELS`, section-07 rate limiting):**
- `fal-ai/lux-tts`

**Image models (used by section-03 `FalAIProvider.IMAGE_MODELS`):**
- `fal-ai/flux/schnell`
- `fal-ai/flux/dev`
- `fal-ai/flux-pro`
- `fal-ai/stable-diffusion-v3-medium`

**Provider name:** `fal_ai` (used by section-02 seed script, section-04 gateway routing normalization)

**Auth header format:** `Authorization: Key {api_key}` (NOT Bearer -- used by section-03 FalAIProvider constructor)
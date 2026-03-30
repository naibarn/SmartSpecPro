# 054 — fal.ai LTX-2.3 Video Models & Lux TTS Integration

Version: 2.1
Date: 2026-03-22
Status: Proposed
Depends-on: None (fal.ai provider template already exists in TypeScript layer)
Reference:
- https://fal.ai/models/fal-ai/ltx-2.3
- https://fal.ai/models/fal-ai/lux-tts

---

## 1. Executive Summary

เพิ่ม 8 media models ใหม่จาก fal.ai เข้าสู่ระบบ SmartSpecPro:

- **7 Video models** จากตระกูล LTX-2.3 ครอบคลุม text-to-video, image-to-video, audio-to-video, extend-video, retake-video (ทั้งรุ่น standard และ fast)
- **1 Audio model** คือ Lux TTS สำหรับ text-to-speech พร้อม voice cloning

### สิ่งที่มีอยู่แล้ว (TypeScript layer only)
- fal.ai provider template ใน `mediaProviders.ts` (providerName: `fal_ai`) — UI template only, ไม่ใช่ Python provider
- โครงสร้าง `mediaModels` table, `mediaProviders` table, seed scripts
- Celery task pipeline สำหรับ media generation (image/video/audio)
- Provider connection test (OPTIONS request — **ไม่ validate API key จริง**, ดู Security §10.5)
- Frontend dynamic form renderer (`ModelInputFieldsPanel.tsx`) รองรับ `video_urls`, `audio_urls` field types อยู่แล้ว

### สิ่งที่ไม่มี (Python backend)
- **ไม่มี** fal.ai provider handler ใน Python — ปัจจุบัน unknown providers จะ fallback ไป KieAIProvider
- **ไม่มี** routing branch สำหรับ `fal_ai` ใน `gateway_unified.py` (ต้องเพิ่มใน 3 methods: `generate_image`, `generate_video`, `generate_audio`)
- **ไม่มี** fal.ai polling branch ใน `recover_stuck_tasks` Celery task

### สิ่งที่ต้องทำ
1. อัปเดต fal.ai provider template ใน `mediaProviders.ts` **และ** `seed-media-providers.ts` (ทั้ง 2 files)
2. สร้าง seed script `seed-media-models-fal-ai.ts` สำหรับ model definitions + configJson (รวม `priority`, `sortOrder`, `creditCost`)
3. สร้าง fal.ai provider handler `fal_ai_provider.py` พร้อม SSRF validation และ `aclose()`
4. เพิ่ม routing branches ใน `gateway_unified.py` สำหรับ 3 methods (image/video/audio)
5. เพิ่ม `FalAIProvider` export ใน `providers/__init__.py`
6. เพิ่ม fal.ai polling branch ใน `media_tasks.py` `recover_stuck_tasks`
7. แก้ไข pricing calculator สำหรับ resolution-based per-duration pricing
8. เพิ่ม security controls: SSRF validation, TTS rate limiting, credit verification from actual output

---

## 2. Model Catalog

### 2.1 LTX-2.3 Text-to-Video (Standard)

| Field | Value |
|-------|-------|
| **Model ID** | `fal-ai/ltx-2.3/text-to-video` |
| **Display Name** | LTX-2.3 Text to Video |
| **Type** | `video` |
| **Category** | `text-to-video` |
| **API Endpoint** | `fal-ai/ltx-2.3/text-to-video` |
| **creditCost** | 360 (base: 1080p × 6s = 60 × 6) |
| **priority** | 50 |
| **sortOrder** | 50 |

**Input Parameters:**

| Parameter | Type | Default | Required | Options |
|-----------|------|---------|----------|---------|
| `prompt` | string | — | Yes | Max 5000 chars |
| `duration` | integer | 6 | No | 6, 8, 10 |
| `resolution` | select | `1080p` | No | 1080p, 1440p, 2160p |
| `aspect_ratio` | select | `16:9` | No | 16:9, 9:16 |
| `fps` | select | 25 | No | 24, 25, 48, 50 |
| `generate_audio` | boolean | true | No | — |

**Output:** `{ video: { url, content_type: "video/mp4", width, height, fps, duration, num_frames } }`

**Pricing (per second):**

| Resolution | Cost/sec USD | Platform Credits/sec |
|------------|-------------|---------------------|
| 1080p | $0.06 | 60 |
| 1440p | $0.12 | 120 |
| 2160p | $0.24 | 240 |

---

### 2.2 LTX-2.3 Text-to-Video (Fast)

| Field | Value |
|-------|-------|
| **Model ID** | `fal-ai/ltx-2.3/text-to-video/fast` |
| **Display Name** | LTX-2.3 Text to Video (Fast) |
| **Type** | `video` |
| **Category** | `text-to-video` |
| **API Endpoint** | `fal-ai/ltx-2.3/text-to-video/fast` |
| **creditCost** | 240 (base: 1080p × 6s = 40 × 6) |
| **priority** | 51 |
| **sortOrder** | 51 |

**Input Parameters:** เหมือน 2.1 แต่ duration รองรับเพิ่ม: 6, 8, 10, 12, 14, 16, 18, 20

**Pricing (per second) — ถูกกว่า Standard ~33%:**

| Resolution | Cost/sec USD | Platform Credits/sec |
|------------|-------------|---------------------|
| 1080p | $0.04 | 40 |
| 1440p | $0.08 | 80 |
| 2160p | $0.16 | 160 |

---

### 2.3 LTX-2.3 Image-to-Video (Standard)

| Field | Value |
|-------|-------|
| **Model ID** | `fal-ai/ltx-2.3/image-to-video` |
| **Display Name** | LTX-2.3 Image to Video |
| **Type** | `video` |
| **Category** | `image-to-video` |
| **API Endpoint** | `fal-ai/ltx-2.3/image-to-video` |
| **creditCost** | 360 |
| **priority** | 52 |
| **sortOrder** | 52 |

**Input Parameters:**

| Parameter | Type | Default | Required | Options |
|-----------|------|---------|----------|---------|
| `image_url` | image_urls | — | Yes | Start frame image (PNG, JPEG, WebP, AVIF, HEIF) |
| `end_image_url` | image_urls | — | No | End frame for transitions |
| `prompt` | string | — | Yes | Max 5000 chars |
| `duration` | integer | 6 | No | 6, 8, 10 |
| `resolution` | select | `1080p` | No | 1080p, 1440p, 2160p |
| `aspect_ratio` | select | `auto` | No | auto, 16:9, 9:16 |
| `fps` | select | 25 | No | 24, 25, 48, 50 |
| `generate_audio` | boolean | true | No | — |

**Pricing:** เหมือน 2.1 (per second by resolution)

---

### 2.4 LTX-2.3 Image-to-Video (Fast)

| Field | Value |
|-------|-------|
| **Model ID** | `fal-ai/ltx-2.3/image-to-video/fast` |
| **Display Name** | LTX-2.3 Image to Video (Fast) |
| **Type** | `video` |
| **Category** | `image-to-video` |
| **API Endpoint** | `fal-ai/ltx-2.3/image-to-video/fast` |
| **creditCost** | 240 |
| **priority** | 53 |
| **sortOrder** | 53 |

**Input Parameters:** เหมือน 2.3 แต่ duration รองรับเพิ่ม: 6, 8, 10, 12, 14, 16, 18, 20

**Pricing:** เหมือน 2.2 (Fast pricing)

---

### 2.5 LTX-2.3 Audio-to-Video

| Field | Value |
|-------|-------|
| **Model ID** | `fal-ai/ltx-2.3/audio-to-video` |
| **Display Name** | LTX-2.3 Audio to Video |
| **Type** | `video` |
| **Category** | `audio-to-video` |
| **API Endpoint** | `fal-ai/ltx-2.3/audio-to-video` |
| **creditCost** | 600 (base: 100 × 6s) |
| **priority** | 54 |
| **sortOrder** | 54 |

**Input Parameters:**

| Parameter | Type | Default | Required | Options |
|-----------|------|---------|----------|---------|
| `audio_url` | audio_urls | — | Yes | Audio file URL (duration 2-20 sec) |
| `image_url` | image_urls | — | No | Initial frame image |
| `prompt` | string | — | Conditional* | Video description |
| `guidance_scale` | number | 5 (text) / 9 (image) | No | Range: 1-50 |

*`prompt` required if `image_url` not provided

**Output:** `{ video: { url, content_type, width, height, fps, duration, num_frames } }`

**Pricing:** $0.10/second → 100 credits/sec (flat, no resolution tiers)

---

### 2.6 LTX-2.3 Extend Video

| Field | Value |
|-------|-------|
| **Model ID** | `fal-ai/ltx-2.3/extend-video` |
| **Display Name** | LTX-2.3 Extend Video |
| **Type** | `video` |
| **Category** | `extend-video` |
| **API Endpoint** | `fal-ai/ltx-2.3/extend-video` |
| **creditCost** | 500 (base: 100 × 5s default) |
| **priority** | 55 |
| **sortOrder** | 55 |

**Input Parameters:**

| Parameter | Type | Default | Required | Options |
|-----------|------|---------|----------|---------|
| `video_url` | video_urls | — | Yes | Video URL to extend |
| `prompt` | string | — | No | Description for extended portion |
| `duration` | number | 5 | No | Max 20 seconds |
| `mode` | select | `end` | No | `start`, `end` |
| `context` | number | — | No | Seconds of context from input (1-20) |

**Output:** `{ video: { url, content_type, file_size, width, height, fps, duration, num_frames } }`

**Pricing:** $0.10/second → 100 credits/sec

---

### 2.7 LTX-2.3 Retake Video

| Field | Value |
|-------|-------|
| **Model ID** | `fal-ai/ltx-2.3/retake-video` |
| **Display Name** | LTX-2.3 Retake Video |
| **Type** | `video` |
| **Category** | `retake-video` |
| **API Endpoint** | `fal-ai/ltx-2.3/retake-video` |
| **creditCost** | 500 (base: 100 × 5s default) |
| **priority** | 56 |
| **sortOrder** | 56 |

**Input Parameters:**

| Parameter | Type | Default | Required | Options |
|-----------|------|---------|----------|---------|
| `video_url` | video_urls | — | Yes | Video URL to retake |
| `prompt` | string | — | Yes | Retake prompt |
| `start_time` | number | 0 | No | Start time in seconds (0-20) |
| `duration` | number | 5 | No | Duration in seconds (2-20) |
| `retake_mode` | select | `replace_audio_and_video` | No | `replace_audio`, `replace_video`, `replace_audio_and_video` |

**Output:** `{ video: { url, content_type, width, height, fps, duration, num_frames } }`

**Pricing:** $0.10/second → 100 credits/sec

---

### 2.8 Lux TTS (Text-to-Speech)

| Field | Value |
|-------|-------|
| **Model ID** | `fal-ai/lux-tts` |
| **Display Name** | Lux TTS (Voice Cloning) |
| **Type** | `audio` |
| **Category** | `text-to-speech` |
| **API Endpoint** | `fal-ai/lux-tts` |
| **creditCost** | 2 (base: ceil(1.4) for minimum 1K chars) |
| **priority** | 57 |
| **sortOrder** | 57 |

**Input Parameters:**

| Parameter | Type | Default | Required | Options |
|-----------|------|---------|----------|---------|
| `prompt` | string | — | Yes | Text to convert to speech |
| `audio_url` | audio_urls | — | Yes | Reference audio for voice cloning |
| `num_inference_steps` | number | 4 | No | Range: 1-16 |
| `max_ref_length` | number | 5 | No | Range: 1-15 seconds |
| `guidance_scale` | number | 3 | No | Range: 0-10 |
| `seed` | number | — | No | Random seed for reproducibility |

**Output:** `{ audio: { url, content_type, file_name, file_size }, seed, timings }`

**Pricing:** $0.0014 per 1,000 characters → 1.4 credits per 1,000 chars
- Billing unit: 1,000 characters
- Output: 48kHz speech audio

---

## 3. Pricing Summary

| Model | Pricing Type | Cost (USD) | Platform Credits | Base creditCost |
|-------|-------------|-----------|-----------------|----------------|
| LTX-2.3 T2V Standard (1080p) | per second | $0.06/sec | 60/sec | 360 |
| LTX-2.3 T2V Standard (1440p) | per second | $0.12/sec | 120/sec | — |
| LTX-2.3 T2V Standard (2160p) | per second | $0.24/sec | 240/sec | — |
| LTX-2.3 T2V Fast (1080p) | per second | $0.04/sec | 40/sec | 240 |
| LTX-2.3 T2V Fast (1440p) | per second | $0.08/sec | 80/sec | — |
| LTX-2.3 T2V Fast (2160p) | per second | $0.16/sec | 160/sec | — |
| LTX-2.3 I2V Standard | per second | same as T2V Std | same as T2V Std | 360 |
| LTX-2.3 I2V Fast | per second | same as T2V Fast | same as T2V Fast | 240 |
| LTX-2.3 Audio-to-Video | per second | $0.10/sec | 100/sec | 600 |
| LTX-2.3 Extend Video | per second | $0.10/sec | 100/sec | 500 |
| LTX-2.3 Retake Video | per second | $0.10/sec | 100/sec | 500 |
| Lux TTS | per 1K chars | $0.0014/1K chars | 1.4/1K chars | 2 |

Credit conversion: 1 USD = 1,000 platform credits
`creditCost` = minimum-tier cost for default parameters (1080p × min duration)

### 3.1 Pricing Formula Design

**IMPORTANT:** ปัจจุบัน `pricingCalculator.ts` `buildTierKey()` สำหรับ `per_duration` สร้าง tier key จาก duration (`"6s"`) ไม่ใช่ resolution — ทำให้ resolution-based tiers ไม่ทำงาน

**Solution:** ใช้ `pricingFormula: "matrix"` แทน `"per_duration"` สำหรับ video models ที่มี resolution tiers:

```typescript
// configJson for resolution × duration pricing
{
  pricingFormula: "matrix",
  pricingTiers: {
    "1080p": 60,    // credits per second at 1080p
    "1440p": 120,   // credits per second at 1440p
    "2160p": 240,   // credits per second at 2160p
    "default": 60,  // fallback to 1080p rate
  },
  // resolution field must have affectsPricing: true
}
```

จากนั้น **ต้องแก้ไข** `calculateCreditCost()` ใน `pricingCalculator.ts` เพราะปัจจุบัน function นี้ return `baseCost * multiplier` โดย `multiplier` คือ `numImages` (default 1) — **ไม่ได้คูณ duration**

ถ้า `pricingTiers["1080p"] = 60` (credits per second) แล้ว function จะ return 60 credits ทั้งหมด แทนที่จะเป็น 60 × 6s = 360

**Fix required ใน `calculateCreditCost()` (after line 191):**

```typescript
// Duration multiplication for per-second video pricing
if ((config.pricingFormula === "matrix" || config.pricingFormula === "per_duration")
    && selections.duration) {
  return baseCost * Number(selections.duration) * multiplier;
}

return baseCost * multiplier;
```

สำหรับ models ที่ไม่มี resolution tiers (A2V, extend, retake):
```typescript
{
  pricingFormula: "per_duration",
  pricingTiers: { "default": 100 },  // 100 credits/sec flat
}
```

**Post-generation verification (MANDATORY):** Credits ต้องคำนวณจาก actual output `video.duration` จาก fal.ai response, ไม่ใช่จาก client-declared duration — ดู Security §10.3

---

## 4. Technical Implementation

### 4.1 Files to Modify (Complete List)

| File | Change | Priority |
|------|--------|----------|
| `apps/web/server/routers/mediaProviders.ts` | Update fal_ai `availableModels` in `PROVIDER_TEMPLATES` | P1 |
| `apps/web/scripts/seed-media-providers.ts` | Update fal_ai `availableModels` in `DEFAULT_PROVIDERS` (must match above) | P1 |
| `apps/web/scripts/seed-media-models-fal-ai.ts` | **NEW** — Seed script with all 8 model definitions | P1 |
| `apps/web/server/services/pricingCalculator.ts` | Fix `"matrix"` formula to support resolution × duration pricing | P1 |
| `python-backend/app/llm_proxy/providers/fal_ai_provider.py` | **NEW** — fal.ai provider handler with SSRF validation | P2 |
| `python-backend/app/llm_proxy/providers/__init__.py` | Export `FalAIProvider` in `__all__` | P2 |
| `python-backend/app/llm_proxy/gateway_unified.py` | Add fal_ai routing in `generate_image()`, `generate_video()`, `generate_audio()` + `_normalize_provider_id()` alias | P2 |
| `python-backend/app/tasks/media_tasks.py` | Add fal.ai polling branch in `_recover_stuck_tasks_async()` | P2 |
| `apps/web/server/services/rateLimiter.ts` | Add `luxTtsLimiter` (5 req/10min per user) | P2 |
| `apps/web/server/routers/mediaProviders.ts` | Update `testFalAI()` to use authenticated probe | P3 |

**Files that do NOT need changes:**
- `mediaGenerationService.ts` `MEDIA_MODELS` static dict — fal.ai models resolve provider from `api_config["provider"]` (bypasses static dict)
- `ModelInputFieldsPanel.tsx` — existing renderer handles `video_urls`, `audio_urls`, `select`, `number`, `boolean` types
- `media_generation.py` (FastAPI endpoints) — generic, provider-agnostic
- `unified_client.py` — ใช้สำหรับ LLM text providers เท่านั้น; media providers instantiate per-request ใน gateway

### 4.2 Provider Template Update

Update `PROVIDER_TEMPLATES` in `mediaProviders.ts` **AND** `DEFAULT_PROVIDERS` in `seed-media-providers.ts` (both must match):

```typescript
{
  providerName: "fal_ai",
  displayName: "fal.ai",
  description: "Fast inference platform for generative AI — LTX-2.3 video generation, Lux TTS, and image models",
  providerType: "multimodal" as const,
  baseUrl: "https://fal.run",
  defaultModel: "fal-ai/flux/schnell",
  availableModels: [
    // Image models (existing)
    { id: "fal-ai/flux/schnell", name: "Flux Schnell", type: "image" as const, description: "Ultra-fast image generation" },
    { id: "fal-ai/flux/dev", name: "Flux Dev", type: "image" as const, description: "High quality image generation" },
    { id: "fal-ai/flux-pro", name: "Flux Pro", type: "image" as const, description: "Professional image generation" },
    { id: "fal-ai/stable-diffusion-v3-medium", name: "SD3 Medium", type: "image" as const, description: "SD3 image generation" },
    // Video models — LTX-2.3 (NEW)
    { id: "fal-ai/ltx-2.3/text-to-video", name: "LTX-2.3 Text to Video", type: "video" as const, description: "High-quality text-to-video (1080p-2160p, 6-10s)" },
    { id: "fal-ai/ltx-2.3/text-to-video/fast", name: "LTX-2.3 Text to Video (Fast)", type: "video" as const, description: "Fast text-to-video generation (1080p-2160p, 6-20s)" },
    { id: "fal-ai/ltx-2.3/image-to-video", name: "LTX-2.3 Image to Video", type: "video" as const, description: "Animate image to video (1080p-2160p, 6-10s)" },
    { id: "fal-ai/ltx-2.3/image-to-video/fast", name: "LTX-2.3 Image to Video (Fast)", type: "video" as const, description: "Fast image-to-video generation (1080p-2160p, 6-20s)" },
    { id: "fal-ai/ltx-2.3/audio-to-video", name: "LTX-2.3 Audio to Video", type: "video" as const, description: "Generate video from audio (2-20s)" },
    { id: "fal-ai/ltx-2.3/extend-video", name: "LTX-2.3 Extend Video", type: "video" as const, description: "Extend existing video (start or end)" },
    { id: "fal-ai/ltx-2.3/retake-video", name: "LTX-2.3 Retake Video", type: "video" as const, description: "Re-generate segments of existing video" },
    // Video models (existing)
    { id: "fal-ai/minimax-video-01", name: "MiniMax Video", type: "video" as const, description: "Video generation" },
    { id: "fal-ai/kling-video/v1/standard/image-to-video", name: "Kling Image to Video", type: "video" as const, description: "Image to video conversion" },
    // Audio models — Lux TTS (NEW)
    { id: "fal-ai/lux-tts", name: "Lux TTS", type: "audio" as const, description: "Text-to-speech with voice cloning (48kHz)" },
  ],
},
```

### 4.3 Seed Script (`seed-media-models-fal-ai.ts`)

สร้าง seed script ใหม่สำหรับ fal.ai models โดยใช้โครงสร้างเดียวกับ `seed-media-models-kie-ai.ts`.

**Each model INSERT ต้องมี fields ครบ:**
- `modelId` — fal.ai endpoint path
- `provider` — `"fal_ai"`
- `modelType` — `"video"` หรือ `"audio"`
- `displayName` — human-readable name
- `description` — one-line description
- `creditCost` — integer (minimum-tier cost, ดู §2.x)
- `priority` — integer (50-57 range for fal.ai)
- `sortOrder` — integer (same as priority)
- `isEnabled` — `true`
- `configJson` — ModelDefinition object (see below)
- `aspectRatios` — JSON array สำหรับ video models
- `durations` — JSON array สำหรับ video models
- `voices` — `NULL` (ไม่มี voice list สำหรับ video; TTS ใช้ reference audio ไม่ใช่ preset voices)
- `aliases` — JSON array ของ alternative names

**Key configJson patterns:**

```typescript
// Video models with resolution × duration pricing (T2V, I2V standard/fast)
{
  apiEndpoint: "fal-ai/ltx-2.3/text-to-video",
  apiPayloadFormat: "custom",  // FalAIProvider handles payload construction
  kieModelId: null,
  pricingFormula: "matrix",    // NOT "per_duration" — see §3.1
  pricingTiers: {
    "1080p": 60,    // credits per second
    "1440p": 120,
    "2160p": 240,
    "default": 60,
  },
  generateType: "video",
  hasAudio: true,
  maxDuration: 10,
  supportedResolutions: ["1080p", "1440p", "2160p"],
  supportedDurations: [6, 8, 10],
  supportedAspectRatios: ["16:9", "9:16"],
  inputFields: [
    { key: "prompt", label: "Prompt", type: "text", required: true },
    { key: "duration", label: "Duration (seconds)", type: "select",
      options: [
        { value: "6", label: "6s" },
        { value: "8", label: "8s" },
        { value: "10", label: "10s" },
      ], default: "6" },
    { key: "resolution", label: "Resolution", type: "select",
      options: [
        { value: "1080p", label: "1080p" },
        { value: "1440p", label: "1440p" },
        { value: "2160p", label: "2160p (4K)" },
      ], default: "1080p", affectsPricing: true },
    { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
      options: [
        { value: "16:9", label: "16:9 (Landscape)" },
        { value: "9:16", label: "9:16 (Portrait)" },
      ], default: "16:9" },
    { key: "fps", label: "Frame Rate", type: "select",
      options: [
        { value: "24", label: "24 fps" },
        { value: "25", label: "25 fps" },
        { value: "48", label: "48 fps" },
        { value: "50", label: "50 fps" },
      ], default: "25" },
    { key: "generate_audio", label: "Generate Audio", type: "boolean", default: true },
  ],
}

// Flat per-second video models (A2V, extend, retake)
{
  apiEndpoint: "fal-ai/ltx-2.3/audio-to-video",
  apiPayloadFormat: "custom",
  kieModelId: null,
  pricingFormula: "per_duration",
  pricingTiers: { "default": 100 },  // 100 credits/sec flat
  generateType: "video",
  hasAudio: true,
  maxDuration: 20,
  // ... inputFields specific to each model
}

// Lux TTS with per-unit (character) pricing
{
  apiEndpoint: "fal-ai/lux-tts",
  apiPayloadFormat: "custom",
  kieModelId: null,
  pricingFormula: "per_unit",
  pricingUnitMetric: "characters",
  pricingUnitField: "prompt",
  pricingUnitSize: 1000,
  pricingUnitRounding: "ceil",
  pricingMinUnits: 1,
  pricingTiers: {
    "default": 1.4,   // 1.4 credits per 1000 chars ($0.0014)
  },
  generateType: "audio",
  hasAudio: true,
  inputFields: [
    { key: "prompt", label: "Text", type: "text", required: true },
    { key: "audio_url", label: "Reference Voice Audio", type: "audio_urls", required: true },
    { key: "num_inference_steps", label: "Inference Steps", type: "number", default: 4 },
    { key: "max_ref_length", label: "Max Reference Length (sec)", type: "number", default: 5 },
    { key: "guidance_scale", label: "Guidance Scale", type: "number", default: 3 },
    { key: "seed", label: "Seed", type: "number" },
  ],
}
```

### 4.4 Python Provider (`fal_ai_provider.py`)

สร้าง fal.ai provider handler ใหม่ใน `python-backend/app/llm_proxy/providers/`. เป็น plain class (ไม่ inherit base class — ตาม pattern ของ `KieAIProvider`, `BytePlusModelArkProvider`, `UVoiceProvider`).

**Complete class design:**

```python
import httpx
import structlog
from typing import Optional
from app.core.media_job_validators import validate_uri_no_ssrf

logger = structlog.get_logger()

class FalAIProvider:
    """fal.ai media generation provider (LTX-2.3 video + Lux TTS)."""

    BASE_URL = "https://fal.run"
    QUEUE_BASE_URL = "https://queue.fal.run"

    # Model IDs for routing (used by recover_stuck_tasks to identify fal.ai tasks)
    VIDEO_MODELS = {
        "fal-ai/ltx-2.3/text-to-video",
        "fal-ai/ltx-2.3/text-to-video/fast",
        "fal-ai/ltx-2.3/image-to-video",
        "fal-ai/ltx-2.3/image-to-video/fast",
        "fal-ai/ltx-2.3/audio-to-video",
        "fal-ai/ltx-2.3/extend-video",
        "fal-ai/ltx-2.3/retake-video",
    }
    AUDIO_MODELS = {"fal-ai/lux-tts"}

    def __init__(self, api_key: str, base_url: Optional[str] = None):
        self._api_key = api_key  # Never log this value
        self.base_url = base_url or self.BASE_URL
        # Convention: scalar timeout, headers passed per-request (matching KieAI/BytePlus pattern)
        self._headers = {
            "Authorization": f"Key {api_key}",
            "Content-Type": "application/json",
        }
        self.client = httpx.AsyncClient(timeout=300.0)

    async def aclose(self) -> None:
        """Close the HTTP client. MUST be called in finally block."""
        await self.client.aclose()

    def _validate_urls(self, params: dict) -> None:
        """SSRF validation for all user-supplied URL fields. (SECURITY: MANDATORY)"""
        for url_field in ("image_url", "end_image_url", "audio_url", "video_url"):
            url = params.get(url_field)
            if url is not None:
                validate_uri_no_ssrf(url)  # raises ValueError on internal/private URLs

    async def generate_video(self, model_id: str, params: dict) -> dict:
        """
        Submit video generation via queue (ALWAYS queue for video — sync times out).
        Returns normalized dict: { "id": request_id, "data": [{"url": "..."}], "provider": "fal_ai" }
        """
        self._validate_urls(params)
        request_id = await self._submit_queue(model_id, params)
        return {
            "id": request_id,
            "data": [],  # empty until polled
            "provider": "fal_ai",
            "status": "PROCESSING",
            "model_id": model_id,
        }

    async def generate_audio(self, model_id: str, params: dict) -> dict:
        """
        Generate audio (Lux TTS). Uses sync endpoint (TTS is fast).
        Returns normalized dict with audio URL.
        """
        self._validate_urls(params)
        url = f"{self.base_url}/{model_id}"
        try:
            response = await self.client.post(url, json=params, headers=self._headers)
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            logger.error("fal_ai_audio_error", model=model_id, status=e.response.status_code)
            raise
        result = response.json()
        return {
            "id": None,
            "data": [{"url": result["audio"]["url"]}],
            "provider": "fal_ai",
            "status": "COMPLETED",
            "raw": result,
        }

    async def _submit_queue(self, model_id: str, params: dict) -> str:
        """POST https://queue.fal.run/{model_id} → returns request_id"""
        url = f"{self.QUEUE_BASE_URL}/{model_id}"
        try:
            response = await self.client.post(url, json=params, headers=self._headers)
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            logger.error("fal_ai_queue_submit_error", model=model_id, status=e.response.status_code)
            raise
        data = response.json()
        logger.info("fal_ai_queue_submitted", model=model_id, request_id=data["request_id"])
        return data["request_id"]

    async def get_queue_status(self, model_id: str, request_id: str) -> dict:
        """GET https://queue.fal.run/{model_id}/requests/{request_id}/status"""
        url = f"{self.QUEUE_BASE_URL}/{model_id}/requests/{request_id}/status"
        response = await self.client.get(url, headers=self._headers)
        response.raise_for_status()
        return response.json()
        # Returns: { "status": "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" }

    async def get_queue_result(self, model_id: str, request_id: str) -> dict:
        """
        GET https://queue.fal.run/{model_id}/requests/{request_id}
        Returns normalized result with video URL.
        """
        url = f"{self.QUEUE_BASE_URL}/{model_id}/requests/{request_id}"
        response = await self.client.get(url, headers=self._headers)
        response.raise_for_status()
        result = response.json()
        # Normalize to internal format
        video_data = result.get("video", {})
        return {
            "id": request_id,
            "data": [{"url": video_data.get("url", "")}],
            "provider": "fal_ai",
            "status": "COMPLETED",
            "raw": result,
            "actual_duration": video_data.get("duration"),  # for credit verification
            "actual_resolution": f"{video_data.get('width', 0)}x{video_data.get('height', 0)}",
        }
```

**fal.ai API patterns:**

| Method | URL | Purpose | When to use |
|--------|-----|---------|-------------|
| POST | `https://queue.fal.run/{model_id}` | Queue submission | **Always for video** (sync times out) |
| GET | `https://queue.fal.run/{model_id}/requests/{request_id}/status` | Status check | Polling from `recover_stuck_tasks` |
| GET | `https://queue.fal.run/{model_id}/requests/{request_id}` | Get result | When status == COMPLETED |
| POST | `https://fal.run/{model_id}` | Synchronous generation | **Only for Lux TTS** (audio is fast) |

**Authentication:** `Authorization: Key {FAL_KEY}`

### 4.5 Gateway Integration (`gateway_unified.py`)

**ไม่ใช่ factory registration** — ต้องเพิ่ม explicit `elif` routing blocks ใน 3 methods ตาม pattern เดียวกับ BytePlus:

#### 4.5.1 `_normalize_provider_id()` — เพิ่ม alias

```python
# Add after the byteplus_modelark alias block (~line 120)
if normalized in ("fal_ai", "falai", "fal", "fal_ai_provider"):
    return "fal_ai"
```

#### 4.5.2 `generate_video()` — เพิ่ม routing block

**NOTE:** Gateway returns plain dict (ไม่มี `VideoGenerationResponse` class — ตาม BytePlus/Kie.ai pattern)

```python
# Add BEFORE the Kie.ai else fallback block
# NOTE: Use request.model, request.extra_params (not bare locals)
elif resolved_provider == "fal_ai":
    from app.services.media_provider_service import get_media_provider_key
    provider_config = await get_media_provider_key("fal_ai")
    if not provider_config or not provider_config.get("apiKey"):
        raise HTTPException(status_code=503, detail="fal.ai provider not configured")
    fal_client = None
    try:
        fal_client = FalAIProvider(
            api_key=provider_config["apiKey"],
            base_url=provider_config.get("baseUrl"),
        )
        extra = request.extra_params or {}
        result = await fal_client.generate_video(request.model, extra)
        # result["data"] is empty — request_id stored in result["id"]
        # recover_stuck_tasks will poll and fill the URL later
        # Credit deduction happens in recover_stuck_tasks after actual duration is known
        return result  # plain dict
    finally:
        if fal_client is not None:
            await fal_client.aclose()
```

#### 4.5.3 `generate_audio()` — เพิ่ม routing block

```python
# Add BEFORE the Kie.ai else fallback block (after UVoice block)
# NOTE: Use request.model, request.extra_params (not bare locals)
elif resolved_provider == "fal_ai":
    from app.services.media_provider_service import get_media_provider_key
    provider_config = await get_media_provider_key("fal_ai")
    if not provider_config or not provider_config.get("apiKey"):
        raise HTTPException(status_code=503, detail="fal.ai provider not configured")
    fal_client = None
    try:
        fal_client = FalAIProvider(
            api_key=provider_config["apiKey"],
            base_url=provider_config.get("baseUrl"),
        )
        extra = request.extra_params or {}
        result = await fal_client.generate_audio(request.model, extra)
        # TTS is synchronous — result already contains audio URL
        # Credit deduction: use self._deduct_credits() with proper signature
        # (actual_cost as Decimal USD, full request/response objects)
        return result  # plain dict
    finally:
        if fal_client is not None:
            await fal_client.aclose()
```

**NOTE on `_deduct_credits()` signature:** The actual method requires:
```python
await self._deduct_credits(
    user,                    # User object
    Decimal("0.0014") * actual_chars / 1000,  # actual_cost in USD (Decimal, NOT credits)
    request,                 # AudioGenerationRequest object
    response,                # AudioGenerationResponse object
    estimated_cost,          # Decimal — pre-estimated cost
    False,                   # use_openrouter
)
```
Credits vs USD conversion is handled internally by `_deduct_credits()` — do NOT pass credit counts where USD Decimals are expected.

#### 4.5.4 `generate_image()` — เพิ่ม routing block (สำหรับ Flux models)

```python
# Add before Kie.ai fallback — routes existing Flux image models
elif resolved_provider == "fal_ai":
    # Same pattern as video — submit to fal.ai sync endpoint
    # (Flux image gen is fast enough for sync)
    ...
```

### 4.6 Celery Polling (`media_tasks.py`)

เพิ่ม fal.ai branch ใน `_recover_stuck_tasks_async()` สำหรับ video tasks ที่ใช้ queue:

```python
# In _recover_stuck_tasks_async(), add BEFORE the Kie.ai else block (after BytePlus block)
# NOTE: MediaTask has NO `provider` column — identify by model ID
from app.llm_proxy.providers.fal_ai_provider import FalAIProvider

elif task.model in FalAIProvider.VIDEO_MODELS or task.model in FalAIProvider.AUDIO_MODELS:
    # --- fal.ai polling branch ---
    from app.services.media_provider_service import get_media_provider_key
    provider_config = await get_media_provider_key("fal_ai")
    if not provider_config or not provider_config.get("apiKey"):
        logger.warning("recover_stuck_task_fal_ai_not_configured", task_id=task.id)
        continue

    fal_client = None
    try:
        fal_client = FalAIProvider(
            api_key=provider_config["apiKey"],
            base_url=provider_config.get("baseUrl"),
        )
        status = await fal_client.get_queue_status(task.model, task.task_id)

        if status.get("status") == "COMPLETED":
            result = await fal_client.get_queue_result(task.model, task.task_id)
            video_url = result["data"][0]["url"]
            actual_duration = result.get("actual_duration")

            # Re-host to R2/S3 (see Security §10.4)
            # Uses existing functions from media_pipeline.py:
            from app.services.media_pipeline import download_result, upload_to_r2
            import tempfile
            with tempfile.TemporaryDirectory() as tmp_dir:
                local_path, file_size, content_type = await download_result(video_url, tmp_dir)
                r2_info = await upload_to_r2(
                    user_id=str(task.user_id),
                    job_id=task.id,
                    result_path=local_path,
                    thumbnail_path=None,
                    media_type="video",
                )
                final_url = r2_info.get("result_url", video_url)

            task.status = TaskStatus.COMPLETED
            task.result_url = final_url
            task.result_data = result.get("raw", {})
            task.completed_at = datetime.now(timezone.utc)
            recovered_count += 1
            logger.info("recover_stuck_task_fal_ai_completed",
                        task_id=task.id, result_url=final_url)

        elif status.get("status") == "FAILED":
            task.status = TaskStatus.FAILED
            task.error_message = f"fal.ai failed: {status.get('error', 'Unknown error')[:200]}"
            task.completed_at = datetime.now(timezone.utc)
            failed_count += 1

        # IN_QUEUE / IN_PROGRESS: do nothing, re-check next cycle

    finally:
        if fal_client is not None:
            await fal_client.aclose()
```

**Key:** fal.ai `request_id` ต้อง store ใน `task.task_id` column เมื่อ submit queue — polling task จะใช้ `task.task_id` + `task.model` เพื่อ call `get_queue_result()`

### 4.7 Provider Registration

#### `providers/__init__.py`
```python
from .fal_ai_provider import FalAIProvider
__all__ = [..., "FalAIProvider"]
```

**NOTE:** `unified_client.py` `_initialize_provider_from_config()` ใช้สำหรับ LLM text providers เท่านั้น (OpenAI, Anthropic, Groq). Media providers (BytePlus, Kie.ai, UVoice, fal.ai) ถูก instantiate **per-request** ใน `gateway_unified.py` ผ่าน `get_media_provider_key()` — ไม่ต้องเพิ่ม fal.ai ใน `unified_client.py`

### 4.8 Frontend Considerations

**ไม่ต้องเปลี่ยน frontend components** — existing renderer handles ทุก field type:
- `video_urls`, `audio_urls`, `image_urls` → `LibraryFilePicker` textarea (line 587 of `ModelInputFieldsPanel.tsx`)
- `select` → dropdown with options
- `number` → number input
- `boolean` → checkbox/switch

---

## 5. Implementation Phases

### Phase 1: Provider Template + Seed Script + Pricing Fix (Day 1)

1. อัปเดต `mediaProviders.ts` `PROVIDER_TEMPLATES` — เพิ่ม LTX-2.3 + Lux TTS
2. อัปเดต `seed-media-providers.ts` `DEFAULT_PROVIDERS` — ให้ตรงกัน
3. สร้าง `apps/web/scripts/seed-media-models-fal-ai.ts` — 8 models พร้อม `priority`, `sortOrder`, `creditCost`
4. แก้ไข `pricingCalculator.ts` — support `"matrix"` formula: `pricingTiers[resolution] × duration`
5. รัน seed script

**Acceptance Criteria:**
- [ ] `availableModels` ตรงกันทั้ง `PROVIDER_TEMPLATES` และ `DEFAULT_PROVIDERS`
- [ ] Seed script สร้าง 8 rows ใน `mediaModels` table (verify: `SELECT "modelId", provider, "creditCost" FROM media_models WHERE provider = 'fal_ai'`)
- [ ] Admin UI แสดง models ใหม่ใน fal.ai provider settings
- [ ] `"matrix"` pricing formula คำนวณ credits ถูกต้อง: unit tests สำหรับทุก resolution × duration combination
- [ ] `pricingTiers` tier key ใช้ resolution (ไม่ใช่ duration) เป็น key

### Phase 2: Python Provider Handler + Gateway + Security (Day 2-3)

1. สร้าง `fal_ai_provider.py` พร้อม:
   - `_validate_urls()` SSRF validation (MANDATORY)
   - `generate_video()` via queue
   - `generate_audio()` via sync
   - `aclose()` cleanup
2. Export ใน `providers/__init__.py`
3. Register ใน `unified_client.py`
4. เพิ่ม routing branches ใน `gateway_unified.py` (3 methods)
5. เพิ่ม `_normalize_provider_id()` alias
6. เพิ่ม fal.ai polling branch ใน `media_tasks.py`
7. เพิ่ม `luxTtsLimiter` ใน `rateLimiter.ts` (5 req/10min per user)

**Acceptance Criteria:**
- [ ] `FalAIProvider` มี `_validate_urls()` เรียก `validate_uri_no_ssrf()` สำหรับทุก URL field
- [ ] Video generation ใช้ queue endpoint เสมอ (ไม่ใช้ sync)
- [ ] Audio (TTS) generation ใช้ sync endpoint
- [ ] `aclose()` ถูกเรียกใน `finally` block ทุกจุด
- [ ] `recover_stuck_tasks` มี fal.ai branch ที่ poll `get_queue_status()` + `get_queue_result()`
- [ ] Credits deducted จาก actual `video.duration` ของ fal.ai response (ไม่ใช่ client-declared)
- [ ] fal.ai CDN URLs ถูก re-host ไป R2/S3 ก่อนส่ง user
- [ ] Lux TTS มี separate rate limit (5 req/10min)
- [ ] Pytest unit tests pass ทุก provider method
- [ ] SSRF test: verify `http://169.254.169.254/...` ถูก reject

### Phase 3: Integration Testing + Security Hardening (Day 4)

1. End-to-end test: UI → tRPC → Celery → fal.ai → result → R2
2. ทดสอบ credit deduction ถูกต้องตาม pricing tiers (actual vs declared)
3. ทดสอบทุก model type
4. อัปเดต `testFalAI()` ให้ validate API key จริง
5. Strip HTML/XML tags จาก prompt ก่อนส่ง fal.ai
6. Handle fal.ai content-policy 422 rejections

**Acceptance Criteria:**
- [ ] ทุก model สามารถ generate ได้ผ่าน UI
- [ ] Credits deducted ถูกต้อง — unit test: request 2160p/10s → charge 240×10=2400 credits (ไม่ใช่ 60×10=600)
- [ ] Audit log บันทึก request/response ครบ (reference audio URL masked — domain only)
- [ ] Error cases (invalid API key, quota exceeded, content policy) แสดง error ที่เข้าใจได้
- [ ] `testFalAI()` returns `{ success: false }` สำหรับ invalid API key
- [ ] Lux TTS prompt ถูก sanitize (strip `<>` tags)
- [ ] fal.ai 422 content-policy → user-friendly error (ไม่ log rejected prompt content)

---

## 6. Security Requirements (MANDATORY)

### 10.1 SSRF Prevention (CRITICAL)

ทุก URL field ที่ user ส่งมา (`image_url`, `end_image_url`, `audio_url`, `video_url`) ต้องผ่าน `validate_uri_no_ssrf()` ก่อนส่งไป fal.ai:

```python
from app.core.media_job_validators import validate_uri_no_ssrf

# In FalAIProvider._validate_urls()
for url_field in ("image_url", "end_image_url", "audio_url", "video_url"):
    url = params.get(url_field)
    if url is not None:
        validate_uri_no_ssrf(url)  # rejects internal/private IPs
```

**Pattern from:** `byteplus_modelark_provider.py:211`

**CRITICAL: `host.docker.internal` bypass** — `validate_uri_no_ssrf()` ใน `media_job_validators.py:87` whitelist `host.docker.internal` สำหรับ asset downloads แต่ exception นี้จะ apply กับ fal.ai URL fields ด้วย ทำให้ user ส่ง `http://host.docker.internal:8000/api/v1/admin/...` เป็น `image_url` ได้ → เข้าถึง Node.js internal API

**Fix required:** เพิ่ม explicit check ใน `FalAIProvider._validate_urls()` ที่ reject `host.docker.internal`:
```python
def _validate_urls(self, params: dict) -> None:
    for url_field in ("image_url", "end_image_url", "audio_url", "video_url"):
        url = params.get(url_field)
        if url is not None:
            validate_uri_no_ssrf(url)
            # Additional check: reject host.docker.internal (whitelisted in validator for other use)
            from urllib.parse import urlparse
            hostname = urlparse(url).hostname or ""
            if hostname.lower() == "host.docker.internal":
                raise ValueError(f"URL targeting internal Docker host is not allowed: {url_field}")
```

**Defense-in-depth (MANDATORY):** tRPC layer (`media.ts`) ต้องเพิ่ม Zod `.refine()` บน `extraParams` ที่ validate URLs matching `^https?://` ว่าไม่ชี้ไป internal hosts:
```typescript
extraParams: z.record(z.any()).optional().refine((params) => {
  if (!params) return true;
  for (const [key, val] of Object.entries(params)) {
    if (typeof val === "string" && /^https?:\/\//i.test(val)) {
      const url = new URL(val);
      if (["localhost", "127.0.0.1", "host.docker.internal", "0.0.0.0"].includes(url.hostname)) {
        return false;
      }
    }
  }
  return true;
}, "extraParams contains URLs targeting internal hosts"),
```

### 10.2 Credit Pricing Security (HIGH)

**ปัญหา:** `pricingCalculator.ts` `buildTierKey()` สร้าง tier key จาก duration ไม่ใช่ resolution → user สามารถ request 2160p แต่จ่ายราคา 1080p (undercharge 4x)

**Solution:**
1. ใช้ `pricingFormula: "matrix"` (ไม่ใช่ `"per_duration"`) สำหรับ resolution-tiered models
2. `"matrix"` formula ต้องคำนวณ: `pricingTiers[resolution] × duration_seconds`
3. `resolution` field ต้องมี `affectsPricing: true`

### 10.3 Post-Generation Credit Verification (HIGH)

Credits ต้องคำนวณจาก **actual output** ของ fal.ai response, ไม่ใช่จาก client-declared params.

**IPC Architecture:** ปัจจุบัน credit operations อยู่ใน Node.js (`creditService.ts`) — Python Celery worker **ไม่สามารถ** call `deductCredits()` โดยตรง

**Current pattern:** Node.js pre-reserves credits ตอน submit (ใน `media.ts`) แล้วไม่มี post-completion reconciliation — ดังนั้นต้องสร้าง reconciliation path:

**Option A — Node.js Polling (Recommended, ง่ายกว่า):**
- `recover_stuck_tasks` (Python) เก็บ `actual_duration` และ `actual_resolution` ลง `task.result_data` เมื่อ task complete
- Node.js media status polling endpoint (ที่ frontend เรียกอยู่แล้ว) อ่าน `result_data.actual_duration` และ reconcile credits ตอนที่ task status เปลี่ยนเป็น COMPLETED
- Reconciliation logic ใน `media.ts` status handler:
```typescript
if (task.status === "COMPLETED" && task.resultData?.actual_duration) {
  const actualCredits = computeActualCost(task.model, task.resultData);
  const preReserved = task.creditsReserved;
  if (actualCredits < preReserved) {
    await refundCredits(userId, preReserved - actualCredits, "fal.ai actual duration adjustment");
  }
  // Note: never charge MORE than pre-reserved (user saw the estimate)
}
```

**Option B — Python HTTP callback to Node.js:**
- Python calls `web_gateway_client.py` → Node.js internal API endpoint → `creditService.ts`
- More complex, requires new endpoint + auth token

```python
# In recover_stuck_tasks, store actual metrics for Node.js reconciliation:
actual_duration = result["raw"]["video"]["duration"]
actual_width = result["raw"]["video"]["width"]
actual_resolution = "2160p" if actual_width >= 3840 else "1440p" if actual_width >= 2560 else "1080p"
task.result_data = {
    **task.result_data,
    "actual_duration": actual_duration,
    "actual_resolution": actual_resolution,
    "actual_width": actual_width,
}
```

### 10.4 Media URL Re-hosting (MEDIUM)

fal.ai CDN URLs (`v3b.fal.media/files/...`) เป็น public URLs — ต้อง re-host ไป platform R2/S3:

1. หลัง generation เสร็จ → download จาก fal.ai CDN
2. Upload ไป R2/S3 ภายใต้ tenant-namespaced path
3. ส่ง presigned R2 URL ให้ user (ไม่ใช่ raw fal.ai URL)
4. ป้องกันการเข้าถึง media ข้าม tenant

### 10.5 API Key Validation (MEDIUM)

`testFalAI()` ปัจจุบันใช้ OPTIONS request ซึ่งไม่ validate API key จริง (fal.ai CORS preflight ไม่ authenticate):

**Fix:** ใช้ authenticated probe request แทน:
```typescript
// Send a minimal request that returns 401 for invalid keys
const response = await fetch("https://queue.fal.run/fal-ai/flux/schnell", {
  method: "POST",
  headers: { "Authorization": `Key ${apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: "test" }),
});
// 422 = key valid, bad input; 401 = key invalid
```

### 10.6 Voice Cloning Controls (HIGH)

Lux TTS voice cloning ต้องมี controls:

1. **Separate rate limit:** 5 requests / 10 minutes per user (ใน `rateLimiter.ts`)
2. **Reference audio SSRF validation:** `validate_uri_no_ssrf(audio_url)` (covered by §10.1)
3. **Audit logging:** log reference audio URL **masked** (domain + path prefix only, strip query params/signed tokens)
4. **Prompt length enforcement:** max 5000 chars ที่ tRPC input schema level

### 10.7 Prompt Sanitization (MEDIUM)

Strip HTML/XML-like tags จาก prompt ก่อนส่ง fal.ai:

```python
import re
def sanitize_prompt(prompt: str) -> str:
    return re.sub(r'<[^>]+>', '', prompt).strip()
```

### 10.8 Error Message Sanitization (MEDIUM)

`response.raise_for_status()` ใน `FalAIProvider` อาจ leak fal.ai error details (รวม rejected prompt content) ใน exception message ที่ propagate ไปถึง user

**Fix:** Wrap `raise_for_status()` errors:
```python
try:
    response.raise_for_status()
except httpx.HTTPStatusError as e:
    status = e.response.status_code
    if status == 422:
        raise ValueError("Content policy rejection — request not processed") from None
    elif status == 401:
        raise ValueError("Invalid fal.ai API key") from None
    elif status == 429:
        raise ValueError("fal.ai rate limit exceeded — try again later") from None
    else:
        logger.error("fal_ai_error", status=status)  # Do NOT log response body
        raise ValueError(f"fal.ai error (HTTP {status})") from None
```

### 10.8b Content Policy Error Handling (LOW)

Handle fal.ai 422 content-policy rejections gracefully:
- Return user-friendly error message
- Do NOT log rejected prompt content in audit trails
- Do NOT deduct credits for rejected requests

### 10.10 Video Input File Size Limit (MEDIUM)

`video_url` สำหรับ extend-video และ retake-video ไม่มี size constraint — user ส่ง URL ชี้ไปไฟล์ multi-GB ได้

**Fix:** เพิ่ม HEAD request ใน `FalAIProvider._validate_urls()` สำหรับ `video_url`:
```python
if url_field == "video_url" and url:
    head_resp = await self.client.head(url, follow_redirects=True)
    content_length = int(head_resp.headers.get("content-length", 0))
    if content_length > 500 * 1024 * 1024:  # 500MB
        raise ValueError(f"Video file too large ({content_length} bytes). Max: 500MB")
```

### 10.11 Concurrent Task Limit (LOW)

เพิ่ม per-user concurrent fal.ai task limit (max 3 in-flight tasks):
```python
# In gateway generate_video(), before submitting:
from sqlalchemy import select, func
count = await db.scalar(
    select(func.count()).where(
        MediaTask.user_id == user.id,
        MediaTask.status == TaskStatus.PROCESSING,
        MediaTask.model.in_(FalAIProvider.VIDEO_MODELS),
    )
)
if count >= 3:
    raise ValueError("Too many concurrent fal.ai tasks (max 3). Wait for current tasks to complete.")
```

### 10.12 Environment Variable Safety (LOW)

`FAL_AI_API_KEY` env var **must NOT** be set in production `.env`. ถ้า set ไว้อาจ bypass DB-stored encrypted key:
- เพิ่ม startup warning log ถ้าทั้ง DB key และ env var มีค่าพร้อมกัน
- ใน production: ใช้ DB-stored key เท่านั้น (encrypted via `smartspecweb_crypto.py`)

### 10.13 Pre-signed URL Lifetime (LOW)

Media library files ใน SmartSpecPro ใช้ **permanent public R2 URLs** (ไม่ใช่ pre-signed) — ดังนั้นปัญหา URL expiry **ไม่เกิดสำหรับ files จาก library**

แต่ถ้า user paste external pre-signed URL (เช่น จาก S3 ภายนอก):
- ให้ fal.ai provider log warning ถ้าเจอ URL ที่มี `X-Amz-Signature` หรือ signed query params
- แนะนำ user ให้ upload ไป media library ก่อนใช้

---

## 7. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| **SSRF via user-supplied URLs** | **CRITICAL** | `validate_uri_no_ssrf()` + explicit `host.docker.internal` reject + tRPC Zod refine (§10.1) |
| **Credit undercharge (resolution mismatch)** | **HIGH** | Use `"matrix"` formula, verify from actual output (§10.2, §10.3) |
| **Voice cloning abuse** | **HIGH** | Separate rate limit, audit logging, SSRF validation (§10.6) |
| **fal.ai CDN URL exposure** | **MEDIUM** | Re-host to R2/S3 (§10.4) |
| **Invalid API key false positive** | **MEDIUM** | Fix `testFalAI()` probe (§10.5) |
| fal.ai API changes | Medium | Pin to LTX-2.3 endpoints, monitor API versioning |
| Long generation times (2160p, 20s) | Medium | Always use queue-based submission (never sync for video) |
| Pre-signed URL expiry during queue wait | Medium | 30-min TTL or re-upload strategy (§10.9) |
| Error message leakage from fal.ai | Medium | Sanitize raise_for_status() exceptions (§10.8) |
| Video input file size (extend/retake) | Medium | HEAD request size check, 500MB max (§10.10) |
| Content policy violations | Low | Handle 422, no credit deduction (§10.8b) |
| Concurrent task quota exhaustion | Low | Per-user limit: max 3 in-flight fal.ai tasks (§10.11) |
| FAL_AI_API_KEY env var in production | Low | Must not be set; startup warning (§10.12) |

---

## 8. Testing Requirements

### Unit Tests (`python-backend/tests/`)

```python
# test_fal_ai_provider.py
- test_generate_text_to_video_submits_to_queue()
- test_generate_image_to_video_with_end_image()
- test_generate_audio_to_video()
- test_generate_extend_video_mode_start()
- test_generate_extend_video_mode_end()
- test_generate_retake_video_replace_audio_only()
- test_generate_tts_sync()
- test_queue_submission_returns_request_id()
- test_queue_status_polling()
- test_queue_result_normalization()
- test_auth_header_format_key_prefix()
- test_error_handling_invalid_key_401()
- test_error_handling_rate_limit_429()
- test_error_handling_content_policy_422()
- test_aclose_called_in_finally()

# test_fal_ai_ssrf.py (SECURITY)
- test_ssrf_rejects_internal_ip_169_254()
- test_ssrf_rejects_localhost()
- test_ssrf_rejects_private_10_0_0_0()
- test_ssrf_allows_https_public_url()
- test_ssrf_validates_all_url_fields()
```

### Pricing Tests (`apps/web/`)

```typescript
// test_pricing_calculator.test.ts
- test_matrix_formula_1080p_6s()    // 60 × 6 = 360
- test_matrix_formula_1440p_10s()   // 120 × 10 = 1200
- test_matrix_formula_2160p_20s()   // 240 × 20 = 4800
- test_matrix_formula_default_fallback()
- test_per_duration_flat_rate()     // 100 × 5 = 500
- test_per_unit_tts_1000_chars()    // ceil(1000/1000) × 1.4 = 1.4
- test_per_unit_tts_2500_chars()    // ceil(2500/1000) × 1.4 = 4.2
```

### Seed Script Verification

```bash
npx tsx scripts/seed-media-models-fal-ai.ts
psql "$DATABASE_URL" -c "
  SELECT \"modelId\", \"modelType\", \"creditCost\", priority, \"sortOrder\"
  FROM media_models WHERE provider = 'fal_ai'
  ORDER BY \"sortOrder\";
"
# Expected: 8 rows with correct creditCost, priority, sortOrder
```

### Integration Tests

```bash
pytest tests/integration/test_fal_ai_models.py -v -m "fal_ai"
# Requires FAL_KEY in env
```

---

## 9. Out of Scope

- fal.ai image models (Flux, SD3) — already registered, not part of this spec
- fal.ai webhook integration — use polling for now, can add webhook support later
- Real-time streaming — LTX-2.3 does not support streaming output
- Model fine-tuning — use fal.ai's default model weights
- Batch/bulk generation — handle as individual requests
- Redis-based rate limiting migration — existing in-memory limiter is acceptable for now (§M-1)

---

## 10. Appendix: fal.ai Authentication

```
Header: Authorization: Key {FAL_KEY}
Content-Type: application/json
```

API key is stored encrypted in `mediaProviders.apiKeyEncrypted` using `encrypt()`/`decrypt()` from `crypto.ts`. Python backend fetches it via `get_media_provider_key("fal_ai")` which reads from DB and decrypts via `smartspecweb_crypto.py` using shared `LLM_ENCRYPTION_KEY`.

Optional dev/testing fallback: `FAL_AI_API_KEY` env var in `python-backend/.env` (lower priority than DB-stored key).

---

## 11. Review Changelog

### v2.1 (2026-03-22) — Second-Pass Verification

**Critical fixes from code-level verification:**
- **[CRITICAL]** `calculateCreditCost()` ไม่คูณ duration — เพิ่ม duration multiplication fix ใน §3.1
- **[HIGH]** `MediaTask` model ไม่มี `provider` column — แก้ polling branch ใช้ `task.model in VIDEO_MODELS` แทน `task.provider`
- **[HIGH]** `download_and_upload_to_r2()` ไม่มี — แก้เป็น `download_result()` + `upload_to_r2()` จาก `media_pipeline.py`
- **[MEDIUM]** ลบ `unified_client.py` registration (ใช้สำหรับ LLM providers เท่านั้น, media providers instantiate per-request)
- **[MEDIUM]** ลบ `VideoGenerationResponse`/`AudioGenerationResponse` classes (ไม่มีจริง — gateway return plain dict)
- **[LOW]** Pre-signed URL concern downgrade เป็น LOW (media library ใช้ permanent R2 URLs)
- **[MEDIUM]** เพิ่ม `structlog` logger ใน provider class (matching KieAI/BytePlus convention)
- **[MEDIUM]** เปลี่ยน httpx client เป็น scalar timeout + per-request headers (matching codebase convention)
- **[MEDIUM]** เพิ่ม `try/except httpx.HTTPStatusError` error handling ใน HTTP calls
- **[MEDIUM]** แก้ gateway routing ใช้ `request.model`, `request.extra_params` (ไม่ใช่ undefined bare locals)
- **[MEDIUM]** เพิ่ม provider availability guard (`if not provider_config`) ก่อน instantiate
- **[MEDIUM]** เพิ่ม note เรื่อง `_deduct_credits()` signature (ต้องส่ง USD Decimal ไม่ใช่ credit int)

**Security round 2 fixes:**
- **[HIGH]** §10.1 — `host.docker.internal` SSRF bypass: เพิ่ม explicit reject ใน `_validate_urls()` + Zod refine ใน tRPC `extraParams`
- **[HIGH]** §10.3 — Credit reconciliation IPC: ระบุ Node.js polling-based reconciliation path (Option A) แทน non-existent Python function
- **[MEDIUM]** §10.8 — Error message sanitization: wrap `raise_for_status()` ป้องกัน fal.ai error leak
- **[MEDIUM]** §10.10 — Video input file size limit (500MB max via HEAD request)
- **[LOW]** §10.11 — Per-user concurrent fal.ai task limit (max 3)
- **[LOW]** §10.12 — `FAL_AI_API_KEY` env var must not be set in production

### v2.0 (2026-03-22) — Post-Review Update

Changes from Architecture, Python Integration, and Security reviews:

**Architecture fixes:**
- Added `seed-media-providers.ts` to files list (must match `mediaProviders.ts`)
- Added `priority`, `sortOrder`, `creditCost`, `description` to all model definitions
- Changed `pricingFormula` from `"per_duration"` to `"matrix"` for resolution-tiered models
- Expanded gateway integration from 3-line snippet to full routing blocks for 3 methods
- Added `pricingCalculator.ts` fix to §4.1 files list
- Clarified `MEDIA_MODELS` static dict does NOT need changes
- Added §3.1 Pricing Formula Design section

**Python integration fixes:**
- Added `aclose()` method to `FalAIProvider` (CRITICAL)
- Added `recover_stuck_tasks` polling branch in `media_tasks.py` (CRITICAL)
- Added `generate_audio()` routing for Lux TTS in gateway (was missing)
- Added `unified_client.py` registration
- Added `providers/__init__.py` export
- Specified: video ALWAYS uses queue (sync times out), TTS uses sync
- Removed "factory pattern" misconception — documented actual if-elif routing

**Security additions:**
- **[CRITICAL]** §10.1 SSRF validation via `validate_uri_no_ssrf()` for all URL fields
- **[HIGH]** §10.2 Credit pricing — changed to `"matrix"` formula to prevent resolution mismatch
- **[HIGH]** §10.3 Post-generation credit verification from actual fal.ai output
- **[HIGH]** §10.6 Voice cloning controls — separate rate limit, masked audit logging
- **[MEDIUM]** §10.4 Re-host fal.ai CDN URLs to R2/S3
- **[MEDIUM]** §10.5 Fix `testFalAI()` to actually validate API key
- **[MEDIUM]** §10.7 Prompt sanitization
- **[MEDIUM]** §10.9 Pre-signed URL lifetime strategy
- **[LOW]** §10.8 Content policy error handling
- Added SSRF-specific unit tests
- Added pricing unit tests

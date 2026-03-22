# Grok Imagine API Access & Capabilities Research

**Date:** 2026-03-11
**Status:** Complete Research

---

## Question 1: Grok Imagine API Access Methods

### Finding: Accessed ONLY via kie.ai aggregator (NOT direct xAI API)

**Current Implementation in SmartSpecPro:**

Grok Imagine is **NOT** accessed directly via xAI's API (api.x.ai). Instead, it is accessed **exclusively through kie.ai**, a third-party API aggregator.

**Code Evidence:**

1. **Frontend Model Registry** (`apps/web/server/services/mediaGenerationService.ts` lines 139-148):
```typescript
"grok-imagine": {
  id: "grok-imagine",
  type: "image",
  name: "Grok Imagine",
  provider: "kie.ai",  // <-- Points to kie.ai, NOT xAI directly
  description: "xAI's image generation model",
  supportsSizes: ["1024x1024", "1024x1792", "1792x1024"],
  supportsAspectRatios: ["1:1", "16:9", "9:16"],
  creditCost: 12,
}
```

2. **KieAI Provider Implementation** (`python-backend/app/llm_proxy/providers/kie_ai_provider.py`):
   - Lines 30: Fallback model mapping includes `"grok-imagine": "grok-imagine"` (passthrough to kie.ai)
   - Lines 118-130: `KieAIProvider` class uses `BASE_URL = "https://api.kie.ai/api/v1"`
   - Lines 227-248: `create_task()` method sends to kie.ai API

3. **Gateway Routing** (`python-backend/app/llm_proxy/gateway_unified.py`):
   - Lines 117-118: Normalizes provider name to `"kie_ai"`
   - Lines 662-667: Initializes kie.ai client for image generation
   - Lines 728-788: Routes all grok-imagine requests through kie.ai_client.generate_image()

### kie.ai API Endpoints

**Base URL:** `https://api.kie.ai/api/v1`

**Key Endpoints:**
- Create task: `POST /jobs/createTask`
- Query task: `GET /jobs/recordInfo?taskId={taskId}`
- Legacy status: `GET /jobs/status/{taskId}`

**Authentication:** Bearer token (API key)

### Other Providers Checked

Searched codebase for:
- Replicate: NOT found in media provider configuration
- fal.ai: NOT found in media provider configuration
- Direct xAI API (api.x.ai): NOT found anywhere

**Conclusion:** SmartSpecPro integrates ONLY via kie.ai aggregator for Grok Imagine. No direct xAI API integration exists.

---

## Question 2: Grok Imagine Upscale Capabilities

### Finding: IMAGE ONLY — No video upscaling support documented

**Status:** Images only. No evidence of video upscaling in:
- Grok Imagine model configuration
- kie.ai API documentation in codebase
- Model metadata fields (supportsDurations → image only)

**Grok Imagine Model Metadata** (`apps/web/server/services/mediaGenerationService.ts` lines 139-148):
```typescript
supportsSizes: ["1024x1024", "1024x1792", "1792x1024"],
supportsAspectRatios: ["1:1", "16:9", "9:16"],
creditCost: 12,
// No supportsDurations → image generation only
// No upscale/enhance parameters in input schema
```

**Comparison with Video Models:**
- Video models (veo-3.1, sora-2, kling-2.6) have `supportsDurations: [5, 10, 15]`
- Grok Imagine has NO duration field → images only

### Upscale Resolution Mapping

From the model metadata:
- **Input Resolutions:** 1024x1024, 1024x1792, 1792x1024
- **Output Resolutions:** Appears to match input (1:1 generation, not super-resolution)
- **No "upscale" input parameter** documented in kie.ai API research

**Source:** `python-backend/docs/kie_ai_api_research.md` does NOT mention any upscale/super-resolution capability for Grok Imagine.

### Conclusion

Grok Imagine via kie.ai:
- **TYPE:** Image generation only (type: "image")
- **UPSCALING:** Not supported or not documented
- **Supported dimensions:** 1024x1024, 1024x1792, 1792x1024 (fixed sizes, not upscaling)

---

## Question 3: kie.ai Integration Details

### kie.ai Overview

**What is kie.ai:** Multi-provider AI API aggregator (marketplace) that consolidates APIs from multiple providers:
- Image: Grok Imagine (xAI), Flux 2.0, Nano Banana Pro (Google), Z-Image, Ideogram, Recraft V3, Ghibli AI
- Video: Sora 2, Veo 3.1, Kling 2.6, Wan 2.6, Runway Aleph
- Audio: ElevenLabs TTS, Suno music generation

### How kie.ai Works in SmartSpecPro

**1. Provider Class:** `KieAIProvider` (`python-backend/app/llm_proxy/providers/kie_ai_provider.py`)

**2. Task-Based API Pattern:**
```
1. POST /api/v1/jobs/createTask  → returns taskId
2. GET /api/v1/jobs/recordInfo?taskId={taskId}  → returns status + result URLs
3. Polling until status = "success" or "fail"
```

**3. Model Resolution:** Two-tier system:
- **Tier 1:** Explicit API model ID from `media_models.configJson.kieModelId`
- **Tier 2:** Fallback alias mapping (e.g., "grok-imagine" → "grok-imagine")
- **Passthrough:** If no mapping found, model ID sent as-is to kie.ai

**4. Database Integration:**

From `python-backend/app/services/media_provider_service.py`:
- Media provider API keys stored in `media_providers` table (PostgreSQL)
- Encrypted with AES-256-GCM (matches Node.js crypto)
- Column: `apiKeyEncrypted`, `baseUrl`, `configJson`, `callbackUrl`

**5. Callback Support:**

Both KieAI and Node.js support optional webhooks:
- `callBackUrl` parameter in task creation
- Kie.ai sends POST to callback when task completes
- Reduces polling overhead for long-running tasks

### Grok Imagine in kie.ai

kie.ai offers Grok Imagine as `"grok-imagine"` model ID.

**Available Options:**
- Aspect ratios: 1:1, 16:9, 9:16
- Sizes: 1024x1024, 1024x1792, 1792x1024
- Cost: 12 credits per generation (~$0.06 USD equivalent, varies by account)
- No parameters for upscaling or video generation

### File Locations & Code References

| Item | File | Lines |
|------|------|-------|
| Grok Imagine model def | `apps/web/server/services/mediaGenerationService.ts` | 139-148 |
| KieAI provider class | `python-backend/app/llm_proxy/providers/kie_ai_provider.py` | 118-550+ |
| Model mapping | `python-backend/app/llm_proxy/providers/kie_ai_provider.py` | 14-55 |
| Gateway routing | `python-backend/app/llm_proxy/gateway_unified.py` | 117-118, 662-788 |
| Media provider service | `python-backend/app/services/media_provider_service.py` | 77-150+ |
| API research doc | `python-backend/docs/kie_ai_api_research.md` | All |
| Test file | `python-backend/test_kie_task_ids.py` | 21 (base URL) |

### kie.ai Base URL Normalization

`KieAIProvider.normalize_base_url()` (lines 132-176) handles common misconfigurations:
- `https://kie.ai/api/v1` → `https://api.kie.ai/api/v1` ✓
- `https://api.kie.ai` → `https://api.kie.ai/api/v1` ✓
- `https://api.kie.ai/api/v1/jobs` → `https://api.kie.ai/api/v1` ✓

---

## Summary Table

| Question | Answer |
|----------|--------|
| **Can Grok Imagine be accessed directly via xAI API?** | ❌ No. SmartSpecPro uses only kie.ai aggregator. |
| **Can it be accessed via third-party aggregators?** | ✅ Yes. Via kie.ai only (no Replicate, fal.ai, or other aggregators integrated). |
| **Does Grok Imagine support image upscaling?** | ❓ Unknown. No upscale parameters documented in SmartSpecPro's kie.ai integration. |
| **Does Grok Imagine support video generation?** | ❌ No. Model type is "image" only. No supportsDurations field. |
| **Does kie.ai offer Grok Imagine?** | ✅ Yes. As model ID `"grok-imagine"` with fixed output sizes. |

---

## Recommendations for Implementation

If upscaling is required:
1. **Research:** Check xAI's official Grok Imagine API docs for upscale parameters
2. **Check kie.ai:** Request kie.ai support if they expose xAI's upscale feature
3. **Alternative:** Consider using dedicated upscaling models:
   - Real-ESRGAN (open-source)
   - Topaz Gigapixel AI
   - Upscayl (free alternative)
   - Add as separate model type in SmartSpecPro

If video generation needed:
- Grok Imagine is text-to-image only
- Use Sora 2, Veo 3.1, or Kling 2.6 for video (already integrated via kie.ai)

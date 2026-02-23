# Feature Spec: BytePlus ModelArk API Integration

**Feature Number:** 022
**Directory:** `specs/feature/022-byteplus-modelark-api/`
**Date:** 2026-02-23
**Status:** Ready for `/deep-plan`
**Risk Level:** HIGH — new encrypted API key storage, external async task flow

---

## 1. Overview

Integrate **BytePlus ModelArk** (ByteDance's AI model platform) as a new media generation provider in SmartSpecPro. This enables users to generate images via **Seedream** models and videos (text-to-video and image-to-video) via **Seedance** models directly from the Media Studio.

### 1.1 Goals

1. Register **BytePlus ModelArk** as a configurable media provider in `admin/media-providers`
2. Register all **Seedream** and **Seedance** models in `admin/media-models` linked to the new provider
3. Implement a **BytePlus ModelArk adapter** in the Python backend that handles:
   - Synchronous image generation (`POST /api/v3/images/generations`)
   - Async video task creation (`POST /api/v3/contents/generations/tasks`)
   - Task status polling (`GET /api/v3/contents/generations/tasks/{task_id}`)
4. Verify and patch **Media Studio** to support generation with BytePlus models (image + video, including I2V with reference image)

### 1.2 Non-Goals

- No new database tables (reuse existing `media_providers` and `media_models`)
- No billing/credit changes specific to BytePlus (use existing credit system)
- No webhook/callback endpoint for BytePlus (poll-based only — BytePlus does not send callbacks like Kie.ai)
- No desktop (Tauri) specific changes

---

## 2. API Reference

### 2.1 Base URL and Authentication

```
Base URL:  https://ark.ap-southeast.bytepluses.com/api/v3
Auth:      Authorization: Bearer <api_key>
Content-Type: application/json
```

The API key is stored encrypted in `media_providers.apiKeyEncrypted` (AES-256-GCM, same encryption as other providers).

### 2.2 Image Generation (Synchronous)

**Endpoint:** `POST /api/v3/images/generations`

**Request Body:**
```json
{
  "model": "seedream-4-0-250828",
  "prompt": "Your generation prompt...",
  "sequential_image_generation": "disabled",
  "response_format": "url",
  "size": "2K",
  "stream": false,
  "watermark": true
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Model ID (seedream-4-5-251128, seedream-4-0-250828) |
| `prompt` | string | Yes | Text description of the image to generate |
| `sequential_image_generation` | string | No | "disabled" (default) or "enabled" |
| `response_format` | string | No | "url" (default) or "b64_json" |
| `size` | string | No | Image size: "1K", "2K", "4K" — default "2K" |
| `stream` | boolean | No | Streaming response — false (default) |
| `watermark` | boolean | No | Add watermark — true (default) |

**Response (synchronous — image URL returned directly):**
```json
{
  "id": "resp_...",
  "created": 1708000000,
  "data": [
    {
      "url": "https://...",
      "revised_prompt": "..."
    }
  ],
  "model": "seedream-4-0-250828",
  "usage": {
    "prompt_tokens": 45,
    "total_tokens": 45
  }
}
```

**Key difference from video:** Image generation is **synchronous** — result URL is returned immediately in the response (no polling needed).

### 2.3 Video Generation (Async Task)

**Endpoint:** `POST /api/v3/contents/generations/tasks`

#### Text-to-Video (T2V) Request:
```json
{
  "model": "seedance-1-0-lite-t2v-250428",
  "content": [
    {
      "type": "text",
      "text": "Your video description prompt  --resolution 720p  --duration 5  --camerafixed false  --watermark false"
    }
  ]
}
```

#### Image-to-Video (I2V) Request:
```json
{
  "model": "seedance-1-0-pro-250528",
  "content": [
    {
      "type": "text",
      "text": "Your video description  --resolution 1080p  --duration 5  --camerafixed false"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://public-url-to-reference-image.jpg"
      }
    }
  ]
}
```

**Inline Prompt Parameters (embedded in text content):**
| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| `--resolution` | `720p`, `1080p` | `720p` | Output video resolution |
| `--duration` | `5`, `10` | `5` | Duration in seconds |
| `--camerafixed` | `true`, `false` | `false` | Lock camera movement |
| `--watermark` | `true`, `false` | `true` | Add watermark to output |

**Video Task Creation Response:**
```json
{
  "id": "task_id_string",
  "status": "queued",
  "model": "seedance-1-0-pro-250528",
  "created_at": 1708000000
}
```

### 2.4 Task Status Polling

**Endpoint:** `GET /api/v3/contents/generations/tasks/{task_id}`

**Headers:** Same `Authorization: Bearer <api_key>`

**Response:**
```json
{
  "id": "task_id_string",
  "status": "succeeded",
  "model": "seedance-1-0-pro-250528",
  "content": [
    {
      "type": "video_url",
      "video_url": {
        "url": "https://result-video-url.mp4",
        "duration": 5,
        "resolution": "1080p"
      }
    }
  ],
  "usage": {
    "prompt_tokens": 45,
    "completion_tokens": 0,
    "total_tokens": 45
  },
  "created_at": 1708000000,
  "completed_at": 1708000030
}
```

**Task Status Values:**
| Status | Description |
|--------|-------------|
| `queued` | Task accepted, waiting to process |
| `processing` | Generation in progress |
| `succeeded` | Complete — result URL available in `content[].video_url.url` |
| `failed` | Error — check `error` field |
| `cancelled` | Task was cancelled |

**Polling Strategy:** Poll every 5 seconds, max 120 attempts (10 minutes timeout).

---

## 3. Models to Register

### 3.1 Seedream (Image Generation)

| Model ID | Display Name | Type | Notes |
|----------|-------------|------|-------|
| `seedream-4-5-251128` | Seedream 4.5 | image | Latest, highest quality |
| `seedream-4-0-250828` | Seedream 4.0 | image | Stable release |

### 3.2 Seedance (Video Generation)

| Model ID | Display Name | Type | Capability | Notes |
|----------|-------------|------|------------|-------|
| `seedance-1-0-pro-fast-251015` | Seedance 1.0 Pro (Fast) | video | T2V + I2V | Fastest generation speed |
| `seedance-1-0-pro-250528` | Seedance 1.0 Pro | video | T2V + I2V | Highest quality |
| `seedance-1-0-lite-t2v-250428` | Seedance 1.0 Lite T2V | video | T2V only | Lightweight, text-to-video only |
| `seedance-1-0-lite-i2v-250428` | Seedance 1.0 Lite I2V | video | I2V only | Lightweight, image-to-video only |

---

## 4. Affected Files and Required Changes

### 4.1 Node.js Backend (tRPC)

**File:** `apps/web/server/routers/mediaProviders.ts`

**Change:** Add BytePlus ModelArk entry to `PROVIDER_TEMPLATES` array:
```typescript
{
  providerName: "byteplus_modelark",
  displayName: "BytePlus ModelArk",
  description: "ByteDance's ModelArk AI platform — Seedream image generation (T2I) and Seedance video generation (T2V + I2V)",
  providerType: "multimodal" as const,
  baseUrl: "https://ark.ap-southeast.bytepluses.com/api/v3",
  defaultModel: "seedream-4-5-251128",
  availableModels: [
    // Image models (Seedream)
    { id: "seedream-4-5-251128", name: "Seedream 4.5", type: "image" as const, description: "Latest Seedream image model (2026)" },
    { id: "seedream-4-0-250828", name: "Seedream 4.0", type: "image" as const, description: "Stable Seedream image model" },
    // Video models (Seedance)
    { id: "seedance-1-0-pro-fast-251015", name: "Seedance 1.0 Pro Fast", type: "video" as const, description: "Fast professional video generation (T2V + I2V)" },
    { id: "seedance-1-0-pro-250528", name: "Seedance 1.0 Pro", type: "video" as const, description: "High-quality professional video (T2V + I2V)" },
    { id: "seedance-1-0-lite-t2v-250428", name: "Seedance 1.0 Lite T2V", type: "video" as const, description: "Lightweight text-to-video generation" },
    { id: "seedance-1-0-lite-i2v-250428", name: "Seedance 1.0 Lite I2V", type: "video" as const, description: "Lightweight image-to-video generation" },
  ],
}
```

**Change:** Add `testBytePlusModelArk()` function and wire it into `testConnection` switch:
```typescript
case "byteplus_modelark":
  result = await testBytePlusModelArk(apiKey, provider.baseUrl || "https://ark.ap-southeast.bytepluses.com/api/v3");
  break;
```

The test function should call `GET /api/v3/contents/generations/tasks` (list tasks) with a limit=1 — a 200/401 response confirms connectivity. If the API doesn't have a lightweight endpoint, use a HEAD request to the base URL.

### 4.2 Python Backend — New Provider Adapter

**New File:** `python-backend/app/llm_proxy/providers/byteplus_modelark_provider.py`

This is the main implementation work. The class must follow the existing `KieAIProvider` pattern.

```python
class BytePlusModelArkProvider:
    """
    BytePlus ModelArk API Provider (ByteDance)

    API Reference: https://docs.byteplus.com/en/docs/ModelArk

    Two distinct API flows:
      - Image (Seedream): POST /api/v3/images/generations → synchronous
      - Video (Seedance): POST /api/v3/contents/generations/tasks → async task
        Poll:            GET /api/v3/contents/generations/tasks/{task_id}
    """

    BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3"

    # Models that use the video task endpoint
    VIDEO_MODELS = {
        "seedance-1-0-pro-fast-251015",
        "seedance-1-0-pro-250528",
        "seedance-1-0-lite-t2v-250428",
        "seedance-1-0-lite-i2v-250428",
    }

    # Models that use the image generation endpoint
    IMAGE_MODELS = {
        "seedream-4-5-251128",
        "seedream-4-0-250828",
    }

    def __init__(self, api_key: str, base_url: str | None = None):
        self.api_key = api_key
        self.base_url = (base_url or self.BASE_URL).rstrip("/")
        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
```

**Methods required:**

#### `async def generate_image(self, request: ImageGenerationRequest) -> dict`
- POST to `/api/v3/images/generations`
- Build body: `{ model, prompt, response_format: "url", size, watermark, sequential_image_generation: "disabled", stream: false }`
- Size mapping from SmartSpecPro size labels → BytePlus `size` values: `"1024x1024"` → `"1K"`, `"2048x2048"` → `"2K"`, `"4096x4096"` → `"4K"`
- Return: `{ result_url: data[0].url, provider_task_id: response.id }`

#### `async def create_video_task(self, request: VideoGenerationRequest, reference_image_url: str | None = None) -> dict`
- POST to `/api/v3/contents/generations/tasks`
- Build content array:
  - Always include text content (prompt + inline params like `--resolution 1080p --duration 5 --camerafixed false`)
  - If `reference_image_url` provided (I2V): append `{"type": "image_url", "image_url": {"url": reference_image_url}}`
- Return: `{ provider_task_id: response.id, status: "queued" }`

#### `async def get_task_status(self, task_id: str) -> dict`
- GET `/api/v3/contents/generations/tasks/{task_id}`
- Map BytePlus status to internal status:
  - `succeeded` → `"success"`
  - `failed` / `cancelled` → `"fail"`
  - `queued` / `processing` → `"processing"`
- Extract video URL from `content[].video_url.url`
- Return: `{ status: str, result_url: str | None, raw_response: dict }`

#### `def _build_inline_params(self, request: VideoGenerationRequest) -> str`
- Helper: builds the `--resolution X --duration Y --camerafixed Z` suffix from request parameters
- Append to prompt text in content array

### 4.3 Python Backend — Integration with Media Task System

**File:** `python-backend/app/tasks/media_tasks.py`

**Change:** The existing `generate_image_task` and `generate_video_task` Celery tasks must be updated to route to the BytePlus provider when `provider_name == "byteplus_modelark"`.

Current routing pattern (simplified):
```python
# In generate_image_task:
if provider_name == "kie_ai":
    client = await initialize_kie_ai_client()
    result = await client.generate_image(...)
elif provider_name == "fal_ai":
    ...
```

**Add** routing for `byteplus_modelark`:
```python
elif provider_name == "byteplus_modelark":
    from app.llm_proxy.providers.byteplus_modelark_provider import BytePlusModelArkProvider
    from app.services.media_provider_service import get_media_provider_key
    config = await get_media_provider_key("byteplus_modelark")
    if not config:
        raise ValueError("BytePlus ModelArk not configured")
    client = BytePlusModelArkProvider(
        api_key=config["apiKey"],
        base_url=config.get("baseUrl")
    )
    result = await client.generate_image(request)
```

**For video tasks:** Similar routing, but use `create_video_task()` for submission and `get_task_status()` for polling. The poll loop is already implemented in the generic Celery task — it calls `_extract_model_query_endpoint` from `configJson`.

**Alternative approach (preferred):** Add `apiQueryEndpoint` to the BytePlus provider's `configJson` so the existing polling infrastructure is reused:
```json
{
  "apiQueryEndpoint": "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks",
  "pollIntervalSeconds": 5,
  "maxPollAttempts": 120
}
```

**File:** `python-backend/app/services/media_provider_service.py`

**No change required** — `get_media_provider_key("byteplus_modelark")` already works for any provider name.

### 4.4 Python Backend — Status Normalization

**File:** `python-backend/app/tasks/media_tasks.py`

The existing `_normalize_kie_task_state()` function handles Kie.ai response shapes. BytePlus uses a different shape:

```python
def _normalize_byteplus_task_state(status_response: dict) -> tuple[str, str]:
    """Normalize BytePlus task status to internal state."""
    status = str(status_response.get("status", "")).lower()
    if status == "succeeded":
        return "success", status
    elif status in ("failed", "cancelled"):
        return "fail", status
    elif status in ("queued", "processing"):
        return "processing", status
    return "unknown", status


def _extract_byteplus_result_url(status_response: dict) -> str | None:
    """Extract video URL from BytePlus task response."""
    content = status_response.get("content", [])
    for item in content:
        if item.get("type") == "video_url":
            video = item.get("video_url", {})
            url = video.get("url")
            if isinstance(url, str) and url.startswith("http"):
                return url
        elif item.get("type") == "image_url":
            img = item.get("image_url", {})
            url = img.get("url")
            if isinstance(url, str) and url.startswith("http"):
                return url
    return None
```

These functions must be wired into the polling logic in `media_tasks.py`.

### 4.5 Python Backend — LLM Gateway

**File:** `python-backend/app/llm_proxy/providers/__init__.py`

**Change:** Export `BytePlusModelArkProvider` alongside existing providers:
```python
from .byteplus_modelark_provider import BytePlusModelArkProvider
```

### 4.6 Media Studio Verification and Fixes

**File:** `apps/web/client/src/pages/MediaStudio.tsx`

**Verification tasks:**
1. **Provider dropdown loading** — confirm `trpc.mediaModels.list` or similar query includes models from `byteplus_modelark` provider when enabled
2. **Image generation flow** — verify that image generation requests with `provider: "byteplus_modelark"` are correctly routed to the Python backend's image endpoint
3. **Video generation flow (T2V)** — verify that video generation with Seedance models routes correctly
4. **I2V (Image-to-Video) flow** — verify that the reference image URL is passed through to the Python backend and included in the BytePlus API request's `content` array
5. **Parameter mapping** — verify that resolution, duration, and camerafixed settings from the UI are correctly mapped to the `--resolution`, `--duration`, `--camerafixed` inline params in the BytePlus text content

**Potential gaps to fix:**
- The `configJson.apiQueryEndpoint` pattern may need to be verified — ensure the existing polling code in `media_tasks.py` uses the correct endpoint for BytePlus (different path from Kie.ai's `/jobs/status/{taskId}`)
- I2V reference image must be a **public URL** for BytePlus (cannot be a local/signed URL). Ensure the reference image is uploaded to S3/R2 and a public URL is used.
- Inline parameter construction (resolution, duration) must be validated — if MediaStudio passes these as separate fields, the Python adapter must concatenate them into the text content.

---

## 5. Admin UI Changes

### 5.1 admin/media-providers Page

**File:** `apps/web/client/src/pages/AdminMediaProviders.tsx`

**No UI code changes required.** The existing "Add from Template" flow in the admin page reads from `trpc.mediaProviders.templates`. Adding the BytePlus template to `PROVIDER_TEMPLATES` in the router (Section 4.1) is sufficient.

**Test connection button** will work once `testBytePlusModelArk()` is added to the router.

**Admin workflow after implementation:**
1. Go to `admin/media-providers`
2. Click "Add Provider" → select "BytePlus ModelArk" template
3. Enter API key (Bearer token from BytePlus console)
4. Set base URL (default: `https://ark.ap-southeast.bytepluses.com/api/v3`)
5. Enable the provider
6. Test connection

### 5.2 admin/media-models Page

**File:** `apps/web/client/src/pages/AdminMediaModels.tsx`

**No UI code changes required.** The existing CRUD interface works for all providers.

**Admin workflow after implementation:**
1. Go to `admin/media-models`
2. Create 6 models (or use seed data):

| modelId | name | modelType | provider | creditCost | configJson |
|---------|------|-----------|----------|------------|------------|
| `seedream-4-5-251128` | Seedream 4.5 | image | byteplus_modelark | 15 | `{"size":"2K","watermark":true}` |
| `seedream-4-0-250828` | Seedream 4.0 | image | byteplus_modelark | 10 | `{"size":"2K","watermark":true}` |
| `seedance-1-0-pro-fast-251015` | Seedance 1.0 Pro Fast | video | byteplus_modelark | 30 | `{"resolution":"1080p","duration":5,"camerafixed":false}` |
| `seedance-1-0-pro-250528` | Seedance 1.0 Pro | video | byteplus_modelark | 40 | `{"resolution":"1080p","duration":5,"camerafixed":false}` |
| `seedance-1-0-lite-t2v-250428` | Seedance 1.0 Lite T2V | video | byteplus_modelark | 20 | `{"resolution":"720p","duration":5,"camerafixed":false}` |
| `seedance-1-0-lite-i2v-250428` | Seedance 1.0 Lite I2V | video | byteplus_modelark | 20 | `{"resolution":"720p","duration":5,"camerafixed":false}` |

---

## 6. Data Flow

### 6.1 Image Generation Flow

```
User (MediaStudio)
  → selects Seedream model
  → enters prompt, size
  → clicks Generate

tRPC media.generate (Node.js)
  → creates MediaTask record (status: pending)
  → dispatches Celery task: generate_image_task(provider="byteplus_modelark", model="seedream-4-5-251128", ...)

Celery Worker (Python)
  → gets provider config from DB via get_media_provider_key("byteplus_modelark")
  → decrypts API key
  → creates BytePlusModelArkProvider instance
  → calls client.generate_image(prompt, size, model)
    → POST /api/v3/images/generations
    → returns image URL immediately (synchronous)
  → downloads image, generates thumbnail
  → uploads to R2 storage
  → updates MediaTask: status=completed, resultUrl=r2_url

MediaStudio
  → polls for task completion (existing polling mechanism)
  → displays result image
```

### 6.2 Video Generation Flow (T2V)

```
User (MediaStudio)
  → selects Seedance T2V model
  → enters prompt
  → optionally sets resolution, duration
  → clicks Generate

tRPC media.generate (Node.js)
  → creates MediaTask record
  → dispatches Celery task: generate_video_task(provider="byteplus_modelark", model="seedance-1-0-lite-t2v-250428", ...)

Celery Worker (Python)
  → creates BytePlusModelArkProvider instance
  → calls client.create_video_task(prompt, resolution, duration)
    → POST /api/v3/contents/generations/tasks
    → Content: [{"type":"text","text":"<prompt> --resolution 720p --duration 5 --camerafixed false"}]
    → returns: { id: "task_id", status: "queued" }
  → updates MediaTask: external_task_id = "task_id", status = processing

  POLL LOOP (every 5s, max 10 min):
    → GET /api/v3/contents/generations/tasks/{task_id}
    → check status: queued → processing → succeeded
    → when succeeded: extract content[].video_url.url

  → downloads video from result URL
  → generates thumbnail (frame at 25%)
  → uploads to R2
  → updates MediaTask: status=completed, resultUrl=r2_url
```

### 6.3 Video Generation Flow (I2V — Image to Video)

```
User (MediaStudio)
  → uploads reference image (or selects from library)
  → selects Seedance I2V model
  → enters motion description

[Reference image must be uploaded to R2 first and have a PUBLIC URL]

Celery Worker (Python)
  → calls client.create_video_task(prompt, resolution, duration, reference_image_url=public_r2_url)
    → POST /api/v3/contents/generations/tasks
    → Content: [
        {"type":"text","text":"<prompt> --resolution 1080p --duration 5 --camerafixed false"},
        {"type":"image_url","image_url":{"url":"<public_r2_url>"}}
      ]
  → [same poll loop as T2V]
```

---

## 7. Security Considerations

### 7.1 API Key Storage
- BytePlus API key stored in `media_providers.apiKeyEncrypted` (AES-256-GCM via `encrypt()` from `crypto.ts`)
- Python decrypts via `media_provider_service.decrypt_api_key()` — no changes needed
- Never log the decrypted key; log only `configured: true/false` and provider name

### 7.2 SSRF Prevention
- The existing `validateExternalUrl()` in `mediaProviders.ts` blocks SSRF in the test connection function
- Must be called before `testBytePlusModelArk()` makes any HTTP request to `baseUrl`
- The BytePlus base URL (`ark.ap-southeast.bytepluses.com`) is an external public domain — passes SSRF validation

### 7.3 Reference Image URL Validation (I2V)
- Reference image URL passed to BytePlus must be a public URL (no signed URLs or localhost)
- The Python adapter must validate the URL is public before including it in the API request
- Use the existing `validate_uri_no_ssrf()` from `app.core.media_job_validators`

### 7.4 Inline Parameter Injection
- The `--resolution`, `--duration`, `--camerafixed` values are appended to the prompt text
- These values MUST be validated/sanitized before concatenation to prevent prompt injection
- Valid values only: resolution ∈ {"720p", "1080p"}, duration ∈ {5, 10}, camerafixed ∈ {true, false}, watermark ∈ {true, false}

---

## 8. Testing Requirements

### 8.1 Unit Tests (Python)

**New file:** `python-backend/tests/providers/test_byteplus_modelark_provider.py`

```python
# Test cases required:
test_generate_image_success()          # Mock API, verify request shape
test_generate_image_size_mapping()     # 1024x1024 → 1K, 2048x2048 → 2K, 4096x4096 → 4K
test_create_video_task_t2v()           # T2V: text-only content
test_create_video_task_i2v()           # I2V: text + image_url content
test_get_task_status_succeeded()       # Extract video URL from content array
test_get_task_status_processing()      # Return processing state
test_get_task_status_failed()          # Return fail state
test_inline_params_construction()       # --resolution 1080p --duration 5 etc.
test_normalize_byteplus_status()       # succeeded→success, failed→fail, queued→processing
test_extract_byteplus_result_url()     # Extract from content[].video_url.url
test_ssrf_validation_reference_image() # Reject internal URLs for I2V
test_api_key_not_logged()             # Verify API key never appears in logs
```

### 8.2 Integration Tests (tRPC)

**Update:** `apps/web/server/routers/mediaProviders.test.ts` (if it exists) or add test file:
- Test that `byteplus_modelark` template is in the templates list
- Test that `testConnection` with provider `byteplus_modelark` calls `testBytePlusModelArk()`
- Test SSRF validation in `testBytePlusModelArk()`

### 8.3 Manual Verification Checklist (Media Studio)

- [ ] BytePlus provider appears in Media Studio's provider/model selector when enabled
- [ ] Seedream 4.5 image generation: generates image, displays in gallery
- [ ] Seedream 4.0 image generation: generates image
- [ ] Seedance 1.0 Pro T2V: generates video from text prompt
- [ ] Seedance 1.0 Pro I2V: generates video from text + reference image
- [ ] Seedance 1.0 Lite T2V: generates video (lightweight)
- [ ] Seedance 1.0 Lite I2V: generates video with reference image
- [ ] Resolution selection (720p / 1080p) is passed correctly
- [ ] Duration selection (5s / 10s) is passed correctly
- [ ] Task progress is visible in Media Studio (processing → complete)
- [ ] Result video plays in Media Studio
- [ ] Generated media is saved to Media Library

---

## 9. Implementation Order

### Phase 1 — Provider Template + Connection Test (Node.js, low risk)
1. Edit `apps/web/server/routers/mediaProviders.ts`:
   - Add BytePlus to `PROVIDER_TEMPLATES`
   - Add `testBytePlusModelArk()` function
   - Wire into `testConnection` switch
2. Run: `cd apps/web && pnpm check`

### Phase 2 — Python Provider Adapter (main work)
1. Create `python-backend/app/llm_proxy/providers/byteplus_modelark_provider.py`
2. Update `python-backend/app/llm_proxy/providers/__init__.py`
3. Add normalization helpers in `python-backend/app/tasks/media_tasks.py`
4. Add provider routing in `generate_image_task` and `generate_video_task`
5. Run: `cd python-backend && ruff check app/ && mypy app/`

### Phase 3 — Tests
1. Write `python-backend/tests/providers/test_byteplus_modelark_provider.py`
2. Run: `cd python-backend && pytest tests/providers/test_byteplus_modelark_provider.py -v`
3. Run full test suite: `cd python-backend && pytest`

### Phase 4 — Media Studio Verification
1. Enable BytePlus provider in admin
2. Create Seedream and Seedance models via admin UI (or seed script)
3. Manual end-to-end test per checklist in Section 8.3
4. Fix any gaps found in Media Studio (reference image URL handling, parameter passing)

---

## 10. Configuration

### 10.1 Provider configJson

When creating the BytePlus provider via admin UI, set `configJson`:
```json
{
  "apiQueryEndpoint": "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks",
  "pollIntervalSeconds": 5,
  "maxPollAttempts": 120,
  "imageEndpoint": "/api/v3/images/generations",
  "videoTaskEndpoint": "/api/v3/contents/generations/tasks",
  "defaultResolution": "1080p",
  "defaultDuration": 5,
  "defaultWatermark": true
}
```

### 10.2 Environment Variables

No new environment variables required. Uses existing:
- `LLM_ENCRYPTION_KEY` — for decrypting the BytePlus API key stored in DB
- `DATABASE_URL` — for `media_provider_service.py` DB lookup

---

## 11. Open Questions

1. **Streaming response (ref: docs/ModelArk/1824137):** The BytePlus image API supports `"stream": true` for streaming responses. Should SmartSpecPro support streaming for image generation to show progress? **Recommendation: start with `stream: false` for simplicity, add streaming as future enhancement.**

2. **Regional endpoint:** The base URL is `ark.ap-southeast.bytepluses.com` (Southeast Asia region). Does SmartSpecPro need to support other regions (e.g., US, EU)? **Recommendation: make `baseUrl` configurable in admin (already supported), default to Southeast Asia.**

3. **seedance-1-0-lite-t2v-250428 listed under both Seedance and Seedream in spec request:** The user listed this model under Seedream in their request. This is a video model (accessed via `/api/v3/contents/generations/tasks`). **Decision: treat as video/Seedance model only.**

4. **Image size support:** BytePlus supports `"1K"`, `"2K"`, `"4K"` sizes. Need to confirm mapping from SmartSpecPro's existing size conventions (pixels like 1024x1024, 2048x2048) to BytePlus size strings.

5. **Watermark behavior:** BytePlus adds a watermark by default. Admin should be able to control this per-model via `configJson.defaultWatermark`. Users may want to disable watermark.

---

## 12. References

- BytePlus ModelArk Docs: https://docs.byteplus.com/en/docs/ModelArk
- Video Generation API: https://docs.byteplus.com/en/docs/ModelArk/Video_Generation_API
- Create Video Task: https://docs.byteplus.com/en/docs/ModelArk/1520757
- Retrieve Video Task: https://docs.byteplus.com/en/docs/ModelArk/1521309
- Image Generation API: https://docs.byteplus.com/en/docs/ModelArk/1541523
- Streaming Response: https://docs.byteplus.com/en/docs/ModelArk/1824137
- Existing provider pattern: `python-backend/app/llm_proxy/providers/kie_ai_provider.py`
- Existing media provider service: `python-backend/app/services/media_provider_service.py`
- tRPC router: `apps/web/server/routers/mediaProviders.ts`
- Media task Celery: `python-backend/app/tasks/media_tasks.py`

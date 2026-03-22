# Section 04: Gateway Routing

## Overview

Add fal.ai routing to `gateway_unified.py` so the unified gateway dispatches video, audio, and image generation requests to `FalAIProvider`. Includes provider ID normalization, routing blocks in all three generation methods, and a per-user concurrent task limit for video generation.

**Depends on:** section-03 (FalAIProvider class)
**Blocks:** section-05 (Celery polling), section-08 (credit reconciliation)

## File to Modify

- `python-backend/app/llm_proxy/gateway_unified.py`

## Tests First

### `python-backend/tests/unit/services/test_gateway_fal_routing.py`

```python
# --- Provider ID Normalization ---
# Test: "fal_ai" -> "fal_ai"
# Test: "fal" -> "fal_ai"
# Test: "falai" -> "fal_ai"
# Test: "fal_ai_provider" -> "fal_ai"
# Test: existing normalizations still work (regression)

# --- Video Routing ---
# Test: generate_video routes to FalAIProvider when resolved_provider == "fal_ai"
# Test: FalAIProvider instantiated with api_key from get_media_provider_key
# Test: result contains request_id and PROCESSING status
# Test: HTTPException 503 when provider not configured
# Test: aclose() called in finally block even on error

# --- Audio Routing ---
# Test: generate_audio routes to FalAIProvider when resolved_provider == "fal_ai"
# Test: _deduct_credits called with actual cost
# Test: HTTPException 503 when not configured

# --- Image Routing ---
# Test: generate_image routes to FalAIProvider when resolved_provider == "fal_ai"
# Test: HTTPException 503 when not configured

# --- Concurrent Task Limit ---
# Test: allows request when user has 0 in-flight fal.ai tasks
# Test: allows request when user has 2 in-flight fal.ai tasks
# Test: rejects request when user has 3 in-flight fal.ai tasks
# Test: only counts fal.ai VIDEO_MODELS tasks
# Test: only counts PROCESSING status
```

## Implementation Details

### 1. Provider ID Normalization

In `_normalize_provider_id()` (~line 110), add after the uvoice block:
```python
if normalized in {"fal", "fal_ai", "falai", "fal_ai_provider"}:
    return "fal_ai"
```

### 2. Video Routing Block

In `generate_video()` (~line 815), add `elif resolved_provider == "fal_ai"` AFTER BytePlus block, BEFORE Kie.ai fallback:

1. Check concurrent limit: `await self._check_fal_concurrent_limit(user.id)`
2. Fetch config: `await get_media_provider_key("fal_ai")` -- raise HTTPException 503 if not configured
3. Instantiate: `FalAIProvider(api_key=provider_config["apiKey"])`
4. Call: `await fal_client.generate_video(request.model, request.extra_params or {})`
5. Deduct credits (pre-reservation)
6. Finally: `await fal_client.aclose()`

Video is queue-based: returns `request_id` in `result["id"]`, stored as `task.task_id` for Celery polling.

### 3. Audio Routing Block

In `generate_audio()` (~line 951), add after UVoice block, before Kie.ai fallback. Same pattern but synchronous -- result already has audio URL. Deduct credits immediately.

### 4. Image Routing Block

In `generate_image()` (~line 498), add after BytePlus block, before Kie.ai fallback. Synchronous -- result has image URL.

### 5. Concurrent Task Limit

New private method:
```python
async def _check_fal_concurrent_limit(self, user_id: int) -> None:
    """Raise ValueError if user has >= 3 in-flight fal.ai tasks."""
```
Query `media_tasks` table: `WHERE user_id = X AND status = PROCESSING AND model IN (FalAIProvider.VIDEO_MODELS)`

### 6. Error Handling Pattern

```python
try:
    # provider calls
except HTTPException:
    raise
except Exception as e:
    logger.error("fal_ai_{type}_generation_failed", ...)
    raise HTTPException(status_code=500, detail="fal.ai generation failed")
finally:
    if fal_client is not None:
        await fal_client.aclose()
```

### Routing Priority

- `generate_video()`: BytePlus -> **fal.ai** -> Kie.ai (fallback)
- `generate_audio()`: UVoice -> **fal.ai** -> Kie.ai (fallback)
- `generate_image()`: BytePlus -> **fal.ai** -> Kie.ai (fallback)

## Implementation Notes (Post-Build)

### Files Modified
- **MODIFIED**: `python-backend/app/llm_proxy/gateway_unified.py` — added fal_ai normalization, routing blocks for video/audio/image, `_check_fal_concurrent_limit()`
- **CREATED**: `python-backend/tests/unit/services/test_gateway_fal_routing.py` (280 lines, 13 tests)

### Deviations from Plan
- None — implementation matches spec exactly.

### Test Fix
- `test_503_when_not_configured`: Mock path was incorrect (`app.llm_proxy.gateway_unified.get_media_provider_key` → `app.services.media_provider_service.get_media_provider_key`). Fixed during review.

### Test Results
All 13 tests pass.

I now have all the context I need to write the section. Let me generate the complete section content.

# Section 05: LLMGateway Routing — BytePlus ModelArk

## Overview

This section extends `LLMGateway.generate_image()` and `LLMGateway.generate_video()` in `python-backend/app/llm_proxy/gateway_unified.py` to route BytePlus ModelArk model requests to the `BytePlusModelArkProvider` adapter (delivered by section-03). The changes are purely additive: a model-membership check at the top of each method causes BytePlus models to take a new code path, while all other models fall through to the existing KieAI code path unchanged.

## Dependencies

- **section-03-python-adapter** must be complete before this section. Specifically, `BytePlusModelArkProvider` must exist at `python-backend/app/llm_proxy/providers/byteplus_modelark_provider.py` and be exported from `python-backend/app/llm_proxy/providers/__init__.py`.
- **section-02-nodejs-media-models** provides the conceptual model registry context, but is not a Python-level dependency.

## Background: Current gateway_unified.py Structure

The file `/home/dev/projects/SmartSpecPro/python-backend/app/llm_proxy/gateway_unified.py` currently contains:

- `LLMGateway.__init__`: Sets up `self.db`, `self.llm_proxy`, `self.unified_client`, `self.credit_service`, `self.web_gateway`.
- `LLMGateway.generate_image(request, user)`: Estimates cost, checks credits, initializes the Kie.ai client (calling `initialize_kie_ai_client()` from `app.services.media_provider_service` if not already set), then calls `self.unified_client.kie_ai_client.generate_image(...)` and returns an `ImageGenerationResponse`.
- `LLMGateway.generate_video(request, user, wait_for_completion)`: Same pattern for video.
- `LLMGateway._deduct_credits(user, actual_cost, request, response, estimated_cost, use_openrouter)`: Deducts credits via Web Gateway or local `CreditService`. This method accepts `Decimal` for `actual_cost`.
- `LLMGateway._estimate_cost(request, use_openrouter)`: Looks up credit cost from the `media_models` DB table and converts to USD via `Decimal(str(credit_cost)) / Decimal("1000")`.

Key imports already in the file:
```python
from decimal import Decimal
from fastapi import HTTPException, status
import structlog
from app.llm_proxy.models import ImageGenerationRequest, ImageGenerationResponse, VideoGenerationRequest, VideoGenerationResponse
```

The `get_media_provider_key` function from `app.services.media_provider_service` returns `Optional[Dict[str, Any]]` with keys `apiKey`, `baseUrl`, and `configJson`. It accepts any provider name string — no code change is needed in that service.

## File to Modify

**`/home/dev/projects/SmartSpecPro/python-backend/app/llm_proxy/gateway_unified.py`**

## Implementation

### Add Import for BytePlusModelArkProvider

At the top of `generate_image` (or as a local import inside the BytePlus branch), import the provider. Local imports inside the routing branch are acceptable and keep the top-level import clean — this is the same pattern used for `initialize_kie_ai_client` which is already imported locally within `generate_image`.

```python
from app.llm_proxy.providers.byteplus_modelark_provider import BytePlusModelArkProvider
```

Import this locally inside both `generate_image` and `generate_video` at the start of the BytePlus branch, consistent with the existing local import style in the method.

### Extend generate_image()

Insert the BytePlus routing block **before** the existing Kie.ai client initialization check (before the `if not self.unified_client.kie_ai_client:` block). The structure is:

```python
async def generate_image(self, request: ImageGenerationRequest, user: User) -> ImageGenerationResponse:
    """Generate image with credit checking."""
    logger.info("image_generation_request", user_id=user.id, model=request.model)

    estimated_cost = await self._estimate_cost(request, False)
    await self._check_credits(user, estimated_cost)

    # --- BytePlus ModelArk routing (INSERT BEFORE Kie.ai block) ---
    from app.llm_proxy.providers.byteplus_modelark_provider import BytePlusModelArkProvider
    if request.model in BytePlusModelArkProvider.IMAGE_MODELS:
        from app.services.media_provider_service import get_media_provider_key
        provider_config = await get_media_provider_key("byteplus_modelark")
        if not provider_config or not provider_config.get("apiKey"):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="BytePlus ModelArk not configured. Please add API key in Admin > Media Providers.",
            )
        client = BytePlusModelArkProvider(
            api_key=provider_config["apiKey"],
            base_url=provider_config.get("baseUrl"),
        )
        try:
            # Map size: prefer request.size, fall back to "2K"
            size = getattr(request, "size", None) or "2K"
            result = await client.generate_image(
                model=request.model,
                prompt=request.prompt,
                size=size,
            )
            actual_cost = Decimal(str(client.calculate_cost_usd(result["usage_tokens"])))
            response = ImageGenerationResponse(
                id=result.get("provider_task_id", ""),
                model=request.model,
                provider="byteplus_modelark",
                created=0,
                data=[{"url": result["result_url"]}],
            )
            transaction = await self._deduct_credits(user, actual_cost, request, response, estimated_cost, False)
            response.credits_used = abs(transaction.amount)
            response.credits_balance = transaction.balance_after
            return response
        except HTTPException:
            raise
        except Exception as e:
            logger.error("byteplus_image_generation_failed", user_id=user.id, model=request.model, error=str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"BytePlus image generation failed: {str(e)}")
        finally:
            await client.aclose()
    # --- End BytePlus routing ---

    # Existing Kie.ai code follows unchanged...
    if not self.unified_client.kie_ai_client:
        ...
```

Key points:
- The `try/finally` wrapping `client.aclose()` is separate from the outer exception handler. Structure it so `aclose()` is guaranteed to run even on errors. The cleanest approach is a nested `try/finally` inside the outer `try/except`.
- `_deduct_credits` is called with `actual_cost` as a `Decimal`, consistent with the Kie.ai branch.
- `created=0` is acceptable — BytePlus does not return a Unix timestamp in the image response.
- Do not catch `HTTPException` in the general `except Exception` — re-raise it as shown.

### Extend generate_video()

Insert the BytePlus routing block **before** the existing Kie.ai client initialization check (before the `if not self.unified_client.kie_ai_client:` block). BytePlus video generation is async — it returns a task ID immediately (no polling in this method; polling is handled by `recover_stuck_tasks` in section-06).

```python
async def generate_video(
    self,
    request: VideoGenerationRequest,
    user: User,
    wait_for_completion: bool = True,
) -> VideoGenerationResponse:
    """Generate video with credit checking."""
    logger.info("video_generation_request", user_id=user.id, model=request.model)

    estimated_cost = await self._estimate_cost(request, False)
    await self._check_credits(user, estimated_cost)

    # --- BytePlus ModelArk routing (INSERT BEFORE Kie.ai block) ---
    from app.llm_proxy.providers.byteplus_modelark_provider import BytePlusModelArkProvider
    if request.model in BytePlusModelArkProvider.VIDEO_MODELS:
        from app.services.media_provider_service import get_media_provider_key
        provider_config = await get_media_provider_key("byteplus_modelark")
        if not provider_config or not provider_config.get("apiKey"):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="BytePlus ModelArk not configured. Please add API key in Admin > Media Providers.",
            )
        client = BytePlusModelArkProvider(
            api_key=provider_config["apiKey"],
            base_url=provider_config.get("baseUrl"),
        )
        try:
            # Extract extra params; fall back to safe defaults
            extra = getattr(request, "extra_params", None) or {}
            resolution = extra.get("resolution", "1080p")
            duration = int(extra.get("duration", 5))
            camerafixed = bool(extra.get("camerafixed", False))

            # I2V: use the first resolved reference image URL if present
            reference_image_url = None
            if request.reference_image_urls:
                reference_image_url = request.reference_image_urls[0]

            result = await client.create_video_task(
                model=request.model,
                prompt=request.prompt,
                resolution=resolution,
                duration=duration,
                camerafixed=camerafixed,
                reference_image_url=reference_image_url,
            )
            response = VideoGenerationResponse(
                id=result["provider_task_id"],
                model=request.model,
                provider="byteplus_modelark",
                created=0,
                data=[],
                status="queued",
            )
            # Credit deduction uses the estimated cost; actual cost deducted on completion in recover_stuck_tasks
            transaction = await self._deduct_credits(user, estimated_cost, request, response, estimated_cost, False)
            response.credits_used = abs(transaction.amount)
            response.credits_balance = transaction.balance_after
            return response
        except HTTPException:
            raise
        except Exception as e:
            logger.error("byteplus_video_task_creation_failed", user_id=user.id, model=request.model, error=str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"BytePlus video task creation failed: {str(e)}")
        finally:
            await client.aclose()
    # --- End BytePlus routing ---

    # Existing Kie.ai code follows unchanged...
    if not self.unified_client.kie_ai_client:
        ...
```

Key points:
- `reference_image_urls` are already resolved to public R2 URLs by the time they reach this method — the gateway's existing R2 resolution block (in `generate_image`) runs before the provider call. For `generate_video`, if the same R2 resolution block is present, confirm it runs before the BytePlus branch. If it does not exist in `generate_video`, the URLs passed from the Celery task are already public (the Celery layer resolves them before calling the gateway).
- Credit deduction at task creation uses `estimated_cost`. This is consistent with the async Kie.ai flow — the important thing is that credits are reserved at submission time.
- `VideoGenerationResponse` fields: check the actual model definition in `app/llm_proxy/models.py` — if `status` is not a field, omit it and rely on the default. The `id` field holds the `provider_task_id` which `recover_stuck_tasks` will read back as `task.task_id`.

### VideoGenerationResponse model check

Before implementing, verify the `VideoGenerationResponse` fields:

```bash
grep -n "class VideoGenerationResponse" /home/dev/projects/SmartSpecPro/python-backend/app/llm_proxy/models.py
```

If `status` is not a field on `VideoGenerationResponse`, remove it from the constructor call and store status separately if needed (or just return without it — `recover_stuck_tasks` drives status updates via the DB record, not from this response).

## Tests

**Test file:** `python-backend/tests/unit/llm_proxy/test_gateway_unified_byteplus.py` (new file)

Run with: `cd python-backend && uv run pytest tests/unit/llm_proxy/test_gateway_unified_byteplus.py -v`

Or targeting gateway tests: `cd python-backend && uv run pytest tests/ -k "gateway" -v`

The existing gateway test file is at `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/llm_proxy/test_gateway_unified.py` — do not modify it. Create a new file alongside it.

### Test Stubs

```python
"""
Tests for LLMGateway BytePlus ModelArk routing.
Section 05 — gateway_unified.py extensions.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal

from app.llm_proxy.gateway_unified import LLMGateway
from app.llm_proxy.models import ImageGenerationRequest, VideoGenerationRequest


@pytest.fixture
def mock_db():
    """Async DB session mock."""
    return AsyncMock()


@pytest.fixture
def gateway(mock_db):
    """LLMGateway instance with all heavy dependencies mocked."""
    with patch("app.llm_proxy.gateway_unified.LLMProxy"), \
         patch("app.llm_proxy.gateway_unified.get_unified_client"), \
         patch("app.llm_proxy.gateway_unified.CreditService"), \
         patch("app.llm_proxy.gateway_unified.get_gateway_client"):
        gw = LLMGateway(mock_db)
        gw._check_credits = AsyncMock()
        gw._estimate_cost = AsyncMock(return_value=Decimal("0.02"))
        gw._deduct_credits = AsyncMock(return_value=MagicMock(amount=-20, balance_after=980))
        return gw


class TestGatewayImageRoutingByteplus:
    """generate_image() routes BytePlus Seedream models correctly."""

    async def test_routes_to_byteplus_for_seedream_4_5(self, gateway):
        """generate_image routes to BytePlus when model is 'seedream-4-5-251128'."""
        ...

    async def test_routes_to_byteplus_for_seedream_4_0(self, gateway):
        """generate_image routes to BytePlus when model is 'seedream-4-0-250828'."""
        ...

    async def test_returns_image_generation_response_with_url(self, gateway):
        """generate_image returns ImageGenerationResponse with result_url in data."""
        ...

    async def test_raises_503_when_byteplus_not_configured(self, gateway):
        """generate_image raises HTTP 503 when get_media_provider_key returns None."""
        ...

    async def test_kieai_regression_non_byteplus_model(self, gateway):
        """generate_image falls through to Kie.ai for non-BytePlus model — no regression."""
        ...

    async def test_aclose_called_in_finally_on_success(self, gateway):
        """aclose() is called on the BytePlus client even on success."""
        ...

    async def test_aclose_called_in_finally_on_error(self, gateway):
        """aclose() is called on the BytePlus client even when generate_image raises."""
        ...


class TestGatewayVideoRoutingByteplus:
    """generate_video() routes BytePlus Seedance models correctly."""

    async def test_routes_to_byteplus_for_seedance_model(self, gateway):
        """generate_video routes to BytePlus when model is in VIDEO_MODELS."""
        ...

    async def test_passes_reference_image_url_for_i2v(self, gateway):
        """generate_video passes reference_image_urls[0] as reference_image_url for I2V."""
        ...

    async def test_returns_video_generation_response_with_task_id(self, gateway):
        """generate_video returns VideoGenerationResponse with provider_task_id as id."""
        ...

    async def test_kieai_regression_non_byteplus_video_model(self, gateway):
        """generate_video falls through to Kie.ai for non-BytePlus model — no regression."""
        ...

    async def test_raises_503_when_byteplus_not_configured(self, gateway):
        """generate_video raises HTTP 503 when BytePlus provider not configured."""
        ...

    async def test_aclose_called_in_finally(self, gateway):
        """aclose() is called on the BytePlus client in all cases."""
        ...
```

### Test Implementation Guidance

For each test, mock `BytePlusModelArkProvider` and `get_media_provider_key` at the import path where they are imported inside the routing branches:

```python
@patch("app.llm_proxy.gateway_unified.BytePlusModelArkProvider")  # if top-level import
# OR patch at the local import path:
@patch("app.llm_proxy.providers.byteplus_modelark_provider.BytePlusModelArkProvider")
```

Because the import is local (inside the method body), you need to patch at the module where it is looked up. The safest approach is to patch `app.llm_proxy.providers.byteplus_modelark_provider.BytePlusModelArkProvider` or use `sys.modules` patching. Check what approach the existing `test_gateway_unified.py` uses for `initialize_kie_ai_client` as a model.

For the `get_media_provider_key` mock:
```python
@patch("app.services.media_provider_service.get_media_provider_key",
       new_callable=AsyncMock,
       return_value={"apiKey": "test-key-abc", "baseUrl": None})
```

For the `aclose()` finally tests, use `MagicMock(aclose=AsyncMock())` as the provider instance and assert `aclose.assert_awaited_once()`.

For the KieAI regression tests, provide a Kie.ai model name (e.g., `"kolors"`) and assert that `BytePlusModelArkProvider` is never instantiated, and that `self.unified_client.kie_ai_client` is called instead.

## Verification

After implementation:

```bash
cd /home/dev/projects/SmartSpecPro/python-backend

# Type check
mypy app/llm_proxy/gateway_unified.py

# Lint
ruff check app/llm_proxy/gateway_unified.py

# Run gateway-specific tests
uv run pytest tests/unit/llm_proxy/test_gateway_unified_byteplus.py -v

# Ensure no regression in existing gateway tests
uv run pytest tests/unit/llm_proxy/test_gateway_unified.py -v

# Run all tests matching "gateway"
uv run pytest tests/ -k "gateway" -v
```

## Security Checklist for this Section

- [x] `get_media_provider_key("byteplus_modelark")` is called to obtain the API key from the encrypted DB store — the key is never hardcoded or logged
- [x] HTTP 503 is raised (not 500) when the provider is not configured — this is the correct signal for "provider unavailable" vs "unexpected error"
- [x] `aclose()` is always called in a `finally` block — no httpx client is left open on error paths
- [x] `HTTPException` is re-raised (not caught by the general `except Exception`) — FastAPI error handling is preserved
- [x] The BytePlus routing block sits entirely before the Kie.ai block — existing Kie.ai behavior is unmodified for all non-BytePlus models

## Implementation Notes (Deviations from Plan)

### Error message sanitization (code review fix)
The section plan showed `detail=f"BytePlus image generation failed: {str(e)}"`. This was changed to a fixed string `"BytePlus image generation failed. See server logs for details."` to prevent httpx exception details (which can include request URLs) from reaching API clients. Raw error is logged via structlog before raising.

### client= initialization pattern (code review fix)
The `client = BytePlusModelArkProvider(...)` assignment was moved inside the `try` block with `client = None` guard before it. The `finally` block uses `if client is not None: await client.aclose()`. This prevents a NameError if `__init__` raises before the assignment completes.

### Test file
`python-backend/tests/unit/llm_proxy/test_gateway_unified_byteplus.py` — 16 tests, all passing.

Key technique: `_byteplus_class_mock(instance)` helper preserves real `IMAGE_MODELS`/`VIDEO_MODELS` frozensets on the mock class so routing membership checks work correctly in tests.

### R2 URL resolution for video reference images
BytePlus video path does not run R2 URL resolution (same as image path). The caller (Celery task layer) is responsible for passing public URLs. This is a known gap documented in the plan.

### Files modified
- `python-backend/app/llm_proxy/gateway_unified.py` — BytePlus routing blocks added to `generate_image()` and `generate_video()`
- `python-backend/tests/unit/llm_proxy/test_gateway_unified_byteplus.py` — new test file (16 tests)
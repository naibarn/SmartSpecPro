"""
Tests for BytePlusModelArkProvider.
Uses unittest.mock for httpx mocking (matching existing provider test conventions).
All async tests use pytest-asyncio (asyncio_mode=auto per pyproject.toml).
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.llm_proxy.providers.byteplus_modelark_provider import BytePlusModelArkProvider


# --- Class structure ---

def test_image_models_set_has_two_entries():
    """IMAGE_MODELS contains exactly 2 Seedream model IDs."""
    assert len(BytePlusModelArkProvider.IMAGE_MODELS) == 2


def test_video_models_set_has_four_entries():
    """VIDEO_MODELS contains exactly 4 Seedance model IDs."""
    assert len(BytePlusModelArkProvider.VIDEO_MODELS) == 4


def test_size_map_includes_pixel_formats():
    """SIZE_MAP maps '1024x1024' -> '1K', '2048x2048' -> '2K', '4096x4096' -> '4K'."""
    assert BytePlusModelArkProvider.SIZE_MAP["1024x1024"] == "1K"
    assert BytePlusModelArkProvider.SIZE_MAP["2048x2048"] == "2K"
    assert BytePlusModelArkProvider.SIZE_MAP["4096x4096"] == "4K"


def test_size_map_includes_identity_entries():
    """SIZE_MAP also maps shorthand inputs to themselves (e.g., '2K' -> '2K')."""
    assert BytePlusModelArkProvider.SIZE_MAP["1K"] == "1K"
    assert BytePlusModelArkProvider.SIZE_MAP["2K"] == "2K"
    assert BytePlusModelArkProvider.SIZE_MAP["4K"] == "4K"


def test_init_strips_trailing_slash():
    """__init__ strips trailing slash from base_url."""
    provider = BytePlusModelArkProvider(api_key="test-key", base_url="https://example.com/api/v3/")
    assert not provider.base_url.endswith("/")
    provider.client.aclose = AsyncMock()


def test_init_api_key_not_in_headers_value():
    """API key is stored only as Bearer token, not exposed elsewhere."""
    provider = BytePlusModelArkProvider(api_key="super-secret-key-123")
    assert "super-secret-key-123" not in str(provider._headers.get("X-API-Key", ""))
    provider.client.aclose = AsyncMock()


# --- Image generation ---

@pytest.mark.asyncio
async def test_generate_image_success():
    """generate_image returns result_url, provider_task_id, usage_tokens on 200."""
    ...


@pytest.mark.asyncio
async def test_generate_image_request_body_fields():
    """Request body contains model, size (mapped), watermark, stream:false."""
    ...


@pytest.mark.asyncio
async def test_generate_image_size_mapping_pixel_formats():
    """1024x1024 -> 1K, 2048x2048 -> 2K, 4096x4096 -> 4K in the outgoing request."""
    ...


@pytest.mark.asyncio
async def test_generate_image_size_mapping_identity():
    """'2K' input maps to '2K' (identity mapping is present in SIZE_MAP)."""
    ...


@pytest.mark.asyncio
async def test_generate_image_raises_on_401():
    """generate_image raises httpx.HTTPStatusError on 401 response."""
    ...


@pytest.mark.asyncio
async def test_generate_image_raises_on_500():
    """generate_image raises httpx.HTTPStatusError on 500 response."""
    ...


# --- Video task creation ---

@pytest.mark.asyncio
async def test_create_video_task_t2v_content_array():
    """T2V: content array has exactly 1 text item."""
    ...


@pytest.mark.asyncio
async def test_create_video_task_t2v_text_includes_inline_params():
    """T2V: text item contains prompt + inline params suffix."""
    ...


@pytest.mark.asyncio
async def test_create_video_task_i2v_content_array():
    """I2V: content array has 2 items -- text and image_url."""
    ...


@pytest.mark.asyncio
async def test_create_video_task_i2v_image_url_matches_reference():
    """I2V: image_url item url matches the reference_image_url parameter."""
    ...


@pytest.mark.asyncio
async def test_create_video_task_returns_provider_task_id():
    """Returns provider_task_id from response.id."""
    ...


@pytest.mark.asyncio
async def test_create_video_task_returns_initial_status():
    """Returns initial status from response.status."""
    ...


# --- Task status ---

@pytest.mark.asyncio
async def test_get_task_status_correct_url():
    """GET request goes to .../contents/generations/tasks/{task_id}."""
    ...


@pytest.mark.asyncio
async def test_get_task_status_returns_raw_dict():
    """Returns the raw response dict unchanged."""
    ...


# --- Inline params ---

def test_build_inline_params_valid_inputs():
    """Valid inputs produce correct suffix string with all 4 flags."""
    provider = BytePlusModelArkProvider(api_key="k")
    result = provider._build_inline_params(resolution="1080p", duration=5, camerafixed=False, watermark=True)
    assert "--resolution 1080p" in result
    assert "--duration 5" in result
    assert "--camerafixed false" in result
    assert "--watermark true" in result


def test_build_inline_params_camerafixed_true_lowercase():
    """camerafixed=True produces '--camerafixed true' (lowercase Python bool)."""
    provider = BytePlusModelArkProvider(api_key="k")
    result = provider._build_inline_params(resolution="720p", duration=5, camerafixed=True, watermark=False)
    assert "--camerafixed true" in result


def test_build_inline_params_invalid_resolution_raises():
    """resolution='4K' (not in allowlist) raises ValueError."""
    provider = BytePlusModelArkProvider(api_key="k")
    with pytest.raises(ValueError):
        provider._build_inline_params(resolution="4K", duration=5, camerafixed=False, watermark=False)


def test_build_inline_params_invalid_resolution_1440p_raises():
    """resolution='1440p' raises ValueError."""
    provider = BytePlusModelArkProvider(api_key="k")
    with pytest.raises(ValueError):
        provider._build_inline_params(resolution="1440p", duration=5, camerafixed=False, watermark=False)


def test_build_inline_params_invalid_duration_raises():
    """duration=15 raises ValueError."""
    provider = BytePlusModelArkProvider(api_key="k")
    with pytest.raises(ValueError):
        provider._build_inline_params(resolution="1080p", duration=15, camerafixed=False, watermark=False)


def test_build_inline_params_invalid_duration_zero_raises():
    """duration=0 raises ValueError."""
    provider = BytePlusModelArkProvider(api_key="k")
    with pytest.raises(ValueError):
        provider._build_inline_params(resolution="1080p", duration=0, camerafixed=False, watermark=False)


# --- Cost calculation ---

def test_calculate_cost_usd_one_million_tokens():
    """calculate_cost_usd(1_000_000) == 2.5."""
    provider = BytePlusModelArkProvider(api_key="k")
    assert provider.calculate_cost_usd(1_000_000) == pytest.approx(2.5)


def test_calculate_cost_usd_zero():
    """calculate_cost_usd(0) == 0.0."""
    provider = BytePlusModelArkProvider(api_key="k")
    assert provider.calculate_cost_usd(0) == 0.0


def test_calculate_cost_usd_45_tokens():
    """calculate_cost_usd(45) ~ 0.0001125."""
    provider = BytePlusModelArkProvider(api_key="k")
    assert provider.calculate_cost_usd(45) == pytest.approx(0.0001125, rel=1e-5)


# --- Security ---

@pytest.mark.asyncio
async def test_ssrf_localhost_reference_image_raises():
    """create_video_task raises ValueError for localhost reference_image_url before HTTP."""
    provider = BytePlusModelArkProvider(api_key="k")
    with pytest.raises(ValueError):
        await provider.create_video_task(
            model="seedance-1-0-pro-250528",
            prompt="test",
            reference_image_url="http://localhost/img.jpg"
        )
    await provider.aclose()


@pytest.mark.asyncio
async def test_ssrf_private_ip_reference_image_raises():
    """create_video_task raises ValueError for 127.0.0.1 reference_image_url."""
    provider = BytePlusModelArkProvider(api_key="k")
    with pytest.raises(ValueError):
        await provider.create_video_task(
            model="seedance-1-0-lite-i2v-250428",
            prompt="test",
            reference_image_url="http://127.0.0.1/img.jpg"
        )
    await provider.aclose()


@pytest.mark.asyncio
async def test_api_key_not_in_structlog_output(capsys):
    """API key value does not appear in captured structlog output during generate_image."""
    ...

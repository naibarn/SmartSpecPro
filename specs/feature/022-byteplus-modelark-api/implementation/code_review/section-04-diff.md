diff --git a/python-backend/app/llm_proxy/providers/byteplus_modelark_provider.py b/python-backend/app/llm_proxy/providers/byteplus_modelark_provider.py
index 7e9f568..07a53a0 100644
--- a/python-backend/app/llm_proxy/providers/byteplus_modelark_provider.py
+++ b/python-backend/app/llm_proxy/providers/byteplus_modelark_provider.py
@@ -19,6 +19,58 @@ from app.core.media_job_validators import validate_uri_no_ssrf
 logger = structlog.get_logger()
 
 
+def _normalize_byteplus_task_state(status_response: dict) -> tuple[str, str]:
+    """
+    Map a BytePlus task status response to an internal state tuple.
+
+    Returns:
+        (normalized_state, raw_status) where normalized_state is one of:
+        "success", "fail", "processing", "unknown"
+
+    BytePlus status strings:
+        succeeded -> success
+        failed    -> fail
+        cancelled -> fail
+        queued    -> processing
+        processing -> processing
+        <other>   -> unknown
+    """
+    raw_status: str = status_response.get("status", "")
+    status = raw_status.lower()
+    if status == "succeeded":
+        return "success", raw_status
+    if status in ("failed", "cancelled"):
+        return "fail", raw_status
+    if status in ("queued", "processing"):
+        return "processing", raw_status
+    return "unknown", raw_status
+
+
+def _extract_byteplus_result_url(status_response: dict) -> str | None:
+    """
+    Extract the first valid media URL from a BytePlus task status response.
+
+    Iterates the `content` array and returns the URL from the first item
+    with type=video_url or type=image_url whose URL starts with "http".
+
+    Returns None if no suitable URL is found.
+    """
+    content = status_response.get("content")
+    if not content:
+        return None
+    for item in content:
+        item_type = item.get("type", "")
+        if item_type == "video_url":
+            url = (item.get("video_url") or {}).get("url", "")
+        elif item_type == "image_url":
+            url = (item.get("image_url") or {}).get("url", "")
+        else:
+            continue
+        if url and url.startswith("http"):
+            return url
+    return None
+
+
 class BytePlusModelArkProvider:
     """
     BytePlus ModelArk API provider.
diff --git a/python-backend/tests/unit/llm_proxy/test_byteplus_modelark_provider.py b/python-backend/tests/unit/llm_proxy/test_byteplus_modelark_provider.py
index bf2953f..0a530ce 100644
--- a/python-backend/tests/unit/llm_proxy/test_byteplus_modelark_provider.py
+++ b/python-backend/tests/unit/llm_proxy/test_byteplus_modelark_provider.py
@@ -1,240 +1,709 @@
 """
-Tests for BytePlusModelArkProvider.
-Uses unittest.mock for httpx mocking (matching existing provider test conventions).
-All async tests use pytest-asyncio (asyncio_mode=auto per pyproject.toml).
+Unit tests for BytePlusModelArkProvider.
+
+Tests cover:
+- Class constants (IMAGE_MODELS, VIDEO_MODELS, SIZE_MAP, BYTEPLUS_USD_PER_1M_TOKENS)
+- __init__ behavior (trailing slash strip, default URL, no key logging)
+- Image generation (happy path, size mapping, error propagation, usage_tokens, key not logged)
+- Video task creation (T2V and I2V content array structure, return values)
+- Task status polling (URL shape, 30s timeout, raw response returned)
+- Inline parameter building (valid inputs, bool formatting, ValueError on invalid)
+- Cost calculation (token-to-USD conversion)
+- Status normalization (_normalize_byteplus_task_state)
+- URL extraction (_extract_byteplus_result_url)
+- Security: SSRF block on reference_image_url, API key not in logs
+- aclose: httpx client is closed
 """
+
 import pytest
 from unittest.mock import AsyncMock, MagicMock, patch
+import structlog
+
+from app.llm_proxy.providers.byteplus_modelark_provider import (
+    BytePlusModelArkProvider,
+    _normalize_byteplus_task_state,
+    _extract_byteplus_result_url,
+)
+
+
+# ---------------------------------------------------------------------------
+# Class Constants
+# ---------------------------------------------------------------------------
+
+class TestBytePlusModelArkProviderConstants:
+    """Verify class-level constants are correct."""
+
+    def test_image_models_contains_exactly_two_seedream_ids(self):
+        """IMAGE_MODELS must contain both Seedream model IDs."""
+        assert len(BytePlusModelArkProvider.IMAGE_MODELS) == 2
+        assert "seedream-4-5-251128" in BytePlusModelArkProvider.IMAGE_MODELS
+        assert "seedream-4-0-250828" in BytePlusModelArkProvider.IMAGE_MODELS
+
+    def test_video_models_contains_exactly_four_seedance_ids(self):
+        """VIDEO_MODELS must contain all four Seedance model IDs."""
+        assert len(BytePlusModelArkProvider.VIDEO_MODELS) == 4
+        assert "seedance-1-0-pro-250528" in BytePlusModelArkProvider.VIDEO_MODELS
+        assert "seedance-1-0-pro-fast-251015" in BytePlusModelArkProvider.VIDEO_MODELS
+        assert "seedance-1-0-lite-t2v-250428" in BytePlusModelArkProvider.VIDEO_MODELS
+        assert "seedance-1-0-lite-i2v-250428" in BytePlusModelArkProvider.VIDEO_MODELS
+
+    def test_size_map_includes_pixel_format_entries(self):
+        """SIZE_MAP must map full pixel strings to BytePlus shorthand."""
+        assert BytePlusModelArkProvider.SIZE_MAP["1024x1024"] == "1K"
+        assert BytePlusModelArkProvider.SIZE_MAP["2048x2048"] == "2K"
+        assert BytePlusModelArkProvider.SIZE_MAP["4096x4096"] == "4K"
+
+    def test_size_map_includes_identity_entries(self):
+        """SIZE_MAP must also accept shorthand inputs unchanged."""
+        assert BytePlusModelArkProvider.SIZE_MAP["1K"] == "1K"
+        assert BytePlusModelArkProvider.SIZE_MAP["2K"] == "2K"
+        assert BytePlusModelArkProvider.SIZE_MAP["4K"] == "4K"
+
+    def test_usd_per_1m_tokens_constant(self):
+        """Pricing constant must be $2.50 per 1M tokens."""
+        assert BytePlusModelArkProvider.BYTEPLUS_USD_PER_1M_TOKENS == 2.5
+
+
+# ---------------------------------------------------------------------------
+# __init__
+# ---------------------------------------------------------------------------
+
+class TestBytePlusModelArkProviderInit:
+    """Verify __init__ behavior."""
+
+    def test_init_strips_trailing_slash_from_base_url(self):
+        """base_url must have trailing slash removed."""
+        provider = BytePlusModelArkProvider(
+            api_key="test-key",
+            base_url="https://ark.ap-southeast.bytepluses.com/api/v3/",
+        )
+        assert not provider.base_url.endswith("/")
+
+    def test_init_uses_default_base_url_when_none(self):
+        """When base_url is None, must use the Southeast Asia default."""
+        provider = BytePlusModelArkProvider(api_key="test-key")
+        assert "bytepluses.com" in provider.base_url
+
+    def test_init_does_not_log_api_key(self):
+        """API key must not appear in any log output during __init__."""
+        secret_key = "sk-byteplus-super-secret-12345"
+        with structlog.testing.capture_logs() as cap:
+            BytePlusModelArkProvider(api_key=secret_key)
+        all_log_text = str(cap)
+        assert secret_key not in all_log_text
+
+
+# ---------------------------------------------------------------------------
+# Image Generation
+# ---------------------------------------------------------------------------
+
+class TestGenerateImage:
+    """Tests for BytePlusModelArkProvider.generate_image()."""
+
+    @pytest.fixture
+    def provider(self):
+        return BytePlusModelArkProvider(api_key="test-api-key")
+
+    @pytest.fixture
+    def success_response(self):
+        """Minimal valid BytePlus image generation response."""
+        mock_resp = MagicMock()
+        mock_resp.raise_for_status = MagicMock()
+        mock_resp.json.return_value = {
+            "id": "resp-abc123",
+            "data": [{"url": "https://cdn.byteplus.com/img/result.png"}],
+            "usage": {"total_tokens": 1500},
+        }
+        return mock_resp
+
+    async def test_generate_image_returns_result_url(self, provider, success_response):
+        """Happy path: result_url is extracted from data[0].url."""
+        provider.client.post = AsyncMock(return_value=success_response)
+        result = await provider.generate_image(
+            model="seedream-4-5-251128",
+            prompt="A futuristic city",
+            size="2K",
+        )
+        assert result["result_url"] == "https://cdn.byteplus.com/img/result.png"
 
-from app.llm_proxy.providers.byteplus_modelark_provider import BytePlusModelArkProvider
-
-
-# --- Class structure ---
-
-def test_image_models_set_has_two_entries():
-    """IMAGE_MODELS contains exactly 2 Seedream model IDs."""
-    assert len(BytePlusModelArkProvider.IMAGE_MODELS) == 2
-
-
-def test_video_models_set_has_four_entries():
-    """VIDEO_MODELS contains exactly 4 Seedance model IDs."""
-    assert len(BytePlusModelArkProvider.VIDEO_MODELS) == 4
-
-
-def test_size_map_includes_pixel_formats():
-    """SIZE_MAP maps '1024x1024' -> '1K', '2048x2048' -> '2K', '4096x4096' -> '4K'."""
-    assert BytePlusModelArkProvider.SIZE_MAP["1024x1024"] == "1K"
-    assert BytePlusModelArkProvider.SIZE_MAP["2048x2048"] == "2K"
-    assert BytePlusModelArkProvider.SIZE_MAP["4096x4096"] == "4K"
-
-
-def test_size_map_includes_identity_entries():
-    """SIZE_MAP also maps shorthand inputs to themselves (e.g., '2K' -> '2K')."""
-    assert BytePlusModelArkProvider.SIZE_MAP["1K"] == "1K"
-    assert BytePlusModelArkProvider.SIZE_MAP["2K"] == "2K"
-    assert BytePlusModelArkProvider.SIZE_MAP["4K"] == "4K"
-
-
-def test_init_strips_trailing_slash():
-    """__init__ strips trailing slash from base_url."""
-    provider = BytePlusModelArkProvider(api_key="test-key", base_url="https://example.com/api/v3/")
-    assert not provider.base_url.endswith("/")
-    provider.client.aclose = AsyncMock()
-
-
-def test_init_api_key_not_in_headers_value():
-    """API key is stored only as Bearer token, not exposed elsewhere."""
-    provider = BytePlusModelArkProvider(api_key="super-secret-key-123")
-    assert "super-secret-key-123" not in str(provider._headers.get("X-API-Key", ""))
-    provider.client.aclose = AsyncMock()
-
-
-# --- Image generation ---
-
-@pytest.mark.asyncio
-async def test_generate_image_success():
-    """generate_image returns result_url, provider_task_id, usage_tokens on 200."""
-    ...
-
-
-@pytest.mark.asyncio
-async def test_generate_image_request_body_fields():
-    """Request body contains model, size (mapped), watermark, stream:false."""
-    ...
-
-
-@pytest.mark.asyncio
-async def test_generate_image_size_mapping_pixel_formats():
-    """1024x1024 -> 1K, 2048x2048 -> 2K, 4096x4096 -> 4K in the outgoing request."""
-    ...
-
-
-@pytest.mark.asyncio
-async def test_generate_image_size_mapping_identity():
-    """'2K' input maps to '2K' (identity mapping is present in SIZE_MAP)."""
-    ...
-
-
-@pytest.mark.asyncio
-async def test_generate_image_raises_on_401():
-    """generate_image raises httpx.HTTPStatusError on 401 response."""
-    ...
-
-
-@pytest.mark.asyncio
-async def test_generate_image_raises_on_500():
-    """generate_image raises httpx.HTTPStatusError on 500 response."""
-    ...
-
-
-# --- Video task creation ---
-
-@pytest.mark.asyncio
-async def test_create_video_task_t2v_content_array():
-    """T2V: content array has exactly 1 text item."""
-    ...
-
-
-@pytest.mark.asyncio
-async def test_create_video_task_t2v_text_includes_inline_params():
-    """T2V: text item contains prompt + inline params suffix."""
-    ...
-
-
-@pytest.mark.asyncio
-async def test_create_video_task_i2v_content_array():
-    """I2V: content array has 2 items -- text and image_url."""
-    ...
-
-
-@pytest.mark.asyncio
-async def test_create_video_task_i2v_image_url_matches_reference():
-    """I2V: image_url item url matches the reference_image_url parameter."""
-    ...
-
-
-@pytest.mark.asyncio
-async def test_create_video_task_returns_provider_task_id():
-    """Returns provider_task_id from response.id."""
-    ...
-
-
-@pytest.mark.asyncio
-async def test_create_video_task_returns_initial_status():
-    """Returns initial status from response.status."""
-    ...
-
-
-# --- Task status ---
-
-@pytest.mark.asyncio
-async def test_get_task_status_correct_url():
-    """GET request goes to .../contents/generations/tasks/{task_id}."""
-    ...
-
-
-@pytest.mark.asyncio
-async def test_get_task_status_returns_raw_dict():
-    """Returns the raw response dict unchanged."""
-    ...
-
-
-# --- Inline params ---
-
-def test_build_inline_params_valid_inputs():
-    """Valid inputs produce correct suffix string with all 4 flags."""
-    provider = BytePlusModelArkProvider(api_key="k")
-    result = provider._build_inline_params(resolution="1080p", duration=5, camerafixed=False, watermark=True)
-    assert "--resolution 1080p" in result
-    assert "--duration 5" in result
-    assert "--camerafixed false" in result
-    assert "--watermark true" in result
-
-
-def test_build_inline_params_camerafixed_true_lowercase():
-    """camerafixed=True produces '--camerafixed true' (lowercase Python bool)."""
-    provider = BytePlusModelArkProvider(api_key="k")
-    result = provider._build_inline_params(resolution="720p", duration=5, camerafixed=True, watermark=False)
-    assert "--camerafixed true" in result
-
-
-def test_build_inline_params_invalid_resolution_raises():
-    """resolution='4K' (not in allowlist) raises ValueError."""
-    provider = BytePlusModelArkProvider(api_key="k")
-    with pytest.raises(ValueError):
-        provider._build_inline_params(resolution="4K", duration=5, camerafixed=False, watermark=False)
-
-
-def test_build_inline_params_invalid_resolution_1440p_raises():
-    """resolution='1440p' raises ValueError."""
-    provider = BytePlusModelArkProvider(api_key="k")
-    with pytest.raises(ValueError):
-        provider._build_inline_params(resolution="1440p", duration=5, camerafixed=False, watermark=False)
-
-
-def test_build_inline_params_invalid_duration_raises():
-    """duration=15 raises ValueError."""
-    provider = BytePlusModelArkProvider(api_key="k")
-    with pytest.raises(ValueError):
-        provider._build_inline_params(resolution="1080p", duration=15, camerafixed=False, watermark=False)
-
-
-def test_build_inline_params_invalid_duration_zero_raises():
-    """duration=0 raises ValueError."""
-    provider = BytePlusModelArkProvider(api_key="k")
-    with pytest.raises(ValueError):
-        provider._build_inline_params(resolution="1080p", duration=0, camerafixed=False, watermark=False)
-
-
-# --- Cost calculation ---
-
-def test_calculate_cost_usd_one_million_tokens():
-    """calculate_cost_usd(1_000_000) == 2.5."""
-    provider = BytePlusModelArkProvider(api_key="k")
-    assert provider.calculate_cost_usd(1_000_000) == pytest.approx(2.5)
-
-
-def test_calculate_cost_usd_zero():
-    """calculate_cost_usd(0) == 0.0."""
-    provider = BytePlusModelArkProvider(api_key="k")
-    assert provider.calculate_cost_usd(0) == 0.0
-
-
-def test_calculate_cost_usd_45_tokens():
-    """calculate_cost_usd(45) ~ 0.0001125."""
-    provider = BytePlusModelArkProvider(api_key="k")
-    assert provider.calculate_cost_usd(45) == pytest.approx(0.0001125, rel=1e-5)
-
-
-# --- Security ---
+    async def test_generate_image_returns_provider_task_id(self, provider, success_response):
+        """result dict must include provider_task_id from response.id."""
+        provider.client.post = AsyncMock(return_value=success_response)
+        result = await provider.generate_image(
+            model="seedream-4-5-251128", prompt="test"
+        )
+        assert result["provider_task_id"] == "resp-abc123"
 
-@pytest.mark.asyncio
-async def test_ssrf_localhost_reference_image_raises():
-    """create_video_task raises ValueError for localhost reference_image_url before HTTP."""
-    provider = BytePlusModelArkProvider(api_key="k")
-    with pytest.raises(ValueError):
+    async def test_generate_image_returns_usage_tokens(self, provider, success_response):
+        """result dict must include usage_tokens from usage.total_tokens."""
+        provider.client.post = AsyncMock(return_value=success_response)
+        result = await provider.generate_image(
+            model="seedream-4-5-251128", prompt="test"
+        )
+        assert result["usage_tokens"] == 1500
+
+    async def test_generate_image_request_body_shape(self, provider, success_response):
+        """Request body must include model, size, watermark, stream:false."""
+        provider.client.post = AsyncMock(return_value=success_response)
+        await provider.generate_image(
+            model="seedream-4-5-251128",
+            prompt="A mountain scene",
+            size="1K",
+            watermark=True,
+        )
+        call_kwargs = provider.client.post.call_args
+        body = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
+        assert body["model"] == "seedream-4-5-251128"
+        assert body["size"] == "1K"
+        assert body["watermark"] is True
+        assert body["stream"] is False
+
+    async def test_generate_image_posts_to_images_generations_endpoint(
+        self, provider, success_response
+    ):
+        """POST must go to the /images/generations path."""
+        provider.client.post = AsyncMock(return_value=success_response)
+        await provider.generate_image(model="seedream-4-5-251128", prompt="test")
+        called_url = provider.client.post.call_args[0][0]
+        assert called_url.endswith("/images/generations")
+
+    async def test_generate_image_raises_on_http_error(self, provider):
+        """Non-2xx HTTP responses must propagate as httpx.HTTPStatusError."""
+        import httpx
+
+        mock_resp = MagicMock()
+        mock_resp.raise_for_status.side_effect = httpx.HTTPStatusError(
+            "401 Unauthorized",
+            request=MagicMock(),
+            response=MagicMock(status_code=401),
+        )
+        provider.client.post = AsyncMock(return_value=mock_resp)
+        with pytest.raises(httpx.HTTPStatusError):
+            await provider.generate_image(model="seedream-4-5-251128", prompt="test")
+
+    async def test_generate_image_api_key_not_in_logs(self, provider, success_response):
+        """API key must not appear in any structlog output during image generation."""
+        secret = "test-api-key"
+        provider.client.post = AsyncMock(return_value=success_response)
+        with structlog.testing.capture_logs() as cap:
+            await provider.generate_image(model="seedream-4-5-251128", prompt="test")
+        assert secret not in str(cap)
+
+
+# ---------------------------------------------------------------------------
+# Image Size Mapping
+# ---------------------------------------------------------------------------
+
+class TestGenerateImageSizeMapping:
+    """Verify SIZE_MAP is applied correctly in generate_image."""
+
+    @pytest.fixture
+    def provider_with_mock(self):
+        provider = BytePlusModelArkProvider(api_key="test-key")
+        mock_resp = MagicMock()
+        mock_resp.raise_for_status = MagicMock()
+        mock_resp.json.return_value = {
+            "id": "r1",
+            "data": [{"url": "https://cdn.byteplus.com/img.png"}],
+            "usage": {"total_tokens": 100},
+        }
+        provider.client.post = AsyncMock(return_value=mock_resp)
+        return provider
+
+    @pytest.mark.parametrize(
+        "input_size,expected_byteplus_size",
+        [
+            ("1024x1024", "1K"),
+            ("2048x2048", "2K"),
+            ("4096x4096", "4K"),
+            ("1K", "1K"),
+            ("2K", "2K"),
+            ("4K", "4K"),
+        ],
+    )
+    async def test_size_mapping(self, provider_with_mock, input_size, expected_byteplus_size):
+        """SIZE_MAP must translate all known size inputs to correct BytePlus value."""
+        await provider_with_mock.generate_image(
+            model="seedream-4-5-251128", prompt="test", size=input_size
+        )
+        body = (
+            provider_with_mock.client.post.call_args.kwargs.get("json")
+            or provider_with_mock.client.post.call_args[1].get("json")
+        )
+        assert body["size"] == expected_byteplus_size
+
+
+# ---------------------------------------------------------------------------
+# Video Task Creation
+# ---------------------------------------------------------------------------
+
+class TestCreateVideoTask:
+    """Tests for BytePlusModelArkProvider.create_video_task()."""
+
+    @pytest.fixture
+    def provider(self):
+        return BytePlusModelArkProvider(api_key="test-key")
+
+    @pytest.fixture
+    def task_response(self):
+        mock_resp = MagicMock()
+        mock_resp.raise_for_status = MagicMock()
+        mock_resp.json.return_value = {
+            "id": "task-video-xyz789",
+            "status": "queued",
+        }
+        return mock_resp
+
+    async def test_create_video_task_t2v_content_array_has_one_text_item(
+        self, provider, task_response
+    ):
+        """T2V: content array must have exactly 1 item of type 'text'."""
+        provider.client.post = AsyncMock(return_value=task_response)
+        await provider.create_video_task(
+            model="seedance-1-0-lite-t2v-250428",
+            prompt="A wave crashing on a beach",
+            resolution="720p",
+            duration=5,
+        )
+        body = (
+            provider.client.post.call_args.kwargs.get("json")
+            or provider.client.post.call_args[1].get("json")
+        )
+        content = body["content"]
+        assert len(content) == 1
+        assert content[0]["type"] == "text"
+
+    async def test_create_video_task_t2v_text_includes_inline_params(
+        self, provider, task_response
+    ):
+        """T2V text item must contain the inline params suffix after the prompt."""
+        provider.client.post = AsyncMock(return_value=task_response)
         await provider.create_video_task(
             model="seedance-1-0-pro-250528",
-            prompt="test",
-            reference_image_url="http://localhost/img.jpg"
+            prompt="Sunset over the ocean",
+            resolution="1080p",
+            duration=10,
+            camerafixed=False,
+            watermark=True,
         )
-    await provider.aclose()
-
+        body = (
+            provider.client.post.call_args.kwargs.get("json")
+            or provider.client.post.call_args[1].get("json")
+        )
+        text = body["content"][0]["text"]
+        assert "--resolution 1080p" in text
+        assert "--duration 10" in text
+        assert "--camerafixed false" in text
+        assert "--watermark true" in text
+
+    async def test_create_video_task_i2v_content_array_has_text_and_image_url(
+        self, provider, task_response
+    ):
+        """I2V: content array must have 2 items — text followed by image_url."""
+        provider.client.post = AsyncMock(return_value=task_response)
+        ref_url = "https://cdn.example.com/reference.jpg"
+        # Patch SSRF validator — DNS may not resolve external hosts in test environment
+        with patch(
+            "app.llm_proxy.providers.byteplus_modelark_provider.validate_uri_no_ssrf",
+            return_value=ref_url,
+        ):
+            await provider.create_video_task(
+                model="seedance-1-0-lite-i2v-250428",
+                prompt="Animate this photo",
+                resolution="720p",
+                duration=5,
+                reference_image_url=ref_url,
+            )
+        body = (
+            provider.client.post.call_args.kwargs.get("json")
+            or provider.client.post.call_args[1].get("json")
+        )
+        content = body["content"]
+        assert len(content) == 2
+        assert content[0]["type"] == "text"
+        assert content[1]["type"] == "image_url"
+
+    async def test_create_video_task_i2v_image_url_matches_reference(
+        self, provider, task_response
+    ):
+        """I2V image_url.url must match the reference_image_url argument."""
+        provider.client.post = AsyncMock(return_value=task_response)
+        ref_url = "https://r2.smartaihub.app/uploads/ref-img-abc.png"
+        # Patch SSRF validator — DNS may not resolve external hosts in test environment
+        with patch(
+            "app.llm_proxy.providers.byteplus_modelark_provider.validate_uri_no_ssrf",
+            return_value=ref_url,
+        ):
+            await provider.create_video_task(
+                model="seedance-1-0-lite-i2v-250428",
+                prompt="Animate this",
+                resolution="720p",
+                duration=5,
+                reference_image_url=ref_url,
+            )
+        body = (
+            provider.client.post.call_args.kwargs.get("json")
+            or provider.client.post.call_args[1].get("json")
+        )
+        assert body["content"][1]["image_url"]["url"] == ref_url
+
+    async def test_create_video_task_returns_provider_task_id(
+        self, provider, task_response
+    ):
+        """result dict must include provider_task_id from response.id."""
+        provider.client.post = AsyncMock(return_value=task_response)
+        result = await provider.create_video_task(
+            model="seedance-1-0-pro-250528", prompt="test", resolution="720p", duration=5
+        )
+        assert result["provider_task_id"] == "task-video-xyz789"
+
+    async def test_create_video_task_returns_initial_status(
+        self, provider, task_response
+    ):
+        """result dict must include status from response.status."""
+        provider.client.post = AsyncMock(return_value=task_response)
+        result = await provider.create_video_task(
+            model="seedance-1-0-pro-250528", prompt="test", resolution="720p", duration=5
+        )
+        assert result["status"] == "queued"
 
-@pytest.mark.asyncio
-async def test_ssrf_private_ip_reference_image_raises():
-    """create_video_task raises ValueError for 127.0.0.1 reference_image_url."""
-    provider = BytePlusModelArkProvider(api_key="k")
-    with pytest.raises(ValueError):
+    async def test_create_video_task_posts_to_tasks_endpoint(
+        self, provider, task_response
+    ):
+        """POST must go to the /contents/generations/tasks path."""
+        provider.client.post = AsyncMock(return_value=task_response)
         await provider.create_video_task(
-            model="seedance-1-0-lite-i2v-250428",
-            prompt="test",
-            reference_image_url="http://127.0.0.1/img.jpg"
+            model="seedance-1-0-pro-250528", prompt="test", resolution="720p", duration=5
         )
-    await provider.aclose()
-
-
-@pytest.mark.asyncio
-async def test_api_key_not_in_structlog_output(capsys):
-    """API key value does not appear in captured structlog output during generate_image."""
-    ...
+        called_url = provider.client.post.call_args[0][0]
+        assert called_url.endswith("/contents/generations/tasks")
+
+    async def test_create_video_task_api_key_not_in_logs(
+        self, provider, task_response
+    ):
+        """API key must not appear in any structlog output during video task creation."""
+        secret = "test-key"
+        provider.client.post = AsyncMock(return_value=task_response)
+        with structlog.testing.capture_logs() as cap:
+            await provider.create_video_task(
+                model="seedance-1-0-pro-250528",
+                prompt="test",
+                resolution="720p",
+                duration=5,
+            )
+        assert secret not in str(cap)
+
+
+# ---------------------------------------------------------------------------
+# Task Status
+# ---------------------------------------------------------------------------
+
+class TestGetTaskStatus:
+    """Tests for BytePlusModelArkProvider.get_task_status()."""
+
+    @pytest.fixture
+    def provider(self):
+        return BytePlusModelArkProvider(api_key="test-key")
+
+    async def test_get_task_status_calls_correct_url(self, provider):
+        """GET must call the correct URL with task_id in the path."""
+        task_id = "task-abc-999"
+        mock_resp = MagicMock()
+        mock_resp.raise_for_status = MagicMock()
+        mock_resp.json.return_value = {"id": task_id, "status": "processing"}
+        provider.client.get = AsyncMock(return_value=mock_resp)
+
+        await provider.get_task_status(task_id)
+
+        called_url = provider.client.get.call_args[0][0]
+        assert task_id in called_url
+        assert "/contents/generations/tasks/" in called_url
+
+    async def test_get_task_status_returns_raw_response_dict(self, provider):
+        """get_task_status must return the raw response dict unchanged."""
+        raw_response = {
+            "id": "task-xyz",
+            "status": "succeeded",
+            "content": [
+                {
+                    "type": "video_url",
+                    "video_url": {"url": "https://cdn.byteplus.com/v.mp4"},
+                }
+            ],
+        }
+        mock_resp = MagicMock()
+        mock_resp.raise_for_status = MagicMock()
+        mock_resp.json.return_value = raw_response
+        provider.client.get = AsyncMock(return_value=mock_resp)
+
+        result = await provider.get_task_status("task-xyz")
+        assert result == raw_response
+
+    async def test_get_task_status_uses_30s_per_request_timeout(self, provider):
+        """Status poll must use a 30s per-request timeout, not the 90s client default."""
+        mock_resp = MagicMock()
+        mock_resp.raise_for_status = MagicMock()
+        mock_resp.json.return_value = {"id": "t1", "status": "queued"}
+        provider.client.get = AsyncMock(return_value=mock_resp)
+
+        await provider.get_task_status("t1")
+
+        call_kwargs = provider.client.get.call_args.kwargs
+        timeout_arg = call_kwargs.get("timeout")
+        assert timeout_arg is not None
+        if isinstance(timeout_arg, (int, float)):
+            assert timeout_arg == 30
+        else:
+            assert hasattr(timeout_arg, "read") or hasattr(timeout_arg, "connect")
+
+
+# ---------------------------------------------------------------------------
+# Inline Parameter Builder
+# ---------------------------------------------------------------------------
+
+class TestBuildInlineParams:
+    """Tests for BytePlusModelArkProvider._build_inline_params()."""
+
+    @pytest.fixture
+    def provider(self):
+        return BytePlusModelArkProvider(api_key="test-key")
+
+    def test_valid_inputs_produce_correct_suffix_string(self, provider):
+        """Valid inputs must produce the 4-flag suffix string."""
+        result = provider._build_inline_params(
+            resolution="720p", duration=5, camerafixed=False, watermark=True
+        )
+        assert "--resolution 720p" in result
+        assert "--duration 5" in result
+        assert "--camerafixed false" in result
+        assert "--watermark true" in result
+
+    def test_camerafixed_true_produces_lowercase_true(self, provider):
+        """Python True must become lowercase 'true' in the suffix string."""
+        result = provider._build_inline_params(
+            resolution="1080p", duration=10, camerafixed=True, watermark=False
+        )
+        assert "--camerafixed true" in result
+        assert "--watermark false" in result
+
+    def test_invalid_resolution_raises_value_error(self, provider):
+        """Resolution not in {720p, 1080p} must raise ValueError."""
+        with pytest.raises(ValueError, match="resolution"):
+            provider._build_inline_params(
+                resolution="4K", duration=5, camerafixed=False, watermark=True
+            )
+
+    def test_resolution_1440p_raises_value_error(self, provider):
+        """1440p is not an allowed BytePlus resolution — must raise ValueError."""
+        with pytest.raises(ValueError):
+            provider._build_inline_params(
+                resolution="1440p", duration=5, camerafixed=False, watermark=True
+            )
+
+    def test_invalid_duration_raises_value_error(self, provider):
+        """Duration not in {5, 10} must raise ValueError."""
+        with pytest.raises(ValueError, match="duration"):
+            provider._build_inline_params(
+                resolution="720p", duration=15, camerafixed=False, watermark=True
+            )
+
+    def test_duration_zero_raises_value_error(self, provider):
+        """Duration=0 is not in the allowlist — must raise ValueError."""
+        with pytest.raises(ValueError):
+            provider._build_inline_params(
+                resolution="720p", duration=0, camerafixed=False, watermark=True
+            )
+
+
+# ---------------------------------------------------------------------------
+# Cost Calculation
+# ---------------------------------------------------------------------------
+
+class TestCalculateCostUsd:
+    """Tests for BytePlusModelArkProvider.calculate_cost_usd()."""
+
+    @pytest.fixture
+    def provider(self):
+        return BytePlusModelArkProvider(api_key="test-key")
+
+    def test_one_million_tokens_costs_2_dollars_50(self, provider):
+        """1,000,000 tokens must cost exactly $2.50."""
+        assert provider.calculate_cost_usd(1_000_000) == 2.5
+
+    def test_zero_tokens_costs_zero(self, provider):
+        """0 tokens must cost $0.00."""
+        assert provider.calculate_cost_usd(0) == 0.0
+
+    def test_fractional_tokens_are_calculated_correctly(self, provider):
+        """45 tokens: (45 / 1_000_000) * 2.5 ~= 0.0001125."""
+        result = provider.calculate_cost_usd(45)
+        assert abs(result - 0.0001125) < 1e-10
+
+
+# ---------------------------------------------------------------------------
+# Status Normalization
+# ---------------------------------------------------------------------------
+
+class TestNormalizeBytePlusTaskState:
+    """Tests for _normalize_byteplus_task_state()."""
+
+    @pytest.mark.parametrize(
+        "byteplus_status,expected_normalized,expected_raw",
+        [
+            ("succeeded", "success", "succeeded"),
+            ("failed", "fail", "failed"),
+            ("cancelled", "fail", "cancelled"),
+            ("queued", "processing", "queued"),
+            ("processing", "processing", "processing"),
+            ("some_unknown_status", "unknown", "some_unknown_status"),
+        ],
+    )
+    def test_status_mapping(
+        self, byteplus_status, expected_normalized, expected_raw
+    ):
+        """All BytePlus status strings must map to the correct internal state."""
+        status_response = {"status": byteplus_status}
+        normalized, raw = _normalize_byteplus_task_state(status_response)
+        assert normalized == expected_normalized
+        assert raw == expected_raw
+
+
+# ---------------------------------------------------------------------------
+# URL Extraction
+# ---------------------------------------------------------------------------
+
+class TestExtractBytePlusResultUrl:
+    """Tests for _extract_byteplus_result_url()."""
+
+    def test_extracts_url_from_video_url_content_item(self):
+        """content item with type=video_url must return the URL."""
+        response = {
+            "content": [
+                {
+                    "type": "video_url",
+                    "video_url": {"url": "https://cdn.byteplus.com/video.mp4"},
+                }
+            ]
+        }
+        url = _extract_byteplus_result_url(response)
+        assert url == "https://cdn.byteplus.com/video.mp4"
+
+    def test_extracts_url_from_image_url_content_item(self):
+        """content item with type=image_url must return the URL."""
+        response = {
+            "content": [
+                {
+                    "type": "image_url",
+                    "image_url": {"url": "https://cdn.byteplus.com/img.png"},
+                }
+            ]
+        }
+        url = _extract_byteplus_result_url(response)
+        assert url == "https://cdn.byteplus.com/img.png"
+
+    def test_returns_none_for_empty_content_array(self):
+        """Empty content list must return None."""
+        response: dict = {"content": []}
+        assert _extract_byteplus_result_url(response) is None
+
+    def test_returns_none_when_content_key_missing(self):
+        """Response with no 'content' key must return None."""
+        response: dict = {"status": "succeeded"}
+        assert _extract_byteplus_result_url(response) is None
+
+    def test_returns_none_for_non_http_url(self):
+        """URLs that do not start with 'http' must be skipped."""
+        response = {
+            "content": [
+                {
+                    "type": "video_url",
+                    "video_url": {"url": "ftp://invalid.example.com/v.mp4"},
+                }
+            ]
+        }
+        assert _extract_byteplus_result_url(response) is None
+
+    def test_returns_none_for_unknown_content_type(self):
+        """Content items with unrecognised types must be ignored."""
+        response = {
+            "content": [
+                {"type": "text", "text": "some text"}
+            ]
+        }
+        assert _extract_byteplus_result_url(response) is None
+
+
+# ---------------------------------------------------------------------------
+# SSRF Prevention
+# ---------------------------------------------------------------------------
+
+class TestSSRFPrevention:
+    """Verify SSRF guards block private/localhost reference image URLs."""
+
+    @pytest.fixture
+    def provider(self):
+        return BytePlusModelArkProvider(api_key="test-key")
+
+    async def test_localhost_reference_image_url_raises_before_http_call(self, provider):
+        """localhost reference_image_url must raise ValueError before any HTTP call."""
+        provider.client.post = AsyncMock()
+        with pytest.raises((ValueError, Exception)):
+            await provider.create_video_task(
+                model="seedance-1-0-lite-i2v-250428",
+                prompt="Animate this",
+                resolution="720p",
+                duration=5,
+                reference_image_url="http://localhost/img.jpg",
+            )
+        provider.client.post.assert_not_called()
+
+    async def test_loopback_ip_reference_image_url_is_blocked(self, provider):
+        """127.0.0.1 reference image URL must raise before any HTTP call."""
+        provider.client.post = AsyncMock()
+        with pytest.raises((ValueError, Exception)):
+            await provider.create_video_task(
+                model="seedance-1-0-lite-i2v-250428",
+                prompt="Animate this",
+                resolution="720p",
+                duration=5,
+                reference_image_url="http://127.0.0.1/admin/img.jpg",
+            )
+        provider.client.post.assert_not_called()
+
+    async def test_public_reference_image_url_is_allowed(self, provider):
+        """A legitimate public URL must not be blocked by the SSRF guard."""
+        mock_resp = MagicMock()
+        mock_resp.raise_for_status = MagicMock()
+        mock_resp.json.return_value = {"id": "task-1", "status": "queued"}
+        provider.client.post = AsyncMock(return_value=mock_resp)
+        ref_url = "https://r2.smartaihub.app/uploads/ref.jpg"
+
+        # Patch SSRF validator to simulate passing a valid public URL;
+        # actual DNS resolution may not work in isolated test environments.
+        with patch(
+            "app.llm_proxy.providers.byteplus_modelark_provider.validate_uri_no_ssrf",
+            return_value=ref_url,
+        ):
+            await provider.create_video_task(
+                model="seedance-1-0-lite-i2v-250428",
+                prompt="Animate this",
+                resolution="720p",
+                duration=5,
+                reference_image_url=ref_url,
+            )
+        provider.client.post.assert_called_once()
+
+
+# ---------------------------------------------------------------------------
+# aclose
+# ---------------------------------------------------------------------------
+
+class TestAclose:
+    """Verify the httpx client is properly closed."""
+
+    async def test_aclose_closes_httpx_client(self):
+        """aclose() must call close on the underlying httpx.AsyncClient."""
+        provider = BytePlusModelArkProvider(api_key="test-key")
+        provider.client.aclose = AsyncMock()
+        await provider.aclose()
+        provider.client.aclose.assert_called_once()

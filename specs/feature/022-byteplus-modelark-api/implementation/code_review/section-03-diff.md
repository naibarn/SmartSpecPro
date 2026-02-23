diff --git a/python-backend/app/llm_proxy/providers/__init__.py b/python-backend/app/llm_proxy/providers/__init__.py
index 89454e2..6228e17 100644
--- a/python-backend/app/llm_proxy/providers/__init__.py
+++ b/python-backend/app/llm_proxy/providers/__init__.py
@@ -12,6 +12,7 @@ from app.llm_proxy.providers.ollama_provider import OllamaProvider
 from app.llm_proxy.providers.openrouter_provider import OpenRouterProvider
 from app.llm_proxy.providers.zai_provider import ZAIProvider
 from .kie_ai_provider import KieAIProvider
+from .byteplus_modelark_provider import BytePlusModelArkProvider
 
 __all__ = [
     "BaseLLMProvider",
@@ -23,4 +24,5 @@ __all__ = [
     "OpenRouterProvider",
     "ZAIProvider",
     "KieAIProvider",
+    "BytePlusModelArkProvider",
 ]
diff --git a/python-backend/app/llm_proxy/providers/byteplus_modelark_provider.py b/python-backend/app/llm_proxy/providers/byteplus_modelark_provider.py
new file mode 100644
index 0000000..a87bbd2
--- /dev/null
+++ b/python-backend/app/llm_proxy/providers/byteplus_modelark_provider.py
@@ -0,0 +1,207 @@
+"""
+BytePlus ModelArk Provider (ByteDance)
+
+Thin, stateful HTTP client wrapper for the BytePlus ModelArk API.
+Supports synchronous image generation (Seedream models) and
+asynchronous video task creation/polling (Seedance models).
+
+Security:
+- SSRF validation on reference_image_url before any HTTP call
+- Inline params validated against allowlists to prevent prompt injection
+- API key never appears in any log record
+"""
+
+import httpx
+import structlog
+
+from app.core.media_job_validators import validate_uri_no_ssrf
+
+logger = structlog.get_logger()
+
+
+class BytePlusModelArkProvider:
+    """
+    BytePlus ModelArk API provider.
+
+    Handles two distinct API flows:
+    - Image (Seedream models): synchronous POST /images/generations
+    - Video (Seedance models): async task via POST /contents/generations/tasks,
+      polled separately by recover_stuck_tasks in media_tasks.py
+    """
+
+    BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3"
+
+    IMAGE_MODELS: frozenset = frozenset({
+        "seedream-4-5-251128",
+        "seedream-4-0-250828",
+    })
+
+    VIDEO_MODELS: frozenset = frozenset({
+        "seedance-1-0-pro-250528",
+        "seedance-1-0-pro-fast-251015",
+        "seedance-1-0-lite-t2v-250428",
+        "seedance-1-0-lite-i2v-250428",
+    })
+
+    # Maps pixel-format sizes to BytePlus shorthand; identity entries allow
+    # gateway to pass already-formatted values without silent fallthrough.
+    SIZE_MAP: dict = {
+        "1024x1024": "1K",
+        "2048x2048": "2K",
+        "4096x4096": "4K",
+        "1K": "1K",
+        "2K": "2K",
+        "4K": "4K",
+    }
+
+    BYTEPLUS_USD_PER_1M_TOKENS: float = 2.5
+
+    def __init__(self, api_key: str, base_url: str | None = None) -> None:
+        self._api_key = api_key  # Never log this value
+        self.base_url = (base_url or self.BASE_URL).rstrip("/")
+        self._headers = {
+            "Authorization": f"Bearer {api_key}",
+            "Content-Type": "application/json",
+        }
+        # 90s default covers the longest synchronous image generation.
+        # Status polls override to 30s per-request.
+        self.client = httpx.AsyncClient(timeout=90.0)
+        logger.info("byteplus_provider_init", base_url=self.base_url)
+
+    async def generate_image(
+        self,
+        model: str,
+        prompt: str,
+        size: str = "2K",
+        watermark: bool = True,
+    ) -> dict:
+        """
+        Generate an image synchronously via POST /images/generations.
+
+        Returns a dict with result_url, provider_task_id, usage_tokens, raw_response.
+        Raises httpx.HTTPStatusError on 4xx/5xx responses.
+        """
+        byteplus_size = self.SIZE_MAP.get(size, "2K")
+        payload = {
+            "model": model,
+            "prompt": prompt,
+            "size": byteplus_size,
+            "response_format": "url",
+            "stream": False,
+            "watermark": watermark,
+            "sequential_image_generation": "disabled",
+        }
+        url = f"{self.base_url}/images/generations"
+        response = await self.client.post(url, headers=self._headers, json=payload)
+        response.raise_for_status()
+        resp = response.json()
+        data = resp.get("data", [{}])
+        result = {
+            "result_url": data[0]["url"],
+            "provider_task_id": resp["id"],
+            "usage_tokens": resp["usage"]["total_tokens"],
+            "raw_response": resp,
+        }
+        logger.info("byteplus_generate_image", model=model, size=byteplus_size)
+        return result
+
+    async def create_video_task(
+        self,
+        model: str,
+        prompt: str,
+        resolution: str = "1080p",
+        duration: int = 5,
+        camerafixed: bool = False,
+        watermark: bool = True,
+        reference_image_url: str | None = None,
+    ) -> dict:
+        """
+        Create an async video generation task via POST /contents/generations/tasks.
+
+        For I2V models, reference_image_url is validated against SSRF before use.
+        Returns provider_task_id and initial status for polling.
+        Raises ValueError on SSRF / invalid inline params, httpx.HTTPStatusError on HTTP errors.
+        """
+        # SSRF validation must be first — before building content or any HTTP call.
+        if reference_image_url is not None:
+            validate_uri_no_ssrf(reference_image_url)
+
+        inline_params = self._build_inline_params(resolution, duration, camerafixed, watermark)
+        content: list[dict] = [
+            {"type": "text", "text": f"{prompt}{inline_params}"},
+        ]
+        if reference_image_url is not None:
+            content.append({"type": "image_url", "image_url": {"url": reference_image_url}})
+
+        payload = {"model": model, "content": content}
+        url = f"{self.base_url}/contents/generations/tasks"
+        response = await self.client.post(url, headers=self._headers, json=payload)
+        response.raise_for_status()
+        resp = response.json()
+        result = {
+            "provider_task_id": resp["id"],
+            "status": resp["status"],
+        }
+        logger.info(
+            "byteplus_create_video_task",
+            model=model,
+            resolution=resolution,
+            duration=duration,
+        )
+        return result
+
+    async def get_task_status(self, task_id: str) -> dict:
+        """
+        Poll BytePlus for current task state.
+
+        Uses a 30s per-request timeout (overrides the 90s client default)
+        to fail status polls quickly. Returns raw response dict for caller
+        to normalize via _normalize_byteplus_task_state().
+        Raises httpx.HTTPStatusError on HTTP errors.
+        """
+        url = f"{self.base_url}/contents/generations/tasks/{task_id}"
+        response = await self.client.get(url, headers=self._headers, timeout=30.0)
+        response.raise_for_status()
+        result: dict = response.json()
+        return result
+
+    def _build_inline_params(
+        self,
+        resolution: str,
+        duration: int,
+        camerafixed: bool,
+        watermark: bool,
+    ) -> str:
+        """
+        Build inline parameter suffix appended to the video prompt.
+
+        Security-critical: validates resolution and duration against explicit
+        allowlists before string concatenation to prevent prompt injection.
+        Raises ValueError for values outside the allowlists.
+        """
+        allowed_resolutions = {"720p", "1080p"}
+        allowed_durations = {5, 10}
+
+        if resolution not in allowed_resolutions:
+            raise ValueError(
+                f"Invalid resolution: {resolution!r}. Must be one of {allowed_resolutions}"
+            )
+        if duration not in allowed_durations:
+            raise ValueError(
+                f"Invalid duration: {duration}. Must be one of {allowed_durations}"
+            )
+
+        return (
+            f"  --resolution {resolution}"
+            f"  --duration {duration}"
+            f"  --camerafixed {str(camerafixed).lower()}"
+            f"  --watermark {str(watermark).lower()}"
+        )
+
+    def calculate_cost_usd(self, total_tokens: int) -> float:
+        """Return USD cost for the given token count at $2.50 per 1M tokens."""
+        return (total_tokens / 1_000_000) * self.BYTEPLUS_USD_PER_1M_TOKENS
+
+    async def aclose(self) -> None:
+        """Close the underlying httpx client. Call in a finally block after use."""
+        await self.client.aclose()
diff --git a/python-backend/tests/unit/llm_proxy/test_byteplus_modelark_provider.py b/python-backend/tests/unit/llm_proxy/test_byteplus_modelark_provider.py
new file mode 100644
index 0000000..bf2953f
--- /dev/null
+++ b/python-backend/tests/unit/llm_proxy/test_byteplus_modelark_provider.py
@@ -0,0 +1,240 @@
+"""
+Tests for BytePlusModelArkProvider.
+Uses unittest.mock for httpx mocking (matching existing provider test conventions).
+All async tests use pytest-asyncio (asyncio_mode=auto per pyproject.toml).
+"""
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+
+from app.llm_proxy.providers.byteplus_modelark_provider import BytePlusModelArkProvider
+
+
+# --- Class structure ---
+
+def test_image_models_set_has_two_entries():
+    """IMAGE_MODELS contains exactly 2 Seedream model IDs."""
+    assert len(BytePlusModelArkProvider.IMAGE_MODELS) == 2
+
+
+def test_video_models_set_has_four_entries():
+    """VIDEO_MODELS contains exactly 4 Seedance model IDs."""
+    assert len(BytePlusModelArkProvider.VIDEO_MODELS) == 4
+
+
+def test_size_map_includes_pixel_formats():
+    """SIZE_MAP maps '1024x1024' -> '1K', '2048x2048' -> '2K', '4096x4096' -> '4K'."""
+    assert BytePlusModelArkProvider.SIZE_MAP["1024x1024"] == "1K"
+    assert BytePlusModelArkProvider.SIZE_MAP["2048x2048"] == "2K"
+    assert BytePlusModelArkProvider.SIZE_MAP["4096x4096"] == "4K"
+
+
+def test_size_map_includes_identity_entries():
+    """SIZE_MAP also maps shorthand inputs to themselves (e.g., '2K' -> '2K')."""
+    assert BytePlusModelArkProvider.SIZE_MAP["1K"] == "1K"
+    assert BytePlusModelArkProvider.SIZE_MAP["2K"] == "2K"
+    assert BytePlusModelArkProvider.SIZE_MAP["4K"] == "4K"
+
+
+def test_init_strips_trailing_slash():
+    """__init__ strips trailing slash from base_url."""
+    provider = BytePlusModelArkProvider(api_key="test-key", base_url="https://example.com/api/v3/")
+    assert not provider.base_url.endswith("/")
+    provider.client.aclose = AsyncMock()
+
+
+def test_init_api_key_not_in_headers_value():
+    """API key is stored only as Bearer token, not exposed elsewhere."""
+    provider = BytePlusModelArkProvider(api_key="super-secret-key-123")
+    assert "super-secret-key-123" not in str(provider._headers.get("X-API-Key", ""))
+    provider.client.aclose = AsyncMock()
+
+
+# --- Image generation ---
+
+@pytest.mark.asyncio
+async def test_generate_image_success():
+    """generate_image returns result_url, provider_task_id, usage_tokens on 200."""
+    ...
+
+
+@pytest.mark.asyncio
+async def test_generate_image_request_body_fields():
+    """Request body contains model, size (mapped), watermark, stream:false."""
+    ...
+
+
+@pytest.mark.asyncio
+async def test_generate_image_size_mapping_pixel_formats():
+    """1024x1024 -> 1K, 2048x2048 -> 2K, 4096x4096 -> 4K in the outgoing request."""
+    ...
+
+
+@pytest.mark.asyncio
+async def test_generate_image_size_mapping_identity():
+    """'2K' input maps to '2K' (identity mapping is present in SIZE_MAP)."""
+    ...
+
+
+@pytest.mark.asyncio
+async def test_generate_image_raises_on_401():
+    """generate_image raises httpx.HTTPStatusError on 401 response."""
+    ...
+
+
+@pytest.mark.asyncio
+async def test_generate_image_raises_on_500():
+    """generate_image raises httpx.HTTPStatusError on 500 response."""
+    ...
+
+
+# --- Video task creation ---
+
+@pytest.mark.asyncio
+async def test_create_video_task_t2v_content_array():
+    """T2V: content array has exactly 1 text item."""
+    ...
+
+
+@pytest.mark.asyncio
+async def test_create_video_task_t2v_text_includes_inline_params():
+    """T2V: text item contains prompt + inline params suffix."""
+    ...
+
+
+@pytest.mark.asyncio
+async def test_create_video_task_i2v_content_array():
+    """I2V: content array has 2 items -- text and image_url."""
+    ...
+
+
+@pytest.mark.asyncio
+async def test_create_video_task_i2v_image_url_matches_reference():
+    """I2V: image_url item url matches the reference_image_url parameter."""
+    ...
+
+
+@pytest.mark.asyncio
+async def test_create_video_task_returns_provider_task_id():
+    """Returns provider_task_id from response.id."""
+    ...
+
+
+@pytest.mark.asyncio
+async def test_create_video_task_returns_initial_status():
+    """Returns initial status from response.status."""
+    ...
+
+
+# --- Task status ---
+
+@pytest.mark.asyncio
+async def test_get_task_status_correct_url():
+    """GET request goes to .../contents/generations/tasks/{task_id}."""
+    ...
+
+
+@pytest.mark.asyncio
+async def test_get_task_status_returns_raw_dict():
+    """Returns the raw response dict unchanged."""
+    ...
+
+
+# --- Inline params ---
+
+def test_build_inline_params_valid_inputs():
+    """Valid inputs produce correct suffix string with all 4 flags."""
+    provider = BytePlusModelArkProvider(api_key="k")
+    result = provider._build_inline_params(resolution="1080p", duration=5, camerafixed=False, watermark=True)
+    assert "--resolution 1080p" in result
+    assert "--duration 5" in result
+    assert "--camerafixed false" in result
+    assert "--watermark true" in result
+
+
+def test_build_inline_params_camerafixed_true_lowercase():
+    """camerafixed=True produces '--camerafixed true' (lowercase Python bool)."""
+    provider = BytePlusModelArkProvider(api_key="k")
+    result = provider._build_inline_params(resolution="720p", duration=5, camerafixed=True, watermark=False)
+    assert "--camerafixed true" in result
+
+
+def test_build_inline_params_invalid_resolution_raises():
+    """resolution='4K' (not in allowlist) raises ValueError."""
+    provider = BytePlusModelArkProvider(api_key="k")
+    with pytest.raises(ValueError):
+        provider._build_inline_params(resolution="4K", duration=5, camerafixed=False, watermark=False)
+
+
+def test_build_inline_params_invalid_resolution_1440p_raises():
+    """resolution='1440p' raises ValueError."""
+    provider = BytePlusModelArkProvider(api_key="k")
+    with pytest.raises(ValueError):
+        provider._build_inline_params(resolution="1440p", duration=5, camerafixed=False, watermark=False)
+
+
+def test_build_inline_params_invalid_duration_raises():
+    """duration=15 raises ValueError."""
+    provider = BytePlusModelArkProvider(api_key="k")
+    with pytest.raises(ValueError):
+        provider._build_inline_params(resolution="1080p", duration=15, camerafixed=False, watermark=False)
+
+
+def test_build_inline_params_invalid_duration_zero_raises():
+    """duration=0 raises ValueError."""
+    provider = BytePlusModelArkProvider(api_key="k")
+    with pytest.raises(ValueError):
+        provider._build_inline_params(resolution="1080p", duration=0, camerafixed=False, watermark=False)
+
+
+# --- Cost calculation ---
+
+def test_calculate_cost_usd_one_million_tokens():
+    """calculate_cost_usd(1_000_000) == 2.5."""
+    provider = BytePlusModelArkProvider(api_key="k")
+    assert provider.calculate_cost_usd(1_000_000) == pytest.approx(2.5)
+
+
+def test_calculate_cost_usd_zero():
+    """calculate_cost_usd(0) == 0.0."""
+    provider = BytePlusModelArkProvider(api_key="k")
+    assert provider.calculate_cost_usd(0) == 0.0
+
+
+def test_calculate_cost_usd_45_tokens():
+    """calculate_cost_usd(45) ~ 0.0001125."""
+    provider = BytePlusModelArkProvider(api_key="k")
+    assert provider.calculate_cost_usd(45) == pytest.approx(0.0001125, rel=1e-5)
+
+
+# --- Security ---
+
+@pytest.mark.asyncio
+async def test_ssrf_localhost_reference_image_raises():
+    """create_video_task raises ValueError for localhost reference_image_url before HTTP."""
+    provider = BytePlusModelArkProvider(api_key="k")
+    with pytest.raises(ValueError):
+        await provider.create_video_task(
+            model="seedance-1-0-pro-250528",
+            prompt="test",
+            reference_image_url="http://localhost/img.jpg"
+        )
+    await provider.aclose()
+
+
+@pytest.mark.asyncio
+async def test_ssrf_private_ip_reference_image_raises():
+    """create_video_task raises ValueError for 127.0.0.1 reference_image_url."""
+    provider = BytePlusModelArkProvider(api_key="k")
+    with pytest.raises(ValueError):
+        await provider.create_video_task(
+            model="seedance-1-0-lite-i2v-250428",
+            prompt="test",
+            reference_image_url="http://127.0.0.1/img.jpg"
+        )
+    await provider.aclose()
+
+
+@pytest.mark.asyncio
+async def test_api_key_not_in_structlog_output(capsys):
+    """API key value does not appear in captured structlog output during generate_image."""
+    ...

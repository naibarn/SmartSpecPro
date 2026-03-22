diff --git a/python-backend/app/llm_proxy/providers/__init__.py b/python-backend/app/llm_proxy/providers/__init__.py
index 6235fe39..0ea84ff2 100644
--- a/python-backend/app/llm_proxy/providers/__init__.py
+++ b/python-backend/app/llm_proxy/providers/__init__.py
@@ -14,6 +14,7 @@ from app.llm_proxy.providers.zai_provider import ZAIProvider
 from .kie_ai_provider import KieAIProvider
 from .byteplus_modelark_provider import BytePlusModelArkProvider
 from .uvoice_provider import UVoiceProvider
+from .fal_ai_provider import FalAIProvider
 
 __all__ = [
     "BaseLLMProvider",
@@ -27,4 +28,5 @@ __all__ = [
     "KieAIProvider",
     "BytePlusModelArkProvider",
     "UVoiceProvider",
+    "FalAIProvider",
 ]
diff --git a/python-backend/app/llm_proxy/providers/fal_ai_provider.py b/python-backend/app/llm_proxy/providers/fal_ai_provider.py
new file mode 100644
index 00000000..d083f687
--- /dev/null
+++ b/python-backend/app/llm_proxy/providers/fal_ai_provider.py
@@ -0,0 +1,245 @@
+"""fal.ai media provider — video (queue), audio (sync TTS), image (sync Flux)."""
+
+import re
+from typing import Any
+from urllib.parse import urlparse
+
+import httpx
+import structlog
+
+from app.core.media_job_validators import validate_uri_no_ssrf
+
+logger = structlog.get_logger()
+
+# URL-bearing fields that must pass SSRF validation
+_URL_FIELDS = frozenset({"image_url", "end_image_url", "audio_url", "video_url"})
+
+
+class FalAIProvider:
+    BASE_URL = "https://fal.run"
+    QUEUE_BASE_URL = "https://queue.fal.run"
+    MAX_VIDEO_FILE_SIZE = 500 * 1024 * 1024  # 500 MB
+
+    VIDEO_MODELS: frozenset[str] = frozenset({
+        "fal-ai/ltx-2.3/text-to-video",
+        "fal-ai/ltx-2.3/text-to-video/fast",
+        "fal-ai/ltx-2.3/image-to-video",
+        "fal-ai/ltx-2.3/image-to-video/fast",
+        "fal-ai/ltx-2.3/audio-to-video",
+        "fal-ai/ltx-2.3/extend-video",
+        "fal-ai/ltx-2.3/retake-video",
+    })
+    AUDIO_MODELS: frozenset[str] = frozenset({"fal-ai/lux-tts"})
+    IMAGE_MODELS: frozenset[str] = frozenset({
+        "fal-ai/flux/schnell",
+        "fal-ai/flux/dev",
+        "fal-ai/flux-pro",
+        "fal-ai/stable-diffusion-v3-medium",
+    })
+
+    def __init__(self, api_key: str, base_url: str | None = None) -> None:
+        self.base_url = (base_url or self.BASE_URL).rstrip("/")
+        self._headers = {
+            "Authorization": f"Key {api_key}",
+            "Content-Type": "application/json",
+        }
+        self.client = httpx.AsyncClient(timeout=300.0)
+        logger.info("fal_ai_provider_init", base_url=self.base_url)
+
+    # ------------------------------------------------------------------
+    # Validation helpers
+    # ------------------------------------------------------------------
+
+    def _validate_urls(self, params: dict[str, Any]) -> None:
+        """SSRF: validate URL fields + reject host.docker.internal + HEAD size check for video_url."""
+        for key in _URL_FIELDS:
+            url = params.get(key)
+            if url is None:
+                continue
+
+            # Reject host.docker.internal (fal.ai provider-specific)
+            parsed = urlparse(url)
+            hostname = (parsed.hostname or "").lower()
+            if hostname == "host.docker.internal":
+                raise ValueError(
+                    f"URL field '{key}' targets host.docker.internal which is not allowed for fal.ai"
+                )
+
+            # Run the shared SSRF validator
+            validate_uri_no_ssrf(url)
+
+        # Video file size check (synchronous HEAD is not practical here, so
+        # callers needing async HEAD must do it separately — see _check_video_size)
+        video_url = params.get("video_url")
+        if video_url is not None:
+            self._check_video_size_sync(video_url)
+
+    def _check_video_size_sync(self, url: str) -> None:
+        """Synchronous HEAD check for video file size (best-effort)."""
+        try:
+            with httpx.Client(timeout=10.0) as sync_client:
+                resp = sync_client.head(url)
+                resp.raise_for_status()
+                cl = resp.headers.get("Content-Length")
+                if cl and int(cl) > self.MAX_VIDEO_FILE_SIZE:
+                    raise ValueError(
+                        f"Video file exceeds 500MB limit ({int(cl)} bytes)"
+                    )
+        except (httpx.RequestError, httpx.HTTPStatusError):
+            # Best effort — if HEAD fails, allow through
+            pass
+
+    @staticmethod
+    def _sanitize_prompt(prompt: str) -> str:
+        """Strip HTML/XML tags from prompt."""
+        return re.sub(r"<[^>]+>", "", prompt)
+
+    # ------------------------------------------------------------------
+    # HTTP error handling
+    # ------------------------------------------------------------------
+
+    @staticmethod
+    def _handle_http_error(exc: httpx.HTTPStatusError) -> None:
+        """Convert HTTP errors to sanitized ValueErrors. Never leak response body."""
+        status = exc.response.status_code
+        if status == 401:
+            raise ValueError("Invalid fal.ai API key") from None
+        if status == 422:
+            raise ValueError("Content policy rejection") from None
+        if status == 429:
+            raise ValueError("fal.ai rate limit exceeded") from None
+        raise ValueError(f"fal.ai error (HTTP {status})") from None
+
+    # ------------------------------------------------------------------
+    # Public API — media generation
+    # ------------------------------------------------------------------
+
+    async def generate_video(self, model_id: str, params: dict[str, Any]) -> dict:
+        """Queue-based video generation. Returns {id, status: PROCESSING}."""
+        self._validate_urls(params)
+
+        if "prompt" in params:
+            params = {**params, "prompt": self._sanitize_prompt(params["prompt"])}
+
+        logger.info("fal_ai_generate_video", model_id=model_id)
+        request_id = await self._submit_queue(model_id, params)
+        return {"id": request_id, "status": "PROCESSING"}
+
+    async def generate_audio(self, model_id: str, params: dict[str, Any]) -> dict:
+        """Synchronous TTS generation. Returns {data: [{url}], status: COMPLETED}."""
+        self._validate_urls(params)
+
+        if "prompt" in params:
+            params = {**params, "prompt": self._sanitize_prompt(params["prompt"])}
+
+        url = f"{self.base_url}/{model_id}"
+        logger.info("fal_ai_generate_audio", model_id=model_id, url=url)
+
+        try:
+            response = await self.client.post(url, headers=self._headers, json=params)
+            response.raise_for_status()
+        except httpx.HTTPStatusError as exc:
+            self._handle_http_error(exc)
+
+        data = response.json()
+        audio_url = data.get("audio", {}).get("url", "")
+        return {
+            "data": [{"url": audio_url}],
+            "status": "COMPLETED",
+        }
+
+    async def generate_image(self, model_id: str, params: dict[str, Any]) -> dict:
+        """Synchronous image generation. Returns {data: [{url}], status: COMPLETED}."""
+        self._validate_urls(params)
+
+        if "prompt" in params:
+            params = {**params, "prompt": self._sanitize_prompt(params["prompt"])}
+
+        url = f"{self.base_url}/{model_id}"
+        logger.info("fal_ai_generate_image", model_id=model_id, url=url)
+
+        try:
+            response = await self.client.post(url, headers=self._headers, json=params)
+            response.raise_for_status()
+        except httpx.HTTPStatusError as exc:
+            self._handle_http_error(exc)
+
+        data = response.json()
+        images = data.get("images", [])
+        return {
+            "data": [{"url": img.get("url", "")} for img in images],
+            "status": "COMPLETED",
+        }
+
+    # ------------------------------------------------------------------
+    # Queue operations
+    # ------------------------------------------------------------------
+
+    async def _submit_queue(self, model_id: str, payload: dict[str, Any]) -> str:
+        """POST queue.fal.run/{model_id} → return request_id."""
+        url = f"{self.QUEUE_BASE_URL}/{model_id}"
+        logger.info("fal_ai_submit_queue", model_id=model_id, url=url)
+
+        try:
+            response = await self.client.post(url, headers=self._headers, json=payload)
+            response.raise_for_status()
+        except httpx.HTTPStatusError as exc:
+            self._handle_http_error(exc)
+
+        data = response.json()
+        return data["request_id"]
+
+    async def get_queue_status(self, model_id: str, request_id: str) -> dict:
+        """GET queue status → {status: IN_QUEUE|IN_PROGRESS|COMPLETED}."""
+        url = f"{self.QUEUE_BASE_URL}/{model_id}/requests/{request_id}/status"
+        logger.info("fal_ai_queue_status", model_id=model_id, request_id=request_id)
+
+        try:
+            response = await self.client.get(url, headers=self._headers)
+            response.raise_for_status()
+        except httpx.HTTPStatusError as exc:
+            self._handle_http_error(exc)
+
+        return response.json()
+
+    async def get_queue_result(self, model_id: str, request_id: str) -> dict:
+        """GET queue result → normalized {data: [{url}], actual_duration, actual_resolution}."""
+        url = f"{self.QUEUE_BASE_URL}/{model_id}/requests/{request_id}"
+        logger.info("fal_ai_queue_result", model_id=model_id, request_id=request_id)
+
+        try:
+            response = await self.client.get(url, headers=self._headers)
+            response.raise_for_status()
+        except httpx.HTTPStatusError as exc:
+            self._handle_http_error(exc)
+
+        data = response.json()
+        video = data.get("video", {})
+        video_url = video.get("url", "")
+        width = video.get("width", 0)
+        height = video.get("height", 0)
+        duration = video.get("duration")
+
+        return {
+            "data": [{"url": video_url}],
+            "actual_duration": duration,
+            "actual_resolution": self._derive_resolution(width, height),
+        }
+
+    @staticmethod
+    def _derive_resolution(width: int, height: int) -> str:
+        """Derive resolution label from pixel dimensions."""
+        if width >= 3840:
+            return "2160p"
+        if width >= 2560:
+            return "1440p"
+        return "1080p"
+
+    # ------------------------------------------------------------------
+    # Cleanup
+    # ------------------------------------------------------------------
+
+    async def aclose(self) -> None:
+        """Close the httpx client. MUST be called in a finally block."""
+        await self.client.aclose()
+        logger.info("fal_ai_provider_closed")
diff --git a/python-backend/tests/unit/services/test_fal_ai_provider.py b/python-backend/tests/unit/services/test_fal_ai_provider.py
new file mode 100644
index 00000000..420a5418
--- /dev/null
+++ b/python-backend/tests/unit/services/test_fal_ai_provider.py
@@ -0,0 +1,319 @@
+"""Unit tests for FalAIProvider."""
+
+import pytest
+import httpx
+from unittest.mock import AsyncMock, patch, MagicMock
+
+from app.llm_proxy.providers.fal_ai_provider import FalAIProvider
+
+
+# --- Constants ---
+
+
+class TestConstants:
+    def test_video_models_count(self):
+        assert len(FalAIProvider.VIDEO_MODELS) == 7
+
+    def test_video_models_are_frozenset(self):
+        assert isinstance(FalAIProvider.VIDEO_MODELS, frozenset)
+
+    def test_video_models_contain_ltx(self):
+        assert "fal-ai/ltx-2.3/text-to-video" in FalAIProvider.VIDEO_MODELS
+        assert "fal-ai/ltx-2.3/text-to-video/fast" in FalAIProvider.VIDEO_MODELS
+        assert "fal-ai/ltx-2.3/image-to-video" in FalAIProvider.VIDEO_MODELS
+        assert "fal-ai/ltx-2.3/image-to-video/fast" in FalAIProvider.VIDEO_MODELS
+        assert "fal-ai/ltx-2.3/audio-to-video" in FalAIProvider.VIDEO_MODELS
+        assert "fal-ai/ltx-2.3/extend-video" in FalAIProvider.VIDEO_MODELS
+        assert "fal-ai/ltx-2.3/retake-video" in FalAIProvider.VIDEO_MODELS
+
+    def test_audio_models(self):
+        assert FalAIProvider.AUDIO_MODELS == frozenset({"fal-ai/lux-tts"})
+
+    def test_image_models_count(self):
+        assert len(FalAIProvider.IMAGE_MODELS) == 4
+
+    def test_image_models_are_frozenset(self):
+        assert isinstance(FalAIProvider.IMAGE_MODELS, frozenset)
+
+    def test_base_url(self):
+        assert FalAIProvider.BASE_URL == "https://fal.run"
+
+    def test_queue_base_url(self):
+        assert FalAIProvider.QUEUE_BASE_URL == "https://queue.fal.run"
+
+
+# --- Init ---
+
+
+class TestInit:
+    def test_auth_header_format(self):
+        provider = FalAIProvider(api_key="test-key-123")
+        assert provider._headers["Authorization"] == "Key test-key-123"
+
+    def test_httpx_timeout(self):
+        provider = FalAIProvider(api_key="test-key")
+        assert provider.client.timeout.read == 300.0
+
+    def test_custom_base_url(self):
+        provider = FalAIProvider(api_key="test-key", base_url="https://custom.fal.run")
+        assert provider.base_url == "https://custom.fal.run"
+
+    def test_default_base_url(self):
+        provider = FalAIProvider(api_key="test-key")
+        assert provider.base_url == "https://fal.run"
+
+
+# --- generate_video (queue) ---
+
+
+class TestGenerateVideo:
+    @pytest.fixture
+    def provider(self):
+        return FalAIProvider(api_key="test-key")
+
+    async def test_posts_to_queue_endpoint(self, provider):
+        mock_response = MagicMock()
+        mock_response.status_code = 200
+        mock_response.json.return_value = {"request_id": "req-123", "status": "IN_QUEUE"}
+        mock_response.raise_for_status = MagicMock()
+
+        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response) as mock_post:
+            result = await provider.generate_video("fal-ai/ltx-2.3/text-to-video", {"prompt": "test"})
+
+            mock_post.assert_called_once()
+            call_url = mock_post.call_args[0][0]
+            assert call_url.startswith("https://queue.fal.run/")
+            assert "fal-ai/ltx-2.3/text-to-video" in call_url
+
+        assert result["id"] == "req-123"
+        assert result["status"] == "PROCESSING"
+
+    async def test_validates_urls_before_request(self, provider):
+        with patch.object(provider, "_validate_urls") as mock_validate:
+            mock_response = MagicMock()
+            mock_response.status_code = 200
+            mock_response.json.return_value = {"request_id": "req-123", "status": "IN_QUEUE"}
+            mock_response.raise_for_status = MagicMock()
+
+            with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
+                await provider.generate_video(
+                    "fal-ai/ltx-2.3/text-to-video",
+                    {"prompt": "test", "image_url": "https://example.com/img.png"},
+                )
+                mock_validate.assert_called_once()
+
+    async def test_sanitizes_prompt(self, provider):
+        mock_response = MagicMock()
+        mock_response.status_code = 200
+        mock_response.json.return_value = {"request_id": "req-123", "status": "IN_QUEUE"}
+        mock_response.raise_for_status = MagicMock()
+
+        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response) as mock_post:
+            await provider.generate_video(
+                "fal-ai/ltx-2.3/text-to-video",
+                {"prompt": "Hello <script>alert(1)</script> world"},
+            )
+            posted_payload = mock_post.call_args[1]["json"]
+            assert "<script>" not in posted_payload["prompt"]
+            assert "Hello" in posted_payload["prompt"]
+            assert "world" in posted_payload["prompt"]
+
+
+# --- generate_audio (sync TTS) ---
+
+
+class TestGenerateAudio:
+    @pytest.fixture
+    def provider(self):
+        return FalAIProvider(api_key="test-key")
+
+    async def test_posts_to_sync_endpoint(self, provider):
+        mock_response = MagicMock()
+        mock_response.status_code = 200
+        mock_response.json.return_value = {"audio": {"url": "https://v3b.fal.media/audio.mp3"}}
+        mock_response.raise_for_status = MagicMock()
+
+        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response) as mock_post:
+            result = await provider.generate_audio("fal-ai/lux-tts", {"text": "Hello world"})
+
+            mock_post.assert_called_once()
+            call_url = mock_post.call_args[0][0]
+            assert call_url.startswith("https://fal.run/")
+
+        assert result["status"] == "COMPLETED"
+        assert result["data"][0]["url"] == "https://v3b.fal.media/audio.mp3"
+
+    async def test_validates_audio_url(self, provider):
+        with patch.object(provider, "_validate_urls") as mock_validate:
+            mock_response = MagicMock()
+            mock_response.status_code = 200
+            mock_response.json.return_value = {"audio": {"url": "https://v3b.fal.media/audio.mp3"}}
+            mock_response.raise_for_status = MagicMock()
+
+            with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
+                await provider.generate_audio(
+                    "fal-ai/lux-tts",
+                    {"text": "Hello", "audio_url": "https://example.com/ref.mp3"},
+                )
+                mock_validate.assert_called_once()
+
+
+# --- generate_image (sync Flux) ---
+
+
+class TestGenerateImage:
+    @pytest.fixture
+    def provider(self):
+        return FalAIProvider(api_key="test-key")
+
+    async def test_posts_to_sync_endpoint(self, provider):
+        mock_response = MagicMock()
+        mock_response.status_code = 200
+        mock_response.json.return_value = {
+            "images": [{"url": "https://v3b.fal.media/img.png", "width": 1024, "height": 1024}]
+        }
+        mock_response.raise_for_status = MagicMock()
+
+        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response) as mock_post:
+            result = await provider.generate_image("fal-ai/flux/schnell", {"prompt": "a cat"})
+
+            mock_post.assert_called_once()
+            call_url = mock_post.call_args[0][0]
+            assert call_url.startswith("https://fal.run/")
+
+        assert result["status"] == "COMPLETED"
+        assert result["data"][0]["url"] == "https://v3b.fal.media/img.png"
+
+
+# --- Queue Operations ---
+
+
+class TestQueueOperations:
+    @pytest.fixture
+    def provider(self):
+        return FalAIProvider(api_key="test-key")
+
+    async def test_submit_queue_returns_request_id(self, provider):
+        mock_response = MagicMock()
+        mock_response.status_code = 200
+        mock_response.json.return_value = {"request_id": "abc-123-def", "status": "IN_QUEUE"}
+        mock_response.raise_for_status = MagicMock()
+
+        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
+            request_id = await provider._submit_queue("fal-ai/ltx-2.3/text-to-video", {"prompt": "test"})
+            assert request_id == "abc-123-def"
+
+    async def test_get_queue_status(self, provider):
+        mock_response = MagicMock()
+        mock_response.status_code = 200
+        mock_response.json.return_value = {"status": "IN_PROGRESS"}
+        mock_response.raise_for_status = MagicMock()
+
+        with patch.object(provider.client, "get", new_callable=AsyncMock, return_value=mock_response):
+            result = await provider.get_queue_status("fal-ai/ltx-2.3/text-to-video", "req-123")
+            assert result["status"] == "IN_PROGRESS"
+
+    async def test_get_queue_result_normalizes(self, provider):
+        mock_response = MagicMock()
+        mock_response.status_code = 200
+        mock_response.json.return_value = {
+            "video": {
+                "url": "https://v3b.fal.media/video.mp4",
+                "width": 1920,
+                "height": 1080,
+                "duration": 6.0,
+            }
+        }
+        mock_response.raise_for_status = MagicMock()
+
+        with patch.object(provider.client, "get", new_callable=AsyncMock, return_value=mock_response):
+            result = await provider.get_queue_result("fal-ai/ltx-2.3/text-to-video", "req-123")
+            assert result["data"][0]["url"] == "https://v3b.fal.media/video.mp4"
+            assert result["actual_duration"] == 6.0
+            assert result["actual_resolution"] == "1080p"
+
+
+# --- Resolution derivation ---
+
+
+class TestResolutionDerivation:
+    def test_4k_resolution(self):
+        provider = FalAIProvider(api_key="test-key")
+        assert provider._derive_resolution(3840, 2160) == "2160p"
+
+    def test_1440p_resolution(self):
+        provider = FalAIProvider(api_key="test-key")
+        assert provider._derive_resolution(2560, 1440) == "1440p"
+
+    def test_1080p_resolution(self):
+        provider = FalAIProvider(api_key="test-key")
+        assert provider._derive_resolution(1920, 1080) == "1080p"
+
+    def test_below_1440p_defaults_to_1080p(self):
+        provider = FalAIProvider(api_key="test-key")
+        assert provider._derive_resolution(1280, 720) == "1080p"
+
+
+# --- Error Handling ---
+
+
+class TestErrorHandling:
+    @pytest.fixture
+    def provider(self):
+        return FalAIProvider(api_key="test-key")
+
+    async def test_401_invalid_api_key(self, provider):
+        mock_response = MagicMock()
+        mock_response.status_code = 401
+        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
+            "Unauthorized", request=MagicMock(), response=mock_response
+        )
+
+        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
+            with pytest.raises(ValueError, match="Invalid fal.ai API key"):
+                await provider.generate_image("fal-ai/flux/schnell", {"prompt": "test"})
+
+    async def test_422_content_policy(self, provider):
+        mock_response = MagicMock()
+        mock_response.status_code = 422
+        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
+            "Unprocessable", request=MagicMock(), response=mock_response
+        )
+
+        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
+            with pytest.raises(ValueError, match="Content policy rejection"):
+                await provider.generate_image("fal-ai/flux/schnell", {"prompt": "test"})
+
+    async def test_429_rate_limit(self, provider):
+        mock_response = MagicMock()
+        mock_response.status_code = 429
+        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
+            "Too Many Requests", request=MagicMock(), response=mock_response
+        )
+
+        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
+            with pytest.raises(ValueError, match="fal.ai rate limit exceeded"):
+                await provider.generate_image("fal-ai/flux/schnell", {"prompt": "test"})
+
+    async def test_500_no_body_in_message(self, provider):
+        mock_response = MagicMock()
+        mock_response.status_code = 500
+        mock_response.text = "Internal server error details that should not leak"
+        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
+            "Internal Server Error", request=MagicMock(), response=mock_response
+        )
+
+        with patch.object(provider.client, "post", new_callable=AsyncMock, return_value=mock_response):
+            with pytest.raises(ValueError, match=r"fal\.ai error \(HTTP 500\)"):
+                await provider.generate_image("fal-ai/flux/schnell", {"prompt": "test"})
+
+
+# --- Resource Cleanup ---
+
+
+class TestResourceCleanup:
+    async def test_aclose_closes_client(self):
+        provider = FalAIProvider(api_key="test-key")
+        with patch.object(provider.client, "aclose", new_callable=AsyncMock) as mock_close:
+            await provider.aclose()
+            mock_close.assert_called_once()
diff --git a/python-backend/tests/unit/services/test_fal_ai_ssrf.py b/python-backend/tests/unit/services/test_fal_ai_ssrf.py
new file mode 100644
index 00000000..9ad9f682
--- /dev/null
+++ b/python-backend/tests/unit/services/test_fal_ai_ssrf.py
@@ -0,0 +1,117 @@
+"""SSRF validation tests for FalAIProvider."""
+
+import pytest
+import httpx
+from unittest.mock import AsyncMock, patch, MagicMock
+
+from app.llm_proxy.providers.fal_ai_provider import FalAIProvider
+
+
+class TestSSRFValidation:
+    @pytest.fixture
+    def provider(self):
+        return FalAIProvider(api_key="test-key")
+
+    def test_rejects_aws_metadata(self, provider):
+        with pytest.raises(ValueError):
+            provider._validate_urls({"image_url": "http://169.254.169.254/latest/meta-data/"})
+
+    def test_rejects_localhost(self, provider):
+        with pytest.raises(ValueError):
+            provider._validate_urls({"image_url": "http://localhost/secret"})
+
+    def test_rejects_127_0_0_1(self, provider):
+        with pytest.raises(ValueError):
+            provider._validate_urls({"image_url": "http://127.0.0.1/secret"})
+
+    def test_rejects_10_network(self, provider):
+        with pytest.raises(ValueError):
+            provider._validate_urls({"image_url": "http://10.0.0.1/internal"})
+
+    def test_rejects_192_168_network(self, provider):
+        with pytest.raises(ValueError):
+            provider._validate_urls({"image_url": "http://192.168.1.1/internal"})
+
+    def test_rejects_host_docker_internal(self, provider):
+        """fal.ai provider must reject host.docker.internal even though base SSRF allows it."""
+        with pytest.raises(ValueError, match="host.docker.internal"):
+            provider._validate_urls({"image_url": "http://host.docker.internal/uploads/img.png"})
+
+    def test_allows_public_url(self, provider):
+        # Should not raise
+        provider._validate_urls({"image_url": "https://example.com/image.png"})
+
+    def test_allows_fal_media_url(self, provider):
+        # Should not raise
+        provider._validate_urls({"image_url": "https://v3b.fal.media/files/some-file.png"})
+
+    def test_validates_all_url_fields(self, provider):
+        """All URL-like fields should be validated."""
+        for field in ("image_url", "end_image_url", "audio_url", "video_url"):
+            with pytest.raises(ValueError):
+                provider._validate_urls({field: "http://127.0.0.1/evil"})
+
+    def test_none_url_fields_skipped(self, provider):
+        # Should not raise when URL fields are None
+        provider._validate_urls({"image_url": None, "prompt": "test"})
+
+    def test_non_url_fields_ignored(self, provider):
+        # Non-URL fields should not be validated
+        provider._validate_urls({"prompt": "http://127.0.0.1/not-a-url-field", "width": 1920})
+
+
+class TestPromptSanitization:
+    @pytest.fixture
+    def provider(self):
+        return FalAIProvider(api_key="test-key")
+
+    def test_strips_script_tags(self, provider):
+        result = provider._sanitize_prompt("Hello <script>alert(1)</script> world")
+        assert "<script>" not in result
+        assert "</script>" not in result
+        assert "Hello" in result
+        assert "world" in result
+
+    def test_strips_img_tags(self, provider):
+        result = provider._sanitize_prompt('Test <img src="x" onerror="alert(1)"> end')
+        assert "<img" not in result
+        assert "Test" in result
+        assert "end" in result
+
+    def test_preserves_plain_text(self, provider):
+        result = provider._sanitize_prompt("A beautiful sunset over the ocean")
+        assert result == "A beautiful sunset over the ocean"
+
+
+class TestVideoFileSizeValidation:
+    @pytest.fixture
+    def provider(self):
+        return FalAIProvider(api_key="test-key")
+
+    def test_video_url_over_500mb_rejected(self, provider):
+        mock_response = MagicMock()
+        mock_response.headers = {"Content-Length": str(600 * 1024 * 1024)}
+        mock_response.raise_for_status = MagicMock()
+
+        mock_client = MagicMock()
+        mock_client.__enter__ = MagicMock(return_value=mock_client)
+        mock_client.__exit__ = MagicMock(return_value=False)
+        mock_client.head.return_value = mock_response
+
+        with patch("app.llm_proxy.providers.fal_ai_provider.httpx.Client", return_value=mock_client):
+            with pytest.raises(ValueError, match="500MB"):
+                provider._validate_urls({"video_url": "https://example.com/big-video.mp4"})
+
+    def test_missing_content_length_handled(self, provider):
+        mock_response = MagicMock()
+        mock_response.headers = {}
+        mock_response.raise_for_status = MagicMock()
+
+        mock_client = MagicMock()
+        mock_client.__enter__ = MagicMock(return_value=mock_client)
+        mock_client.__exit__ = MagicMock(return_value=False)
+        mock_client.head.return_value = mock_response
+
+        with patch("app.llm_proxy.providers.fal_ai_provider.httpx.Client", return_value=mock_client):
+            # Should not raise when Content-Length is missing
+            provider._validate_urls({"video_url": "https://example.com/video.mp4"})

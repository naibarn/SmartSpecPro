from __future__ import annotations

import pytest

from app.services.typhoon_ocr_document_service import (
    TyphoonDocumentProviderUnavailableError,
    TyphoonOcrDocumentService,
    get_typhoon_ocr_document_service,
)
from app.services.typhoon_ocr_rate_limiter import (
    TyphoonOcrRateLimitState,
    TyphoonOcrRateLimiter,
)


@pytest.mark.asyncio
async def test_typhoon_service_extracts_image_text_from_openai_compatible_response(monkeypatch):
    service = get_typhoon_ocr_document_service(api_key_override="typhoon-test-key")

    async def fake_post_completion(self, *, messages, trace_id=None):
        assert trace_id == "trace-123"
        assert messages[0]["role"] == "user"
        return {
            "id": "resp-typhoon-1",
            "model": "typhoon-ocr",
            "choices": [
                {
                    "message": {
                        "content": (
                            '{"shortCaption":"Receipt","detailedCaption":"Receipt","ocrText":"ร้าน ABC 120 บาท",'
                            '"objects":[],"styles":[],"materials":[],"colors":[],"rooms":[],"architectureTags":[],"safetyLabels":[]}'
                        )
                    }
                }
            ],
        }

    monkeypatch.setattr(TyphoonOcrDocumentService, "_post_completion", fake_post_completion, raising=True)

    result = await service.parse_and_extract_document(
        content=b"image-bytes",
        mime_type="image/jpeg",
        file_name="receipt.jpg",
        trace_id="trace-123",
    )

    assert result.provider == "typhoon_ocr_1_5"
    assert result.provider_request_id == "resp-typhoon-1"
    assert result.ocr_text == "ร้าน ABC 120 บาท"
    assert result.to_legacy_analysis()["metadata"]["provider"] == "typhoon_ocr_1_5"


@pytest.mark.asyncio
async def test_typhoon_service_uses_pdf_text_when_pages_are_text_based(monkeypatch):
    service = get_typhoon_ocr_document_service(api_key_override="typhoon-test-key")

    class FakePage:
        def __init__(self, text: str):
            self._text = text

        def extract_text(self):
            return self._text

        @property
        def images(self):
            return []

    class FakeReader:
        def __init__(self, *_args, **_kwargs):
            self.pages = [FakePage("หน้า 1 ร้าน ABC"), FakePage("หน้า 2 ยอดรวม 120 บาท")]

    monkeypatch.setattr("pypdf.PdfReader", FakeReader, raising=False)

    result = await service.parse_and_extract_document(
        content=b"%PDF-1.7 fake",
        mime_type="application/pdf",
        file_name="receipt.pdf",
        trace_id="trace-456",
    )

    assert result.provider == "typhoon_ocr_1_5"
    assert result.page_count == 2
    assert "[page 1]" in result.ocr_text
    assert "ยอดรวม 120 บาท" in result.ocr_text


@pytest.mark.asyncio
async def test_typhoon_rate_limiter_allows_requests_within_window():
    class FakeRedis:
        def __init__(self) -> None:
            self.calls = []

        async def eval(self, script, numkeys, key, max_requests, window_seconds, now, request_id, ttl_seconds):
            self.calls.append(
                {
                    "script": script,
                    "numkeys": numkeys,
                    "key": key,
                    "max_requests": max_requests,
                    "window_seconds": window_seconds,
                    "now": now,
                    "request_id": request_id,
                    "ttl_seconds": ttl_seconds,
                }
            )
            return [1, 19, 0]

    redis_client = FakeRedis()
    limiter = TyphoonOcrRateLimiter(redis_client=redis_client)

    state = await limiter.acquire(trace_id="trace-rl-1")

    assert state.allowed is True
    assert state.remaining == 19
    assert state.retry_after_seconds == 0
    assert state.redis_available is True
    assert len(redis_client.calls) == 1
    assert redis_client.calls[0]["key"] == "rate_limit:typhoon_ocr_1_5:requests"
    assert redis_client.calls[0]["max_requests"] == "20"
    assert redis_client.calls[0]["window_seconds"] == "60"


@pytest.mark.asyncio
async def test_typhoon_rate_limiter_blocks_when_redis_is_unavailable(monkeypatch):
    async def fake_get_cache_redis():
        return None

    monkeypatch.setattr(
        "app.services.typhoon_ocr_rate_limiter.get_cache_redis",
        fake_get_cache_redis,
        raising=True,
    )

    limiter = TyphoonOcrRateLimiter(redis_client=None)
    state = await limiter.acquire(trace_id="trace-rl-2")

    assert state.allowed is False
    assert state.remaining == 0
    assert state.retry_after_seconds == 60
    assert state.redis_available is False
    assert state.error_message is not None
    assert "request blocked" in state.error_message.lower()


@pytest.mark.asyncio
async def test_typhoon_service_blocks_api_call_when_rate_limited(monkeypatch):
    service = get_typhoon_ocr_document_service(api_key_override="typhoon-test-key")

    class FakeRateLimiter:
        max_requests = 20
        window_seconds = 60

        async def acquire(self, *, trace_id=None):
            assert trace_id == "trace-789"
            return TyphoonOcrRateLimitState(
                allowed=False,
                remaining=0,
                retry_after_seconds=13,
                redis_available=True,
            )

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            raise AssertionError("HTTP client should not be created when Typhoon rate limit is exceeded")

    monkeypatch.setattr(
        "app.services.typhoon_ocr_document_service.httpx.AsyncClient",
        FakeAsyncClient,
        raising=True,
    )
    service._rate_limiter = FakeRateLimiter()

    with pytest.raises(TyphoonDocumentProviderUnavailableError) as exc_info:
        await service._post_completion(messages=[{"role": "user", "content": "hello"}], trace_id="trace-789")

    assert "rate limit exceeded" in str(exc_info.value).lower()

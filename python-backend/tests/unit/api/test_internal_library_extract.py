import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.internal_library import VISION_PROMPT, router
from app.core.config import settings
from app.core.database import get_db
from app.services.landingai_ade_document_service import LandingAIDocumentResult
from app.services.typhoon_ocr_document_service import (
    TyphoonDocumentProviderUnavailableError,
    TyphoonDocumentResult,
)


async def _fake_get_db():
    yield object()


@pytest.mark.asyncio
async def test_document_ocr_test_connection_endpoint_uses_typhoon_key_override(monkeypatch):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _fake_get_db

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)
    monkeypatch.setattr(
        "app.api.internal_library._build_document_ocr_test_image",
        lambda: b"sample-image-bytes",
    )

    async def fake_typhoon_call(
        content: bytes,
        mime_type: str,
        *,
        file_name: str,
        prompt: str,
        capture_intent: str | None = None,
        source_url: str | None = None,
        trace_id: str | None = None,
        session=None,
        api_key_override: str | None = None,
    ):
        assert content == b"sample-image-bytes"
        assert mime_type == "image/png"
        assert file_name == "document-ocr-test.png"
        assert capture_intent == "receipt"
        assert api_key_override == "typhoon-test-key"
        return (
            {
                "ocrText": "OCR TEST",
                "metadata": {"model_version": "typhoon-ocr"},
            },
            "typhoon_ocr_1_5",
            [],
        )

    monkeypatch.setattr("app.api.internal_library._call_typhoon_document_ocr", fake_typhoon_call)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/library/document-ocr/test-connection",
            headers={
                "x-proxy-token": "proxy-token",
                "x-typhoon-ocr-api-key": "typhoon-test-key",
            },
            json={
                "provider_id": "typhoon_ocr_1_5",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["provider_id"] == "typhoon_ocr_1_5"
    assert payload["message"] == "Connection successful"
    assert payload["ocr_text"] == "OCR TEST"
    assert payload["model_version"] == "typhoon-ocr"
    assert payload["elapsed_ms"] >= 0


@pytest.mark.asyncio
async def test_document_ocr_test_connection_endpoint_uses_landingai_key_override(monkeypatch):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _fake_get_db

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)
    monkeypatch.setattr(
        "app.api.internal_library._build_document_ocr_test_image",
        lambda: b"sample-image-bytes",
    )

    async def fake_landingai_call(
        content: bytes,
        mime_type: str,
        *,
        file_name: str,
        prompt: str,
        capture_intent: str | None = None,
        source_url: str | None = None,
        trace_id: str | None = None,
        session=None,
        api_key_override: str | None = None,
    ):
        assert content == b"sample-image-bytes"
        assert mime_type == "image/png"
        assert file_name == "document-ocr-test.png"
        assert capture_intent == "receipt"
        assert api_key_override == "landingai-test-key"
        return (
            {
                "ocrText": "OCR TEST",
                "metadata": {"model_version": "dpt-2-latest"},
            },
            "landingai_ade",
            [],
        )

    monkeypatch.setattr("app.api.internal_library._call_landingai_ade_document_ocr", fake_landingai_call)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/library/document-ocr/test-connection",
            headers={
                "x-proxy-token": "proxy-token",
                "x-landingai-ade-api-key": "landingai-test-key",
            },
            json={
                "provider_id": "landingai_ade",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["provider_id"] == "landingai_ade"
    assert payload["message"] == "Connection successful"
    assert payload["ocr_text"] == "OCR TEST"
    assert payload["model_version"] == "dpt-2-latest"
    assert payload["elapsed_ms"] >= 0


@pytest.mark.asyncio
async def test_document_ocr_test_connection_endpoint_uses_google_ai_vision(monkeypatch):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _fake_get_db

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)
    monkeypatch.setattr(
        "app.api.internal_library._build_document_ocr_test_image",
        lambda: b"sample-image-bytes",
    )

    async def fake_google_call(
        content: bytes,
        mime_type: str,
        *,
        file_name: str,
        prompt: str,
        capture_intent: str | None = None,
        source_url: str | None = None,
        trace_id: str | None = None,
        session=None,
        api_key_override: str | None = None,
    ):
        assert content == b"sample-image-bytes"
        assert mime_type == "image/png"
        assert file_name == "document-ocr-test.png"
        assert capture_intent == "receipt"
        return (
            {
                "ocrText": "OCR TEST",
                "metadata": {"model_version": "gemini-2.5-flash"},
            },
            "google_ai_vision",
            [],
        )

    monkeypatch.setattr("app.api.internal_library._call_google_ai_document_ocr", fake_google_call)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/library/document-ocr/test-connection",
            headers={"x-proxy-token": "proxy-token"},
            json={
                "provider_id": "google_ai_vision",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["provider_id"] == "google_ai_vision"
    assert payload["message"] == "Connection successful"
    assert payload["ocr_text"] == "OCR TEST"
    assert payload["model_version"] == "gemini-2.5-flash"
    assert payload["elapsed_ms"] >= 0


@pytest.mark.asyncio
async def test_extract_library_text_endpoint_returns_extracted_text(monkeypatch):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _fake_get_db

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)

    def fake_extract(self, content: bytes, mime_type: str, file_name: str):
        assert content == b"hello world"
        assert mime_type == "application/pdf"
        assert file_name == "guide.pdf"
        return {
            "text": "Extracted document text",
            "char_count": 23,
            "method": "pdf",
        }

    monkeypatch.setattr(
        "app.api.internal_library.OneDriveContentExtractor.extract",
        fake_extract,
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/library/extract-text",
            headers={"x-proxy-token": "proxy-token"},
            json={
                "file_name": "guide.pdf",
                "mime_type": "application/pdf",
                "content_base64": "aGVsbG8gd29ybGQ=",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["text"] == "Extracted document text"
    assert payload["char_count"] == 23
    assert payload["method"] == "pdf"
    assert payload["warning"] is None
    assert payload["metadata"]["analysis_profile"] == "metadata_only"
    assert payload["metadata"]["capture_intent"] is None


@pytest.mark.asyncio
async def test_extract_library_text_endpoint_uses_google_ai_vision_provider(monkeypatch):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _fake_get_db

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)

    async def fake_google_call(
        content: bytes,
        mime_type: str,
        *,
        file_name: str,
        prompt: str,
        capture_intent: str | None = None,
        source_url: str | None = None,
        trace_id: str | None = None,
        session=None,
        api_key_override: str | None = None,
    ):
        assert content == b"hello world"
        assert mime_type == "image/jpeg"
        assert file_name == "receipt.jpg"
        assert capture_intent is None
        return (
            {
                "ocrText": "Thai receipt OCR",
                "metadata": {"model_version": "gemini-2.5-flash"},
            },
            "google_ai_vision",
            [],
        )

    monkeypatch.setattr("app.api.internal_library._call_google_ai_document_ocr", fake_google_call)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/library/extract-text",
            headers={"x-proxy-token": "proxy-token"},
            json={
                "file_name": "receipt.jpg",
                "mime_type": "image/jpeg",
                "content_base64": "aGVsbG8gd29ybGQ=",
                "ocr_provider": "google_ai_vision",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["text"] == "Thai receipt OCR"
    assert payload["method"] == "image_document_ocr"
    assert payload["metadata"]["ocr_provider"] == "google_ai_vision"
    assert payload["metadata"]["model_version"] == "gemini-2.5-flash"


@pytest.mark.asyncio
async def test_extract_library_text_endpoint_rejects_bad_base64(monkeypatch):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _fake_get_db

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/library/extract-text",
            headers={"x-proxy-token": "proxy-token"},
            json={
                "file_name": "guide.pdf",
                "mime_type": "application/pdf",
                "content_base64": "!not-valid!",
            },
        )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid base64 content"


@pytest.mark.asyncio
async def test_extract_library_text_endpoint_accepts_web_gateway_token_fallback(monkeypatch):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _fake_get_db

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-token", raising=False)

    def fake_extract(self, content: bytes, mime_type: str, file_name: str):
        assert content == b"hello world"
        assert mime_type == "application/pdf"
        assert file_name == "guide.pdf"
        return {
            "text": "Extracted document text",
            "char_count": 23,
            "method": "pdf",
        }

    monkeypatch.setattr(
        "app.api.internal_library.OneDriveContentExtractor.extract",
        fake_extract,
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/library/extract-text",
            headers={"x-proxy-token": "gateway-token"},
            json={
                "file_name": "guide.pdf",
                "mime_type": "application/pdf",
                "content_base64": "aGVsbG8gd29ybGQ=",
            },
        )

    assert response.status_code == 200
    assert response.json()["method"] == "pdf"


@pytest.mark.asyncio
async def test_extract_library_text_endpoint_uses_landingai_ade_for_scanned_slip(monkeypatch):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _fake_get_db

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)

    class FakeAdeService:
        def is_configured(self) -> bool:
            return True

        async def parse_and_extract_document(
            self,
            *,
            content: bytes | None,
            mime_type: str,
            file_name: str,
            prompt: str | None = None,
            capture_intent: str | None = None,
            source_url: str | None = None,
            trace_id: str | None = None,
            session=None,
            allow_temp_url: bool = True,
            extract_schema=None,
            parse_model=None,
            extract_model=None,
        ):
            assert content == b"pdf bytes"
            assert mime_type == "application/pdf"
            assert file_name == "transfer-slip.pdf"
            assert source_url is None
            assert session is not None
            assert trace_id is not None
            assert allow_temp_url is True
            return LandingAIDocumentResult(
                provider="landingai_ade",
                model_version="dpt-2-latest",
                source_url_kind="public_url",
                source_url_public="https://cdn.example.com/ade/transfer-slip.pdf",
                markdown="โอนเงิน 250 บาท ไป SCB Main",
                ocr_text="โอนเงิน 250 บาท ไป SCB Main",
                structured_json={
                    "shortCaption": "Transfer slip",
                    "detailedCaption": "Bank transfer slip",
                    "ocrText": "โอนเงิน 250 บาท ไป SCB Main",
                    "objects": [],
                    "styles": [],
                    "materials": [],
                    "colors": [],
                    "rooms": [],
                    "architectureTags": [],
                    "safetyLabels": [],
                },
                page_count=1,
                warnings=[],
                trace_id=trace_id,
                provider_request_id="job-ade-123",
                parse_status="completed",
                mime_type="application/pdf",
                file_hash="hash-ade",
                markdown_hash="hash-md",
                ocr_text_hash="hash-ocr",
            )

    monkeypatch.setattr(
        "app.api.internal_library.get_landingai_ade_document_service",
        lambda *args, **kwargs: FakeAdeService(),
    )
    monkeypatch.setattr(
        "app.api.internal_library.OneDriveContentExtractor.extract",
        lambda self, content, mime_type, file_name: (_ for _ in ()).throw(AssertionError("OneDrive extractor should not be used when ADE succeeds")),
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/library/extract-text",
            headers={"x-proxy-token": "proxy-token"},
            json={
                "file_name": "transfer-slip.pdf",
                "mime_type": "application/pdf",
                "content_base64": "cGRmIGJ5dGVz",
                "analysis_profile": "document_ocr",
                "capture_intent": "transfer_slip",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["text"] == "โอนเงิน 250 บาท ไป SCB Main"
    assert payload["char_count"] == len("โอนเงิน 250 บาท ไป SCB Main")
    assert payload["method"] == "pdf_document_ocr"
    assert payload["warning"] is None
    assert payload["metadata"]["ocr_provider"] == "landingai_ade"
    assert payload["metadata"]["provider_request_id"] == "job-ade-123"
    assert payload["metadata"]["source_url_kind"] == "public_url"


@pytest.mark.asyncio
async def test_extract_library_text_endpoint_uses_typhoon_ocr_when_typhoon_key_is_present(monkeypatch):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _fake_get_db

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)

    class FakeTyphoonService:
        def is_configured(self) -> bool:
            return True

        async def parse_and_extract_document(
            self,
            *,
            content: bytes | None,
            mime_type: str,
            file_name: str,
            source_url: str | None = None,
            trace_id: str | None = None,
            session=None,
            allow_temp_url: bool = True,
            extract_schema=None,
        ):
            assert content == b"image bytes"
            assert mime_type == "image/jpeg"
            assert file_name == "receipt.jpg"
            assert trace_id is not None
            return TyphoonDocumentResult(
                provider="typhoon_ocr_1_5",
                model_version="typhoon-ocr",
                source_url_kind="uploaded_bytes",
                source_url_public="",
                markdown="ร้าน ABC 120 บาท",
                ocr_text="ร้าน ABC 120 บาท",
                structured_json={
                    "shortCaption": "Receipt",
                    "detailedCaption": "Receipt",
                    "ocrText": "ร้าน ABC 120 บาท",
                    "objects": [],
                    "styles": [],
                    "materials": [],
                    "colors": [],
                    "rooms": [],
                    "architectureTags": [],
                    "safetyLabels": [],
                },
                page_count=1,
                warnings=[],
                trace_id=trace_id,
                provider_request_id="resp-typhoon-1",
                parse_status="completed",
                mime_type="image/jpeg",
                file_hash="hash-typhoon",
                markdown_hash="hash-md",
                ocr_text_hash="hash-ocr",
            )

    monkeypatch.setattr(
        "app.api.internal_library.get_typhoon_ocr_document_service",
        lambda *args, **kwargs: FakeTyphoonService(),
    )

    class FakeLandingService:
        def is_configured(self) -> bool:
            return False

    monkeypatch.setattr(
        "app.api.internal_library.get_landingai_ade_document_service",
        lambda *args, **kwargs: FakeLandingService(),
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/library/extract-text",
            headers={
                "x-proxy-token": "proxy-token",
                "x-typhoon-ocr-api-key": "typhoon-test-key",
            },
            json={
                "file_name": "receipt.jpg",
                "mime_type": "image/jpeg",
                "content_base64": "aW1hZ2UgYnl0ZXM=",
                "analysis_profile": "document_ocr",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["text"] == "ร้าน ABC 120 บาท"
    assert payload["method"] == "image_document_ocr"
    assert payload["metadata"]["ocr_provider"] == "typhoon_ocr_1_5"


@pytest.mark.asyncio
async def test_extract_library_text_endpoint_falls_back_to_native_extractor_when_typhoon_ocr_is_unavailable(monkeypatch):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _fake_get_db

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)

    class FailingTyphoonService:
        def is_configured(self) -> bool:
            return True

        async def parse_and_extract_document(
            self,
            *,
            content: bytes | None,
            mime_type: str,
            file_name: str,
            source_url: str | None = None,
            trace_id: str | None = None,
            session=None,
            allow_temp_url: bool = True,
            extract_schema=None,
        ):
            raise TyphoonDocumentProviderUnavailableError("Typhoon OCR is unavailable")

    class DisabledLandingService:
        def is_configured(self) -> bool:
            return False

    monkeypatch.setattr("app.api.internal_library.get_typhoon_ocr_document_service", lambda *args, **kwargs: FailingTyphoonService())
    monkeypatch.setattr("app.api.internal_library.get_landingai_ade_document_service", lambda *args, **kwargs: DisabledLandingService())
    monkeypatch.setattr(
        "app.api.internal_library.OneDriveContentExtractor.extract",
        lambda self, content, mime_type, file_name: {
            "text": "Extracted document text",
            "char_count": 23,
            "method": "pdf",
        },
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/library/extract-text",
            headers={
                "x-proxy-token": "proxy-token",
                "x-typhoon-ocr-api-key": "typhoon-test-key",
            },
            json={
                "file_name": "guide.pdf",
                "mime_type": "application/pdf",
                "content_base64": "aGVsbG8gd29ybGQ=",
                "analysis_profile": "document_ocr",
                "capture_intent": "transfer_slip",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["text"] == "Extracted document text"
    assert payload["method"] == "pdf"
    assert payload["warning"] is not None
    assert "Typhoon OCR is unavailable" in payload["warning"]


@pytest.mark.asyncio
async def test_enrich_library_media_endpoint_uses_landingai_ade_for_transfer_slip_image(monkeypatch):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _fake_get_db

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_USE_WEB_GATEWAY", True, raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "http://gateway.local", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-token", raising=False)

    class FakeAdeService:
        def is_configured(self) -> bool:
            return True

        async def parse_and_extract_document(
            self,
            *,
            content: bytes | None,
            mime_type: str,
            file_name: str,
            prompt: str | None = None,
            capture_intent: str | None = None,
            source_url: str | None = None,
            trace_id: str | None = None,
            session=None,
            allow_temp_url: bool = True,
            extract_schema=None,
            parse_model=None,
            extract_model=None,
        ):
            assert content == b"jpg bytes"
            assert mime_type == "image/jpeg"
            assert file_name == "transfer-slip.jpg"
            assert prompt is not None
            assert "document transcription engine" in prompt.lower()
            assert capture_intent == "transfer_slip"
            assert source_url == "https://cdn.example.com/library/uploads/tenant-1/7/transfer-slip.jpg"
            assert session is not None
            assert trace_id is not None
            assert allow_temp_url is True
            assert extract_schema is not None
            assert parse_model is None
            assert extract_model is None
            return LandingAIDocumentResult(
                provider="landingai_ade",
                model_version="dpt-2-latest",
                source_url_kind="public_url",
                source_url_public="https://cdn.example.com/library/uploads/tenant-1/7/transfer-slip.jpg",
                markdown="# Transfer slip\n\nโอนเงิน 726.00 บาท ไปยัง TIKTOKSHOPSELLER",
                ocr_text="โอนเงิน 726.00 บาท ไปยัง TIKTOKSHOPSELLER",
                structured_json={
                    "shortCaption": "Krungthai transfer slip",
                    "detailedCaption": "Payment slip showing a transfer of 726.00 baht.",
                    "ocrText": "โอนเงิน 726.00 บาท ไปยัง TIKTOKSHOPSELLER",
                    "objects": ["qr code", "amount"],
                    "styles": [],
                    "materials": [],
                    "colors": [],
                    "rooms": [],
                    "architectureTags": [],
                    "safetyLabels": [],
                },
                page_count=1,
                warnings=[],
                trace_id=trace_id,
                provider_request_id="job-ade-456",
                parse_status="completed",
                mime_type="image/jpeg",
                file_hash="hash-ade-jpg",
                markdown_hash="hash-md",
                ocr_text_hash="hash-ocr",
            )

    monkeypatch.setattr(
        "app.api.internal_library.get_landingai_ade_document_service",
        lambda *args, **kwargs: FakeAdeService(),
    )
    monkeypatch.setattr(
        "app.api.internal_library._call_gateway_multimodal_vision_bytes",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("Gateway should not be used when ADE succeeds")),
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/library/enrich-media",
            headers={"x-proxy-token": "proxy-token"},
            json={
                "file_name": "transfer-slip.jpg",
                "mime_type": "image/jpeg",
                "content_base64": "anBnIGJ5dGVz",
                "source_url": "https://cdn.example.com/library/uploads/tenant-1/7/transfer-slip.jpg",
                "analysis_profile": "document_ocr",
                "capture_intent": "transfer_slip",
                "enable_vision": True,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["method"] == "image_document_ocr"
    assert payload["search_quality"] == "full_text"
    assert payload["warning"] is None
    assert payload["metadata"]["ocr_provider"] == "landingai_ade"
    assert payload["metadata"]["capture_intent"] == "transfer_slip"
    assert payload["metadata"]["analysis_profile"] == "document_ocr"
    assert "TIKTOKSHOPSELLER" in payload["text"]


@pytest.mark.asyncio
async def test_enrich_library_media_endpoint_returns_image_caption(monkeypatch):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _fake_get_db

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_USE_WEB_GATEWAY", True, raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "http://gateway.local", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-token", raising=False)

    async def fake_gateway(content: bytes, mime_type: str, **kwargs):
        assert mime_type == "image/jpeg"
        prompt = kwargs.get("prompt") or ""
        assert "document transcription engine" in prompt.lower()
        assert "transfer slip" in prompt.lower()
        return {
            "shortCaption": "Modern white house",
            "detailedCaption": "A modern white house with a pool.",
            "ocrText": "",
            "objects": ["house", "pool"],
            "styles": ["modern"],
            "materials": ["glass"],
            "colors": ["white"],
            "architectureTags": ["residential"],
        }

    monkeypatch.setattr("app.api.internal_library._call_gateway_multimodal_vision_bytes", fake_gateway)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/library/enrich-media",
            headers={"x-proxy-token": "proxy-token"},
            json={
                "file_name": "house.jpg",
                "mime_type": "image/jpeg",
                "content_base64": "aGVsbG8gd29ybGQ=",
                "analysis_profile": "document_ocr",
                "capture_intent": "transfer_slip",
                "enable_vision": True,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "image_document_ocr"
    assert payload["search_quality"] == "full_text"
    assert payload["caption"] == "Modern white house"
    assert "Modern white house" in payload["text"]
    assert payload["metadata"]["ocr_provider"] == "gateway_auto"


@pytest.mark.asyncio
async def test_enrich_library_media_endpoint_uses_gateway_auto_selection_for_transfer_slip(monkeypatch, tmp_path):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _fake_get_db

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "http://gateway.local", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-token", raising=False)
    monkeypatch.setenv("FINANCE_OCR_DEBUG_TRACE", "true")
    monkeypatch.setenv("FINANCE_OCR_DEBUG_TRACE_DIR", str(tmp_path))

    async def fake_gateway(content: bytes, mime_type: str, **kwargs):
        assert mime_type == "image/jpeg"
        assert "transfer slip" in (kwargs.get("prompt") or "").lower()
        return {
            "shortCaption": "Krungthai transfer slip",
            "detailedCaption": "Payment slip showing a transfer of 726.00 baht.",
            "ocrText": "โอนเงิน 726.00 บาท ไปยัง TIKTOKSHOPSELLER",
            "objects": ["qr code", "amount"],
            "styles": [],
            "materials": [],
            "colors": [],
            "architectureTags": [],
        }

    monkeypatch.setattr("app.api.internal_library._call_gateway_multimodal_vision_bytes", fake_gateway)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/library/enrich-media",
            headers={"x-proxy-token": "proxy-token"},
            json={
                "file_name": "transfer-slip.jpg",
                "mime_type": "image/jpeg",
                "content_base64": "aGVsbG8gd29ybGQ=",
                "analysis_profile": "document_ocr",
                "capture_intent": "transfer_slip",
                "enable_vision": True,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "image_document_ocr"
    assert payload["metadata"]["ocr_provider"] == "gateway_auto"
    assert "โอนเงิน 726.00 บาท" in payload["text"]

    debug_files = list(tmp_path.glob("finance-ocr-*.jsonl"))
    assert len(debug_files) == 1
    debug_path = debug_files[0]
    assert isinstance(debug_path, Path)
    debug_events = [json.loads(line) for line in debug_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert any(event["event"] == "finance_ocr.enrich_media.start" for event in debug_events)
    assert any(event["event"] == "finance_ocr.document_ocr.gateway_text" for event in debug_events)


@pytest.mark.asyncio
async def test_enrich_library_media_endpoint_requests_structured_output_for_transfer_slip(monkeypatch):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _fake_get_db

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_USE_WEB_GATEWAY", True, raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "http://gateway.local", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-token", raising=False)

    async def fake_gateway(content: bytes, mime_type: str, **kwargs):
        assert mime_type == "image/jpeg"
        assert "transfer slip" in (kwargs.get("prompt") or "").lower()
        return {
            "shortCaption": "Krungthai transfer slip",
            "detailedCaption": "Payment slip showing a transfer of 726.00 baht.",
            "ocrText": "โอนเงิน 726.00 บาท ไปยัง TIKTOKSHOPSELLER",
            "objects": ["qr code", "amount"],
            "styles": [],
            "materials": [],
            "colors": [],
            "architectureTags": [],
        }

    monkeypatch.setattr("app.api.internal_library._call_gateway_multimodal_vision_bytes", fake_gateway)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/library/enrich-media",
            headers={"x-proxy-token": "proxy-token"},
            json={
                "file_name": "transfer-slip.jpg",
                "mime_type": "image/jpeg",
                "content_base64": "aGVsbG8gd29ybGQ=",
                "analysis_profile": "document_ocr",
                "capture_intent": "transfer_slip",
                "enable_vision": True,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "image_document_ocr"
    assert payload["metadata"]["ocr_provider"] == "gateway_auto"
    assert "โอนเงิน 726.00 บาท" in payload["text"]


@pytest.mark.asyncio
async def test_enrich_library_media_endpoint_prefers_source_url_for_transfer_slip(monkeypatch, tmp_path):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _fake_get_db

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_USE_WEB_GATEWAY", True, raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "http://gateway.local", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-token", raising=False)
    monkeypatch.setenv("FINANCE_OCR_DEBUG_TRACE", "true")
    monkeypatch.setenv("FINANCE_OCR_DEBUG_TRACE_DIR", str(tmp_path))

    captured: dict[str, object] = {}

    async def fake_responses_completion(
        self,
        *,
        input,
        model,
        reasoning=None,
        max_output_tokens=None,
        extra_body=None,
        **kwargs,
    ):
        captured["input"] = input
        captured["model"] = model
        captured["reasoning"] = reasoning
        captured["max_output_tokens"] = max_output_tokens
        captured["extra_body"] = extra_body
        return {
            "output": [
                {
                    "type": "message",
                    "role": "assistant",
                    "content": [
                        {
                            "type": "output_text",
                            "text": (
                                "{\"shortCaption\":\"Krungthai transfer slip\","
                                "\"detailedCaption\":\"Payment slip showing a transfer of 726.00 baht.\","
                                "\"ocrText\":\"โอนเงิน 726.00 บาท ไปยัง TIKTOKSHOPSELLER\","
                                "\"objects\":[\"qr code\",\"amount\"],"
                                "\"styles\":[],"
                                "\"materials\":[],"
                                "\"colors\":[],"
                                "\"architectureTags\":[]}"
                            ),
                        }
                    ],
                }
            ]
        }

    monkeypatch.setattr("app.api.internal_library.LLMGatewayClient.responses_completion", fake_responses_completion)

    source_url = "https://cdn.example.com/library/uploads/tenant-1/7/transfer-slip.jpg"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/library/enrich-media",
            headers={"x-proxy-token": "proxy-token"},
            json={
                "file_name": "transfer-slip.jpg",
                "mime_type": "image/jpeg",
                "content_base64": "aGVsbG8gd29ybGQ=",
                "source_url": source_url,
                "analysis_profile": "document_ocr",
                "capture_intent": "transfer_slip",
                "enable_vision": True,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "image_document_ocr"
    assert payload["metadata"]["ocr_provider"] == "gateway_auto"
    assert "โอนเงิน 726.00 บาท" in payload["text"]

    responses_input = captured["input"]
    assert isinstance(responses_input, list)
    image_block = responses_input[0]["content"][1]
    assert image_block["type"] == "input_image"
    assert image_block["image_url"] == source_url
    assert captured["model"] == "__auto"
    assert captured["reasoning"] == {"effort": "high"}
    assert captured["max_output_tokens"] == 4096
    assert captured["extra_body"] == {
        "modelSelection": {"mode": "auto-global"},
        "modelSelectionContext": {"featureModes": ["photo_search", "structured_output", "responses"]},
    }

    debug_files = list(tmp_path.glob("finance-ocr-*.jsonl"))
    assert len(debug_files) == 1
    debug_events = [json.loads(line) for line in debug_files[0].read_text(encoding="utf-8").splitlines() if line.strip()]
    gateway_request = next(
        event for event in debug_events if event["event"] == "finance_ocr.gateway.request"
    )
    assert gateway_request["payload"]["source_url_public"] is True
    assert gateway_request["payload"]["source_url_kind"] == "absolute_url"
    assert gateway_request["payload"]["source_url_host_redacted"] == "cdn….example.com"


@pytest.mark.asyncio
async def test_enrich_library_media_endpoint_uploads_local_source_url_to_temp_r2_before_gateway(monkeypatch, tmp_path):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _fake_get_db

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_USE_WEB_GATEWAY", True, raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "http://gateway.local", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-token", raising=False)
    monkeypatch.setattr(settings, "SITE_URL", "http://localhost:3000", raising=False)
    monkeypatch.setenv("FINANCE_OCR_DEBUG_TRACE", "true")
    monkeypatch.setenv("FINANCE_OCR_DEBUG_TRACE_DIR", str(tmp_path))

    captured: dict[str, object] = {}

    class FakeR2StorageService:
        async def upload_bytes(
            self,
            content: bytes,
            key: str,
            content_type: str = "application/octet-stream",
            db_session=None,
            metadata=None,
        ):
            assert content == b"hello world"
            assert key.startswith("temp/finance-ocr/")
            assert content_type == "image/jpeg"
            assert db_session is not None
            return "https://cdn.example.com/temp/finance-ocr/" + key.rsplit("/", 1)[-1]

    monkeypatch.setattr("app.api.internal_library.get_r2_storage_service", lambda: FakeR2StorageService())

    async def fake_responses_completion(
        self,
        *,
        input,
        model,
        reasoning=None,
        max_output_tokens=None,
        extra_body=None,
        **kwargs,
    ):
        captured["input"] = input
        captured["model"] = model
        captured["reasoning"] = reasoning
        captured["max_output_tokens"] = max_output_tokens
        captured["extra_body"] = extra_body
        return {
            "output": [
                {
                    "type": "message",
                    "role": "assistant",
                    "content": [
                        {
                            "type": "output_text",
                            "text": (
                                "{\"shortCaption\":\"Krungthai transfer slip\","
                                "\"detailedCaption\":\"Payment slip showing a transfer of 726.00 baht.\","
                                "\"ocrText\":\"โอนเงิน 726.00 บาท ไปยัง TIKTOKSHOPSELLER\","
                                "\"objects\":[\"qr code\",\"amount\"],"
                                "\"styles\":[],"
                                "\"materials\":[],"
                                "\"colors\":[],"
                                "\"architectureTags\":[]}"
                            ),
                        }
                    ],
                }
            ]
        }

    monkeypatch.setattr("app.api.internal_library.LLMGatewayClient.responses_completion", fake_responses_completion)

    source_url = "/uploads/library/tenant-1/7/transfer-slip.jpg"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/library/enrich-media",
            headers={"x-proxy-token": "proxy-token"},
            json={
                "file_name": "transfer-slip.jpg",
                "mime_type": "image/jpeg",
                "content_base64": "aGVsbG8gd29ybGQ=",
                "source_url": source_url,
                "analysis_profile": "document_ocr",
                "capture_intent": "transfer_slip",
                "enable_vision": True,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "image_document_ocr"
    assert payload["metadata"]["ocr_provider"] == "gateway_auto"
    assert "โอนเงิน 726.00 บาท" in payload["text"]

    responses_input = captured["input"]
    assert isinstance(responses_input, list)
    image_block = responses_input[0]["content"][1]
    assert image_block["type"] == "input_image"
    assert image_block["image_url"].startswith("https://cdn.example.com/temp/finance-ocr/")
    assert captured["model"] == "__auto"
    assert captured["reasoning"] == {"effort": "high"}
    assert captured["max_output_tokens"] == 4096
    assert captured["extra_body"] == {
        "modelSelection": {"mode": "auto-global"},
        "modelSelectionContext": {"featureModes": ["photo_search", "structured_output", "responses"]},
    }

    debug_files = list(tmp_path.glob("finance-ocr-*.jsonl"))
    assert len(debug_files) == 1
    debug_events = [json.loads(line) for line in debug_files[0].read_text(encoding="utf-8").splitlines() if line.strip()]
    gateway_request = next(
        event for event in debug_events if event["event"] == "finance_ocr.gateway.request"
    )
    assert gateway_request["payload"]["source_url_public"] is False
    assert gateway_request["payload"]["source_url_kind"] == "r2_temp_url"
    assert gateway_request["payload"]["source_url_host_redacted"] == "localhost"
    assert gateway_request["payload"]["resolved_image_url_public"] is True
    assert gateway_request["payload"]["resolved_image_url_host_redacted"] == "cdn….example.com"


@pytest.mark.asyncio
async def test_enrich_library_media_endpoint_falls_back_to_data_url_when_temp_r2_upload_fails(monkeypatch, tmp_path):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _fake_get_db

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_USE_WEB_GATEWAY", True, raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "http://gateway.local", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-token", raising=False)
    monkeypatch.setattr(settings, "SITE_URL", "http://localhost:3000", raising=False)
    monkeypatch.setenv("FINANCE_OCR_DEBUG_TRACE", "true")
    monkeypatch.setenv("FINANCE_OCR_DEBUG_TRACE_DIR", str(tmp_path))

    captured: dict[str, object] = {}

    class FailingR2StorageService:
        async def upload_bytes(
            self,
            content: bytes,
            key: str,
            content_type: str = "application/octet-stream",
            db_session=None,
            metadata=None,
        ):
            raise ValueError("storage unavailable")

    monkeypatch.setattr("app.api.internal_library.get_r2_storage_service", lambda: FailingR2StorageService())

    async def fake_responses_completion(
        self,
        *,
        input,
        model,
        reasoning=None,
        max_output_tokens=None,
        extra_body=None,
        **kwargs,
    ):
        captured["input"] = input
        captured["model"] = model
        captured["reasoning"] = reasoning
        captured["max_output_tokens"] = max_output_tokens
        captured["extra_body"] = extra_body
        return {
            "output": [
                {
                    "type": "message",
                    "role": "assistant",
                    "content": [
                        {
                            "type": "output_text",
                            "text": (
                                "{\"shortCaption\":\"Krungthai transfer slip\","
                                "\"detailedCaption\":\"Payment slip showing a transfer of 726.00 baht.\","
                                "\"ocrText\":\"โอนเงิน 726.00 บาท ไปยัง TIKTOKSHOPSELLER\","
                                "\"objects\":[\"qr code\",\"amount\"],"
                                "\"styles\":[],"
                                "\"materials\":[],"
                                "\"colors\":[],"
                                "\"architectureTags\":[]}"
                            ),
                        }
                    ],
                }
            ]
        }

    monkeypatch.setattr("app.api.internal_library.LLMGatewayClient.responses_completion", fake_responses_completion)

    source_url = "http://localhost:3000/uploads/library/tenant-1/7/transfer-slip.jpg"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/library/enrich-media",
            headers={"x-proxy-token": "proxy-token"},
            json={
                "file_name": "transfer-slip.jpg",
                "mime_type": "image/jpeg",
                "content_base64": "aGVsbG8gd29ybGQ=",
                "source_url": source_url,
                "analysis_profile": "document_ocr",
                "capture_intent": "transfer_slip",
                "enable_vision": True,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "image_document_ocr"
    assert payload["metadata"]["ocr_provider"] == "gateway_auto"
    assert "โอนเงิน 726.00 บาท" in payload["text"]

    responses_input = captured["input"]
    assert isinstance(responses_input, list)
    image_block = responses_input[0]["content"][1]
    assert image_block["type"] == "input_image"
    assert image_block["image_url"].startswith("data:image/jpeg;base64,")
    assert captured["model"] == "__auto"
    assert captured["reasoning"] == {"effort": "high"}
    assert captured["max_output_tokens"] == 4096
    assert captured["extra_body"] == {
        "modelSelection": {"mode": "auto-global"},
        "modelSelectionContext": {"featureModes": ["photo_search", "structured_output", "responses"]},
    }

    debug_files = list(tmp_path.glob("finance-ocr-*.jsonl"))
    assert len(debug_files) == 1
    debug_events = [json.loads(line) for line in debug_files[0].read_text(encoding="utf-8").splitlines() if line.strip()]
    gateway_request = next(
        event for event in debug_events if event["event"] == "finance_ocr.gateway.request"
    )
    assert gateway_request["payload"]["source_url_public"] is False
    assert gateway_request["payload"]["source_url_kind"] == "data_url"
    assert gateway_request["payload"]["source_url_host_redacted"] == "localhost"
    assert gateway_request["payload"]["resolved_image_url_public"] is False
    assert gateway_request["payload"]["resolved_image_url_host_redacted"] is None


@pytest.mark.asyncio
async def test_enrich_library_media_endpoint_document_ocr_stays_on_gateway_for_transfer_slip(monkeypatch):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _fake_get_db

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_USE_WEB_GATEWAY", True, raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "http://gateway.local", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-token", raising=False)

    async def fake_gateway(*args, **kwargs):
        raise RuntimeError("gateway exploded")

    monkeypatch.setattr("app.api.internal_library._call_gateway_multimodal_vision_bytes", fake_gateway)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/library/enrich-media",
            headers={"x-proxy-token": "proxy-token"},
            json={
                "file_name": "transfer-slip.jpg",
                "mime_type": "image/jpeg",
                "content_base64": "aGVsbG8gd29ybGQ=",
                "analysis_profile": "document_ocr",
                "capture_intent": "transfer_slip",
                "enable_vision": True,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "image_vision_unavailable"
    assert payload["search_quality"] == "metadata_only"
    assert "gateway exploded" in (payload["warning"] or "")


@pytest.mark.asyncio
async def test_enrich_library_media_endpoint_returns_metadata_only_image_when_not_opted_in(monkeypatch):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _fake_get_db

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_USE_WEB_GATEWAY", False, raising=False)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/library/enrich-media",
            headers={"x-proxy-token": "proxy-token"},
            json={
                "file_name": "house.jpg",
                "mime_type": "image/jpeg",
                "content_base64": "aGVsbG8gd29ybGQ=",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "image_metadata_only"
    assert payload["search_quality"] == "metadata_only"


@pytest.mark.asyncio
async def test_enrich_library_media_endpoint_returns_video_transcript(monkeypatch):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _fake_get_db

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_USE_WEB_GATEWAY", False, raising=False)

    async def fake_extract_frame(video_path: str, output_path: str):
        with open(output_path, "wb") as handle:
            handle.write(b"frame")

    async def fake_extract_audio(video_path: str, output_path: str):
        with open(output_path, "wb") as handle:
            handle.write(b"audio")

    async def fake_stt(audio_bytes: bytes, provider: str, format: str, language):
        return {"text": "This is the spoken transcript."}

    monkeypatch.setattr("app.api.internal_library._run_ffmpeg_extract_frame", fake_extract_frame)
    monkeypatch.setattr("app.api.internal_library._run_ffmpeg_extract_audio", fake_extract_audio)
    monkeypatch.setattr("app.api.internal_library._call_stt_provider", fake_stt)
    monkeypatch.setattr(
        "app.api.internal_library._ffprobe_metadata",
        lambda path: {"duration_seconds": 12.5, "codec": "h264"},
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/library/enrich-media",
            headers={"x-proxy-token": "proxy-token"},
            json={
                "file_name": "demo.mp4",
                "mime_type": "video/mp4",
                "content_base64": "aGVsbG8gd29ybGQ=",
                "analysis_profile": "video_transcript",
                "enable_transcript": True,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "video_transcript"
    assert payload["search_quality"] == "full_text"
    assert payload["transcript"] == "This is the spoken transcript."
    assert "spoken transcript" in payload["text"]


@pytest.mark.asyncio
async def test_enrich_library_media_endpoint_uses_gateway_for_video_frame_vision(monkeypatch):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _fake_get_db

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_USE_WEB_GATEWAY", True, raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "http://gateway.local", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-token", raising=False)

    async def fake_extract_frame(video_path: str, output_path: str):
        with open(output_path, "wb") as handle:
            handle.write(b"frame")

    async def fake_gateway(content: bytes, mime_type: str, **kwargs):
        assert mime_type == "image/jpeg"
        assert kwargs.get("prompt") == VISION_PROMPT
        return {
            "shortCaption": "Warehouse walkthrough",
            "detailedCaption": "A short video frame showing a warehouse interior.",
            "ocrText": "Loading dock 12",
            "objects": ["dock"],
            "styles": [],
            "materials": [],
            "colors": [],
            "architectureTags": [],
        }

    monkeypatch.setattr("app.api.internal_library._run_ffmpeg_extract_frame", fake_extract_frame)
    monkeypatch.setattr("app.api.internal_library._call_gateway_multimodal_vision_bytes", fake_gateway)
    monkeypatch.setattr(
        "app.api.internal_library._ffprobe_metadata",
        lambda path: {"duration_seconds": 12.5, "codec": "h264"},
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/library/enrich-media",
            headers={"x-proxy-token": "proxy-token"},
            json={
                "file_name": "demo.mp4",
                "mime_type": "video/mp4",
                "content_base64": "aGVsbG8gd29ybGQ=",
                "analysis_profile": "real_world_vision",
                "enable_vision": True,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "video_frame_vision"
    assert payload["search_quality"] == "full_text"
    assert payload["caption"] == "Warehouse walkthrough"
    assert "Loading dock 12" in payload["text"]

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.internal_library import router
from app.core.config import settings


@pytest.mark.asyncio
async def test_extract_library_text_endpoint_returns_extracted_text(monkeypatch):
    app = FastAPI()
    app.include_router(router)

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
    assert response.json() == {
        "success": True,
        "text": "Extracted document text",
        "char_count": 23,
        "method": "pdf",
        "warning": None,
    }


@pytest.mark.asyncio
async def test_extract_library_text_endpoint_rejects_bad_base64(monkeypatch):
    app = FastAPI()
    app.include_router(router)

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
async def test_enrich_library_media_endpoint_returns_image_caption(monkeypatch):
    app = FastAPI()
    app.include_router(router)

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)

    async def fake_gemini(content: bytes, mime_type: str, **kwargs):
        assert mime_type == "image/jpeg"
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

    monkeypatch.setattr("app.api.internal_library._call_gemini_vision_bytes", fake_gemini)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/internal/library/enrich-media",
            headers={"x-proxy-token": "proxy-token"},
            json={
                "file_name": "house.jpg",
                "mime_type": "image/jpeg",
                "content_base64": "aGVsbG8gd29ybGQ=",
                "analysis_profile": "document_ocr",
                "enable_vision": True,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "image_document_ocr"
    assert payload["search_quality"] == "full_text"
    assert payload["caption"] == "Modern white house"
    assert "Modern white house" in payload["text"]


@pytest.mark.asyncio
async def test_enrich_library_media_endpoint_returns_metadata_only_image_when_not_opted_in(monkeypatch):
    app = FastAPI()
    app.include_router(router)

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)

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

    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token", raising=False)

    async def fake_extract_frame(video_path: str, output_path: str):
        with open(output_path, "wb") as handle:
            handle.write(b"frame")

    async def fake_extract_audio(video_path: str, output_path: str):
        with open(output_path, "wb") as handle:
            handle.write(b"audio")

    async def fake_gemini(content: bytes, mime_type: str, **kwargs):
        raise AssertionError("video frame vision should not run in transcript-only mode")

    async def fake_stt(audio_bytes: bytes, provider: str, format: str, language):
        return {"text": "This is the spoken transcript."}

    monkeypatch.setattr("app.api.internal_library._run_ffmpeg_extract_frame", fake_extract_frame)
    monkeypatch.setattr("app.api.internal_library._run_ffmpeg_extract_audio", fake_extract_audio)
    monkeypatch.setattr("app.api.internal_library._call_gemini_vision_bytes", fake_gemini)
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

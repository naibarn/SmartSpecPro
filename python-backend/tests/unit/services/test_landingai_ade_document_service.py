from __future__ import annotations

import pytest

from app.services.landingai_ade_document_service import (
    DEFAULT_DOCUMENT_EXTRACTION_SCHEMA,
    DocumentProviderUnavailableError,
    DocumentSourceUrlExpiredError,
    LandingAIDocumentConfig,
    LandingAIDocumentService,
    UnsupportedDocumentError,
)


class _FakeStorage:
    def __init__(self, *, urls: list[str]):
        self.urls = urls
        self.calls: list[tuple[str, bytes, str]] = []

    async def upload_bytes(self, key: str, data: bytes, content_type: str, db_session=None) -> str:
        self.calls.append((key, data, content_type))
        if not self.urls:
            raise AssertionError("No fake storage URL configured")
        return self.urls.pop(0)


class _FakeClient:
    def __init__(self, *, parse_results: list[dict] | None = None, extract_results: list[dict] | None = None, parse_side_effects: list[Exception] | None = None):
        self.parse_results = list(parse_results or [])
        self.extract_results = list(extract_results or [])
        self.parse_side_effects = list(parse_side_effects or [])
        self.parse_calls: list[dict] = []
        self.extract_calls: list[dict] = []

    async def parse(self, *, document_url: str, file_name: str, mime_type: str, model: str, trace_id: str | None = None) -> dict:
        self.parse_calls.append(
            {
                "document_url": document_url,
                "file_name": file_name,
                "mime_type": mime_type,
                "model": model,
                "trace_id": trace_id,
            }
        )
        if self.parse_side_effects:
            effect = self.parse_side_effects.pop(0)
            raise effect
        if not self.parse_results:
            raise AssertionError("No fake parse result configured")
        return self.parse_results.pop(0)

    async def extract(self, *, markdown: str, schema: dict, model: str, trace_id: str | None = None) -> dict:
        self.extract_calls.append(
            {
                "markdown": markdown,
                "schema": schema,
                "model": model,
                "trace_id": trace_id,
            }
        )
        if not self.extract_results:
            raise AssertionError("No fake extract result configured")
        return self.extract_results.pop(0)


def _service(*, client: _FakeClient, storage: _FakeStorage | None = None) -> LandingAIDocumentService:
    return LandingAIDocumentService(
        client=client,
        storage_service=storage or _FakeStorage(urls=["https://cdn.example.com/temp/ade/1.pdf"]),
        config=LandingAIDocumentConfig(
            api_key="test-key",
            base_url="https://api.va.landing.ai",
            parse_model="dpt-2-latest",
            extract_model="dpt-2-latest",
        ),
    )


@pytest.mark.asyncio
async def test_public_document_url_is_sent_to_ade_unchanged():
    client = _FakeClient(
        parse_results=[
            {
                "markdown": "# Receipt\n\nTotal 100 THB",
                "metadata": {"page_count": 1, "version": "v1", "job_id": "job-123"},
            }
        ],
        extract_results=[
            {
                "extraction": {
                    "shortCaption": "Receipt",
                    "detailedCaption": "Receipt for lunch",
                    "ocrText": "Receipt for lunch",
                    "objects": [],
                    "styles": [],
                    "materials": [],
                    "colors": [],
                    "rooms": [],
                    "architectureTags": [],
                    "safetyLabels": [],
                }
            }
        ],
    )
    service = _service(client=client)

    result = await service.parse_and_extract_document(
        content=b"pdf-bytes",
        mime_type="application/pdf",
        file_name="receipt.pdf",
        source_url="https://example.com/receipt.pdf",
        trace_id="trace-123",
        extract_schema=DEFAULT_DOCUMENT_EXTRACTION_SCHEMA,
    )

    assert client.parse_calls[0]["document_url"] == "https://example.com/receipt.pdf"
    assert client.parse_calls[0]["model"] == "dpt-2-latest"
    assert result.source_url_kind == "public_url"
    assert result.source_url_public == "https://example.com/receipt.pdf"
    assert result.provider == "landingai_ade"
    assert result.provider_request_id == "job-123"
    assert result.structured_json["ocrText"] == "Receipt for lunch"
    assert result.ocr_text == "Receipt for lunch"


@pytest.mark.asyncio
async def test_private_upload_is_rewritten_to_temporary_public_url_before_ade():
    storage = _FakeStorage(urls=["https://cdn.example.com/temp/ade/uploaded.pdf"])
    client = _FakeClient(
        parse_results=[
            {
                "markdown": "# Receipt\n\nTotal 100 THB",
                "metadata": {"page_count": 1, "version": "v1"},
            }
        ],
        extract_results=[
            {
                "extraction": {
                    "shortCaption": "Receipt",
                    "detailedCaption": "Receipt for lunch",
                    "ocrText": "Receipt for lunch",
                    "objects": [],
                    "styles": [],
                    "materials": [],
                    "colors": [],
                    "rooms": [],
                    "architectureTags": [],
                    "safetyLabels": [],
                }
            }
        ],
    )
    service = _service(client=client, storage=storage)

    result = await service.parse_and_extract_document(
        content=b"%PDF-1.4 fake",
        mime_type="application/pdf",
        file_name="receipt.pdf",
        source_url="http://localhost/receipt.pdf",
        trace_id="trace-private",
        extract_schema=DEFAULT_DOCUMENT_EXTRACTION_SCHEMA,
    )

    assert storage.calls
    uploaded_key, uploaded_bytes, uploaded_content_type = storage.calls[0]
    assert uploaded_key.startswith("temp/landingai-ade/trace-private/")
    assert uploaded_bytes == b"%PDF-1.4 fake"
    assert uploaded_content_type == "application/pdf"
    assert client.parse_calls[0]["document_url"] == "https://cdn.example.com/temp/ade/uploaded.pdf"
    assert result.source_url_kind == "temporary_public_url"
    assert result.source_url_public == "https://cdn.example.com/temp/ade/uploaded.pdf"


@pytest.mark.asyncio
async def test_parse_only_normalizes_markdown_to_text_without_extraction():
    client = _FakeClient(
        parse_results=[
            {
                "markdown": "# Heading\n\n- item 1\n- item 2",
                "metadata": {"page_count": 2, "version": "v2", "job_id": "job-456"},
            }
        ],
    )
    service = _service(client=client)

    result = await service.parse_document(
        content=b"%PDF-1.4 fake",
        mime_type="application/pdf",
        file_name="guide.pdf",
        source_url="https://example.com/guide.pdf",
        trace_id="trace-parse-only",
    )

    assert result.structured_json is None
    assert result.ocr_text == "Heading\n\nitem 1\nitem 2"
    assert result.page_count == 2
    assert result.model_version == "v2"
    assert result.provider_request_id == "job-456"


@pytest.mark.asyncio
async def test_unsupported_mime_rejects_before_client_calls():
    client = _FakeClient(
        parse_results=[
            {
                "markdown": "# Unsupported",
                "metadata": {"page_count": 1, "version": "v1"},
            }
        ]
    )
    service = _service(client=client)

    with pytest.raises(UnsupportedDocumentError):
        await service.parse_document(
            content=b"plain text",
            mime_type="text/plain",
            file_name="note.txt",
            source_url="https://example.com/note.txt",
            trace_id="trace-unsupported",
        )

    assert client.parse_calls == []
    assert client.extract_calls == []


@pytest.mark.asyncio
async def test_encrypted_pdf_rejects_before_client_calls():
    client = _FakeClient(
        parse_results=[
            {
                "markdown": "# Encrypted",
                "metadata": {"page_count": 1, "version": "v1"},
            }
        ]
    )
    service = _service(client=client)

    encrypted_pdf = b"%PDF-1.7\n1 0 obj\n<< /Encrypt 2 0 R >>\nendobj\n"
    with pytest.raises(UnsupportedDocumentError):
        await service.parse_document(
            content=encrypted_pdf,
            mime_type="application/pdf",
            file_name="encrypted.pdf",
            source_url="https://example.com/encrypted.pdf",
            trace_id="trace-encrypted",
        )

    assert client.parse_calls == []
    assert client.extract_calls == []


@pytest.mark.asyncio
async def test_temp_url_expiry_retries_with_fresh_upload():
    storage = _FakeStorage(
        urls=[
            "https://cdn.example.com/temp/ade/first.pdf",
            "https://cdn.example.com/temp/ade/second.pdf",
        ]
    )
    client = _FakeClient(
        parse_side_effects=[
            DocumentSourceUrlExpiredError("expired"),
        ],
        parse_results=[
            {
                "markdown": "# Receipt\n\nTotal 100 THB",
                "metadata": {"page_count": 1, "version": "v1", "job_id": "job-789"},
            }
        ],
        extract_results=[
            {
                "extraction": {
                    "shortCaption": "Receipt",
                    "detailedCaption": "Retry success",
                    "ocrText": "Retry success",
                    "objects": [],
                    "styles": [],
                    "materials": [],
                    "colors": [],
                    "rooms": [],
                    "architectureTags": [],
                    "safetyLabels": [],
                }
            }
        ],
    )
    service = _service(client=client, storage=storage)

    result = await service.parse_and_extract_document(
        content=b"%PDF-1.4 fake",
        mime_type="application/pdf",
        file_name="receipt.pdf",
        source_url="http://localhost/receipt.pdf",
        trace_id="trace-retry",
        extract_schema=DEFAULT_DOCUMENT_EXTRACTION_SCHEMA,
    )

    assert len(storage.calls) == 2
    assert len(client.parse_calls) == 2
    assert client.parse_calls[0]["document_url"] == "https://cdn.example.com/temp/ade/first.pdf"
    assert client.parse_calls[1]["document_url"] == "https://cdn.example.com/temp/ade/second.pdf"
    assert result.provider_request_id == "job-789"


@pytest.mark.asyncio
async def test_missing_configuration_is_reported_as_provider_unavailable():
    client = _FakeClient(
        parse_results=[
            {
                "markdown": "# Receipt",
                "metadata": {"page_count": 1, "version": "v1"},
            }
        ]
    )
    service = LandingAIDocumentService(
        client=client,
        storage_service=_FakeStorage(urls=["https://cdn.example.com/temp/ade/1.pdf"]),
        config=LandingAIDocumentConfig(
            api_key="",
            base_url="https://api.va.landing.ai",
        ),
    )

    with pytest.raises(DocumentProviderUnavailableError):
        await service.parse_document(
            content=b"%PDF-1.4 fake",
            mime_type="application/pdf",
            file_name="receipt.pdf",
            source_url="https://example.com/receipt.pdf",
            trace_id="trace-unavailable",
        )


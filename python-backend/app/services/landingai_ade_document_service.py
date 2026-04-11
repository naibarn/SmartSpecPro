"""LandingAI ADE document parsing and extraction adapter.

This service keeps the provider-specific integration behind a small, testable
boundary. It resolves private/local inputs to short-lived public URLs via the
existing R2 storage service, calls LandingAI ADE parse/extract, and normalizes
the response into a stable contract for downstream consumers.
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import os
import re
import uuid
from dataclasses import dataclass, field
from typing import Any, Protocol, Optional
from urllib.parse import urlparse

import httpx
import structlog

from app.core.config import settings
from app.services.r2_storage_service import get_r2_storage_service

logger = structlog.get_logger(__name__)

LANDINGAI_DEFAULT_BASE_URL = "https://api.va.landing.ai"
LANDINGAI_DEFAULT_PARSE_PATH = "/v1/ade/parse"
LANDINGAI_DEFAULT_EXTRACT_PATH = "/v1/ade/extract"
LANDINGAI_DEFAULT_POLL_PATH_TEMPLATE = "/v1/ade/parse/jobs/{job_id}"
LANDINGAI_DEFAULT_PARSE_MODEL = "dpt-2-latest"
LANDINGAI_DEFAULT_EXTRACT_MODEL = "dpt-2-latest"
LANDINGAI_DEFAULT_TIMEOUT_SECONDS = 90.0

ALLOWED_DOCUMENT_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
}

DEFAULT_DOCUMENT_EXTRACTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": True,
    "properties": {
        "shortCaption": {"type": "string"},
        "detailedCaption": {"type": "string"},
        "ocrText": {"type": "string"},
        "objects": {"type": "array", "items": {"type": "string"}},
        "styles": {"type": "array", "items": {"type": "string"}},
        "materials": {"type": "array", "items": {"type": "string"}},
        "colors": {"type": "array", "items": {"type": "string"}},
        "rooms": {"type": "array", "items": {"type": "string"}},
        "architectureTags": {"type": "array", "items": {"type": "string"}},
        "safetyLabels": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "shortCaption",
        "detailedCaption",
        "ocrText",
        "objects",
        "styles",
        "materials",
        "colors",
        "rooms",
        "architectureTags",
        "safetyLabels",
    ],
}


class DocumentAdapterError(RuntimeError):
    """Base error for ADE document processing."""


class UnsupportedDocumentError(DocumentAdapterError):
    """Raised when the input is not eligible for ADE parsing."""


class DocumentProviderUnavailableError(DocumentAdapterError):
    """Raised when the ADE provider is unavailable or misconfigured."""


class DocumentSourceUrlExpiredError(DocumentAdapterError):
    """Raised when a temporary source URL is no longer fetchable."""


@dataclass(frozen=True)
class LandingAIDocumentResult:
    provider: str
    model_version: str | None
    source_url_kind: str
    source_url_public: str
    markdown: str
    ocr_text: str
    structured_json: dict[str, Any] | None
    page_count: int | None
    warnings: list[str] = field(default_factory=list)
    trace_id: str | None = None
    provider_request_id: str | None = None
    parse_status: str = "completed"
    mime_type: str | None = None
    file_hash: str | None = None
    markdown_hash: str | None = None
    ocr_text_hash: str | None = None

    def to_legacy_analysis(self) -> dict[str, Any]:
        """Convert the ADE result into the current document-analysis shape."""
        analysis: dict[str, Any]
        if self.structured_json and isinstance(self.structured_json, dict):
            analysis = dict(self.structured_json)
        else:
            fallback_text = self.ocr_text.strip() or _markdown_to_text(self.markdown)
            analysis = {
                "shortCaption": "Document",
                "detailedCaption": fallback_text[:512],
                "ocrText": fallback_text,
                "objects": [],
                "styles": [],
                "materials": [],
                "colors": [],
                "rooms": [],
                "architectureTags": [],
                "safetyLabels": [],
            }

        analysis.setdefault("shortCaption", "Document")
        analysis.setdefault("detailedCaption", "")
        analysis.setdefault("ocrText", self.ocr_text or _markdown_to_text(self.markdown))
        for key in ("objects", "styles", "materials", "colors", "rooms", "architectureTags", "safetyLabels"):
            analysis.setdefault(key, [])
        analysis["metadata"] = {
            "provider": self.provider,
            "model_version": self.model_version,
            "source_url_kind": self.source_url_kind,
            "source_url_public": self.source_url_public,
            "page_count": self.page_count,
            "parse_status": self.parse_status,
            "provider_request_id": self.provider_request_id,
            "trace_id": self.trace_id,
            "warnings": list(self.warnings),
            "mime_type": self.mime_type,
            "file_hash": self.file_hash,
            "markdown_hash": self.markdown_hash,
            "ocr_text_hash": self.ocr_text_hash,
        }
        return analysis


@dataclass(frozen=True)
class LandingAIDocumentConfig:
    api_key: str
    base_url: str = LANDINGAI_DEFAULT_BASE_URL
    parse_path: str = LANDINGAI_DEFAULT_PARSE_PATH
    extract_path: str = LANDINGAI_DEFAULT_EXTRACT_PATH
    poll_path_template: str = LANDINGAI_DEFAULT_POLL_PATH_TEMPLATE
    parse_model: str = LANDINGAI_DEFAULT_PARSE_MODEL
    extract_model: str = LANDINGAI_DEFAULT_EXTRACT_MODEL
    timeout_seconds: float = LANDINGAI_DEFAULT_TIMEOUT_SECONDS
    poll_interval_seconds: float = 2.0
    max_poll_attempts: int = 5
    upload_folder: str = "temp/landingai-ade"


class LandingAIDocumentClientProtocol(Protocol):
    async def parse(self, *, document_url: str, file_name: str, mime_type: str, model: str, trace_id: str | None = None) -> dict[str, Any]:
        ...

    async def extract(self, *, markdown: str, schema: dict[str, Any], model: str, trace_id: str | None = None) -> dict[str, Any]:
        ...


def _resolve_api_key() -> str:
    return (
        str(getattr(settings, "LANDINGAI_ADE_API_KEY", "") or "").strip()
        or str(os.getenv("VISION_AGENT_API_KEY", "") or "").strip()
    )


def _resolve_config() -> LandingAIDocumentConfig:
    return LandingAIDocumentConfig(
        api_key=_resolve_api_key(),
        base_url=str(getattr(settings, "LANDINGAI_ADE_BASE_URL", "") or LANDINGAI_DEFAULT_BASE_URL).rstrip("/"),
        parse_path=str(getattr(settings, "LANDINGAI_ADE_PARSE_PATH", "") or LANDINGAI_DEFAULT_PARSE_PATH),
        extract_path=str(getattr(settings, "LANDINGAI_ADE_EXTRACT_PATH", "") or LANDINGAI_DEFAULT_EXTRACT_PATH),
        poll_path_template=str(
            getattr(settings, "LANDINGAI_ADE_POLL_PATH_TEMPLATE", "") or LANDINGAI_DEFAULT_POLL_PATH_TEMPLATE
        ),
        parse_model=str(getattr(settings, "LANDINGAI_ADE_PARSE_MODEL", "") or LANDINGAI_DEFAULT_PARSE_MODEL),
        extract_model=str(getattr(settings, "LANDINGAI_ADE_EXTRACT_MODEL", "") or LANDINGAI_DEFAULT_EXTRACT_MODEL),
        timeout_seconds=float(getattr(settings, "LANDINGAI_ADE_TIMEOUT_SECONDS", LANDINGAI_DEFAULT_TIMEOUT_SECONDS) or LANDINGAI_DEFAULT_TIMEOUT_SECONDS),
        poll_interval_seconds=float(getattr(settings, "LANDINGAI_ADE_POLL_INTERVAL_SECONDS", 2.0) or 2.0),
        max_poll_attempts=int(getattr(settings, "LANDINGAI_ADE_MAX_POLL_ATTEMPTS", 5) or 5),
        upload_folder=str(getattr(settings, "LANDINGAI_ADE_UPLOAD_FOLDER", "") or "temp/landingai-ade"),
    )


def _normalize_mime_type(mime_type: str) -> str:
    return str(mime_type or "").split(";", 1)[0].strip().lower()


def _is_public_url(value: str | None) -> bool:
    candidate = str(value or "").strip()
    if not candidate:
        return False

    try:
        parsed = urlparse(candidate)
    except Exception:
        return False

    if parsed.scheme not in {"http", "https"}:
        return False

    hostname = str(parsed.hostname or "").strip().lower()
    if not hostname:
        return False

    if hostname in {"localhost", "0.0.0.0", "127.0.0.1", "::1"}:
        return False
    if hostname.endswith(".localhost") or hostname.endswith(".local"):
        return False
    if hostname.endswith(".internal") or hostname.endswith(".svc"):
        return False

    return True


def _source_url_kind(source_url: str | None, was_uploaded: bool) -> tuple[str, bool]:
    if was_uploaded:
        return "temporary_public_url", True
    if _is_public_url(source_url):
        return "public_url", True
    return "unresolved", False


def _allowed_document_mime_type(mime_type: str, file_name: str) -> bool:
    normalized = _normalize_mime_type(mime_type)
    if normalized in ALLOWED_DOCUMENT_MIME_TYPES:
        return True
    if normalized == "application/octet-stream":
        return file_name.lower().endswith(".pdf")
    return False


def _looks_like_encrypted_pdf(content: bytes, file_name: str, mime_type: str) -> bool:
    normalized = _normalize_mime_type(mime_type)
    if normalized != "application/pdf" and not file_name.lower().endswith(".pdf"):
        return False

    head = bytes(content[:4096]).decode("latin-1", errors="ignore")
    if "/Encrypt" in head:
        return True

    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(content))
        return bool(getattr(reader, "is_encrypted", False))
    except Exception:
        # If the PDF is malformed, let the provider surface the actual parse error.
        return False


def _hash_text(value: str | None) -> str | None:
    candidate = str(value or "").strip()
    if not candidate:
        return None
    return hashlib.sha256(candidate.encode("utf-8")).hexdigest()


def _hash_bytes(value: bytes | bytearray | None) -> str | None:
    if not value:
        return None
    return hashlib.sha256(bytes(value)).hexdigest()


def _markdown_to_text(markdown: str) -> str:
    text = str(markdown or "").strip()
    if not text:
        return ""
    text = re.sub(r"```(?:json|text)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```", "", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^[-*+]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\d+\.\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"[*_`]", "", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _extract_response_payload(response: dict[str, Any]) -> dict[str, Any]:
    if isinstance(response.get("data"), dict):
        return response["data"]
    return response


class LandingAIDocumentHttpClient:
    """HTTP client for the official LandingAI ADE REST API."""

    def __init__(self, config: LandingAIDocumentConfig, client: httpx.AsyncClient | None = None):
        self.config = config
        self._client = client
        self._owns_client = client is None

    async def aclose(self) -> None:
        if self._client is not None and self._owns_client and not self._client.is_closed:
            await self._client.aclose()

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.config.timeout_seconds)
            self._owns_client = True
        return self._client

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.config.api_key}",
        }

    async def _request(self, method: str, path: str, *, files: dict[str, tuple[str | None, str]], trace_id: str | None = None) -> httpx.Response:
        url = f"{self.config.base_url.rstrip('/')}{path}"
        headers = self._headers()
        if trace_id:
            headers["x-trace-id"] = trace_id
        response = await self.client.request(method, url, files=files, headers=headers)
        return response

    async def _poll_parse_job(self, *, job_id: str, trace_id: str | None = None) -> dict[str, Any]:
        if not job_id:
            raise DocumentProviderUnavailableError("ADE parse job did not return a job id")

        url = f"{self.config.base_url.rstrip('/')}{self.config.poll_path_template.format(job_id=job_id)}"
        headers = self._headers()
        if trace_id:
            headers["x-trace-id"] = trace_id

        for attempt in range(max(self.config.max_poll_attempts, 1)):
            response = await self.client.get(url, headers=headers)
            if response.status_code >= 500:
                if attempt + 1 >= self.config.max_poll_attempts:
                    raise DocumentProviderUnavailableError(
                        f"ADE parse job polling failed with HTTP {response.status_code}"
                    )
                await asyncio.sleep(self.config.poll_interval_seconds)
                continue

            payload = response.json()
            if not isinstance(payload, dict):
                raise DocumentProviderUnavailableError("ADE parse job returned an invalid payload")

            status = str(payload.get("status") or payload.get("job_status") or payload.get("state") or "").strip().lower()
            if status in {"completed", "succeeded", "success", "done", "partial"}:
                if isinstance(payload.get("output_url"), str) and payload["output_url"].strip():
                    output_response = await self.client.get(payload["output_url"], headers=headers)
                    output_response.raise_for_status()
                    output_payload = output_response.json()
                    if isinstance(output_payload, dict):
                        return output_payload
                if isinstance(payload.get("data"), dict):
                    return payload["data"]
                return payload

            if status in {"failed", "error", "cancelled", "canceled"}:
                message = str(payload.get("error") or payload.get("message") or "ADE parse job failed").strip()
                raise DocumentProviderUnavailableError(message)

            await asyncio.sleep(self.config.poll_interval_seconds)

        raise DocumentProviderUnavailableError("ADE parse job did not complete before polling budget expired")

    async def parse(self, *, document_url: str, file_name: str, mime_type: str, model: str, trace_id: str | None = None) -> dict[str, Any]:
        files = {
            "document_url": (None, document_url),
            "model": (None, model),
            "filename": (None, file_name),
            "mime_type": (None, mime_type),
        }
        response = await self._request("POST", self.config.parse_path, files=files, trace_id=trace_id)
        if response.status_code in {401, 403}:
            raise DocumentProviderUnavailableError("ADE API key is not authorized")
        if response.status_code == 404:
            raise DocumentSourceUrlExpiredError("ADE could not fetch the document URL")
        if response.status_code >= 500:
            raise DocumentProviderUnavailableError(f"ADE parse failed with HTTP {response.status_code}")

        payload = response.json()
        if not isinstance(payload, dict):
            raise DocumentProviderUnavailableError("ADE parse returned a non-object payload")

        if response.status_code == 202 or str(payload.get("status") or "").lower() in {"queued", "pending", "running", "processing"}:
            job_id = str(payload.get("job_id") or payload.get("metadata", {}).get("job_id") or "").strip()
            if not job_id:
                raise DocumentProviderUnavailableError("ADE parse queued without a job id")
            return await self._poll_parse_job(job_id=job_id, trace_id=trace_id)

        if response.status_code not in {200, 206}:
            raise DocumentProviderUnavailableError(f"ADE parse failed with HTTP {response.status_code}")

        return payload

    async def extract(self, *, markdown: str, schema: dict[str, Any], model: str, trace_id: str | None = None) -> dict[str, Any]:
        files = {
            "markdown": (None, markdown),
            "schema": (None, json.dumps(schema, ensure_ascii=False)),
            "model": (None, model),
        }
        response = await self._request("POST", self.config.extract_path, files=files, trace_id=trace_id)
        if response.status_code in {401, 403}:
            raise DocumentProviderUnavailableError("ADE API key is not authorized")
        if response.status_code >= 500:
            raise DocumentProviderUnavailableError(f"ADE extract failed with HTTP {response.status_code}")

        payload = response.json()
        if not isinstance(payload, dict):
            raise DocumentProviderUnavailableError("ADE extract returned a non-object payload")
        if response.status_code not in {200, 206}:
            raise DocumentProviderUnavailableError(f"ADE extract failed with HTTP {response.status_code}")
        return payload


_service_singleton: LandingAIDocumentService | None = None


class LandingAIDocumentService:
    """High-level ADE adapter that resolves URLs and normalizes outputs."""

    def __init__(
        self,
        *,
        client: LandingAIDocumentClientProtocol | None = None,
        storage_service: Any | None = None,
        config: LandingAIDocumentConfig | None = None,
    ):
        self.config = config or _resolve_config()
        self.client = client or LandingAIDocumentHttpClient(self.config)
        self.storage_service = storage_service or get_r2_storage_service()

    def is_configured(self) -> bool:
        return bool(self.config.api_key and self.config.base_url)

    async def _resolve_source_url(
        self,
        *,
        content: bytes | None,
        source_url: str | None,
        mime_type: str,
        file_name: str,
        trace_id: str | None,
        session: Any | None,
        allow_temp_url: bool,
    ) -> tuple[str, str, bool]:
        normalized_source_url = str(source_url or "").strip() or None
        if _is_public_url(normalized_source_url):
            return normalized_source_url or "", "public_url", True

        if not allow_temp_url:
            raise DocumentProviderUnavailableError("Temporary public URL generation is disabled")

        if content is None:
            raise DocumentProviderUnavailableError("Private document inputs require raw bytes for temporary URL generation")

        extension = _infer_extension(file_name, mime_type)
        temp_key = f"{self.config.upload_folder.rstrip('/')}/{(trace_id or uuid.uuid4().hex)[:32]}/{uuid.uuid4().hex}{extension}"
        uploaded_url = await self.storage_service.upload_bytes(
            temp_key,
            content,
            mime_type,
            db_session=session,
        )
        if not _is_public_url(uploaded_url):
            raise DocumentProviderUnavailableError("Storage did not return a public URL for the document")
        return uploaded_url, "temporary_public_url", True

    async def _run_parse(
        self,
        *,
        content: bytes | None,
        mime_type: str,
        file_name: str,
        source_url: str | None,
        trace_id: str | None,
        session: Any | None,
        allow_temp_url: bool,
        extract_schema: dict[str, Any] | None,
        parse_model: str | None,
        extract_model: str | None,
    ) -> LandingAIDocumentResult:
        normalized_mime = _normalize_mime_type(mime_type)
        if not _allowed_document_mime_type(normalized_mime, file_name):
            raise UnsupportedDocumentError(f"Unsupported document MIME type: {mime_type}")

        if content is not None and _looks_like_encrypted_pdf(content, file_name, normalized_mime):
            raise UnsupportedDocumentError("Encrypted PDFs are not supported by ADE")

        if not self.is_configured():
            raise DocumentProviderUnavailableError("LandingAI ADE is not configured")

        resolved_url, source_url_kind, source_url_public = await self._resolve_source_url(
            content=content,
            source_url=source_url,
            mime_type=normalized_mime,
            file_name=file_name,
            trace_id=trace_id,
            session=session,
            allow_temp_url=allow_temp_url,
        )
        file_hash = _hash_bytes(content)

        try:
            parse_payload = await self.client.parse(
                document_url=resolved_url,
                file_name=file_name,
                mime_type=normalized_mime,
                model=parse_model or self.config.parse_model,
                trace_id=trace_id,
            )
        except DocumentSourceUrlExpiredError:
            if source_url_kind != "temporary_public_url" or content is None:
                raise
            logger.warning("landingai_ade_temp_url_expired_retrying", trace_id=trace_id, file_name=file_name)
            resolved_url, source_url_kind, source_url_public = await self._resolve_source_url(
                content=content,
                source_url=source_url,
                mime_type=normalized_mime,
                file_name=file_name,
                trace_id=trace_id,
                session=session,
                allow_temp_url=allow_temp_url,
            )
            parse_payload = await self.client.parse(
                document_url=resolved_url,
                file_name=file_name,
                mime_type=normalized_mime,
                model=parse_model or self.config.parse_model,
                trace_id=trace_id,
            )

        parse_payload = _extract_response_payload(parse_payload)
        if not isinstance(parse_payload, dict):
            raise DocumentProviderUnavailableError("ADE parse returned a malformed payload")

        markdown = str(parse_payload.get("markdown") or "").strip()
        metadata = parse_payload.get("metadata") if isinstance(parse_payload.get("metadata"), dict) else {}
        page_count = metadata.get("page_count")
        if isinstance(page_count, bool):
            page_count = None
        elif isinstance(page_count, (int, float)):
            page_count = int(page_count)
        else:
            page_count = None
        parse_status = "partial" if parse_payload.get("failed_pages") else "completed"
        provider_request_id = str(metadata.get("job_id") or metadata.get("request_id") or "").strip() or None
        model_version = str(metadata.get("version") or parse_model or self.config.parse_model or "").strip() or None
        warnings: list[str] = []
        failed_pages = metadata.get("failed_pages")
        if isinstance(failed_pages, list) and failed_pages:
            warnings.append(f"Failed pages: {failed_pages}")

        structured_json: dict[str, Any] | None = None
        if extract_schema is not None:
            try:
                extract_payload = await self.client.extract(
                    markdown=markdown,
                    schema=extract_schema,
                    model=extract_model or self.config.extract_model,
                    trace_id=trace_id,
                )
                extract_payload = _extract_response_payload(extract_payload)
                if isinstance(extract_payload, dict):
                    structured_json = extract_payload.get("extraction") if isinstance(extract_payload.get("extraction"), dict) else extract_payload
                else:
                    warnings.append("ADE extract returned a malformed payload")
            except DocumentAdapterError as exc:
                raise
            except Exception as exc:
                warnings.append(f"ADE extract failed: {exc}")

        ocr_text = ""
        if structured_json and isinstance(structured_json, dict):
            ocr_text = str(structured_json.get("ocrText") or "").strip()
        if not ocr_text:
            ocr_text = _markdown_to_text(markdown)

        result = LandingAIDocumentResult(
            provider="landingai_ade",
            model_version=model_version,
            source_url_kind=source_url_kind,
            source_url_public=resolved_url if source_url_public else "",
            markdown=markdown,
            ocr_text=ocr_text,
            structured_json=structured_json,
            page_count=page_count,
            warnings=warnings,
            trace_id=trace_id,
            provider_request_id=provider_request_id,
            parse_status=parse_status,
            mime_type=normalized_mime,
            file_hash=file_hash,
            markdown_hash=_hash_text(markdown),
            ocr_text_hash=_hash_text(ocr_text),
        )
        return result

    async def parse_document(
        self,
        *,
        content: bytes | None,
        mime_type: str,
        file_name: str,
        source_url: str | None = None,
        trace_id: str | None = None,
        session: Any | None = None,
        allow_temp_url: bool = True,
        parse_model: str | None = None,
    ) -> LandingAIDocumentResult:
        return await self._run_parse(
            content=content,
            mime_type=mime_type,
            file_name=file_name,
            source_url=source_url,
            trace_id=trace_id,
            session=session,
            allow_temp_url=allow_temp_url,
            extract_schema=None,
            parse_model=parse_model,
            extract_model=None,
        )

    async def parse_and_extract_document(
        self,
        *,
        content: bytes | None,
        mime_type: str,
        file_name: str,
        source_url: str | None = None,
        trace_id: str | None = None,
        session: Any | None = None,
        allow_temp_url: bool = True,
        extract_schema: dict[str, Any] | None = None,
        parse_model: str | None = None,
        extract_model: str | None = None,
    ) -> LandingAIDocumentResult:
        return await self._run_parse(
            content=content,
            mime_type=mime_type,
            file_name=file_name,
            source_url=source_url,
            trace_id=trace_id,
            session=session,
            allow_temp_url=allow_temp_url,
            extract_schema=extract_schema or DEFAULT_DOCUMENT_EXTRACTION_SCHEMA,
            parse_model=parse_model,
            extract_model=extract_model,
        )


def _infer_extension(file_name: str, mime_type: str) -> str:
    normalized = _normalize_mime_type(mime_type)
    if normalized == "application/pdf":
        return ".pdf"
    if normalized in {"image/jpeg", "image/jpg"}:
        return ".jpg"
    if normalized == "image/png":
        return ".png"
    if normalized == "image/webp":
        return ".webp"
    if normalized == "image/gif":
        return ".gif"
    if normalized == "image/heic":
        return ".heic"
    if normalized == "image/heif":
        return ".heif"
    suffix = os.path.splitext(file_name)[1].strip()
    return suffix or ".bin"


def get_landingai_ade_document_service() -> LandingAIDocumentService:
    global _service_singleton
    if _service_singleton is None:
        _service_singleton = LandingAIDocumentService()
    return _service_singleton

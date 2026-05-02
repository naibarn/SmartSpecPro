"""Internal library scope propagation API router.

Exposes endpoints for the Node.js backend to trigger scope recomputation
and vector store metadata propagation after permission changes:
  POST /api/internal/library/propagate-scopes  -- propagate scopes to vector stores
  POST /api/internal/library/reindex           -- trigger full library reindex
  GET  /api/internal/library/reindex/status    -- get reindex job status
"""

from __future__ import annotations

import asyncio
import base64
import io
import hashlib
import mimetypes
import os
import json
import ipaddress
import re
import shutil
import subprocess
import tempfile
import uuid
from datetime import datetime
import secrets
from urllib.parse import urljoin, urlparse
from typing import Optional, Any, Dict

import httpx
import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import verify_token
from app.core.config import settings
from app.core.database import get_db
from app.core.system_settings_loader import get_google_ai_api_key
from app.models.library import LibraryIndexJob
from app.models.user import User
from app.orchestrator.rag.scope_engine import propagate_scopes_to_vector_stores
from app.api.stt import _call_stt_provider
from app.services.media_pipeline import _ffprobe_metadata
from app.services.finance_ocr_debug_trace import write_finance_ocr_debug_event
from app.services.llm_gateway_client import LLMGatewayClient
from app.services.landingai_ade_document_service import (
    DEFAULT_DOCUMENT_EXTRACTION_SCHEMA,
    DocumentAdapterError,
    DocumentProviderUnavailableError,
    UnsupportedDocumentError,
    get_landingai_ade_document_service,
)
from app.services.typhoon_ocr_document_service import (
    TyphoonDocumentAdapterError,
    TyphoonDocumentProviderUnavailableError,
    TyphoonUnsupportedDocumentError,
    get_typhoon_ocr_document_service,
)
from app.services.r2_storage_service import get_r2_storage_service
from app.services.onedrive_content_extractor import OneDriveContentExtractor
from app.services.library_pgvector_service import search_library_pgvector_scores
from app.services.unified_payin_slip_parser_service import parse_and_summarize_payin_slip

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/internal/library", tags=["Internal Library"])
MAX_LIBRARY_SEARCH_QUERY_LENGTH = 2_000
MAX_LIBRARY_SEARCH_CANDIDATES = 1_000
MAX_MEDIA_ENRICH_BYTES = 50 * 1024 * 1024
MAX_PDF_OCR_PAGES = 3
REINDEX_TASK_ID_KEY = "vectordb:reindex:task_id"
REINDEX_BATCH_KEY = "vectordb:reindex:batch"
REINDEX_BATCH_TTL_SECONDS = 24 * 60 * 60
GOOGLE_AI_VISION_MODEL = "gemini-2.5-flash"
GOOGLE_AI_VISION_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GOOGLE_AI_VISION_MODEL}:generateContent"
VISION_PROMPT = """Analyze this media frame and return a JSON object with EXACTLY these fields:
{
  "shortCaption": "One sentence description (max 20 words)",
  "detailedCaption": "2-3 sentences with more detail",
  "ocrText": "Any text visible in the image, or empty string",
  "objects": ["list", "of", "visible", "objects"],
  "styles": ["design", "styles", "detected"],
  "materials": ["materials", "visible"],
  "colors": ["dominant", "colors"],
  "rooms": ["room", "types", "if", "interior"],
  "architectureTags": ["architectural", "features"],
  "safetyLabels": []
}
Return ONLY valid JSON, no markdown or explanation."""

PAYIN_SLIP_LLM_PROMPT = """Analyze this Thai transfer slip and return a JSON object with EXACTLY these fields:
{
  "shortCaption": "One short sentence naming the slip type",
  "detailedCaption": "2-3 sentences summarizing the slip",
  "ocrText": "Full transcription of every readable word, number, date, time, amount, bank name, person name, reference, and account hint visible in the slip",
  "objects": ["list", "of", "visible", "objects"],
  "styles": [],
  "materials": [],
  "colors": [],
  "rooms": [],
  "architectureTags": [],
  "safetyLabels": []
}
Rules:
- Treat the image as a payment slip or bank transfer slip first.
- The slip may be from a Thai bank, wallet app, or government payment app.
- Never infer the amount, date, time, reference, or merchant code from the filename, upload timestamp, QR payload metadata, or any non-visible metadata.
- Prefer values that are visibly printed on the slip itself, especially labels such as amount, fee, date, time, reference, merchant code, payer, and payee.
- If an amount or date is unclear, leave it empty rather than guessing from context.
- Common bank layouts may repeat the same content in headers, footers, QR areas, or receipt panels. Keep the reading order but avoid obvious duplicate blocks when a cleaner transcription is possible.
- If sender and receiver details are visible, preserve both sides separately in the transcription.
- If the slip is a self-transfer between the user's own accounts, keep both accounts distinct rather than collapsing them.
- Preserve bank names, masked account numbers, last 4 digits, reference IDs, merchant codes, merchant names, and transaction timestamps exactly as visible.
- Preserve Thai and English exactly as visible.
- Keep the reading order top-to-bottom, left-to-right.
- Do not summarize, translate, or omit readable text in ocrText.
- Keep duplicate text regions only when they improve legibility.
Return ONLY valid JSON, no markdown or explanation."""

PAYIN_SLIP_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
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
    "additionalProperties": False,
}

DOCUMENT_OCR_BASE_PROMPT = """You are a document transcription engine for finance uploads.
Return a JSON object with EXACTLY these fields:
{
  "shortCaption": "One short sentence naming the document type",
  "detailedCaption": "2-3 sentences summarizing the document",
  "ocrText": "Full transcription of every readable word, number, date, time, amount, bank name, person name, reference, and account hint visible in the document",
  "objects": ["list", "of", "visible", "objects"],
  "styles": [],
  "materials": [],
  "colors": [],
  "rooms": [],
  "architectureTags": [],
  "safetyLabels": []
}
Rules:
- Treat the image as a finance document first, not a scene photo.
- Preserve Thai and English exactly as visible.
- Keep the reading order top-to-bottom, left-to-right.
- Do not summarize, translate, or omit readable text in ocrText.
- If a value is partly obscured, include the readable portion exactly.
- If there are duplicate text regions, keep the most legible transcription.
Return ONLY valid JSON, no markdown or explanation."""


class RenderPdfRequest(BaseModel):
    html: str = Field(min_length=1, max_length=2_000_000)


def _require_localhost(request: Request, *, force: bool = False) -> None:
    if force or getattr(settings, "SMARTSPEC_LOCALHOST_ONLY", False):
        host = (request.client.host if request.client else "") or ""
        if host not in ("127.0.0.1", "::1", "localhost"):
            raise HTTPException(status_code=403, detail="Forbidden (localhost only)")


def _load_reindex_batch_metadata(redis_client) -> dict[str, Any] | None:
    raw_value = redis_client.get(REINDEX_BATCH_KEY)
    if not raw_value:
        return None
    if isinstance(raw_value, bytes):
        raw_value = raw_value.decode()
    try:
        parsed = json.loads(str(raw_value))
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _store_reindex_batch_metadata(redis_client, metadata: dict[str, Any]) -> None:
    redis_client.set(REINDEX_BATCH_KEY, json.dumps(metadata), ex=REINDEX_BATCH_TTL_SECONDS)


def _match_reindex_batch_metadata(
    batch_metadata: dict[str, Any] | None,
    *,
    task_id: str | None,
) -> dict[str, Any] | None:
    if not batch_metadata:
        return None
    metadata_task_id = str(batch_metadata.get("task_id") or "").strip()
    if metadata_task_id and task_id and metadata_task_id != task_id:
        return None
    return batch_metadata


def _coerce_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _merge_reindex_batch_outcome(
    batch_metadata: dict[str, Any] | None,
    task_result: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if not batch_metadata and not task_result:
        return None

    merged = dict(batch_metadata or {})
    if isinstance(task_result, dict):
        merged["expected_total_items"] = _coerce_int(task_result.get("total_items"))
        merged["expected_enqueued_jobs"] = _coerce_int(task_result.get("enqueued_jobs"))
        merged["enqueue_errors"] = _coerce_int(task_result.get("errors"))
    return merged


def _determine_reindex_status(
    *,
    queue_state: str,
    batch_summary: dict[str, Any] | None,
    batch_metadata: dict[str, Any] | None,
    task_result: dict[str, Any] | None,
) -> str:
    normalized_state = str(queue_state or "").upper()
    if normalized_state in ("PENDING", "STARTED", "RETRY"):
        return "running"
    if normalized_state == "FAILURE":
        return "failed"
    if normalized_state != "SUCCESS":
        return normalized_state.lower() if normalized_state else "idle"

    summary = batch_summary or {}
    metadata = _merge_reindex_batch_outcome(batch_metadata, task_result) or {}
    has_batch_tracking = bool(batch_metadata and "baseline_job_id" in batch_metadata)
    expected_enqueued_jobs = _coerce_int(metadata.get("expected_enqueued_jobs"))
    enqueue_errors = _coerce_int(metadata.get("enqueue_errors"))
    observed_total_jobs = _coerce_int(summary.get("total_jobs"))
    active_jobs = _coerce_int(summary.get("active_jobs"))
    failed_jobs = _coerce_int(summary.get("failed_jobs"))

    if not has_batch_tracking:
        return "completed_with_errors" if enqueue_errors > 0 else "completed"
    if expected_enqueued_jobs > 0 and observed_total_jobs < expected_enqueued_jobs:
        return "running"
    if active_jobs > 0:
        return "running"
    if failed_jobs > 0 or enqueue_errors > 0:
        return "completed_with_errors"
    return "completed"


async def _build_reindex_batch_summary(
    session: AsyncSession,
    batch_metadata: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if not batch_metadata or "baseline_job_id" not in batch_metadata:
        return None

    baseline_job_id = int(batch_metadata.get("baseline_job_id") or 0)
    tenant_id = batch_metadata.get("tenant_id")
    predicates = [
        LibraryIndexJob.job_type == "reindex",
        LibraryIndexJob.id > baseline_job_id,
    ]
    if tenant_id:
        predicates.append(LibraryIndexJob.tenant_id == str(tenant_id))

    rows = (
        await session.execute(
            select(LibraryIndexJob.status, func.count(LibraryIndexJob.id))
            .where(and_(*predicates))
            .group_by(LibraryIndexJob.status)
        )
    ).all()
    counts = {str(status): int(count or 0) for status, count in rows}
    pending_jobs = int(counts.get("pending", 0))
    retry_pending_jobs = int(counts.get("retry_pending", 0))
    processing_jobs = int(counts.get("processing", 0))
    completed_jobs = int(counts.get("completed", 0))
    failed_jobs = int(counts.get("failed", 0))

    return {
        "baseline_job_id": baseline_job_id,
        "requested_at": batch_metadata.get("requested_at"),
        "tenant_id": tenant_id,
        "total_jobs": int(sum(counts.values())),
        "pending_jobs": pending_jobs,
        "retry_pending_jobs": retry_pending_jobs,
        "processing_jobs": processing_jobs,
        "completed_jobs": completed_jobs,
        "failed_jobs": failed_jobs,
        "active_jobs": pending_jobs + retry_pending_jobs + processing_jobs,
    }


async def _verify_proxy_token(
    request: Request,
    x_proxy_token: Optional[str] = Header(None),
):
    """Verify the internal proxy token for Node.js -> Python calls."""
    _require_localhost(request)
    trace_id = _resolve_finance_ocr_trace_id(request, None)
    if not x_proxy_token:
        _trace_finance_ocr(
            "finance_ocr.internal_auth.reject",
            {
                "reason": "missing_proxy_token",
                "header_fingerprint": None,
            },
            trace_id=trace_id,
        )
        raise HTTPException(status_code=401, detail="Missing proxy token")
    proxy_token = str(getattr(settings, "SMARTSPEC_PROXY_TOKEN", "") or "").strip()
    web_gateway_token = str(getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "") or "").strip()
    expected_tokens = [token for token in (proxy_token, web_gateway_token) if token]
    if not expected_tokens:
        _trace_finance_ocr(
            "finance_ocr.internal_auth.reject",
            {
                "reason": "missing_expected_tokens",
                "header_fingerprint": _token_fingerprint(x_proxy_token),
            },
            trace_id=trace_id,
        )
        raise HTTPException(status_code=500, detail="SMARTSPEC_PROXY_TOKEN not configured")

    matched_source = None
    if proxy_token and secrets.compare_digest(x_proxy_token, proxy_token):
        matched_source = "SMARTSPEC_PROXY_TOKEN"
    elif web_gateway_token and secrets.compare_digest(x_proxy_token, web_gateway_token):
        matched_source = "SMARTSPEC_WEB_GATEWAY_TOKEN"

    _trace_finance_ocr(
        "finance_ocr.internal_auth.check",
        {
            "header_fingerprint": _token_fingerprint(x_proxy_token),
            "expected_proxy_fingerprint": _token_fingerprint(proxy_token),
            "expected_gateway_fingerprint": _token_fingerprint(web_gateway_token),
            "expected_token_count": len(expected_tokens),
            "matched_source": matched_source,
        },
        trace_id=trace_id,
    )

    if not matched_source:
        _trace_finance_ocr(
            "finance_ocr.internal_auth.reject",
            {
                "reason": "invalid_proxy_token",
                "header_fingerprint": _token_fingerprint(x_proxy_token),
                "expected_proxy_fingerprint": _token_fingerprint(proxy_token),
                "expected_gateway_fingerprint": _token_fingerprint(web_gateway_token),
            },
            trace_id=trace_id,
        )
        raise HTTPException(status_code=401, detail="Invalid proxy token")

    _trace_finance_ocr(
        "finance_ocr.internal_auth.accept",
        {
            "matched_source": matched_source,
            "header_fingerprint": _token_fingerprint(x_proxy_token),
        },
        trace_id=trace_id,
    )


@router.post("/render-pdf")
async def render_markdown_pdf_internal(
    payload: RenderPdfRequest,
    request: Request,
    x_proxy_token: Optional[str] = Header(None),
):
    """Render printable HTML to a PDF binary for the web library export flow."""
    _require_localhost(request)
    await _verify_proxy_token(request, x_proxy_token)

    from app.services.playwright_feature_gate import is_playwright_enabled

    if not is_playwright_enabled():
        raise HTTPException(status_code=503, detail="Playwright PDF rendering is disabled.")

    from playwright.async_api import async_playwright

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
        )
        try:
            page = await browser.new_page(viewport={"width": 1280, "height": 1600})
            await page.set_content(payload.html, wait_until="load")
            await page.emulate_media(media="print")
            pdf_bytes = await page.pdf(
                format="A4",
                print_background=True,
                margin={"top": "18mm", "right": "16mm", "bottom": "18mm", "left": "16mm"},
            )
        finally:
            await browser.close()

    return Response(content=pdf_bytes, media_type="application/pdf")


@router.post("/document-ocr/test-connection")
async def test_document_ocr_connection_internal(
    payload: DocumentOcrTestConnectionRequest,
    request: Request,
    x_proxy_token: Optional[str] = Header(None),
    x_typhoon_ocr_api_key: Optional[str] = Header(None),
    x_landingai_ade_api_key: Optional[str] = Header(None),
):
    """Run a lightweight OCR connection test against the configured provider."""
    _require_localhost(request)
    await _verify_proxy_token(request, x_proxy_token)

    provider_id = str(payload.provider_id or "").strip()
    start_time = datetime.utcnow()
    sample_image = _build_document_ocr_test_image()
    prompt = _build_document_ocr_prompt("receipt")

    try:
        if provider_id == "typhoon_ocr_1_5":
            result = await _call_typhoon_document_ocr(
                sample_image,
                "image/png",
                file_name="document-ocr-test.png",
                prompt=prompt,
                capture_intent="receipt",
                source_url=None,
                trace_id=None,
                session=None,
                api_key_override=(x_typhoon_ocr_api_key or "").strip() or None,
            )
            analysis, provider_name, warnings = result
        elif provider_id == "landingai_ade":
            result = await _call_landingai_ade_document_ocr(
                sample_image,
                "image/png",
                file_name="document-ocr-test.png",
                prompt=prompt,
                capture_intent="receipt",
                source_url=None,
                trace_id=None,
                session=None,
                api_key_override=(x_landingai_ade_api_key or "").strip() or None,
            )
            analysis, provider_name, warnings = result
        elif provider_id == "google_ai_vision":
            result = await _call_google_ai_document_ocr(
                sample_image,
                "image/png",
                file_name="document-ocr-test.png",
                prompt=prompt,
                capture_intent="receipt",
                source_url=None,
                trace_id=None,
                session=None,
                api_key_override=(payload.api_key or "").strip() or None,
            )
            analysis, provider_name, warnings = result
        else:
            return DocumentOcrTestConnectionResponse(
                success=False,
                provider_id=provider_id,
                message="Unsupported OCR provider",
            )
    except (TyphoonDocumentAdapterError, DocumentAdapterError, DocumentProviderUnavailableError) as exc:
        return DocumentOcrTestConnectionResponse(
            success=False,
            provider_id=provider_id,
            message=str(exc),
        )
    except Exception as exc:
        return DocumentOcrTestConnectionResponse(
            success=False,
            provider_id=provider_id,
            message=f"Document OCR test failed: {exc}",
        )

    elapsed_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
    text = str(analysis.get("ocrText") or "").strip()
    rate_limit_notice = None
    if provider_id == "typhoon_ocr_1_5":
        rate_limit_notice = "Typhoon OCR is capped at 20 requests per minute system-wide."
    return DocumentOcrTestConnectionResponse(
        success=bool(text),
        provider_id=provider_name,
        message="Connection successful" if text else "OCR returned empty text",
        ocr_text=text or None,
        model_version=str((analysis.get("metadata") or {}).get("model_version") or "") or None,
        elapsed_ms=elapsed_ms,
        rate_limit_notice=rate_limit_notice,
    )


async def _verify_reindex_auth(
    request: Request,
    x_proxy_token: Optional[str] = Header(None),
    x_reindex_token: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
    session: AsyncSession = Depends(get_db),
):
    """
    Verify auth for reindex internal endpoints.

    Accept either:
    1) x-proxy-token (server-to-server), or
    2) Authorization: Bearer <access-token> of an active admin user.
    """
    _require_localhost(
        request,
        force=bool(getattr(settings, "SMARTSPEC_REINDEX_LOCALHOST_ONLY", True)),
    )
    proxy_token = getattr(settings, "SMARTSPEC_PROXY_TOKEN", None)
    reindex_token = getattr(settings, "SMARTSPEC_INTERNAL_REINDEX_TOKEN", None)
    if reindex_token:
        if x_reindex_token and secrets.compare_digest(x_reindex_token, reindex_token):
            return
    elif x_proxy_token and proxy_token and secrets.compare_digest(x_proxy_token, proxy_token):
        return

    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        payload = verify_token(token, expected_type="access")
        if payload:
            user_id = payload.get("sub") or payload.get("user_id")
            try:
                user_id_int = int(user_id)
            except (TypeError, ValueError):
                user_id_int = None
            if user_id_int is not None:
                result = await session.execute(select(User).where(User.id == user_id_int))
                user = result.scalar_one_or_none()
                if user and user.is_active and user.is_admin:
                    return

    raise HTTPException(status_code=401, detail="Missing or invalid internal credentials")


class PropagateScopesRequest(BaseModel):
    item_id: int
    tenant_id: str
    new_allowed_scopes: list[str]


class PropagateScopesResponse(BaseModel):
    success: bool
    providers_updated: dict[str, int]


class ReindexResponse(BaseModel):
    task_id: str
    status: str
    message: str


class ReindexStatusResponse(BaseModel):
    task_id: Optional[str]
    status: str
    result: Optional[Dict[str, Any]]


class LibrarySearchRequest(BaseModel):
    tenant_id: str = Field(..., min_length=1, max_length=128)
    query: str = Field(..., min_length=1, max_length=MAX_LIBRARY_SEARCH_QUERY_LENGTH)
    candidate_item_ids: list[int] = Field(
        ...,
        min_length=1,
        max_length=MAX_LIBRARY_SEARCH_CANDIDATES,
    )

    @field_validator("query")
    @classmethod
    def validate_query(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("query must not be blank")
        return normalized

    @field_validator("candidate_item_ids")
    @classmethod
    def validate_candidate_item_ids(cls, value: list[int]) -> list[int]:
        normalized: list[int] = []
        seen: set[int] = set()
        for item_id in value:
            if item_id <= 0:
                raise ValueError("candidate_item_ids must contain only positive integers")
            if item_id in seen:
                continue
            seen.add(item_id)
            normalized.append(item_id)
        if not normalized:
            raise ValueError("candidate_item_ids must not be empty")
        return normalized


class LibrarySearchResult(BaseModel):
    item_id: int
    vector_score: float


class LibrarySearchResponse(BaseModel):
    success: bool
    results: list[LibrarySearchResult]


class LibraryExtractTextRequest(BaseModel):
    file_name: str = Field(..., min_length=1, max_length=255)
    mime_type: str = Field(..., min_length=1, max_length=255)
    content_base64: str = Field(..., min_length=1)
    ocr_provider: Optional[str] = Field(default=None, max_length=64)
    source_url: Optional[str] = Field(default=None, max_length=2048)
    analysis_profile: Optional[str] = Field(default=None, max_length=64)
    capture_intent: Optional[str] = Field(default=None, max_length=64)
    trace_id: Optional[str] = Field(default=None, max_length=128)


class LibraryExtractTextResponse(BaseModel):
    success: bool
    text: str
    char_count: int
    method: str
    warning: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class LibraryMediaEnrichmentRequest(BaseModel):
    file_name: str = Field(..., min_length=1, max_length=255)
    mime_type: str = Field(..., min_length=1, max_length=255)
    content_base64: str = Field(..., min_length=1)
    ocr_provider: Optional[str] = Field(default=None, max_length=64)
    source_url: Optional[str] = Field(default=None, max_length=2048)
    analysis_profile: Optional[str] = Field(default=None, max_length=64)
    capture_intent: Optional[str] = Field(default=None, max_length=64)
    enable_vision: bool = False
    enable_transcript: bool = False
    trace_id: Optional[str] = Field(default=None, max_length=128)


class LibraryMediaEnrichmentResponse(BaseModel):
    success: bool
    text: str
    char_count: int
    method: str
    search_quality: str
    caption: Optional[str] = None
    transcript: Optional[str] = None
    warning: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class DocumentOcrTestConnectionRequest(BaseModel):
    provider_id: str = Field(..., min_length=1, max_length=64)
    api_key: Optional[str] = Field(default=None, max_length=8192)


class DocumentOcrTestConnectionResponse(BaseModel):
    success: bool
    provider_id: str
    message: str
    ocr_text: Optional[str] = None
    model_version: Optional[str] = None
    elapsed_ms: Optional[int] = None
    rate_limit_notice: Optional[str] = None


def _decode_base64_content(encoded: str) -> bytes:
    try:
        content = base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 content") from exc
    if len(content) > MAX_MEDIA_ENRICH_BYTES:
        raise HTTPException(status_code=413, detail="Media payload exceeds upload enrichment limit")
    return content


def _build_document_ocr_test_image() -> bytes:
    from PIL import Image, ImageDraw, ImageFont

    image = Image.new("RGB", (1600, 900), color="white")
    draw = ImageDraw.Draw(image)

    font_candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    font = None
    for candidate in font_candidates:
        try:
            font = ImageFont.truetype(candidate, 64)
            break
        except Exception:
            continue
    if font is None:
        font = ImageFont.load_default()

    lines = [
        "OCR TEST",
        "12345",
        "Typhoon LandingAI",
    ]
    y = 120
    for line in lines:
        draw.text((120, y), line, fill="black", font=font)
        y += 140

    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _normalize_source_url(value: str | None) -> str | None:
    candidate = str(value or "").strip()
    if not candidate:
        return None
    if candidate.startswith(("http://", "https://")):
        return candidate
    base_url = (
        str(getattr(settings, "SITE_URL", "") or "").strip()
        or str(getattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "") or "").strip()
        or "http://localhost:3000"
    )
    return urljoin(base_url.rstrip("/") + "/", candidate.lstrip("/"))


def _is_public_source_url(value: str | None) -> bool:
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

    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        return True

    if (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_reserved
        or address.is_multicast
    ):
        return False

    return True


def _redact_source_url_host(value: str | None) -> str | None:
    candidate = str(value or "").strip()
    if not candidate:
        return None

    try:
        parsed = urlparse(candidate)
    except Exception:
        return None

    hostname = str(parsed.hostname or "").strip().lower()
    if not hostname:
        return None

    if hostname in {"localhost", "0.0.0.0", "127.0.0.1", "::1"}:
        return "localhost"
    if hostname.endswith(".localhost") or hostname.endswith(".local"):
        return hostname

    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        labels = [label for label in hostname.split(".") if label]
        if not labels:
            return None
        if len(labels) <= 2:
            return hostname
        first_label = labels[0]
        first_label_redacted = f"{first_label[:3]}…" if len(first_label) > 3 else f"{first_label}…"
        return ".".join([first_label_redacted, *labels[1:]])

    if address.is_private or address.is_loopback or address.is_link_local:
        return "private-ip"
    if address.is_reserved or address.is_multicast:
        return "special-ip"
    return str(address)


def _mime_type_to_extension(mime_type: str) -> str:
    normalized = (mime_type or "").split(";", 1)[0].strip().lower()
    if normalized in {"image/jpeg", "image/jpg"}:
        return ".jpg"
    if normalized == "image/png":
        return ".png"
    if normalized == "image/webp":
        return ".webp"
    if normalized == "image/gif":
        return ".gif"
    if normalized == "application/pdf":
        return ".pdf"
    guessed = mimetypes.guess_extension(normalized)
    return guessed or ""


async def _resolve_gateway_image_url(
    content: bytes,
    mime_type: str,
    *,
    source_url: str | None,
    force_inline: bool = False,
    trace_id: str | None = None,
    session: AsyncSession | None = None,
) -> tuple[str, str, bool]:
    resolved_source_url = _normalize_source_url(source_url)
    if force_inline:
        image_data_url = f"data:{mime_type};base64,{base64.b64encode(content).decode('ascii')}"
        return image_data_url, "data_url", False
    if _is_public_source_url(resolved_source_url):
        return resolved_source_url or "", "absolute_url", True

    try:
        r2_service = get_r2_storage_service()
        temp_key = "temp/finance-ocr/{trace}/{file}{ext}".format(
            trace=(trace_id or uuid.uuid4().hex).replace("/", "_"),
            file=uuid.uuid4().hex,
            ext=_mime_type_to_extension(mime_type),
        )
        public_url = await r2_service.upload_bytes(
            temp_key,
            content,
            content_type=mime_type,
            db_session=session,
        )
        if _is_public_source_url(public_url):
            return public_url, "r2_temp_url", True
    except Exception as exc:
        _trace_finance_ocr(
            "finance_ocr.gateway.temp_url_failed",
            {
                "mime_type": mime_type,
                "source_url_present": bool(resolved_source_url),
                "source_url_public": _is_public_source_url(resolved_source_url),
                "source_url_host_redacted": _redact_source_url_host(resolved_source_url),
                "error": str(exc)[:240],
            },
            trace_id=trace_id,
        )

    if resolved_source_url and _is_public_source_url(resolved_source_url):
        return resolved_source_url, "absolute_url", True

    image_data_url = f"data:{mime_type};base64,{base64.b64encode(content).decode('ascii')}"
    return image_data_url, "data_url", False


def _build_media_search_text(
    analysis: dict[str, Any] | None,
    transcript: str | None,
    media_metadata: dict[str, Any] | None,
) -> str:
    parts: list[str] = []
    if analysis:
        for key in ("shortCaption", "detailedCaption", "ocrText"):
            value = str(analysis.get(key) or "").strip()
            if value:
                parts.append(value)
        for key in ("objects", "styles", "materials", "colors", "architectureTags"):
            value = analysis.get(key)
            if isinstance(value, list):
                normalized = [str(item).strip() for item in value if str(item).strip()]
                if normalized:
                    parts.append(f"{key}: {', '.join(normalized)}")
    if transcript:
        parts.append(transcript.strip())
    if media_metadata:
        summary_bits = []
        for key in ("duration_seconds", "format", "codec", "width", "height"):
            value = media_metadata.get(key)
            if value is not None:
                summary_bits.append(f"{key}={value}")
        if summary_bits:
            parts.append("media_metadata: " + ", ".join(summary_bits))
    return "\n\n".join(part for part in parts if part).strip()


def _normalize_analysis_profile(value: str | None) -> str:
    return str(value or "").strip().lower()


def _normalize_capture_intent(value: str | None) -> str | None:
    normalized = str(value or "").strip().lower()
    if normalized in {"receipt", "transfer_slip", "statement"}:
        return normalized
    return None


def _resolve_finance_ocr_trace_id(
    request: Request | None = None,
    explicit_trace_id: str | None = None,
) -> str:
    candidate = str(explicit_trace_id or "").strip()
    if not candidate and request is not None:
        candidate = str(
            request.headers.get("x-trace-id")
            or request.headers.get("x-request-id")
            or "",
        ).strip()
    if candidate:
        sanitized = re.sub(r"[^A-Za-z0-9._:-]+", "", candidate)
        if sanitized:
            return sanitized[:128]
    return uuid.uuid4().hex[:16]


def _token_fingerprint(value: str | None) -> str | None:
    token = str(value or "").strip()
    if not token:
        return None
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:12]


def _trace_finance_ocr(
    event: str,
    payload: dict[str, Any],
    *,
    trace_id: str | None = None,
) -> None:
    write_finance_ocr_debug_event(
        event,
        {
            "trace_id": trace_id or "unknown",
            **payload,
        },
    )


def _build_document_ocr_prompt(capture_intent: str | None = None) -> str:
    prompt = DOCUMENT_OCR_BASE_PROMPT
    if capture_intent == "transfer_slip":
        prompt += (
            "\nThis document is a transfer slip. Prioritize sender, receiver, bank name, "
            "account nickname, masked account number, reference number, amount, fee, and timestamp."
        )
    elif capture_intent == "statement":
        prompt += (
            "\nThis document is a bank statement. Prioritize account holder, bank name, "
            "statement period, opening balance, closing balance, and transaction rows."
        )
    else:
        prompt += (
            "\nThis document is a receipt or invoice. Prioritize merchant name, total, VAT, "
            "subtotal, payment method, and purchase date/time."
        )
    return prompt


def _should_use_landingai_ade_document_path(
    *,
    mime_type: str,
    prompt: str,
    capture_intent: str | None = None,
) -> bool:
    normalized_mime = mime_type.lower().split(";", 1)[0].strip()
    normalized_prompt = prompt.lower()
    return bool(
        capture_intent
        or "document transcription engine" in normalized_prompt
        or normalized_mime == "application/pdf"
    )


def _normalize_document_ocr_provider_id(provider_id: str | None) -> str:
    normalized = str(provider_id or "").strip().lower().replace("-", "_")
    if normalized in {"legacy", "landingai_ade", "typhoon_ocr_1_5", "google_ai_vision"}:
        return normalized
    if normalized in {"landing_ai_ade", "landingai", "ade"}:
        return "landingai_ade"
    if normalized in {"typhoon_ocr", "typhoonocr", "typhoonocr15"}:
        return "typhoon_ocr_1_5"
    if normalized in {"googleaivision", "google_ai", "google_vision", "gemini_vision", "gemini_ocr", "geminiocr"}:
        return "google_ai_vision"
    return ""


def _extract_gemini_content_text(response: dict[str, Any]) -> str:
    candidates = response.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return ""

    first_candidate = candidates[0] if isinstance(candidates[0], dict) else {}
    content = first_candidate.get("content") if isinstance(first_candidate, dict) else None
    parts = content.get("parts") if isinstance(content, dict) else None
    if not isinstance(parts, list):
        return ""

    texts: list[str] = []
    for part in parts:
        if not isinstance(part, dict):
            continue
        text = part.get("text")
        if isinstance(text, str) and text.strip():
            texts.append(text.strip())
    return "\n".join(texts).strip()


async def _call_google_ai_document_ocr(
    content: bytes,
    mime_type: str,
    *,
    file_name: str,
    prompt: str,
    capture_intent: str | None = None,
    source_url: str | None = None,
    trace_id: str | None = None,
    session: AsyncSession | None = None,
    api_key_override: str | None = None,
) -> tuple[dict[str, Any], str, list[str]]:
    api_key = (api_key_override or "").strip()
    if not api_key:
        api_key = (await get_google_ai_api_key(session) or "").strip()
    if not api_key:
        raise DocumentProviderUnavailableError("Google AI OCR is not configured")

    _trace_finance_ocr(
        "finance_ocr.document_ocr.google_start",
        {
            "file_name": file_name,
            "mime_type": mime_type,
            "content_bytes": len(content),
            "capture_intent": capture_intent,
            "source_url_present": bool(_normalize_source_url(source_url)),
            "source_url_host_redacted": _redact_source_url_host(_normalize_source_url(source_url)),
        },
        trace_id=trace_id,
    )

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inlineData": {
                            "mimeType": mime_type,
                            "data": base64.b64encode(content).decode("ascii"),
                        }
                    },
                ]
            }
        ],
        "generationConfig": {
            "response_mime_type": "application/json",
            "temperature": 0.0,
        },
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
        response = await client.post(
            GOOGLE_AI_VISION_URL,
            params={"key": api_key},
            json=payload,
        )

    if response.status_code != 200:
        raise DocumentAdapterError(
            f"Google AI OCR error ({response.status_code}): {response.text[:240]}"
        )

    try:
        data = response.json()
    except Exception as exc:
        raise DocumentAdapterError("Google AI OCR returned invalid JSON") from exc
    text = _extract_gemini_content_text(data)
    analysis = _parse_json_object_text(text)
    if not analysis:
        raise DocumentAdapterError("Google AI OCR returned non-JSON content")

    metadata = analysis.get("metadata")
    if isinstance(metadata, dict):
        metadata.setdefault("model_version", GOOGLE_AI_VISION_MODEL)
    else:
        analysis["metadata"] = {"model_version": GOOGLE_AI_VISION_MODEL}

    warnings: list[str] = []
    _trace_finance_ocr(
        "finance_ocr.document_ocr.google_success",
        {
            "file_name": file_name,
            "mime_type": mime_type,
            "warning_count": len(warnings),
            "capture_intent": capture_intent,
        },
        trace_id=trace_id,
    )
    return analysis, "google_ai_vision", warnings


async def _call_landingai_ade_document_ocr(
    content: bytes,
    mime_type: str,
    *,
    file_name: str,
    prompt: str,
    capture_intent: str | None = None,
    source_url: str | None = None,
    trace_id: str | None = None,
    session: AsyncSession | None = None,
    api_key_override: str | None = None,
) -> tuple[dict[str, Any], str, list[str]]:
    service = get_landingai_ade_document_service(api_key_override=api_key_override)
    if not service.is_configured():
        raise DocumentProviderUnavailableError("LandingAI ADE is not configured")

    if not _should_use_landingai_ade_document_path(
        mime_type=mime_type,
        prompt=prompt,
        capture_intent=capture_intent,
    ):
        raise UnsupportedDocumentError("LandingAI ADE is not the active path for this media")

    result = await service.parse_and_extract_document(
        content=content,
        mime_type=mime_type,
        file_name=file_name,
        prompt=prompt,
        capture_intent=capture_intent,
        source_url=source_url,
        trace_id=trace_id,
        session=session,
        allow_temp_url=True,
        extract_schema=DEFAULT_DOCUMENT_EXTRACTION_SCHEMA,
    )
    analysis = result.to_legacy_analysis()
    warnings = list(result.warnings)
    _trace_finance_ocr(
        "finance_ocr.document_ocr.landingai_ade_success",
        {
            "file_name": file_name,
            "mime_type": mime_type,
            "source_url_kind": result.source_url_kind,
            "source_url_public": bool(result.source_url_public),
            "provider_request_id": result.provider_request_id,
            "page_count": result.page_count,
            "warning_count": len(warnings),
        },
        trace_id=trace_id,
    )
    return analysis, "landingai_ade", warnings


async def _call_typhoon_document_ocr(
    content: bytes,
    mime_type: str,
    *,
    file_name: str,
    prompt: str,
    capture_intent: str | None = None,
    source_url: str | None = None,
    trace_id: str | None = None,
    session: AsyncSession | None = None,
    api_key_override: str | None = None,
) -> tuple[dict[str, Any], str, list[str]]:
    service = get_typhoon_ocr_document_service(api_key_override=api_key_override)
    if not service.is_configured():
        raise TyphoonDocumentProviderUnavailableError("Typhoon OCR is not configured")

    result = await service.parse_and_extract_document(
        content=content,
        mime_type=mime_type,
        file_name=file_name,
        source_url=source_url,
        trace_id=trace_id,
        session=session,
        allow_temp_url=True,
        extract_schema=DEFAULT_DOCUMENT_EXTRACTION_SCHEMA,
    )
    analysis = result.to_legacy_analysis()
    warnings = list(result.warnings)
    _trace_finance_ocr(
        "finance_ocr.document_ocr.typhoon_success",
        {
            "file_name": file_name,
            "mime_type": mime_type,
            "source_url_kind": result.source_url_kind,
            "source_url_public": bool(result.source_url_public),
            "provider_request_id": result.provider_request_id,
            "page_count": result.page_count,
            "warning_count": len(warnings),
            "capture_intent": capture_intent,
        },
        trace_id=trace_id,
    )
    return analysis, "typhoon_ocr_1_5", warnings


def _extract_chat_completion_text(response: dict[str, Any]) -> str:
    choices = response.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""

    first_choice = choices[0] if isinstance(choices[0], dict) else {}
    if not isinstance(first_choice, dict):
        return ""

    message = first_choice.get("message")
    if not isinstance(message, dict):
        return ""

    content = message.get("content")
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if not isinstance(item, dict):
                continue
            text = item.get("text")
            if isinstance(text, str) and text.strip():
                parts.append(text.strip())
        return "\n".join(parts).strip()

    if isinstance(content, dict):
        text = content.get("text")
        if isinstance(text, str):
            return text.strip()

    reasoning = message.get("reasoning")
    if isinstance(reasoning, str):
        return reasoning.strip()

    return ""


def _extract_responses_output_text(response: dict[str, Any]) -> str:
    direct_text = response.get("output_text")
    if isinstance(direct_text, str) and direct_text.strip():
        return direct_text.strip()

    nested_response = response.get("response")
    if isinstance(nested_response, dict):
        nested_output_text = nested_response.get("output_text")
        if isinstance(nested_output_text, str) and nested_output_text.strip():
            return nested_output_text.strip()

    output = response.get("output")
    if not isinstance(output, list):
        output = nested_response.get("output") if isinstance(nested_response, dict) else None

    if not isinstance(output, list):
        return ""

    parts: list[str] = []
    for item in output:
        if not isinstance(item, dict):
          continue

        if item.get("type") == "message" and isinstance(item.get("content"), list):
            for part in item["content"]:
                if not isinstance(part, dict):
                    continue
                text = part.get("text")
                if isinstance(text, str) and text.strip():
                    parts.append(text.strip())
            continue

        if item.get("type") == "output_text" and isinstance(item.get("text"), str):
            text = item["text"].strip()
            if text:
                parts.append(text)

    return "\n".join(parts).strip()


def _extract_llm_response_text(response: dict[str, Any]) -> str:
    responses_text = _extract_responses_output_text(response)
    if responses_text:
        return responses_text
    return _extract_chat_completion_text(response)


def _parse_json_object_text(text: str) -> dict[str, Any] | None:
    candidate = text.strip()
    if not candidate:
        return None

    if candidate.startswith("```"):
        candidate = re.sub(r"^```(?:json)?\s*", "", candidate, flags=re.IGNORECASE)
        candidate = re.sub(r"\s*```$", "", candidate)

    try:
        parsed = json.loads(candidate)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass

    start = candidate.find("{")
    end = candidate.rfind("}")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(candidate[start : end + 1])
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return None
    return None


async def _call_gateway_multimodal_vision_bytes(
    content: bytes,
    mime_type: str,
    *,
    prompt: str,
    temperature: float,
    source_url: str | None = None,
    response_schema: dict[str, Any] | None = None,
    response_schema_name: str | None = None,
    chat_model_id: str | None = None,
    force_inline_image: bool = False,
    tenant_id: str | None = None,
    trace_id: str | None = None,
    session: AsyncSession | None = None,
) -> dict[str, Any]:
    resolved_source_url = _normalize_source_url(source_url)
    resolved_source_url_public = _is_public_source_url(resolved_source_url)
    _trace_finance_ocr(
        "finance_ocr.gateway.start",
        {
            "mime_type": mime_type,
            "content_bytes": len(content),
            "temperature": temperature,
            "prompt_kind": "document_ocr" if "document transcription engine" in prompt.lower() else "vision",
            "web_gateway_enabled": bool(settings.SMARTSPEC_USE_WEB_GATEWAY),
            "source_url_present": bool(resolved_source_url),
            "source_url_public": resolved_source_url_public,
            "source_url_host_redacted": _redact_source_url_host(resolved_source_url),
            "request_shape": "responses",
        },
        trace_id=trace_id,
    )

    if not settings.SMARTSPEC_USE_WEB_GATEWAY:
        raise RuntimeError("SmartSpec web gateway OCR fallback is disabled")

    gateway_url = (settings.SMARTSPEC_WEB_GATEWAY_URL or "").strip()
    gateway_token = (settings.SMARTSPEC_WEB_GATEWAY_TOKEN or "").strip()
    if not gateway_url or not gateway_token:
        raise RuntimeError("SmartSpec web gateway OCR fallback is not configured")

    resolved_image_url, resolved_image_url_kind, resolved_image_url_public = await _resolve_gateway_image_url(
        content,
        mime_type,
        source_url=resolved_source_url,
        force_inline=force_inline_image,
        trace_id=trace_id,
        session=session,
    )
    gateway = LLMGatewayClient()
    responses_input = [
        {
            "role": "user",
            "content": [
                {"type": "input_text", "text": prompt},
                {
                    "type": "input_image",
                    "image_url": resolved_image_url,
                },
            ],
        }
    ]
    responses_extra_body = {
        "modelSelection": {"mode": "auto-global"},
        "modelSelectionContext": {
            "featureModes": ["photo_search", "structured_output", "responses"],
        },
    }
    chat_messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": resolved_image_url}},
            ],
        }
    ]
    chat_response_format = None
    if response_schema is not None:
        chat_response_format = {
            "type": "json_schema",
            "json_schema": {
                "name": response_schema_name or "finance_transfer_slip_ocr",
                "schema": response_schema,
                "strict": True,
            },
        }

    try:
        if chat_response_format is not None:
            model_id = chat_model_id or "__auto"
            _trace_finance_ocr(
                "finance_ocr.gateway.request",
                {
                    "mime_type": mime_type,
                    "request_shape": "chat",
                    "feature_modes": ["photo_search", "structured_output", "chat_completions"],
                    "content_bytes": len(content),
                    "source_url_present": bool(resolved_source_url),
                    "source_url_public": resolved_source_url_public,
                    "source_url_host_redacted": _redact_source_url_host(resolved_source_url),
                    "source_url_kind": resolved_image_url_kind,
                    "resolved_image_url_public": resolved_image_url_public,
                    "resolved_image_url_host_redacted": _redact_source_url_host(resolved_image_url),
                    "model": model_id,
                    "response_format": "json_schema",
                },
                trace_id=trace_id,
            )
            response = await gateway.chat_completion(
                messages=chat_messages,
                model=model_id,
                tenant_id=tenant_id,
                response_format=chat_response_format,
                temperature=temperature,
                trace_id=trace_id,
                timeout=90,
            )
            text = _extract_chat_completion_text(response)
        else:
            _trace_finance_ocr(
                "finance_ocr.gateway.request",
                {
                    "mime_type": mime_type,
                    "request_shape": "responses",
                    "feature_modes": ["photo_search", "structured_output", "responses"],
                    "content_bytes": len(content),
                    "source_url_present": bool(resolved_source_url),
                    "source_url_public": resolved_source_url_public,
                    "source_url_host_redacted": _redact_source_url_host(resolved_source_url),
                    "source_url_kind": resolved_image_url_kind,
                    "resolved_image_url_public": resolved_image_url_public,
                    "resolved_image_url_host_redacted": _redact_source_url_host(resolved_image_url),
                    "model": "__auto",
                    "extra_body_keys": sorted(list(responses_extra_body.keys())),
                },
                trace_id=trace_id,
            )
            response = await gateway.responses_completion(
                input=responses_input,
                model="__auto",
                tenant_id=tenant_id,
                reasoning={"effort": "high"},
                max_output_tokens=4096,
                extra_body=responses_extra_body,
                trace_id=trace_id,
                timeout=90,
            )
            text = _extract_llm_response_text(response)
        if not isinstance(response, dict):
            raise RuntimeError("Gateway OCR returned an invalid response")

        analysis = _parse_json_object_text(text)
        if analysis:
            _trace_finance_ocr(
                "finance_ocr.gateway.success",
                {
                "mime_type": mime_type,
                "analysis_keys": sorted(list(analysis.keys()))[:20],
                "ocr_text_length": len(str(analysis.get("ocrText") or "").strip()),
                "request_shape": "responses",
                "source_url_public": resolved_source_url_public,
                "source_url_host_redacted": _redact_source_url_host(resolved_source_url),
                "resolved_image_url_kind": resolved_image_url_kind,
                "resolved_image_url_public": resolved_image_url_public,
            },
            trace_id=trace_id,
        )
            return analysis

        error = RuntimeError("Gateway OCR returned non-JSON content")
        _trace_finance_ocr(
            "finance_ocr.gateway.empty_response",
            {
                "mime_type": mime_type,
                "request_shape": "responses",
                "response_text_length": len(text),
                "source_url_public": resolved_source_url_public,
                "source_url_host_redacted": _redact_source_url_host(resolved_source_url),
            },
            trace_id=trace_id,
        )
        raise error
    except Exception as exc:
        _trace_finance_ocr(
            "finance_ocr.gateway.error",
            {
                "mime_type": mime_type,
                "request_shape": "responses",
                "error": str(exc)[:240],
            },
            trace_id=trace_id,
        )
        raise


async def _call_document_ocr_with_fallback(
    content: bytes,
    mime_type: str,
    *,
    file_name: str,
    prompt: str,
    temperature: float,
    capture_intent: str | None = None,
    source_url: str | None = None,
    tenant_id: str | None = None,
    trace_id: str | None = None,
    session: AsyncSession | None = None,
    typhoon_api_key_override: str | None = None,
    landingai_api_key_override: str | None = None,
) -> tuple[dict[str, Any], str, list[str]]:
    warnings: list[str] = []
    gateway_analysis: dict[str, Any] | None = None
    gateway_search_text = ""
    gateway_only = bool(capture_intent)
    _trace_finance_ocr(
        "finance_ocr.document_ocr.start",
        {
            "mime_type": mime_type,
            "content_bytes": len(content),
            "temperature": temperature,
            "has_web_gateway": bool(
                settings.SMARTSPEC_USE_WEB_GATEWAY
                and (settings.SMARTSPEC_WEB_GATEWAY_URL or "").strip()
                and (settings.SMARTSPEC_WEB_GATEWAY_TOKEN or "").strip()
            ),
            "gateway_only": gateway_only,
            "source_url_present": bool(_normalize_source_url(source_url)),
            "source_url_host_redacted": _redact_source_url_host(_normalize_source_url(source_url)),
        },
        trace_id=trace_id,
    )

    if typhoon_api_key_override:
        try:
            typhoon_analysis, typhoon_provider, typhoon_warnings = await _call_typhoon_document_ocr(
                content,
                mime_type,
                file_name=file_name,
                prompt=prompt,
                capture_intent=capture_intent,
                source_url=source_url,
                trace_id=trace_id,
                session=session,
                api_key_override=typhoon_api_key_override,
            )
            typhoon_text = str(typhoon_analysis.get("ocrText") or "").strip()
            if typhoon_text or _build_media_search_text(typhoon_analysis, None, None).strip():
                warnings.extend(typhoon_warnings)
                return typhoon_analysis, typhoon_provider, warnings

            warnings.extend(typhoon_warnings)
            warnings.append("Typhoon OCR returned empty OCR text")
            _trace_finance_ocr(
                "finance_ocr.document_ocr.typhoon_empty",
                {
                    "mime_type": mime_type,
                    "warning_count": len(warnings),
                },
                trace_id=trace_id,
            )
        except (TyphoonUnsupportedDocumentError, TyphoonDocumentProviderUnavailableError, TyphoonDocumentAdapterError) as exc:
            warnings.append(str(exc))
            _trace_finance_ocr(
                "finance_ocr.document_ocr.typhoon_failed",
                {
                    "mime_type": mime_type,
                    "error": str(exc)[:240],
                },
                trace_id=trace_id,
            )

    if _should_use_landingai_ade_document_path(
        mime_type=mime_type,
        prompt=prompt,
        capture_intent=capture_intent,
    ):
        try:
            ade_analysis, ade_provider, ade_warnings = await _call_landingai_ade_document_ocr(
                content,
                mime_type,
                file_name=file_name,
                prompt=prompt,
                capture_intent=capture_intent,
                source_url=source_url,
                trace_id=trace_id,
                session=session,
                api_key_override=landingai_api_key_override,
            )
            ade_ocr_text = str(ade_analysis.get("ocrText") or "").strip()
            if ade_ocr_text or _build_media_search_text(ade_analysis, None, None).strip():
                warnings.extend(ade_warnings)
                return ade_analysis, ade_provider, warnings

            warnings.extend(ade_warnings)
            warnings.append("LandingAI ADE returned empty OCR text")
            _trace_finance_ocr(
                "finance_ocr.document_ocr.landingai_ade_empty",
                {
                    "mime_type": mime_type,
                    "warning_count": len(warnings),
                },
                trace_id=trace_id,
            )
        except UnsupportedDocumentError as exc:
            warnings.append(str(exc))
            _trace_finance_ocr(
                "finance_ocr.document_ocr.landingai_ade_unsupported",
                {
                    "mime_type": mime_type,
                    "error": str(exc)[:240],
                },
                trace_id=trace_id,
            )
        except DocumentProviderUnavailableError as exc:
            warnings.append(str(exc))
            _trace_finance_ocr(
                "finance_ocr.document_ocr.landingai_ade_unavailable",
                {
                    "mime_type": mime_type,
                    "error": str(exc)[:240],
                },
                trace_id=trace_id,
            )
        except DocumentAdapterError as exc:
            warnings.append(str(exc))
            _trace_finance_ocr(
                "finance_ocr.document_ocr.landingai_ade_failed",
                {
                    "mime_type": mime_type,
                    "error": str(exc)[:240],
                },
                trace_id=trace_id,
            )

    if settings.SMARTSPEC_USE_WEB_GATEWAY and (settings.SMARTSPEC_WEB_GATEWAY_URL or "").strip() and (settings.SMARTSPEC_WEB_GATEWAY_TOKEN or "").strip():
        try:
            gateway_analysis = await _call_gateway_multimodal_vision_bytes(
                content,
                mime_type,
                prompt=prompt,
                temperature=temperature,
                source_url=source_url,
                tenant_id=tenant_id,
                trace_id=trace_id,
                session=session,
            )
            gateway_ocr_text = str(gateway_analysis.get("ocrText") or "").strip()
            if gateway_ocr_text:
                _trace_finance_ocr(
                    "finance_ocr.document_ocr.gateway_text",
                    {
                        "mime_type": mime_type,
                        "ocr_text_length": len(gateway_ocr_text),
                        "warning_count": len(warnings),
                    },
                    trace_id=trace_id,
                )
                return gateway_analysis, "gateway_auto", warnings
            gateway_search_text = _build_media_search_text(gateway_analysis, None, None).strip()
            if gateway_search_text:
                warnings.append("Gateway OCR returned no ocrText; using partial structured output")
            else:
                warnings.append("Gateway OCR returned empty text")
            _trace_finance_ocr(
                "finance_ocr.document_ocr.gateway_partial",
                {
                    "mime_type": mime_type,
                    "has_structured_output": bool(gateway_search_text),
                    "warning_count": len(warnings),
                },
                trace_id=trace_id,
            )
        except Exception as exc:
            warnings.append(f"Gateway OCR failed: {exc}")
            _trace_finance_ocr(
                "finance_ocr.document_ocr.gateway_failed",
                {
                    "mime_type": mime_type,
                    "error": str(exc)[:240],
                    "warning_count": len(warnings),
                },
                trace_id=trace_id,
            )

    if gateway_analysis is not None and gateway_search_text:
        _trace_finance_ocr(
            "finance_ocr.document_ocr.return_gateway_partial",
            {
                "mime_type": mime_type,
                "gateway_only": gateway_only,
                "warning_count": len(warnings),
            },
            trace_id=trace_id,
        )
        return gateway_analysis, "gateway_auto", warnings

    error = DocumentProviderUnavailableError("; ".join(warnings) or "Document OCR unavailable")
    _trace_finance_ocr(
        "finance_ocr.document_ocr.failed",
        {
            "mime_type": mime_type,
            "error": str(error)[:240],
            "warning_count": len(warnings),
            "gateway_only": gateway_only,
        },
        trace_id=trace_id,
    )
    raise error


def _select_pdf_page_image(images: list[Any]) -> Any | None:
    if not images:
        return None

    def score(image: Any) -> tuple[int, int]:
        pil_image = getattr(image, "image", None)
        if pil_image is not None:
            width = int(getattr(pil_image, "width", 0) or 0)
            height = int(getattr(pil_image, "height", 0) or 0)
            return (width * height, len(getattr(image, "data", b"") or b""))
        raw_data = getattr(image, "data", None)
        if isinstance(raw_data, (bytes, bytearray)):
            return (len(raw_data), 0)
        return (0, 0)

    return max(images, key=score)


def _pdf_image_to_bytes(image: Any) -> tuple[bytes, str]:
    from PIL import Image as PILImage

    raw_data = getattr(image, "data", None)
    candidate = None
    if isinstance(raw_data, (bytes, bytearray)) and raw_data:
        try:
            candidate = PILImage.open(io.BytesIO(bytes(raw_data)))
        except Exception:
            candidate = None

    if candidate is None:
        pil_image = getattr(image, "image", None)
        if pil_image is not None:
            candidate = pil_image.copy()

    if candidate is None:
        raise ValueError("Embedded PDF image is unavailable for OCR")

    if getattr(candidate, "mode", None) not in ("RGB", "RGBA", "L"):
        candidate = candidate.convert("RGB")
    elif getattr(candidate, "mode", None) == "RGBA":
        candidate = candidate.convert("RGB")

    max_dimension = 1600
    candidate.thumbnail((max_dimension, max_dimension))

    output = io.BytesIO()
    candidate.save(output, format="PNG")
    return output.getvalue(), "image/png"


async def _extract_pdf_ocr_text(
    content: bytes,
    *,
    file_name: str,
    capture_intent: str | None = None,
    source_url: str | None = None,
    tenant_id: str | None = None,
    trace_id: str | None = None,
    session: AsyncSession | None = None,
) -> tuple[str, list[str]]:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(content))
    page_texts: list[str] = []
    warnings: list[str] = []
    _trace_finance_ocr(
        "finance_ocr.pdf.start",
        {
            "file_name": file_name,
            "page_count": len(reader.pages),
            "capture_intent": capture_intent,
            "max_pages": MAX_PDF_OCR_PAGES,
        },
        trace_id=trace_id,
    )

    max_pages = min(len(reader.pages), MAX_PDF_OCR_PAGES)
    for page_index in range(max_pages):
        page = reader.pages[page_index]
        page_images = list(getattr(page, "images", []) or [])
        _trace_finance_ocr(
            "finance_ocr.pdf.page.start",
            {
                "file_name": file_name,
                "page_number": page_index + 1,
                "image_count": len(page_images),
            },
            trace_id=trace_id,
        )
        if not page_images:
            continue

        selected_image = _select_pdf_page_image(page_images)
        if selected_image is None:
            continue

        try:
            image_bytes, image_mime = _pdf_image_to_bytes(selected_image)
        except Exception as exc:
            warnings.append(f"page {page_index + 1} image decode failed: {exc}")
            _trace_finance_ocr(
                "finance_ocr.pdf.page.decode_failed",
                {
                    "file_name": file_name,
                    "page_number": page_index + 1,
                    "error": str(exc)[:240],
                },
                trace_id=trace_id,
            )
            continue

        try:
            analysis, _ocr_provider, ocr_warnings = await _call_document_ocr_with_fallback(
                image_bytes,
                image_mime,
                file_name=file_name,
                prompt=_build_document_ocr_prompt(capture_intent),
                temperature=0.0,
                capture_intent=capture_intent,
                source_url=source_url,
                tenant_id=tenant_id,
                trace_id=trace_id,
                session=session,
            )
            searchable_text = _build_media_search_text(analysis, None, None).strip()
            if searchable_text:
                page_texts.append(f"[page {page_index + 1}]\n{searchable_text}")
                warnings.extend(ocr_warnings)
                _trace_finance_ocr(
                    "finance_ocr.pdf.page.success",
                    {
                        "file_name": file_name,
                        "page_number": page_index + 1,
                        "searchable_text_length": len(searchable_text),
                        "ocr_warning_count": len(ocr_warnings),
                    },
                    trace_id=trace_id,
                )
            else:
                warnings.append(f"page {page_index + 1} OCR returned empty text")
                _trace_finance_ocr(
                    "finance_ocr.pdf.page.empty",
                    {
                        "file_name": file_name,
                        "page_number": page_index + 1,
                        "warning_count": len(warnings),
                    },
                    trace_id=trace_id,
                )
        except Exception as exc:
            warnings.append(f"page {page_index + 1} OCR failed: {exc}")
            _trace_finance_ocr(
                "finance_ocr.pdf.page.failed",
                {
                    "file_name": file_name,
                    "page_number": page_index + 1,
                    "error": str(exc)[:240],
                    "warning_count": len(warnings),
                },
                trace_id=trace_id,
            )

    if not page_texts and not warnings:
        warnings.append("No embedded PDF images were available for OCR fallback")
        _trace_finance_ocr(
            "finance_ocr.pdf.no_images",
            {
                "file_name": file_name,
                "page_count": len(reader.pages),
            },
            trace_id=trace_id,
        )

    return "\n\n".join(page_texts).strip(), warnings


async def _run_ffmpeg_extract_frame(video_path: str, output_path: str) -> None:
    probe_result = await asyncio.to_thread(_ffprobe_metadata, video_path)
    duration = float(probe_result.get("duration_seconds") or 0.0)
    seek_time = max(duration * 0.25, 0.0)
    cmd = [
        "ffmpeg", "-y", "-ss", str(seek_time),
        "-i", video_path,
        "-frames:v", "1",
        "-q:v", "3",
        output_path,
    ]
    await asyncio.to_thread(subprocess.run, cmd, capture_output=True, timeout=60, check=True)


async def _run_ffmpeg_extract_audio(video_path: str, output_path: str) -> None:
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-t", "90",
        output_path,
    ]
    await asyncio.to_thread(subprocess.run, cmd, capture_output=True, timeout=90, check=True)


@router.post(
    "/propagate-scopes",
    response_model=PropagateScopesResponse,
    dependencies=[Depends(_verify_proxy_token)],
)
async def propagate_scopes_endpoint(
    request: PropagateScopesRequest,
    session: AsyncSession = Depends(get_db),
):
    """
    Internal endpoint called by Node.js after permission changes.
    Propagates allowed_scopes to vector store metadata (pgvector, ChromaDB,
    Cloudflare Vectorize).

    The Node.js side has already updated the PostgreSQL allowed_scopes columns.
    This endpoint handles the vector store metadata sync.
    """
    try:
        result = await propagate_scopes_to_vector_stores(
            item_id=request.item_id,
            new_allowed_scopes=request.new_allowed_scopes,
            tenant_id=request.tenant_id,
            session=session,
        )

        logger.info(
            "propagate_scopes_api_success",
            item_id=request.item_id,
            tenant_id=request.tenant_id,
            providers=result,
        )

        return PropagateScopesResponse(
            success=True,
            providers_updated=result,
        )
    except Exception as e:
        logger.error(
            "propagate_scopes_api_error",
            item_id=request.item_id,
            tenant_id=request.tenant_id,
            error=str(e),
        )
        raise HTTPException(status_code=500, detail="Scope propagation failed")


@router.post(
    "/search",
    response_model=LibrarySearchResponse,
    dependencies=[Depends(_verify_proxy_token)],
)
async def search_library_vectors_endpoint(
    request: LibrarySearchRequest,
    session: AsyncSession = Depends(get_db),
):
    """Internal endpoint for pgvector-native Library scoring."""
    try:
        rows = await search_library_pgvector_scores(
            session,
            tenant_id=request.tenant_id,
            query=request.query,
            candidate_item_ids=request.candidate_item_ids,
        )
        return LibrarySearchResponse(
            success=True,
            results=[LibrarySearchResult(**row) for row in rows],
        )
    except Exception as e:
        logger.error(
            "library_pgvector_search_api_error",
            tenant_id=request.tenant_id,
            candidate_count=len(request.candidate_item_ids),
            error=str(e),
        )
        raise HTTPException(status_code=500, detail="Library pgvector search failed")


@router.post(
    "/extract-text",
    response_model=LibraryExtractTextResponse,
    dependencies=[Depends(_verify_proxy_token)],
)
async def extract_library_text_endpoint(
    payload: LibraryExtractTextRequest,
    http_request: Request,
    session: AsyncSession = Depends(get_db),
):
    """Extract searchable text from direct library uploads."""
    trace_id = _resolve_finance_ocr_trace_id(http_request, payload.trace_id)
    tenant_id = (http_request.headers.get("x-tenant-id") or "").strip() or None
    landingai_api_key_override = (http_request.headers.get("x-landingai-ade-api-key") or "").strip() or None
    typhoon_api_key_override = (http_request.headers.get("x-typhoon-ocr-api-key") or "").strip() or None
    content = _decode_base64_content(payload.content_base64)
    source_url = _normalize_source_url(payload.source_url)
    analysis_profile = _normalize_analysis_profile(payload.analysis_profile)
    capture_intent = _normalize_capture_intent(payload.capture_intent)
    _trace_finance_ocr(
        "finance_ocr.extract_text.start",
        {
            "file_name": payload.file_name,
            "mime_type": payload.mime_type,
            "analysis_profile": analysis_profile,
            "capture_intent": capture_intent,
            "content_bytes": len(content),
            "source_url_present": bool(source_url),
            "has_typhoon_api_key": bool(typhoon_api_key_override),
            "tenant_id_present": bool(tenant_id),
        },
        trace_id=trace_id,
    )

    extractor = OneDriveContentExtractor()
    warning_parts: list[str] = []
    response_metadata: dict[str, Any] = {
        "analysis_profile": analysis_profile or "metadata_only",
        "capture_intent": capture_intent,
    }
    requested_ocr_provider = _normalize_document_ocr_provider_id(payload.ocr_provider)

    try:
        if requested_ocr_provider == "google_ai_vision":
            try:
                analysis, ocr_provider, ocr_warnings = await _call_google_ai_document_ocr(
                    content,
                    payload.mime_type,
                    file_name=payload.file_name,
                    prompt=_build_document_ocr_prompt(capture_intent),
                    capture_intent=capture_intent,
                    source_url=source_url,
                    trace_id=trace_id,
                    session=session,
                )
                text = str(analysis.get("ocrText") or "").strip() or _build_media_search_text(analysis, None, None).strip()
                if text:
                    warning_parts.extend(ocr_warnings)
                    response_metadata.update({
                        "ocr_provider": ocr_provider,
                        "ocr_text": str(analysis.get("ocrText") or "").strip() or None,
                    })
                    analysis_metadata = analysis.get("metadata") if isinstance(analysis.get("metadata"), dict) else {}
                    if isinstance(analysis_metadata, dict):
                        response_metadata.update(analysis_metadata)
                    response_metadata.setdefault("provider", ocr_provider)
                    response_metadata.setdefault(
                        "extraction_method",
                        "pdf_document_ocr" if payload.mime_type.lower().endswith("pdf") else "image_document_ocr",
                    )
                    method = response_metadata["extraction_method"]
                    warning = "; ".join(part for part in warning_parts if part) or None
                    _trace_finance_ocr(
                        "finance_ocr.extract_text.result",
                        {
                            "file_name": payload.file_name,
                            "mime_type": payload.mime_type,
                            "analysis_profile": analysis_profile,
                            "capture_intent": capture_intent,
                            "method": method,
                            "text_length": len(text),
                            "warning_count": len(warning_parts),
                            "ocr_provider": ocr_provider,
                        },
                        trace_id=trace_id,
                    )

                    return LibraryExtractTextResponse(
                        success=True,
                        text=text,
                        char_count=len(text),
                        method=method,
                        warning=warning,
                        metadata=response_metadata,
                    )
                warning_parts.extend(ocr_warnings)
                warning_parts.append("Google AI OCR returned empty OCR text")
            except (DocumentProviderUnavailableError, DocumentAdapterError) as exc:
                warning_parts.append(str(exc))

        ade_service = get_landingai_ade_document_service(api_key_override=landingai_api_key_override)
        if typhoon_api_key_override:
            analysis, ocr_provider, ocr_warnings = await _call_document_ocr_with_fallback(
                content,
                payload.mime_type,
                file_name=payload.file_name,
                prompt=_build_document_ocr_prompt(capture_intent),
                temperature=0.0,
                capture_intent=capture_intent,
                source_url=source_url,
                tenant_id=tenant_id,
                trace_id=trace_id,
                session=session,
                typhoon_api_key_override=typhoon_api_key_override,
                landingai_api_key_override=landingai_api_key_override,
            )
            text = str(analysis.get("ocrText") or "").strip() or _build_media_search_text(analysis, None, None).strip()
            if text:
                warning_parts.extend(ocr_warnings)
                response_metadata.update({
                    "ocr_provider": ocr_provider,
                    "ocr_text": str(analysis.get("ocrText") or "").strip() or None,
                })
                analysis_metadata = analysis.get("metadata") if isinstance(analysis.get("metadata"), dict) else {}
                if isinstance(analysis_metadata, dict):
                    response_metadata.update(analysis_metadata)
                response_metadata.setdefault("provider", ocr_provider)
                response_metadata.setdefault("extraction_method", "pdf_document_ocr" if payload.mime_type.lower().endswith("pdf") else "image_document_ocr")
                method = response_metadata["extraction_method"]
                warning = "; ".join(part for part in warning_parts if part) or None
                _trace_finance_ocr(
                    "finance_ocr.extract_text.result",
                    {
                        "file_name": payload.file_name,
                        "mime_type": payload.mime_type,
                        "analysis_profile": analysis_profile,
                        "capture_intent": capture_intent,
                        "method": method,
                        "text_length": len(text),
                        "warning_count": len(warning_parts),
                        "ocr_provider": ocr_provider,
                    },
                    trace_id=trace_id,
                )

                return LibraryExtractTextResponse(
                    success=True,
                    text=text,
                    char_count=len(text),
                    method=method,
                    warning=warning,
                    metadata=response_metadata,
                )
            warning_parts.extend(ocr_warnings)
            warning_parts.append("Typhoon OCR returned empty OCR text")
        if ade_service.is_configured() and _should_use_landingai_ade_document_path(
            mime_type=payload.mime_type,
            prompt=_build_document_ocr_prompt(capture_intent),
            capture_intent=capture_intent,
        ):
            analysis, ocr_provider, ocr_warnings = await _call_landingai_ade_document_ocr(
                content,
                payload.mime_type,
                file_name=payload.file_name,
                prompt=_build_document_ocr_prompt(capture_intent),
                capture_intent=capture_intent,
                source_url=source_url,
                trace_id=trace_id,
                session=session,
                api_key_override=landingai_api_key_override,
            )
            text = str(analysis.get("ocrText") or "").strip() or _build_media_search_text(analysis, None, None).strip()
            if text:
                warning_parts.extend(ocr_warnings)
                response_metadata.update({
                    "ocr_provider": ocr_provider,
                    "ocr_text": str(analysis.get("ocrText") or "").strip() or None,
                })
                analysis_metadata = analysis.get("metadata") if isinstance(analysis.get("metadata"), dict) else {}
                if isinstance(analysis_metadata, dict):
                    response_metadata.update(analysis_metadata)
                response_metadata.setdefault("provider", ocr_provider)
                response_metadata.setdefault("extraction_method", "pdf_document_ocr")
                method = "pdf_document_ocr"
                warning = "; ".join(part for part in warning_parts if part) or None
                _trace_finance_ocr(
                    "finance_ocr.extract_text.result",
                    {
                        "file_name": payload.file_name,
                        "mime_type": payload.mime_type,
                        "analysis_profile": analysis_profile,
                        "capture_intent": capture_intent,
                        "method": method,
                        "text_length": len(text),
                        "warning_count": len(warning_parts),
                        "ocr_provider": ocr_provider,
                    },
                    trace_id=trace_id,
                )

                return LibraryExtractTextResponse(
                    success=True,
                    text=text,
                    char_count=len(text),
                    method=method,
                    warning=warning,
                    metadata=response_metadata,
                )
            warning_parts.extend(ocr_warnings)
            warning_parts.append("LandingAI ADE returned empty OCR text")
    except UnsupportedDocumentError as exc:
        warning_parts.append(str(exc))
    except DocumentProviderUnavailableError as exc:
        warning_parts.append(str(exc))
    except DocumentAdapterError as exc:
        warning_parts.append(str(exc))

    result = extractor.extract(
        content=content,
        mime_type=payload.mime_type,
        file_name=payload.file_name,
    )

    method = str(result.get("method") or "unknown")
    text = str(result.get("text") or "").strip()
    if method in {"legacy_unsupported", "unsupported", "too_large", "error"}:
        warning_parts.append(f"Extraction result: {method}")

    if (
        not text
        and analysis_profile == "document_ocr"
        and (
            payload.mime_type.lower().startswith("application/pdf")
            or payload.file_name.lower().endswith(".pdf")
            or "pdf" in payload.mime_type.lower()
        )
    ):
        ocr_text, ocr_warnings = await _extract_pdf_ocr_text(
            content,
            file_name=payload.file_name,
            capture_intent=capture_intent,
            source_url=source_url,
            tenant_id=tenant_id,
            trace_id=trace_id,
            session=session,
        )
        warning_parts.extend(ocr_warnings)
        if ocr_text:
            text = ocr_text
            method = "pdf_document_ocr"
        else:
            warning_parts.append("PDF OCR fallback did not extract searchable text")
            method = "pdf_document_ocr_unavailable"

    if not response_metadata.get("ocr_provider"):
        response_metadata.update({
            "extraction_method": method,
            "ocr_provider": method if method != "unknown" else None,
        })
    if isinstance(result, dict):
        result_metadata = result.get("metadata")
        if isinstance(result_metadata, dict):
            response_metadata.update(result_metadata)
    response_metadata["analysis_profile"] = analysis_profile or "metadata_only"
    response_metadata["capture_intent"] = capture_intent

    warning: str | None = "; ".join(part for part in warning_parts if part) or None
    _trace_finance_ocr(
        "finance_ocr.extract_text.result",
        {
            "file_name": payload.file_name,
            "mime_type": payload.mime_type,
            "analysis_profile": analysis_profile,
            "capture_intent": capture_intent,
            "method": method,
            "text_length": len(text),
            "warning_count": len(warning_parts),
            "ocr_provider": response_metadata.get("ocr_provider"),
        },
        trace_id=trace_id,
    )

    return LibraryExtractTextResponse(
        success=True,
        text=text,
        char_count=len(text),
        method=method,
        warning=warning,
        metadata=response_metadata,
    )


@router.post(
    "/enrich-media",
    response_model=LibraryMediaEnrichmentResponse,
    dependencies=[Depends(_verify_proxy_token)],
)
async def enrich_library_media_endpoint(
    payload: LibraryMediaEnrichmentRequest,
    http_request: Request,
    session: AsyncSession = Depends(get_db),
):
    """Extract searchable metadata/transcripts from image and video uploads."""
    trace_id = _resolve_finance_ocr_trace_id(http_request, payload.trace_id)
    tenant_id = (http_request.headers.get("x-tenant-id") or "").strip() or None
    llm_model_id = (http_request.headers.get("x-llm-model-id") or "").strip() or None
    content = _decode_base64_content(payload.content_base64)
    landingai_api_key_override = (http_request.headers.get("x-landingai-ade-api-key") or "").strip() or None
    typhoon_api_key_override = (http_request.headers.get("x-typhoon-ocr-api-key") or "").strip() or None
    source_url = _normalize_source_url(payload.source_url)
    mime_type = payload.mime_type.lower()
    file_name = payload.file_name
    capture_intent = _normalize_capture_intent(payload.capture_intent)
    requested_ocr_provider = _normalize_document_ocr_provider_id(payload.ocr_provider)
    warning_parts: list[str] = []
    _trace_finance_ocr(
        "finance_ocr.enrich_media.start",
        {
            "file_name": file_name,
            "mime_type": mime_type,
            "analysis_profile": payload.analysis_profile or "real_world_vision",
            "capture_intent": capture_intent,
            "enable_vision": payload.enable_vision,
            "enable_transcript": payload.enable_transcript,
            "content_bytes": len(content),
            "source_url_present": bool(source_url),
        },
        trace_id=trace_id,
    )

    if mime_type.startswith("image/"):
        if not payload.enable_vision:
            _trace_finance_ocr(
                "finance_ocr.enrich_media.metadata_only",
                {
                    "file_name": file_name,
                    "mime_type": mime_type,
                    "analysis_profile": payload.analysis_profile or "metadata_only",
                    "reason": "vision_disabled",
                },
                trace_id=trace_id,
            )
            return LibraryMediaEnrichmentResponse(
                success=True,
                text="",
                char_count=0,
                method="image_metadata_only",
                search_quality="metadata_only",
                warning="Image upload kept in metadata-only mode. Enable OCR/Vision explicitly for real-world photos or scanned documents.",
                metadata={
                    "analysis_profile": payload.analysis_profile or "metadata_only",
                },
            )
        if payload.analysis_profile == "finance_payin_llm_parser" and capture_intent == "transfer_slip":
            try:
                _trace_finance_ocr(
                    "finance_ocr.unified_payin_slip.vision.start",
                    {
                        "file_name": file_name,
                        "mime_type": mime_type,
                        "source_url_present": bool(source_url),
                        "prompt_length": len(PAYIN_SLIP_LLM_PROMPT),
                        "llm_model_id": llm_model_id,
                    },
                    trace_id=trace_id,
                )
                analysis = await _call_gateway_multimodal_vision_bytes(
                    content,
                    payload.mime_type,
                    prompt=PAYIN_SLIP_LLM_PROMPT,
                    temperature=0.0,
                    source_url=source_url,
                    response_schema=PAYIN_SLIP_JSON_SCHEMA,
                    response_schema_name="finance_transfer_slip_ocr",
                    chat_model_id=llm_model_id,
                    force_inline_image=True,
                    tenant_id=tenant_id,
                    trace_id=trace_id,
                    session=session,
                )
                gateway_ocr_text = str(analysis.get("ocrText") or "").strip()
                _trace_finance_ocr(
                    "finance_ocr.unified_payin_slip.vision.result",
                    {
                        "file_name": file_name,
                        "mime_type": mime_type,
                        "ocr_text_length": len(gateway_ocr_text),
                        "short_caption_length": len(str(analysis.get("shortCaption") or "").strip()),
                        "detailed_caption_length": len(str(analysis.get("detailedCaption") or "").strip()),
                        "metadata_keys": sorted(list((analysis.get("metadata") or {}).keys()))[:20]
                        if isinstance(analysis.get("metadata"), dict)
                        else [],
                    },
                    trace_id=trace_id,
                )
                source_payload = {
                    "raw_ocr_text": gateway_ocr_text or _build_media_search_text(analysis, None, None).strip(),
                    "short_caption": str(analysis.get("shortCaption") or "").strip(),
                    "detailed_caption": str(analysis.get("detailedCaption") or "").strip(),
                    "filename": file_name,
                    "image_path": "",
                }
                _trace_finance_ocr(
                    "finance_ocr.unified_payin_slip.parser.start",
                    {
                        "file_name": file_name,
                        "mime_type": mime_type,
                        "raw_ocr_text_length": len(source_payload["raw_ocr_text"]),
                        "short_caption_length": len(source_payload["short_caption"]),
                        "detailed_caption_length": len(source_payload["detailed_caption"]),
                    },
                    trace_id=trace_id,
                )
                parsed_result = parse_and_summarize_payin_slip({
                    "trace_id": trace_id,
                    "source": source_payload,
                    "parse_options": {
                        "mode": "auto",
                        "return_detection_evidence": True,
                    },
                })
                summary_text = str(parsed_result.get("summary") or "").strip()
                structured_result = parsed_result.get("parsed") if isinstance(parsed_result.get("parsed"), dict) else {}
                _trace_finance_ocr(
                    "finance_ocr.unified_payin_slip.parser.result",
                    {
                        "file_name": file_name,
                        "mime_type": mime_type,
                        "summary_length": len(summary_text),
                        "parsed_keys": sorted(list(structured_result.keys()))[:40] if isinstance(structured_result, dict) else [],
                        "transaction_type": (structured_result.get("transaction") or {}).get("transaction_type")
                        if isinstance(structured_result.get("transaction"), dict)
                        else None,
                        "amount": (structured_result.get("transaction") or {}).get("amount")
                        if isinstance(structured_result.get("transaction"), dict)
                        else None,
                        "currency": (structured_result.get("transaction") or {}).get("currency")
                        if isinstance(structured_result.get("transaction"), dict)
                        else None,
                        "raw_date_text": (structured_result.get("transaction") or {}).get("raw_date_text")
                        if isinstance(structured_result.get("transaction"), dict)
                        else None,
                        "warnings": (structured_result.get("validation") or {}).get("warnings")
                        if isinstance(structured_result.get("validation"), dict)
                        else [],
                        "missing_fields": (structured_result.get("validation") or {}).get("missing_fields")
                        if isinstance(structured_result.get("validation"), dict)
                        else [],
                    },
                    trace_id=trace_id,
                )
                warning_parts = []
                if not summary_text:
                    summary_text = gateway_ocr_text or str(source_payload["raw_ocr_text"] or "").strip()
                if not summary_text:
                    summary_text = str(analysis.get("shortCaption") or "").strip()
                metadata = {
                    "analysis_profile": "finance_payin_llm_parser",
                    "capture_intent": capture_intent,
                    "ocr_provider": "gateway_auto",
                    "ocr_text": gateway_ocr_text or None,
                    "unified_payin_slip_summary": summary_text,
                    "unified_payin_slip_result": structured_result,
                    "short_caption": str(analysis.get("shortCaption") or "").strip() or None,
                    "detailed_caption": str(analysis.get("detailedCaption") or "").strip() or None,
                    "source_url_kind": "public_url" if _is_public_source_url(source_url) else "unresolved",
                }
                analysis_metadata = analysis.get("metadata") if isinstance(analysis.get("metadata"), dict) else {}
                if isinstance(analysis_metadata, dict):
                    metadata.update(analysis_metadata)
                _trace_finance_ocr(
                    "finance_ocr.unified_payin_slip.result",
                    {
                        "file_name": file_name,
                        "mime_type": mime_type,
                        "summary_length": len(summary_text),
                        "ocr_text_length": len(gateway_ocr_text),
                        "has_structured_result": bool(structured_result),
                        "transaction_type": (structured_result.get("transaction") or {}).get("transaction_type")
                        if isinstance(structured_result.get("transaction"), dict)
                        else None,
                    },
                    trace_id=trace_id,
                )
                return LibraryMediaEnrichmentResponse(
                    success=True,
                    text=summary_text,
                    char_count=len(summary_text),
                    method="image_unified_llm_parser",
                    search_quality="full_text" if summary_text else "metadata_only",
                    caption=str(analysis.get("shortCaption") or "").strip() or None,
                    warning=None,
                    metadata=metadata,
                )
            except Exception as exc:
                _trace_finance_ocr(
                    "finance_ocr.enrich_media.failed",
                    {
                        "file_name": file_name,
                        "mime_type": mime_type,
                        "analysis_profile": payload.analysis_profile or "finance_payin_llm_parser",
                        "error": str(exc)[:240],
                    },
                    trace_id=trace_id,
                )
                return LibraryMediaEnrichmentResponse(
                    success=False,
                    text="",
                    char_count=0,
                    method="image_unified_llm_parser_failed",
                    search_quality="metadata_only",
                    warning=f"Unified transfer slip parsing failed: {exc}",
                    metadata={
                        "analysis_profile": "finance_payin_llm_parser",
                        "capture_intent": capture_intent,
                    },
                )
        if requested_ocr_provider == "google_ai_vision":
            try:
                analysis, ocr_provider, ocr_warnings = await _call_google_ai_document_ocr(
                    content,
                    payload.mime_type,
                    file_name=file_name,
                    prompt=_build_document_ocr_prompt(capture_intent)
                    if payload.analysis_profile == "document_ocr"
                    else VISION_PROMPT,
                    capture_intent=capture_intent,
                    source_url=source_url,
                    trace_id=trace_id,
                    session=session,
                )
                searchable_text = _build_media_search_text(analysis, None, None).strip()
                if searchable_text:
                    warning_parts.extend(ocr_warnings)
                    return LibraryMediaEnrichmentResponse(
                        success=True,
                        text=searchable_text,
                        char_count=len(searchable_text),
                        method="image_document_ocr" if payload.analysis_profile == "document_ocr" else "image_vision",
                        search_quality="full_text",
                        caption=str(analysis.get("shortCaption") or "").strip() or None,
                        warning="; ".join(warning_parts) if warning_parts else None,
                        metadata={
                            **(analysis.get("metadata") if isinstance(analysis.get("metadata"), dict) else {}),
                            "analysis_profile": payload.analysis_profile or "real_world_vision",
                            "ocr_provider": ocr_provider,
                            "ocr_text": str(analysis.get("ocrText") or "").strip() or None,
                        },
                    )
                warning_parts.extend(ocr_warnings)
                warning_parts.append("Google AI OCR returned empty OCR text")
            except (DocumentProviderUnavailableError, DocumentAdapterError) as exc:
                warning_parts.append(str(exc))
        try:
            analysis, ocr_provider, ocr_warnings = await _call_document_ocr_with_fallback(
                content,
                payload.mime_type,
                file_name=file_name,
                prompt=_build_document_ocr_prompt(capture_intent)
                if payload.analysis_profile == "document_ocr"
                else VISION_PROMPT,
                temperature=0.0 if payload.analysis_profile == "document_ocr" else 0.1,
                capture_intent=capture_intent,
                source_url=source_url,
                tenant_id=tenant_id,
                trace_id=trace_id,
                session=session,
                typhoon_api_key_override=typhoon_api_key_override,
                landingai_api_key_override=landingai_api_key_override,
            )
        except Exception as exc:
            _trace_finance_ocr(
                "finance_ocr.enrich_media.failed",
                {
                    "file_name": file_name,
                    "mime_type": mime_type,
                    "analysis_profile": payload.analysis_profile or "real_world_vision",
                    "error": str(exc)[:240],
                },
                trace_id=trace_id,
            )
            return LibraryMediaEnrichmentResponse(
                success=True,
                text="",
                char_count=0,
                method="image_vision_unavailable",
                search_quality="metadata_only",
                warning=str(exc),
                metadata={
                    "analysis_profile": payload.analysis_profile or "real_world_vision",
                },
            )

        searchable_text = _build_media_search_text(analysis, None, None)
        _trace_finance_ocr(
            "finance_ocr.enrich_media.result",
            {
                "file_name": file_name,
                "mime_type": mime_type,
                "analysis_profile": payload.analysis_profile or "real_world_vision",
                "ocr_provider": ocr_provider,
                "text_length": len(searchable_text),
                "ocr_warning_count": len(ocr_warnings),
            },
            trace_id=trace_id,
        )
        return LibraryMediaEnrichmentResponse(
            success=True,
            text=searchable_text,
            char_count=len(searchable_text),
            method="image_document_ocr" if payload.analysis_profile == "document_ocr" else "image_vision",
            search_quality="full_text" if searchable_text else "metadata_only",
            caption=str(analysis.get("shortCaption") or "") or None,
            warning=None if searchable_text else "OCR returned partial structured output without searchable text",
            metadata={
                "analysis_profile": payload.analysis_profile or "real_world_vision",
                "capture_intent": capture_intent,
                "ocr_provider": ocr_provider,
                "ocr_text": str(analysis.get("ocrText") or "") or None,
                "objects": analysis.get("objects") or [],
                "styles": analysis.get("styles") or [],
                "materials": analysis.get("materials") or [],
                "colors": analysis.get("colors") or [],
                "architecture_tags": analysis.get("architectureTags") or [],
                "ocr_warnings": ocr_warnings[:5],
            },
        )

    if mime_type.startswith("video/"):
        _trace_finance_ocr(
            "finance_ocr.enrich_media.video_start",
            {
                "file_name": file_name,
                "mime_type": mime_type,
                "analysis_profile": payload.analysis_profile or "metadata_only",
                "enable_vision": payload.enable_vision,
                "enable_transcript": payload.enable_transcript,
            },
            trace_id=trace_id,
        )
        work_dir = tempfile.mkdtemp(prefix="library-video-enrich-")
        video_path = os.path.join(work_dir, file_name)
        frame_path = os.path.join(work_dir, "frame.jpg")
        audio_path = os.path.join(work_dir, "audio.wav")
        transcript_text: str | None = None
        analysis: dict[str, Any] | None = None
        warning_parts: list[str] = []
        media_metadata: dict[str, Any] = {}
        try:
          with open(video_path, "wb") as handle:
            handle.write(content)

          media_metadata = await asyncio.to_thread(_ffprobe_metadata, video_path)

          if payload.enable_vision:
              try:
                await _run_ffmpeg_extract_frame(video_path, frame_path)
                with open(frame_path, "rb") as image_handle:
                    analysis = await _call_gateway_multimodal_vision_bytes(
                        image_handle.read(),
                        "image/jpeg",
                        prompt=VISION_PROMPT,
                        temperature=0.1,
                        tenant_id=tenant_id,
                        session=session,
                    )
              except Exception as exc:
                warning_parts.append(f"frame_analysis_failed:{exc}")

          if payload.enable_transcript:
              try:
                await _run_ffmpeg_extract_audio(video_path, audio_path)
                with open(audio_path, "rb") as audio_handle:
                    stt_result = await _call_stt_provider(
                        audio_handle.read(),
                        "groq",
                        "wav",
                        None,
                    )
                    transcript_text = str(stt_result.get("text") or "").strip() or None
              except Exception as exc:
                warning_parts.append(f"transcript_failed:{exc}")
        finally:
          shutil.rmtree(work_dir, ignore_errors=True)

        searchable_text = _build_media_search_text(
            analysis,
            transcript_text,
            media_metadata if (analysis or transcript_text) else None,
        )
        if payload.enable_vision and payload.enable_transcript:
            method = "video_frame_and_transcript"
        elif payload.enable_transcript:
            method = "video_transcript"
        elif payload.enable_vision:
            method = "video_frame_vision"
        else:
            method = "video_metadata_only"
        search_quality = "full_text" if searchable_text and (analysis or transcript_text) else "metadata_only"
        return LibraryMediaEnrichmentResponse(
            success=True,
            text=searchable_text,
            char_count=len(searchable_text),
            method=method,
            search_quality=search_quality,
            caption=str((analysis or {}).get("shortCaption") or "") or None,
            transcript=transcript_text,
            warning="; ".join(warning_parts) if warning_parts else None,
            metadata={
                **media_metadata,
                "analysis_profile": payload.analysis_profile or (
                    "video_transcript" if payload.enable_transcript and not payload.enable_vision else "metadata_only"
                ),
            },
        )

    raise HTTPException(status_code=400, detail="Unsupported media type for enrichment")


@router.post(
    "/reindex",
    response_model=ReindexResponse,
    dependencies=[Depends(_verify_reindex_auth)],
)
async def trigger_library_reindex_internal(
    session: AsyncSession = Depends(get_db),
):
    """Trigger a full reindex of all library items via Celery (internal)."""
    import redis
    from celery.result import AsyncResult
    from app.tasks.media_tasks import reindex_all_library_task

    redis_url = settings.REDIS_URL or "redis://localhost:6379/0"
    r = redis.from_url(redis_url)
    existing_task_id = r.get(REINDEX_TASK_ID_KEY)
    existing_batch = _load_reindex_batch_metadata(r)
    if existing_task_id:
        existing_task_id = (
            existing_task_id.decode()
            if isinstance(existing_task_id, bytes)
            else existing_task_id
        )
        existing_batch = _match_reindex_batch_metadata(existing_batch, task_id=str(existing_task_id))
        result = AsyncResult(existing_task_id)
        if result.state in ("PENDING", "STARTED", "RETRY"):
            return ReindexResponse(
                task_id=existing_task_id,
                status="already_running",
                message="A reindex job is already in progress",
            )
        existing_summary = await _build_reindex_batch_summary(session, existing_batch)
        existing_task_result = result.result if isinstance(result.result, dict) else None
        if _determine_reindex_status(
            queue_state=result.state,
            batch_summary=existing_summary,
            batch_metadata=existing_batch,
            task_result=existing_task_result,
        ) == "running":
            return ReindexResponse(
                task_id=existing_task_id,
                status="already_running",
                message="A reindex job batch is still processing downstream index jobs",
            )

    baseline_job_id = int(
        await session.scalar(select(func.max(LibraryIndexJob.id)))
        or 0
    )
    task = reindex_all_library_task.delay(tenant_id=None)
    batch_metadata = {
        "task_id": task.id,
        "baseline_job_id": baseline_job_id,
        "tenant_id": None,
        "requested_at": datetime.utcnow().isoformat(),
    }
    r.set(REINDEX_TASK_ID_KEY, task.id, ex=REINDEX_BATCH_TTL_SECONDS)
    _store_reindex_batch_metadata(r, batch_metadata)
    return ReindexResponse(
        task_id=task.id,
        status="started",
        message="Reindex job has been queued",
    )


@router.get(
    "/reindex/status",
    response_model=ReindexStatusResponse,
    dependencies=[Depends(_verify_reindex_auth)],
)
async def get_library_reindex_status_internal(
    session: AsyncSession = Depends(get_db),
):
    """Check the status of the current reindex job (internal)."""
    import redis
    from celery.result import AsyncResult

    redis_url = settings.REDIS_URL or "redis://localhost:6379/0"
    r = redis.from_url(redis_url)
    task_id = r.get(REINDEX_TASK_ID_KEY)
    batch_metadata = _load_reindex_batch_metadata(r)

    if not task_id:
        return ReindexStatusResponse(status="idle", task_id=None, result=None)

    task_id_str = task_id.decode() if isinstance(task_id, bytes) else str(task_id)
    batch_metadata = _match_reindex_batch_metadata(batch_metadata, task_id=task_id_str)
    result = AsyncResult(task_id_str)
    batch_summary = await _build_reindex_batch_summary(session, batch_metadata)
    task_result = result.result if isinstance(result.result, dict) else None
    merged_batch_metadata = _merge_reindex_batch_outcome(batch_metadata, task_result)
    if merged_batch_metadata and merged_batch_metadata != (batch_metadata or {}):
        _store_reindex_batch_metadata(r, merged_batch_metadata)

    payload: Dict[str, Any] = {
        "task_id": task_id_str,
        "status": result.state.lower(),
        "result": None,
    }
    if batch_summary:
        payload["result"] = {
            "queue_task_state": result.state.lower(),
            **batch_summary,
        }
    if merged_batch_metadata:
        payload["result"] = {
            **(payload["result"] or {}),
            "expected_total_items": _coerce_int(merged_batch_metadata.get("expected_total_items")),
            "expected_enqueued_jobs": _coerce_int(merged_batch_metadata.get("expected_enqueued_jobs")),
            "enqueue_errors": _coerce_int(merged_batch_metadata.get("enqueue_errors")),
        }

    payload["status"] = _determine_reindex_status(
        queue_state=result.state,
        batch_summary=batch_summary,
        batch_metadata=merged_batch_metadata,
        task_result=task_result,
    )

    if result.state == "SUCCESS":
        if task_result is not None:
            payload["result"] = {
                **(payload["result"] or {}),
                **task_result,
            }
        elif payload["result"] is None:
            payload["result"] = result.result
    elif result.state == "FAILURE":
        payload["status"] = "failed"
        payload["result"] = {
            **(payload["result"] or {}),
            "error": str(result.result),
        }

    return ReindexStatusResponse(**payload)

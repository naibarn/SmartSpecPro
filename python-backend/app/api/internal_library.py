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
import os
import json
import shutil
import subprocess
import tempfile
from datetime import datetime
import secrets
from typing import Optional, Any, Dict

import httpx
import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Request
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
from app.services.onedrive_content_extractor import OneDriveContentExtractor
from app.services.library_pgvector_service import search_library_pgvector_scores

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/internal/library", tags=["Internal Library"])
MAX_LIBRARY_SEARCH_QUERY_LENGTH = 2_000
MAX_LIBRARY_SEARCH_CANDIDATES = 1_000
MAX_MEDIA_ENRICH_BYTES = 50 * 1024 * 1024
REINDEX_TASK_ID_KEY = "vectordb:reindex:task_id"
REINDEX_BATCH_KEY = "vectordb:reindex:batch"
REINDEX_BATCH_TTL_SECONDS = 24 * 60 * 60
GEMINI_VISION_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
)
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
    if not x_proxy_token:
        raise HTTPException(status_code=401, detail="Missing proxy token")
    proxy_token = getattr(settings, "SMARTSPEC_PROXY_TOKEN", None)
    if not proxy_token:
        raise HTTPException(status_code=500, detail="SMARTSPEC_PROXY_TOKEN not configured")
    if not secrets.compare_digest(x_proxy_token, proxy_token):
        raise HTTPException(status_code=401, detail="Invalid proxy token")


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


class LibraryExtractTextResponse(BaseModel):
    success: bool
    text: str
    char_count: int
    method: str
    warning: Optional[str] = None


class LibraryMediaEnrichmentRequest(BaseModel):
    file_name: str = Field(..., min_length=1, max_length=255)
    mime_type: str = Field(..., min_length=1, max_length=255)
    content_base64: str = Field(..., min_length=1)
    analysis_profile: Optional[str] = Field(default=None, max_length=64)
    enable_vision: bool = False
    enable_transcript: bool = False


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


def _decode_base64_content(encoded: str) -> bytes:
    try:
        content = base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 content") from exc
    if len(content) > MAX_MEDIA_ENRICH_BYTES:
        raise HTTPException(status_code=413, detail="Media payload exceeds upload enrichment limit")
    return content


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


async def _call_gemini_vision_bytes(
    content: bytes,
    mime_type: str,
    *,
    session: AsyncSession | None = None,
) -> dict[str, Any]:
    api_key = await get_google_ai_api_key(session)
    if not api_key:
        raise RuntimeError("Google AI API key is not configured in Admin Settings")

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": VISION_PROMPT},
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
            "temperature": 0.1,
        },
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            GEMINI_VISION_URL,
            params={"key": api_key},
            json=payload,
        )
    if response.status_code != 200:
        raise RuntimeError(f"Gemini vision API error: {response.status_code}")

    data = response.json()
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(text)


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
    request: LibraryExtractTextRequest,
):
    """Extract searchable text from direct library uploads."""
    content = _decode_base64_content(request.content_base64)

    extractor = OneDriveContentExtractor()
    result = extractor.extract(
        content=content,
        mime_type=request.mime_type,
        file_name=request.file_name,
    )

    method = str(result.get("method") or "unknown")
    text = str(result.get("text") or "")
    warning: str | None = None
    if method in {"legacy_unsupported", "unsupported", "too_large", "error"}:
        warning = f"Extraction result: {method}"

    return LibraryExtractTextResponse(
        success=True,
        text=text,
        char_count=int(result.get("char_count") or len(text)),
        method=method,
        warning=warning,
    )


@router.post(
    "/enrich-media",
    response_model=LibraryMediaEnrichmentResponse,
    dependencies=[Depends(_verify_proxy_token)],
)
async def enrich_library_media_endpoint(
    request: LibraryMediaEnrichmentRequest,
    session: AsyncSession = Depends(get_db),
):
    """Extract searchable metadata/transcripts from image and video uploads."""
    content = _decode_base64_content(request.content_base64)
    mime_type = request.mime_type.lower()
    file_name = request.file_name

    if mime_type.startswith("image/"):
        if not request.enable_vision:
            return LibraryMediaEnrichmentResponse(
                success=True,
                text="",
                char_count=0,
                method="image_metadata_only",
                search_quality="metadata_only",
                warning="Image upload kept in metadata-only mode. Enable OCR/Vision explicitly for real-world photos or scanned documents.",
                metadata={
                    "analysis_profile": request.analysis_profile or "metadata_only",
                },
            )
        try:
            analysis = await _call_gemini_vision_bytes(content, request.mime_type, session=session)
        except Exception as exc:
            return LibraryMediaEnrichmentResponse(
                success=True,
                text="",
                char_count=0,
                method="image_vision_unavailable",
                search_quality="metadata_only",
                warning=str(exc),
                metadata={
                    "analysis_profile": request.analysis_profile or "real_world_vision",
                },
            )

        searchable_text = _build_media_search_text(analysis, None, None)
        return LibraryMediaEnrichmentResponse(
            success=True,
            text=searchable_text,
            char_count=len(searchable_text),
            method="image_document_ocr" if request.analysis_profile == "document_ocr" else "image_vision",
            search_quality="full_text" if searchable_text else "metadata_only",
            caption=str(analysis.get("shortCaption") or "") or None,
            warning=None,
            metadata={
                "analysis_profile": request.analysis_profile or "real_world_vision",
                "ocr_text": str(analysis.get("ocrText") or "") or None,
                "objects": analysis.get("objects") or [],
                "styles": analysis.get("styles") or [],
                "materials": analysis.get("materials") or [],
                "colors": analysis.get("colors") or [],
                "architecture_tags": analysis.get("architectureTags") or [],
            },
        )

    if mime_type.startswith("video/"):
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

          if request.enable_vision:
              try:
                await _run_ffmpeg_extract_frame(video_path, frame_path)
                with open(frame_path, "rb") as image_handle:
                    analysis = await _call_gemini_vision_bytes(
                        image_handle.read(),
                        "image/jpeg",
                        session=session,
                    )
              except Exception as exc:
                warning_parts.append(f"frame_analysis_failed:{exc}")

          if request.enable_transcript:
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
        if request.enable_vision and request.enable_transcript:
            method = "video_frame_and_transcript"
        elif request.enable_transcript:
            method = "video_transcript"
        elif request.enable_vision:
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
                "analysis_profile": request.analysis_profile or (
                    "video_transcript" if request.enable_transcript and not request.enable_vision else "metadata_only"
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

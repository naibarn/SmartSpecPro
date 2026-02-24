"""
Celery task for importing presentations from PPTX files or Google Slides.

Worker startup (import queue):
  celery -A app.core.celery_app worker -Q presentation_import -c 4 --hostname=import@%h

Environment variables required:
  NODE_INTERNAL_URL           — http://localhost:3000 (default)
  SMARTSPEC_WEB_GATEWAY_TOKEN — shared secret for internal callback auth
"""

import json
import os
import re

import httpx
import structlog
from sqlalchemy import text

from app.core.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.services.google_token_service import GoogleTokenService
from app.services.gslides_importer import GSlidesImporter
from app.services.pptx_importer import PptxImporter
from app.services.r2_storage_service import get_r2_storage_service
from app.tasks.media_tasks import _run_async  # reuse canonical implementation

logger = structlog.get_logger(__name__)

NODE_INTERNAL_URL = os.environ.get("NODE_INTERNAL_URL", "http://localhost:3000")
WEB_GATEWAY_TOKEN = os.environ.get("SMARTSPEC_WEB_GATEWAY_TOKEN", "")

# Threshold for truncating slides JSON payload (8 MB)
_SLIDES_JSON_MAX_BYTES = 8 * 1024 * 1024


# ---------------------------------------------------------------------------
# Celery task entry point
# ---------------------------------------------------------------------------


@celery_app.task(
    name="tasks.import_presentation",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
    reject_on_worker_lost=True,
    time_limit=600,
    soft_time_limit=540,
)
def import_presentation_task(
    self,
    conversion_id: int,
    source_type: str,
    user_id: int,
    tenant_id: str,
    source_item_id: int | None = None,
    slides_url: str | None = None,
):
    """Outer sync entry point — delegates to async inner function via _run_async."""
    return _run_async(
        _import_async(self, conversion_id, source_type, user_id, tenant_id, source_item_id, slides_url)
    )


# ---------------------------------------------------------------------------
# DB helper
# ---------------------------------------------------------------------------


_ALLOWED_UPDATE_COLUMNS = frozenset({"status", "progress", "fidelity_warnings"})


async def _update_conversion(
    conversion_id: int,
    tenant_id: str,
    status: str | None = None,
    progress: int | None = None,
    fidelity_warnings: list[str] | None = None,
) -> None:
    """Update presentation_conversion_records using raw SQL.

    The tenant_id guard (S04-02) ensures a conversion record belonging to a
    different tenant cannot be modified even if a forged conversion_id is supplied.
    """
    sets: list[str] = []
    params: dict = {"cid": conversion_id, "tid": tenant_id}

    if status is not None:
        sets.append("status = :status")
        params["status"] = status
    if progress is not None:
        sets.append("progress = :progress")
        params["progress"] = progress
    if fidelity_warnings is not None:
        sets.append("fidelity_warnings = :fw::json")
        params["fw"] = json.dumps(fidelity_warnings)

    if not sets:
        return

    sets.append("updated_at = now()")
    sql = (
        f"UPDATE presentation_conversion_records SET {', '.join(sets)} "
        "WHERE id = :cid AND tenant_id = :tid"
    )
    async with AsyncSessionLocal() as session:
        await session.execute(text(sql), params)
        await session.commit()


# ---------------------------------------------------------------------------
# Async implementation
# ---------------------------------------------------------------------------


async def _import_async(
    task,
    conversion_id: int,
    source_type: str,
    user_id: int,
    tenant_id: str,
    source_item_id: int | None,
    slides_url: str | None,
) -> None:
    """Async implementation of the import task.

    Steps:
    1. Set status → "processing", progress → 5 in DB.
    2. Dispatch to the appropriate importer (PptxImporter or GSlidesImporter).
    3. After parsing: set progress → 90.
    4. Truncate slides JSON if > 8 MB.
    5. Notify Node.js callback.
    6. Set status → "done", progress → 100 in DB.
    7. On any exception: set status → "failed", notify Node.js with error, re-raise.
    """
    s3_prefix = f"{tenant_id}/presentations/imports/{conversion_id}"
    r2 = get_r2_storage_service()

    try:
        # Step 1: Mark as processing
        await _update_conversion(conversion_id, tenant_id, status="processing", progress=5)

        if source_type == "pptx":
            result = await _run_pptx_import(conversion_id, source_item_id, s3_prefix, r2)
        elif source_type == "google_slides":
            result = await _run_gslides_import(conversion_id, user_id, slides_url, s3_prefix, r2)
        else:
            raise ValueError(f"Unknown source_type: {source_type!r}")

        # Step 3: Progress 90 after parsing
        await _update_conversion(conversion_id, tenant_id, progress=90)

        # Step 4: Truncate slides JSON if > 8 MB
        slides = result.slides
        fidelity_warnings = list(result.fidelity_warnings)

        serialized = json.dumps(slides)
        if len(serialized.encode()) > _SLIDES_JSON_MAX_BYTES:
            slides, fidelity_warnings = _truncate_slides(slides, fidelity_warnings)

        # Step 5: Notify Node.js
        await _notify_nodejs(
            conversion_id,
            "done",
            slides=slides,
            fidelity_warnings=fidelity_warnings,
        )

        # Step 6: Update DB: done
        await _update_conversion(
            conversion_id,
            tenant_id,
            status="done",
            progress=100,
            fidelity_warnings=fidelity_warnings,
        )

        logger.info("presentation_import_complete", conversion_id=conversion_id)

    except Exception as exc:
        user_msg = (
            str(exc)
            if isinstance(exc, (ImportError, ValueError))
            else "Import failed due to an internal error"
        )
        logger.error("presentation_import_failed", conversion_id=conversion_id, error=str(exc))
        await _update_conversion(conversion_id, tenant_id, status="failed")
        await _notify_nodejs(conversion_id, "failed", error=user_msg)
        raise


# ---------------------------------------------------------------------------
# Path-specific helpers
# ---------------------------------------------------------------------------


async def _run_pptx_import(
    conversion_id: int,
    source_item_id: int | None,
    s3_prefix: str,
    r2,
):
    """Download the PPTX file and run PptxImporter."""
    # S04-08: Explicit None guard before DB query to produce a clear error message.
    if source_item_id is None:
        raise ValueError("source_item_id is required for PPTX import")

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT source_url FROM library_items WHERE id = :item_id"),
            {"item_id": source_item_id},
        )
        row = result.fetchone()
        if not row or not row.source_url:
            raise ValueError(f"Library item {source_item_id} has no source URL")
        s3_url = row.source_url

    # S04-05: SSRF protection — only allow HTTPS downloads from the configured storage backend.
    if not s3_url.startswith("https://"):
        raise ValueError(f"Library item source_url must use HTTPS, got: {s3_url[:32]!r}")

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.get(s3_url)
        resp.raise_for_status()
        pptx_bytes = resp.content

    importer = PptxImporter(r2_service=r2)
    return await importer.import_file(pptx_bytes, s3_prefix)


async def _run_gslides_import(
    conversion_id: int,
    user_id: int,
    slides_url: str | None,
    s3_prefix: str,
    r2,
):
    """Retrieve the access token and run GSlidesImporter."""
    async with AsyncSessionLocal() as session:
        token_service = GoogleTokenService(session)
        access_token = await token_service.get_valid_access_token(user_id)

    match = re.search(
        r"docs\.google\.com/presentation/d/([a-zA-Z0-9_-]+)",
        slides_url or "",
    )
    if not match:
        raise ValueError("Invalid Google Slides URL")
    presentation_id = match.group(1)

    importer = GSlidesImporter(access_token=access_token, r2_service=r2)
    return await importer.import_presentation(presentation_id, s3_prefix)


# ---------------------------------------------------------------------------
# Slides truncation
# ---------------------------------------------------------------------------


def _truncate_slides(
    slides: list[dict],
    fidelity_warnings: list[str],
) -> tuple[list[dict], list[str]]:
    """Binary-search for the maximum N slides that fit within _SLIDES_JSON_MAX_BYTES."""
    lo, hi = 0, len(slides)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if len(json.dumps(slides[:mid]).encode()) <= _SLIDES_JSON_MAX_BYTES:
            lo = mid
        else:
            hi = mid - 1

    truncated = slides[:lo]
    warnings = list(fidelity_warnings) + ["Import truncated: presentation too large to import fully"]
    logger.warning(
        "presentation_import_slides_truncated",
        original_count=len(slides),
        kept=lo,
    )
    return truncated, warnings


# ---------------------------------------------------------------------------
# Node.js callback
# ---------------------------------------------------------------------------


async def _notify_nodejs(
    conversion_id: int,
    status: str,
    slides=None,
    fidelity_warnings=None,
    error=None,
) -> None:
    """POST callback to Node.js internal route.

    Does NOT raise on HTTP error — notification failure must not fail the Celery task.
    Logs errors internally.

    Target: {NODE_INTERNAL_URL}/api/internal/presentation-import/callback
    Auth:   Authorization: Bearer {WEB_GATEWAY_TOKEN}
    """
    payload: dict = {"conversionId": conversion_id, "status": status}
    if slides is not None:
        payload["slides"] = slides
    if fidelity_warnings is not None:
        payload["fidelityWarnings"] = fidelity_warnings
    if error is not None:
        payload["error"] = error

    url = f"{NODE_INTERNAL_URL}/api/internal/presentation-import/callback"
    headers = {"Authorization": f"Bearer {WEB_GATEWAY_TOKEN}"}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
        logger.info(
            "presentation_import_callback_sent",
            conversion_id=conversion_id,
            status=status,
        )
    except Exception as exc:
        logger.error(
            "presentation_import_callback_failed",
            conversion_id=conversion_id,
            status=status,
            error=str(exc),
        )

"""Background backfill for missing media thumbnails."""

from __future__ import annotations

import mimetypes
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import httpx
import structlog
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.media_job_validators import validate_provider_result_uri
from app.models.media_task import MediaTask, TaskStatus
from app.services.media_pipeline import (
    MediaPipelineError,
    generate_thumbnail,
    upload_thumbnail_to_r2,
)

logger = structlog.get_logger()

DEFAULT_BACKFILL_LIMIT = 10
SUPPORTED_MEDIA_TYPES = {"image", "video"}
TRUSTED_RELATIVE_PREFIXES = ("/api/storage/files/", "/api/v1/media/files/", "/uploads/")


def _enum_or_str(value: Any) -> str:
    return value.value if hasattr(value, "value") else str(value or "")


def _is_usable_media_url(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    trimmed = value.strip()
    return (
        trimmed.startswith("http://")
        or trimmed.startswith("https://")
        or trimmed.startswith(TRUSTED_RELATIVE_PREFIXES)
    )


def _extract_first_url(value: Any, keys: tuple[str, ...]) -> str | None:
    if not value:
        return None
    if isinstance(value, str):
        return value.strip() if _is_usable_media_url(value) else None
    if isinstance(value, list):
        for item in value:
            found = _extract_first_url(item, keys)
            if found:
                return found
        return None
    if not isinstance(value, dict):
        return None
    for key in keys:
        candidate = value.get(key)
        if isinstance(candidate, str) and _is_usable_media_url(candidate):
            return candidate.strip()
    for key in ("result", "urls", "output", "response", "data", "taskResult", "kie_ai_response"):
        found = _extract_first_url(value.get(key), keys)
        if found:
            return found
    return None


def extract_task_result_url(task: MediaTask) -> str | None:
    if _is_usable_media_url(task.result_url):
        return str(task.result_url).strip()
    return _extract_first_url(
        task.result_data,
        (
            "url",
            "result_url",
            "resultUrl",
            "video_url",
            "videoUrl",
            "image_url",
            "imageUrl",
        ),
    )


def has_task_thumbnail(task: MediaTask) -> bool:
    return bool(_extract_first_url(
        task.result_data,
        (
            "thumbnail_url",
            "thumbnailUrl",
            "thumbnail",
            "poster_url",
            "posterUrl",
            "poster",
        ),
    ))


def _guess_extension(content_type: str, url: str) -> str:
    ext = mimetypes.guess_extension(content_type.split(";", 1)[0].strip())
    if ext:
        return ext
    path = urlsplit(url).path
    suffix = Path(path).suffix
    return suffix or ".bin"


def _resolve_download_url(url: str) -> tuple[str, bool]:
    trimmed = url.strip()
    if trimmed.startswith(TRUSTED_RELATIVE_PREFIXES):
        base = os.getenv("NODE_SERVER_URL") or os.getenv("WEB_BASE_URL") or "http://localhost:3000"
        return f"{base.rstrip('/')}{trimmed}", True
    return trimmed, False


async def download_backfill_source(result_url: str, tmp_dir: str) -> str:
    """Download a trusted historical media source for thumbnail extraction."""
    download_url, is_internal = _resolve_download_url(result_url)
    if not is_internal:
        try:
            validate_provider_result_uri(download_url)
        except ValueError as e:
            raise MediaPipelineError(f"Blocked URL: {e}") from e

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(300.0, connect=10.0),
        follow_redirects=True,
    ) as client:
        response = await client.get(download_url)
        response.raise_for_status()

    content_type = response.headers.get("content-type", "application/octet-stream")
    ext = _guess_extension(content_type, download_url)
    file_path = os.path.join(tmp_dir, f"source{ext}")
    await _write_bytes(file_path, response.content)
    return file_path


async def _write_bytes(path: str, data: bytes) -> None:
    import asyncio

    def _write() -> None:
        Path(path).write_bytes(data)

    await asyncio.to_thread(_write)


def build_thumbnail_result_data_patch(
    existing: Any,
    *,
    thumbnail_key: str | None,
    thumbnail_url: str | None,
) -> dict[str, Any]:
    result_data = dict(existing) if isinstance(existing, dict) else {}
    result_obj = dict(result_data.get("result")) if isinstance(result_data.get("result"), dict) else {}
    urls_obj = dict(result_data.get("urls")) if isinstance(result_data.get("urls"), dict) else {}
    r2_keys = dict(result_data.get("r2_keys")) if isinstance(result_data.get("r2_keys"), dict) else {}

    if thumbnail_url:
        result_obj["thumbnail_url"] = thumbnail_url
        urls_obj["thumbnail"] = thumbnail_url
    if thumbnail_key:
        r2_keys["thumbnail"] = thumbnail_key

    result_data["result"] = result_obj
    result_data["urls"] = urls_obj
    result_data["r2_keys"] = r2_keys
    result_data["thumbnail_backfill"] = {
        "status": "completed",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    return result_data


def build_thumbnail_failure_result_data_patch(existing: Any, *, error: str) -> dict[str, Any]:
    result_data = dict(existing) if isinstance(existing, dict) else {}
    result_data["thumbnail_backfill"] = {
        "status": "failed",
        "failed_at": datetime.now(timezone.utc).isoformat(),
        "error": error[:500],
    }
    return result_data


async def list_missing_thumbnail_tasks(
    db: AsyncSession,
    *,
    limit: int = DEFAULT_BACKFILL_LIMIT,
    media_type: str | None = None,
) -> list[MediaTask]:
    safe_limit = max(1, min(int(limit), 50))
    media_types = [media_type] if media_type in SUPPORTED_MEDIA_TYPES else sorted(SUPPORTED_MEDIA_TYPES)

    query = (
        select(MediaTask)
        .where(
            MediaTask.status == TaskStatus.COMPLETED.value,
            MediaTask.media_type.in_(media_types),
            MediaTask.result_url.isnot(None),
            text(
                """
                (
                  media_tasks.result_data IS NULL
                  OR (
                    media_tasks.result_data #>> '{result,thumbnail_url}' IS NULL
                    AND media_tasks.result_data #>> '{urls,thumbnail}' IS NULL
                    AND media_tasks.result_data #>> '{thumbnail_url}' IS NULL
                    AND media_tasks.result_data #>> '{thumbnailUrl}' IS NULL
                    AND media_tasks.result_data #>> '{thumbnail}' IS NULL
                    AND media_tasks.result_data #>> '{poster_url}' IS NULL
                    AND media_tasks.result_data #>> '{posterUrl}' IS NULL
                    AND media_tasks.result_data #>> '{poster}' IS NULL
                    AND media_tasks.result_data #>> '{r2_keys,thumbnail}' IS NULL
                    AND media_tasks.result_data #>> '{thumbnail_backfill,status}' IS NULL
                  )
                )
                """
            ),
        )
        .order_by(MediaTask.created_at.desc())
        .limit(safe_limit)
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def backfill_task_thumbnail(db: AsyncSession, task: MediaTask) -> dict[str, Any]:
    media_type = _enum_or_str(task.media_type)
    if media_type not in SUPPORTED_MEDIA_TYPES:
        return {"status": "skipped", "reason": "unsupported_media_type", "task_id": task.id}
    if has_task_thumbnail(task):
        return {"status": "skipped", "reason": "already_has_thumbnail", "task_id": task.id}

    result_url = extract_task_result_url(task)
    if not result_url:
        return {"status": "skipped", "reason": "missing_result_url", "task_id": task.id}

    tmp_dir = tempfile.mkdtemp(prefix=f"thumb_backfill_{task.id}_")
    try:
        file_path = await download_backfill_source(result_url, tmp_dir)
        thumbnail_path = await generate_thumbnail(file_path, media_type, tmp_dir)
        if not thumbnail_path:
            return {"status": "skipped", "reason": "thumbnail_generation_unavailable", "task_id": task.id}

        r2_info = await upload_thumbnail_to_r2(
            str(task.user_id or "0"),
            task.id,
            thumbnail_path,
            media_type,
            db_session=db,
        )
        task.result_data = build_thumbnail_result_data_patch(
            task.result_data,
            thumbnail_key=r2_info.get("thumbnail_key"),
            thumbnail_url=r2_info.get("thumbnail_url"),
        )
        await db.commit()
        return {
            "status": "completed",
            "task_id": task.id,
            "thumbnail_url": r2_info.get("thumbnail_url"),
        }
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


async def run_missing_media_thumbnail_backfill_batch(
    db: AsyncSession,
    *,
    limit: int = DEFAULT_BACKFILL_LIMIT,
    media_type: str | None = None,
) -> dict[str, Any]:
    tasks = await list_missing_thumbnail_tasks(db, limit=limit, media_type=media_type)
    result = {
        "status": "completed",
        "found": len(tasks),
        "completed": 0,
        "skipped": 0,
        "failed": 0,
        "items": [],
    }

    task_ids = [task.id for task in tasks]

    for task_id in task_ids:
        try:
            task = await db.get(MediaTask, task_id)
            if not task:
                item = {"status": "skipped", "task_id": task_id, "reason": "task_not_found"}
                result["items"].append(item)
                result["skipped"] += 1
                continue
            item = await backfill_task_thumbnail(db, task)
        except Exception as e:
            await db.rollback()
            logger.warning("media_thumbnail_backfill_task_failed", task_id=task_id, error=str(e))
            failure_task = await db.get(MediaTask, task_id)
            if failure_task:
                failure_task.result_data = build_thumbnail_failure_result_data_patch(
                    failure_task.result_data,
                    error=str(e),
                )
                await db.commit()
            item = {"status": "failed", "task_id": task_id, "error": str(e)}

        result["items"].append(item)
        if item.get("status") == "completed":
            result["completed"] += 1
        elif item.get("status") == "failed":
            result["failed"] += 1
        else:
            result["skipped"] += 1

    return result

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import structlog
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

from .exceptions import YouTubeApiError

logger = structlog.get_logger(__name__)


class YouTubeVideoClient:
    """Async-friendly YouTube Data API wrapper for upload/publish flows."""

    def __init__(
        self,
        credentials: Any,
        *,
        application_name: str = "SmartSpecPro",
        client: Any | None = None,
    ) -> None:
        self.credentials = credentials
        self.application_name = application_name
        self._client = client
        self._logger = logger.bind(component="youtube_video_client")

    def _get_client(self):
        if self._client is None:
            from googleapiclient.discovery import build

            self._client = build("youtube", "v3", credentials=self.credentials, cache_discovery=False)
        return self._client

    @staticmethod
    def _format_publish_at(publish_at: datetime | str) -> str:
        if isinstance(publish_at, str):
            return publish_at
        if publish_at.tzinfo is None:
            publish_at = publish_at.replace(tzinfo=timezone.utc)
        return publish_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

    @staticmethod
    def classify_shorts_candidate(width: int, height: int, duration_seconds: int) -> bool:
        if width <= 0 or height <= 0 or duration_seconds <= 0:
            return False
        return duration_seconds <= 180 and height >= width

    @staticmethod
    def _build_body(
        *,
        title: str,
        description: str,
        category_id: str = "22",
        tags: Iterable[str] | None = None,
        privacy_status: str = "private",
        publish_at: datetime | str | None = None,
        made_for_kids: bool = False,
        self_declared_made_for_kids: bool | None = None,
        contains_synthetic_media: bool | None = None,
    ) -> dict[str, Any]:
        snippet: dict[str, Any] = {
            "title": title,
            "description": description,
            "categoryId": category_id,
        }
        if tags:
            tag_list = [tag for tag in tags if str(tag).strip()]
            if tag_list:
                snippet["tags"] = tag_list

        status: dict[str, Any] = {
            "privacyStatus": "private" if publish_at is not None else privacy_status,
            "selfDeclaredMadeForKids": made_for_kids,
        }
        if publish_at is not None:
            status["publishAt"] = YouTubeVideoClient._format_publish_at(publish_at)
        if self_declared_made_for_kids is not None:
            status["selfDeclaredMadeForKids"] = self_declared_made_for_kids
        if contains_synthetic_media is not None:
            status["containsSyntheticMedia"] = contains_synthetic_media

        return {"snippet": snippet, "status": status}

    async def upload_video(
        self,
        file_path: str | Path,
        *,
        title: str,
        description: str,
        category_id: str = "22",
        tags: Iterable[str] | None = None,
        privacy_status: str = "private",
        publish_at: datetime | str | None = None,
        notify_subscribers: bool = False,
        made_for_kids: bool = False,
        self_declared_made_for_kids: bool | None = None,
        contains_synthetic_media: bool | None = None,
        mime_type: str = "video/mp4",
    ) -> dict[str, Any]:
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(path)

        def _run_upload() -> dict[str, Any]:
            youtube = self._get_client()
            body = self._build_body(
                title=title,
                description=description,
                category_id=category_id,
                tags=tags,
                privacy_status=privacy_status,
                publish_at=publish_at,
                made_for_kids=made_for_kids,
                self_declared_made_for_kids=self_declared_made_for_kids,
                contains_synthetic_media=contains_synthetic_media,
            )
            media = MediaFileUpload(str(path), chunksize=-1, resumable=True, mimetype=mime_type)
            request = youtube.videos().insert(
                part="snippet,status",
                body=body,
                media_body=media,
                notifySubscribers=notify_subscribers,
            )
            return request.execute(num_retries=3)

        try:
            return await asyncio.to_thread(_run_upload)
        except HttpError as exc:
            raise YouTubeApiError(
                f"YouTube upload failed: {exc.error_details if hasattr(exc, 'error_details') else exc}",
                status_code=getattr(exc.resp, "status", None),
            ) from exc

    async def fetch_video(self, video_id: str, *, parts: str = "snippet,status,processingDetails") -> dict[str, Any]:
        def _run_fetch() -> dict[str, Any]:
            youtube = self._get_client()
            response = youtube.videos().list(part=parts, id=video_id).execute(num_retries=3)
            items = response.get("items")
            if isinstance(items, list) and items:
                first = items[0]
                if isinstance(first, dict):
                    return first
            return response

        try:
            return await asyncio.to_thread(_run_fetch)
        except HttpError as exc:
            raise YouTubeApiError(
                f"YouTube fetch failed: {exc.error_details if hasattr(exc, 'error_details') else exc}",
                status_code=getattr(exc.resp, "status", None),
            ) from exc

    async def wait_for_processing(
        self,
        video_id: str,
        *,
        poll_interval_seconds: int = 10,
        timeout_seconds: int = 900,
    ) -> dict[str, Any]:
        deadline = asyncio.get_running_loop().time() + max(timeout_seconds, 1)
        interval = max(poll_interval_seconds, 1)

        while True:
            payload = await self.fetch_video(video_id)
            status = payload.get("status") if isinstance(payload, dict) else None
            processing = payload.get("processingDetails") if isinstance(payload, dict) else None
            processing_status = ""
            if isinstance(processing, dict):
                processing_status = str(processing.get("processingStatus") or "").lower()
            privacy_status = str(status.get("privacyStatus") if isinstance(status, dict) else "").lower()

            if processing_status in {"succeeded", "failed", "terminated"}:
                return payload
            if privacy_status in {"public", "unlisted", "private"} and processing_status == "":
                return payload

            if asyncio.get_running_loop().time() >= deadline:
                raise TimeoutError(f"YouTube video {video_id} did not finish processing within {timeout_seconds}s")

            await asyncio.sleep(interval)

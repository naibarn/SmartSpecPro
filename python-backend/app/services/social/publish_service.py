from __future__ import annotations

import ipaddress
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
import structlog

from app.services.social.exceptions import MetaApiError, TikTokApiError, YouTubeApiError
from app.services.social.meta_graph_client import MetaGraphClient
from app.services.social.tiktok_client import TikTokContentPostingClient
from app.services.social.youtube_client import YouTubeVideoClient

logger = structlog.get_logger(__name__)


def _extract_provider_post_id(payload: Any) -> str | None:
    if not payload or not isinstance(payload, dict):
        return None

    for key in ("provider_post_id", "providerPostId", "post_id", "postId", "publish_id", "id"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, int):
            return str(value)

    nested = payload.get("result")
    if isinstance(nested, dict):
        nested_value = _extract_provider_post_id(nested)
        if nested_value:
            return nested_value

    data = payload.get("data")
    if isinstance(data, dict):
        nested_value = _extract_provider_post_id(data)
        if nested_value:
            return nested_value

    return None


def _parse_publish_at(value: int | str | datetime | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, int):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _validate_public_media_url(raw_url: str) -> None:
    parsed = urlparse(raw_url)
    if parsed.scheme != "https":
        raise ValueError("Media URLs must use HTTPS")
    hostname = (parsed.hostname or "").lower()
    if hostname in {"localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254", "metadata.google.internal"}:
        raise ValueError("Media URL host is blocked")
    try:
        ip = ipaddress.ip_address(hostname)
    except ValueError:
        # Not an IP literal, continue.
        pass
    else:
        if ip.is_private or ip.is_loopback or ip.is_link_local:
            raise ValueError("Media URL points to a private or loopback address")


async def _download_media_url(url: str) -> tuple[Path, str, int]:
    _validate_public_media_url(url)
    suffix = Path(urlparse(url).path).suffix or ".mp4"
    temp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    temp_path = Path(temp.name)
    temp.close()

    total_bytes = 0
    content_type = "video/mp4"
    timeout = httpx.Timeout(connect=10.0, read=60.0, write=60.0, pool=10.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            content_type = response.headers.get("content-type", content_type)
            with temp_path.open("wb") as handle:
                async for chunk in response.aiter_bytes():
                    if not chunk:
                        continue
                    total_bytes += len(chunk)
                    handle.write(chunk)

    if total_bytes <= 0:
        try:
            temp_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise ValueError("Media URL returned an empty file")

    return temp_path, content_type, total_bytes


def _normalize_tiktok_privacy_level(options: list[Any], requested: str | None) -> str:
    normalized_options = [str(option).strip() for option in options if str(option).strip()]
    if not normalized_options:
        return requested or "SELF_ONLY"

    if requested:
        requested_upper = requested.strip().upper()
        for option in normalized_options:
            if option.upper() == requested_upper:
                return option

    for preferred in ("SELF_ONLY", "PUBLIC_TO_FRIENDS", "PUBLIC_TO_EVERYONE"):
        for option in normalized_options:
            if option.upper() == preferred:
                return option

    return normalized_options[0]


def _parse_video_metadata(value: Any) -> tuple[int | None, int | None, int | None]:
    if not isinstance(value, dict):
        return None, None, None
    width = value.get("width")
    height = value.get("height")
    duration = value.get("duration_seconds") or value.get("durationSeconds")
    return (
        int(width) if isinstance(width, (int, float)) and width > 0 else None,
        int(height) if isinstance(height, (int, float)) and height > 0 else None,
        int(duration) if isinstance(duration, (int, float)) and duration > 0 else None,
    )


def _build_youtube_credentials(access_token: str) -> Any:
    try:
        from google.oauth2.credentials import Credentials
    except ModuleNotFoundError as exc:  # pragma: no cover - dependency guard
        raise YouTubeApiError("YouTube publishing requires google-auth to be installed") from exc

    return Credentials(token=access_token)


async def publish_social_content(
    *,
    provider: str,
    access_token: str,
    page_id: str,
    message: str | None = None,
    link: str | None = None,
    media_urls: list[str] | None = None,
    title: str | None = None,
    description: str | None = None,
    tags: list[str] | None = None,
    privacy_status: str | None = None,
    scheduled_publish_time: int | None = None,
    publish_at: str | datetime | None = None,
    video_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    provider_id = provider.strip().lower()
    message_text = (message or "").strip()
    link_text = (link or "").strip() or None
    media_urls = [url.strip() for url in (media_urls or []) if isinstance(url, str) and url.strip()]
    publish_at_dt = _parse_publish_at(publish_at)
    if scheduled_publish_time is not None and publish_at_dt is None:
        publish_at_dt = datetime.fromtimestamp(int(scheduled_publish_time), tz=timezone.utc)

    if provider_id == "meta":
        client = MetaGraphClient(access_token, page_id=page_id)
        try:
            result = await client.create_post(message_text, link_text, scheduled_at=scheduled_publish_time)
        finally:
            await client.close()

        provider_post_id = _extract_provider_post_id(result)
        status = "scheduled" if scheduled_publish_time is not None else "published"
        return {
            "provider": provider_id,
            "status": status,
            "provider_post_id": provider_post_id,
            "result": result,
        }

    if provider_id == "tiktok":
        if publish_at_dt is not None or scheduled_publish_time is not None:
            raise TikTokApiError("TikTok does not support scheduled publishing yet")
        if not media_urls:
            raise TikTokApiError("TikTok publishing requires at least one media URL")

        temp_path, content_type, total_size = await _download_media_url(media_urls[0])
        try:
            async with TikTokContentPostingClient(access_token) as client:
                creator_info = await client.query_creator_info()
                creator_data = creator_info.get("data") if isinstance(creator_info, dict) else {}
                if not isinstance(creator_data, dict):
                    creator_data = {}

                privacy_options = []
                if isinstance(creator_data.get("privacy_level_options"), list):
                    privacy_options = creator_data["privacy_level_options"]
                privacy_level = _normalize_tiktok_privacy_level(privacy_options, privacy_status)

                post_info: dict[str, Any] = {
                    "title": (title or message_text or "SmartSpec Pro video").strip(),
                    "privacy_level": privacy_level,
                }
                if message_text:
                    post_info["description"] = message_text
                if link_text:
                    post_info["link"] = link_text

                source_info = {
                    "source": "FILE_UPLOAD",
                    "video_size": total_size,
                    "chunk_size": total_size,
                    "total_chunk_count": 1,
                }
                init_result = await client.init_direct_video_post(post_info=post_info, source_info=source_info)
                init_data = init_result.get("data") if isinstance(init_result, dict) else {}
                if not isinstance(init_data, dict):
                    init_data = {}
                upload_url = str(init_data.get("upload_url") or "").strip()
                publish_id = str(init_data.get("publish_id") or init_data.get("post_id") or "").strip()
                if not upload_url:
                    raise TikTokApiError("TikTok init response did not include upload_url")
                if not publish_id:
                    raise TikTokApiError("TikTok init response did not include publish_id")

                await client.upload_file_to_upload_url(upload_url, temp_path, content_type=content_type)
                final_result = await client.wait_for_terminal_status(publish_id)
                return {
                    "provider": provider_id,
                    "status": "published",
                    "provider_post_id": publish_id,
                    "result": {
                        "init": init_result,
                        "final": final_result,
                        "creator_info": creator_info,
                    },
                }
        finally:
            try:
                temp_path.unlink(missing_ok=True)
            except Exception:
                pass

    if provider_id == "youtube":
        if not media_urls:
            raise YouTubeApiError("YouTube publishing requires at least one media URL")

        temp_path, content_type, _total_size = await _download_media_url(media_urls[0])
        try:
            credentials = _build_youtube_credentials(access_token)
            client = YouTubeVideoClient(credentials)
            title_text = (title or message_text or "SmartSpec Pro video").strip()
            description_text = (description or message_text or title_text).strip()
            payload = await client.upload_video(
                temp_path,
                title=title_text,
                description=description_text,
                tags=tags or [],
                privacy_status=privacy_status or ("private" if publish_at_dt is not None else "public"),
                publish_at=publish_at_dt,
                mime_type=content_type or "video/mp4",
            )
            provider_post_id = _extract_provider_post_id(payload)
            shorts_candidate = None
            width, height, duration_seconds = _parse_video_metadata(video_metadata)
            if width and height and duration_seconds:
                shorts_candidate = YouTubeVideoClient.classify_shorts_candidate(width, height, duration_seconds)
            return {
                "provider": provider_id,
                "status": "scheduled" if publish_at_dt is not None else "published",
                "provider_post_id": provider_post_id,
                "shorts_candidate": shorts_candidate,
                "result": payload,
            }
        finally:
            try:
                temp_path.unlink(missing_ok=True)
            except Exception:
                pass

    raise MetaApiError(f"Unsupported social provider: {provider_id}")

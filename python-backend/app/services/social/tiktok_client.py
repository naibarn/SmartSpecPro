from __future__ import annotations

import asyncio
import math
from pathlib import Path
from urllib.parse import urlparse
from typing import Any

import httpx
import structlog

from .exceptions import TikTokApiError

logger = structlog.get_logger(__name__)


class TikTokContentPostingClient:
    """Async wrapper for TikTok Content Posting API.

    The client focuses on the video posting flows we need for background
    publishing: creator-info preflight, direct post, upload-to-inbox, upload
    transfer, status polling, and cancellation.
    """

    BASE_URL = "https://open.tiktokapis.com"
    UPLOAD_BASE_URL = "https://open-upload.tiktokapis.com"
    TERMINAL_STATUSES = frozenset({
        "FAILED",
        "PUBLISH_COMPLETE",
        "SEND_TO_USER_INBOX",
        "CANCELLED",
        "CANCELED",
    })

    def __init__(
        self,
        access_token: str,
        *,
        base_url: str | None = None,
        client: httpx.AsyncClient | None = None,
        timeout: float = 30.0,
    ) -> None:
        self.access_token = access_token
        self.base_url = (base_url or self.BASE_URL).rstrip("/")
        self._client = client or httpx.AsyncClient(
            timeout=httpx.Timeout(connect=10.0, read=timeout, write=timeout, pool=5.0),
            follow_redirects=False,
        )
        self._owns_client = client is None
        self._logger = logger.bind(component="tiktok_content_posting_client")

    async def __aenter__(self) -> "TikTokContentPostingClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.close()

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json; charset=UTF-8",
        }

    def _build_url(self, suffix: str) -> str:
        return f"{self.base_url.rstrip('/')}{suffix}"

    @staticmethod
    def _validate_upload_url(upload_url: str) -> None:
        parsed = urlparse(upload_url)
        if parsed.scheme != "https":
            raise TikTokApiError("TikTok upload_url must use HTTPS")
        hostname = (parsed.hostname or "").lower()
        if not hostname.endswith(".tiktokapis.com") and hostname != "tiktokapis.com":
            raise TikTokApiError(f"Unexpected TikTok upload host: {hostname!r}")

    async def _request_json(
        self,
        method: str,
        suffix: str,
        *,
        json_body: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        url = self._build_url(suffix)
        try:
            response = await self._client.request(
                method,
                url,
                headers={**self._headers(), **(headers or {})},
                json=json_body,
            )
        except httpx.RequestError as exc:
            raise TikTokApiError(f"TikTok request failed: {exc.__class__.__name__}") from exc

        payload: dict[str, Any] = {}
        try:
            body = response.json()
            if isinstance(body, dict):
                payload = body
        except Exception:
            payload = {}

        error = payload.get("error") if isinstance(payload, dict) else None
        code = error.get("code") if isinstance(error, dict) else None
        message = error.get("message") if isinstance(error, dict) else None

        if response.status_code >= 400 or (code and code != "ok"):
            raise TikTokApiError(
                message or f"TikTok API error (HTTP {response.status_code})",
                status_code=response.status_code,
                payload=payload,
            )

        return payload

    async def query_creator_info(self) -> dict[str, Any]:
        return await self._request_json("POST", "/v2/post/publish/creator_info/query/", json_body={})

    async def init_direct_video_post(
        self,
        *,
        post_info: dict[str, Any],
        source_info: dict[str, Any],
    ) -> dict[str, Any]:
        return await self._request_json(
            "POST",
            "/v2/post/publish/video/init/",
            json_body={
                "post_info": post_info,
                "source_info": source_info,
            },
        )

    async def init_inbox_video_upload(self, *, source_info: dict[str, Any]) -> dict[str, Any]:
        return await self._request_json(
            "POST",
            "/v2/post/publish/inbox/video/init/",
            json_body={"source_info": source_info},
        )

    async def upload_file_to_upload_url(
        self,
        upload_url: str,
        file_path: str | Path,
        *,
        content_type: str = "video/mp4",
        chunk_size: int = 10 * 1024 * 1024,
    ) -> None:
        self._validate_upload_url(upload_url)
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(path)

        total_size = path.stat().st_size
        if total_size <= 0:
            raise TikTokApiError("TikTok upload file is empty")

        effective_chunk_size = max(1, chunk_size)
        total_chunks = max(1, math.ceil(total_size / effective_chunk_size))

        with path.open("rb") as handle:
            offset = 0
            chunk_index = 0
            while offset < total_size:
                chunk = handle.read(min(effective_chunk_size, total_size - offset))
                if not chunk:
                    break
                last_byte = offset + len(chunk) - 1
                headers = {
                    "Content-Type": content_type,
                    "Content-Length": str(len(chunk)),
                    "Content-Range": f"bytes {offset}-{last_byte}/{total_size}",
                }
                response = await self._client.put(upload_url, content=chunk, headers=headers)
                if response.status_code not in {201, 206}:
                    raise TikTokApiError(
                        f"TikTok upload chunk failed (HTTP {response.status_code})",
                        status_code=response.status_code,
                    )
                offset += len(chunk)
                chunk_index += 1

        if chunk_index != total_chunks:
            self._logger.info(
                "tiktok_upload_chunk_count_adjusted",
                file_path=str(path),
                expected_chunks=total_chunks,
                actual_chunks=chunk_index,
            )

    async def fetch_status(self, publish_id: str) -> dict[str, Any]:
        return await self._request_json(
            "POST",
            "/v2/post/publish/status/fetch/",
            json_body={"publish_id": publish_id},
        )

    async def cancel_publish(self, publish_id: str) -> dict[str, Any]:
        return await self._request_json(
            "POST",
            "/v2/post/publish/cancel/",
            json_body={"publish_id": publish_id},
        )

    async def wait_for_terminal_status(
        self,
        publish_id: str,
        *,
        poll_interval_seconds: int = 10,
        timeout_seconds: int = 900,
    ) -> dict[str, Any]:
        deadline = asyncio.get_running_loop().time() + max(timeout_seconds, 1)
        interval = max(poll_interval_seconds, 1)

        while True:
            payload = await self.fetch_status(publish_id)
            data = payload.get("data") if isinstance(payload, dict) else None
            status = str(data.get("status") if isinstance(data, dict) else payload.get("status") if isinstance(payload, dict) else "").upper()
            if status in self.TERMINAL_STATUSES:
                return payload

            if asyncio.get_running_loop().time() >= deadline:
                raise TimeoutError(f"TikTok publish {publish_id} did not complete within {timeout_seconds}s")

            await asyncio.sleep(interval)

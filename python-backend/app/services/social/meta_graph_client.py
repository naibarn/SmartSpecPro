from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from collections.abc import AsyncIterable
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
import structlog

from .base_provider import SocialProviderClient
from .exceptions import MetaApiError, PermissionDeniedError, RateLimitExceededError, TokenExpiredError

logger = structlog.get_logger(__name__)

# Reels is independently pinned: changing the existing feed client's configured
# version would silently change other Meta integrations.
REELS_GRAPH_API_VERSION = "v27.0"


def scrub_access_tokens(value: Any) -> Any:
    """Redact Meta access_token values from strings and URLs."""
    if isinstance(value, str):
        try:
            parsed = urlsplit(value)
            if not parsed.query:
                return value
            params = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if k.lower() != "access_token"]
            return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(params), parsed.fragment))
        except Exception:
            return value.replace("access_token=", "access_token=[REDACTED]")
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for key, item in value.items():
            if key.lower() == "access_token":
                redacted[key] = "[REDACTED]"
            else:
                redacted[key] = scrub_access_tokens(item)
        return redacted
    if isinstance(value, list):
        return [scrub_access_tokens(item) for item in value]
    return value


@dataclass(slots=True)
class _RetryPlan:
    attempts: int
    delay: float


class MetaGraphClient(SocialProviderClient):
    def __init__(
        self,
        access_token: str,
        *,
        page_id: str | None = None,
        client: httpx.AsyncClient | None = None,
        api_version: str | None = None,
        base_url: str | None = None,
        timeout: float = 30.0,
    ) -> None:
        self.access_token = access_token
        self.page_id = page_id
        self.api_version = api_version or os.getenv("META_GRAPH_API_VERSION", "v25.0")
        self.base_url = base_url or f"https://graph.facebook.com/{self.api_version}"
        self.timeout = timeout
        self._client = client
        self._owns_client = client is None
        self._limits = httpx.Limits(max_connections=20, max_keepalive_connections=10)
        self._logger = logger.bind(component="meta_graph_client")

    async def __aenter__(self) -> "MetaGraphClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.close()

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout, limits=self._limits)
        return self._client

    def _build_url(self, path: str) -> str:
        return f"{self.base_url.rstrip('/')}/{path.lstrip('/')}"

    def _build_params(self, extra: dict[str, Any] | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {"access_token": self.access_token}
        if extra:
            params.update(extra)
        return params

    def _retry_plan(self, status_code: int, attempt: int, response: httpx.Response | None = None) -> _RetryPlan | None:
        if status_code == 429:
            delay = 2**attempt
            if response is not None:
                retry_after = response.headers.get("Retry-After")
                if retry_after is not None:
                    try:
                        delay = min(float(retry_after), 60.0)
                    except ValueError:
                        delay = min(delay, 60.0)
            return _RetryPlan(attempts=3, delay=delay)
        if status_code in {502, 503}:
            return _RetryPlan(attempts=3, delay=2**attempt)
        return None

    def _parse_error(self, response: httpx.Response) -> MetaApiError:
        payload: dict[str, Any] = {}
        try:
            body = response.json()
            if isinstance(body, dict):
                payload = body
        except Exception:
            body = None

        error = payload.get("error") if isinstance(payload, dict) else None
        code = None
        message = f"Meta API error (HTTP {response.status_code})"
        if isinstance(error, dict):
            code = error.get("code")
            message = error.get("message") or message
        elif isinstance(payload, dict) and "message" in payload:
            message = str(payload["message"])

        if code == 190:
            return TokenExpiredError(message, status_code=response.status_code, payload=payload)
        if code == 10:
            return PermissionDeniedError(message, status_code=response.status_code, payload=payload)
        if response.status_code == 429:
            return RateLimitExceededError(message, status_code=response.status_code, payload=payload)
        return MetaApiError(message, status_code=response.status_code, payload=payload)

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
        retry_transient: bool = True,
        base_url: str | None = None,
    ) -> dict[str, Any]:
        client = self._get_client()
        url = f"{base_url.rstrip('/')}/{path.lstrip('/')}" if base_url else self._build_url(path)
        merged_params = self._build_params(params)

        last_error: Exception | None = None
        for attempt in range(4):
            try:
                self._logger.info(
                    "meta_request",
                    method=method,
                    url=scrub_access_tokens(url),
                    params=scrub_access_tokens(merged_params),
                )
                response = await client.request(
                    method,
                    url,
                    params=merged_params,
                    json=json_body,
                    follow_redirects=False,
                )
            except httpx.RequestError as exc:
                safe_url = scrub_access_tokens(str(exc.request.url)) if getattr(exc, "request", None) else scrub_access_tokens(url)
                self._logger.warning("meta_request_error", method=method, url=safe_url, error=exc.__class__.__name__)
                raise MetaApiError(f"Meta request failed: {exc.__class__.__name__}") from exc

            if response.status_code < 300:
                try:
                    payload = response.json()
                    return payload if isinstance(payload, dict) else {"data": payload}
                except Exception:
                    return {"ok": True}

            retry_plan = self._retry_plan(response.status_code, attempt, response) if retry_transient else None
            if retry_plan is None or attempt >= retry_plan.attempts:
                raise self._parse_error(response)

            self._logger.warning(
                "meta_request_retry",
                method=method,
                url=scrub_access_tokens(url),
                status_code=response.status_code,
                delay=retry_plan.delay,
                attempt=attempt + 1,
            )
            await asyncio.sleep(retry_plan.delay)
            last_error = self._parse_error(response)

        if last_error is not None:
            raise last_error
        raise MetaApiError("Meta request failed")

    async def send_message(self, recipient_id: str, text: str) -> dict[str, Any]:
        return await self._request(
            "POST",
            self._path_for_page("messages"),
            json_body={
                "recipient": {"id": recipient_id},
                "message": {"text": text},
            },
        )

    async def create_post(
        self,
        message: str,
        link: str | None = None,
        scheduled_at: int | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"message": message}
        if link:
            payload["link"] = link
        if scheduled_at is not None:
            payload["published"] = False
            payload["scheduled_publish_time"] = int(scheduled_at)
        return await self._request("POST", self._path_for_page("feed"), json_body=payload)

    @staticmethod
    def _reels_video_id(video_id: str) -> str:
        # Provider identifiers are numeric; reject paths and query strings before
        # building a token-bearing URL.
        if not isinstance(video_id, str) or not video_id.isascii() or not video_id.isdigit():
            raise ValueError("Invalid Meta Reels video ID")
        return video_id

    @property
    def _reels_base_url(self) -> str:
        return f"https://graph.facebook.com/{REELS_GRAPH_API_VERSION}"

    async def start_reel_upload(self) -> dict[str, Any]:
        """Create an upload session. Persist the response before uploading.

        A timeout may mean Meta created a session; the caller must treat it as
        uncertain rather than automatically creating another one.
        """
        result = await self._request(
            "POST", self._path_for_page("video_reels"),
            json_body={"upload_phase": "start"}, retry_transient=False,
            base_url=self._reels_base_url,
        )
        video_id = result.get("video_id")
        upload_url = result.get("upload_url")
        if not isinstance(video_id, str) or not isinstance(upload_url, str):
            raise MetaApiError("Meta did not return a valid Reels upload session")
        self._validate_reel_upload_url(upload_url, video_id)
        return result

    @classmethod
    def _validate_reel_upload_url(cls, upload_url: str, video_id: str) -> None:
        cls._reels_video_id(video_id)
        parsed = urlsplit(upload_url)
        valid_paths = {f"/video-upload/{video_id}", f"/video-upload/{REELS_GRAPH_API_VERSION}/{video_id}"}
        if (parsed.scheme != "https" or parsed.netloc != "rupload.facebook.com"
                or parsed.path not in valid_paths or parsed.query or parsed.fragment):
            raise ValueError("Invalid Meta Reels upload URL")

    async def upload_reel_binary(
        self, *, video_id: str, upload_url: str, content: AsyncIterable[bytes],
        file_size: int, offset: int = 0,
    ) -> dict[str, Any]:
        """Stream bytes starting at offset; resume only from Meta's status offset."""
        self._validate_reel_upload_url(upload_url, video_id)
        if (not isinstance(file_size, int) or isinstance(file_size, bool)
                or not isinstance(offset, int) or isinstance(offset, bool)
                or file_size <= 0 or not 0 <= offset < file_size):
            raise ValueError("Invalid Reels upload size or offset")
        try:
            response = await self._get_client().request(
                "POST", upload_url,
                headers={"Authorization": f"OAuth {self.access_token}", "offset": str(offset),
                         "file_size": str(file_size), "Content-Type": "application/octet-stream",
                         "Content-Length": str(file_size - offset)},
                content=content, follow_redirects=False,
            )
        except httpx.RequestError as exc:
            # Do not log request headers or response bodies: they may contain credentials.
            raise MetaApiError(f"Meta upload failed: {exc.__class__.__name__}") from exc
        if response.status_code >= 300:
            raise self._parse_error(response)
        try:
            payload = response.json()
        except ValueError as exc:
            raise MetaApiError("Meta returned an invalid upload response") from exc
        if not isinstance(payload, dict) or payload.get("success") is not True:
            raise MetaApiError("Meta did not confirm the Reels upload")
        return payload

    async def get_reel_status(self, video_id: str) -> dict[str, Any]:
        """Fetch provider status, including bytes_transfered for safe resumption."""
        return await self._request(
            "GET", self._reels_video_id(video_id), params={"fields": "status"},
            base_url=self._reels_base_url,
        )

    async def finish_reel_upload(
        self, *, video_id: str, description: str, is_ai_generated: bool,
    ) -> dict[str, Any]:
        """Request public publication once; reconcile provider status on ambiguity."""
        result = await self._request(
            "POST", self._path_for_page("video_reels"),
            json_body={"upload_phase": "finish", "video_id": self._reels_video_id(video_id),
                       "video_state": "PUBLISHED", "description": description,
                       "is_ai_generated": is_ai_generated},
            retry_transient=False, base_url=self._reels_base_url,
        )
        if result.get("success") is not True:
            raise MetaApiError("Meta did not confirm the Reels publication request")
        return result

    async def get_comments(self, object_id: str, limit: int = 25, after: str | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {"limit": limit}
        if after:
            params["after"] = after
        return await self._request("GET", f"{object_id}/comments", params=params)

    async def reply_to_comment(self, object_id: str, message: str) -> dict[str, Any]:
        return await self._request(
            "POST",
            f"{object_id}/comments",
            json_body={"message": message},
        )

    async def hide_comment(self, comment_id: str) -> dict[str, Any]:
        return await self._request("POST", comment_id, json_body={"is_hidden": True})

    async def delete_comment(self, comment_id: str) -> dict[str, Any]:
        return await self._request("DELETE", comment_id)

    async def subscribe_webhooks(self, fields: list[str]) -> dict[str, Any]:
        return await self._request(
            "POST",
            self._path_for_page("subscribed_apps"),
            json_body={"subscribed_fields": ",".join(fields)},
        )

    async def unsubscribe_webhooks(self) -> dict[str, Any]:
        return await self._request("DELETE", self._path_for_page("subscribed_apps"))

    async def get_page_feed(self, limit: int = 25, after: str | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {"limit": limit}
        if after:
            params["after"] = after
        return await self._request("GET", self._path_for_page("feed"), params=params)

    def _path_for_page(self, suffix: str) -> str:
        if not self.page_id:
            raise MetaApiError("page_id is required for page-scoped Meta Graph calls")
        return f"{self.page_id}/{suffix.lstrip('/')}"

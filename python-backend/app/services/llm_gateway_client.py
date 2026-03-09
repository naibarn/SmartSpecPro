"""LLM Gateway Client — async HTTP client for Node.js LLM Gateway.

All LLM calls from Python services go through this client.
The Node.js gateway handles credit deduction, rate limiting, and audit logging.

Uses X-Internal-Token auth (not Authorization: Bearer) for service-to-service calls.

Feature: 032-Browser-Automation-Copilot, Section 02
"""

import asyncio
import logging
import uuid
from typing import Any, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class InsufficientCreditsError(Exception):
    """Raised when the gateway returns HTTP 402 (insufficient credits)."""

    def __init__(self, message: str = "Insufficient credits", trace_id: str = ""):
        super().__init__(message)
        self.trace_id = trace_id


class GatewayUnavailableError(Exception):
    """Raised when the gateway returns HTTP 5xx after retry, or on timeout."""

    def __init__(self, message: str = "Gateway unavailable", trace_id: str = ""):
        super().__init__(message)
        self.trace_id = trace_id


class LLMGatewayClient:
    """Async HTTP client for Node.js LLM Gateway.

    All LLM calls from Python services go through this client.
    Gateway handles credit deduction, rate limiting, and audit.
    """

    def __init__(
        self,
        base_url: str | None = None,
        token: str | None = None,
        timeout: int | None = None,
        max_retries: int | None = None,
    ):
        self._base_url = (base_url or settings.SMARTSPEC_WEB_GATEWAY_URL).rstrip("/")
        self._token = token or settings.SMARTSPEC_WEB_GATEWAY_TOKEN
        self._timeout = timeout or settings.SMARTSPEC_WEB_GATEWAY_TIMEOUT_SECONDS
        self._max_retries = max_retries if max_retries is not None else settings.SMARTSPEC_WEB_GATEWAY_RETRIES
        self._client: httpx.AsyncClient | None = None

    async def aclose(self) -> None:
        """Close the underlying HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    def _build_headers(
        self,
        user_id: int | None = None,
        tenant_id: str | None = None,
        trace_id: str | None = None,
    ) -> dict[str, str]:
        """Build request headers for internal auth."""
        tid = trace_id or uuid.uuid4().hex[:32]
        headers: dict[str, str] = {
            "X-Internal-Token": self._token,
            "x-trace-id": tid,
            "Content-Type": "application/json",
        }
        if user_id is not None:
            headers["X-User-Id"] = str(user_id)
        if tenant_id is not None:
            headers["X-Tenant-Id"] = str(tenant_id)
        return headers

    async def _request_with_retry(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        headers: dict[str, str],
        timeout: int | None = None,
    ) -> httpx.Response:
        """Execute HTTP request with retry logic for 429 and 5xx."""
        url = f"{self._base_url}{path}"
        req_timeout = timeout or self._timeout
        trace_id = headers.get("x-trace-id", "unknown")
        retries_429 = 0
        max_429_retries = 3
        retries_5xx = 0
        max_5xx_retries = 1

        while True:
            try:
                if self._client is None or self._client.is_closed:
                    self._client = httpx.AsyncClient(timeout=req_timeout)
                response = await self._client.request(
                    method, url, json=json_body, headers=headers
                )

                # Success
                if response.status_code < 400:
                    return response

                # 402 — Insufficient credits
                if response.status_code == 402:
                    raise InsufficientCreditsError(
                        f"Insufficient credits (traceId={trace_id})",
                        trace_id=trace_id,
                    )

                # 429 — Rate limited
                if response.status_code == 429:
                    retries_429 += 1
                    if retries_429 > max_429_retries:
                        raise GatewayUnavailableError(
                            f"Rate limited after {max_429_retries} retries (traceId={trace_id})",
                            trace_id=trace_id,
                        )
                    retry_after = response.headers.get("retry-after")
                    if retry_after:
                        wait = min(float(retry_after), 60.0)  # Cap at 60s
                    else:
                        wait = 2 ** (retries_429 - 1)  # 1, 2, 4
                    logger.warning(
                        "LLM Gateway 429, retry %d/%d in %.1fs (traceId=%s)",
                        retries_429, max_429_retries, wait, trace_id,
                    )
                    await asyncio.sleep(wait)
                    continue

                # 5xx — Server error
                if response.status_code >= 500:
                    retries_5xx += 1
                    if retries_5xx > max_5xx_retries:
                        raise GatewayUnavailableError(
                            f"Gateway error {response.status_code} after retry (traceId={trace_id})",
                            trace_id=trace_id,
                        )
                    logger.warning(
                        "LLM Gateway %d, retrying once (traceId=%s)",
                        response.status_code, trace_id,
                    )
                    await asyncio.sleep(1)
                    continue

                # Other 4xx — don't retry
                raise GatewayUnavailableError(
                    f"Gateway returned {response.status_code} (traceId={trace_id})",
                    trace_id=trace_id,
                )

            except (httpx.TimeoutException, httpx.ConnectError) as exc:
                raise GatewayUnavailableError(
                    f"Gateway timeout/connection error: {exc} (traceId={trace_id})",
                    trace_id=trace_id,
                ) from exc

    async def chat_completion(
        self,
        messages: list[dict[str, Any]],
        model: str,
        user_id: int | None = None,
        tenant_id: str | None = None,
        *,
        response_format: dict[str, Any] | None = None,
        temperature: float | None = None,
        trace_id: str | None = None,
        timeout: int | None = None,
    ) -> dict[str, Any]:
        """POST /v1/chat/completions via internal HTTP."""
        headers = self._build_headers(user_id, tenant_id, trace_id)

        body: dict[str, Any] = {"model": model, "messages": messages}
        if response_format is not None:
            body["response_format"] = response_format
        if temperature is not None:
            body["temperature"] = temperature

        response = await self._request_with_retry(
            "POST", "/v1/chat/completions", json_body=body, headers=headers,
            timeout=timeout,
        )
        return response.json()

    async def vision_call(
        self,
        prompt: str,
        screenshot_b64: str,
        model: str,
        user_id: int | None = None,
        tenant_id: str | None = None,
        *,
        trace_id: str | None = None,
    ) -> dict[str, Any]:
        """POST /v1/chat/completions with base64 image content blocks."""
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{screenshot_b64}"},
                    },
                ],
            }
        ]
        return await self.chat_completion(
            messages, model, user_id, tenant_id, trace_id=trace_id
        )

    async def list_available_models(
        self,
        category: str | None = None,
    ) -> list[dict[str, Any]]:
        """GET /v1/models — query enabled models from model_provider_map."""
        headers = self._build_headers()
        path = "/v1/models"
        if category:
            path = f"{path}?category={category}"

        response = await self._request_with_retry(
            "GET", path, headers=headers, timeout=30
        )
        data = response.json()
        return data.get("data", [])

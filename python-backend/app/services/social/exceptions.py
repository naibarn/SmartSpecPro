from __future__ import annotations

from typing import Any


class MetaApiError(Exception):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload or {}


class TokenExpiredError(MetaApiError):
    pass


class PermissionDeniedError(MetaApiError):
    pass


class RateLimitExceededError(MetaApiError):
    pass


class SocialProviderApiError(Exception):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload or {}


class TikTokApiError(SocialProviderApiError):
    pass


class YouTubeApiError(SocialProviderApiError):
    pass

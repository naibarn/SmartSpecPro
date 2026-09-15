"""Retired provider-specific task authentication compatibility module.

Feature 186 Cloudflare consumers use the canonical queue envelope and the
service's existing internal authentication boundary. No Google OIDC verifier
is retained for the removed task routes.
"""

from starlette.middleware.base import BaseHTTPMiddleware


class OIDCAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        return await call_next(request)

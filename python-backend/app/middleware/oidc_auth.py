"""OIDC token validation middleware for Cloud Tasks endpoints.

Validates that incoming requests to /tasks/* carry a valid Google OIDC token
from an authorized service account.
"""

import os

import structlog
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = structlog.get_logger()


class OIDCAuthMiddleware(BaseHTTPMiddleware):
    """Middleware that validates OIDC tokens on /tasks/* routes.

    In development mode (ENVIRONMENT=development), OIDC validation is skipped
    and a shared internal token is accepted instead.
    """

    async def dispatch(self, request: Request, call_next):
        """Validate OIDC token for /tasks/* paths."""
        # Only protect /tasks/* paths
        if not request.url.path.startswith("/tasks/"):
            return await call_next(request)

        environment = os.environ.get("ENVIRONMENT", "production")

        if environment == "development":
            return await self._validate_dev_token(request, call_next)

        return await self._validate_oidc_token(request, call_next)

    async def _validate_dev_token(self, request: Request, call_next):
        """In development, accept a shared internal token."""
        expected_token = os.environ.get("TASKS_INTERNAL_TOKEN", "")
        provided_token = request.headers.get("X-Internal-Token", "")

        if not expected_token or provided_token != expected_token:
            return JSONResponse(
                status_code=401,
                content={"error": "Unauthorized", "detail": "Invalid internal token"},
            )

        return await call_next(request)

    async def _validate_oidc_token(self, request: Request, call_next):
        """Validate Google OIDC token from Cloud Tasks / Cloud Scheduler."""
        auth_header = request.headers.get("Authorization", "")

        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"error": "Unauthorized", "detail": "Missing Authorization header"},
            )

        token = auth_header[7:]

        try:
            from google.oauth2 import id_token
            from google.auth.transport import requests as google_requests

            audience = os.environ.get("CLOUD_RUN_PYTHON_URL", "")
            claims = id_token.verify_oauth2_token(
                token,
                google_requests.Request(),
                audience=audience,
            )

            # Verify the caller is an allowed service account
            email = claims.get("email", "")
            project_id = os.environ.get("GCP_PROJECT_ID", "")
            allowed_emails = [
                f"cloud-run-api@{project_id}.iam.gserviceaccount.com",
                f"cloud-scheduler@{project_id}.iam.gserviceaccount.com",
            ]

            if email not in allowed_emails:
                logger.warning("oidc_unauthorized_sa", email=email)
                return JSONResponse(
                    status_code=401,
                    content={"error": "Unauthorized", "detail": "Service account not allowed"},
                )

            # Attach service account email to request state
            request.state.service_account_email = email

        except Exception as e:
            logger.warning("oidc_validation_failed", error=str(e))
            return JSONResponse(
                status_code=401,
                content={"error": "Unauthorized", "detail": "Invalid OIDC token"},
            )

        return await call_next(request)

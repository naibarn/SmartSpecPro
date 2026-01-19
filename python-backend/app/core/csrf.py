"""
SmartSpec Pro - CSRF Protection
Implements Double Submit Cookie pattern for CSRF protection
"""

import secrets
import hmac
import hashlib
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
import structlog

from app.core.config import settings

logger = structlog.get_logger(__name__)


class CSRFProtection:
    """
    CSRF Protection using Double Submit Cookie pattern with HMAC verification.

    This implementation:
    1. Generates a random CSRF token on first request
    2. Sets the token as a secure, httpOnly cookie
    3. Requires the token to be sent in custom header (X-CSRF-Token) for state-changing requests
    4. Verifies token matches between cookie and header using HMAC
    """

    def __init__(
        self,
        secret_key: Optional[str] = None,
        token_name: str = "csrf_token",
        header_name: str = "X-CSRF-Token",
        cookie_name: str = "csrf_token",
        cookie_path: str = "/",
        cookie_domain: Optional[str] = None,
        cookie_secure: bool = True,
        cookie_httponly: bool = True,
        cookie_samesite: str = "strict",
        token_length: int = 32,
        token_max_age: int = 3600,  # 1 hour
    ):
        """
        Initialize CSRF protection.

        Args:
            secret_key: Secret key for HMAC signing (uses settings.SECRET_KEY if not provided)
            token_name: Name for token storage
            header_name: HTTP header name to check for CSRF token
            cookie_name: Cookie name for CSRF token
            cookie_path: Cookie path
            cookie_domain: Cookie domain
            cookie_secure: Use secure cookie (HTTPS only)
            cookie_httponly: Use httpOnly cookie
            cookie_samesite: SameSite cookie attribute
            token_length: Length of generated tokens
            token_max_age: Token validity in seconds
        """
        self.secret_key = (secret_key or settings.SECRET_KEY).encode()
        self.token_name = token_name
        self.header_name = header_name
        self.cookie_name = cookie_name
        self.cookie_path = cookie_path
        self.cookie_domain = cookie_domain
        self.cookie_secure = cookie_secure
        self.cookie_httponly = cookie_httponly
        self.cookie_samesite = cookie_samesite
        self.token_length = token_length
        self.token_max_age = token_max_age

    def generate_token(self) -> str:
        """
        Generate a cryptographically secure CSRF token.

        Returns:
            CSRF token string
        """
        # Generate random token
        random_token = secrets.token_urlsafe(self.token_length)

        # Add timestamp for expiration
        timestamp = int(datetime.utcnow().timestamp())
        token_data = f"{random_token}:{timestamp}"

        # Sign with HMAC
        signature = hmac.new(
            self.secret_key,
            token_data.encode(),
            hashlib.sha256
        ).hexdigest()

        # Combine token, timestamp, and signature
        csrf_token = f"{random_token}.{timestamp}.{signature}"

        logger.debug("CSRF token generated", token_length=len(csrf_token))
        return csrf_token

    def verify_token(self, token: str) -> bool:
        """
        Verify CSRF token validity and signature.

        Args:
            token: CSRF token to verify

        Returns:
            True if valid, False otherwise
        """
        try:
            # Split token into components
            parts = token.split(".")
            if len(parts) != 3:
                logger.warning("Invalid CSRF token format", parts_count=len(parts))
                return False

            random_token, timestamp_str, signature = parts

            # Verify timestamp hasn't expired
            timestamp = int(timestamp_str)
            now = int(datetime.utcnow().timestamp())
            if now - timestamp > self.token_max_age:
                logger.warning("CSRF token expired", age=now - timestamp)
                return False

            # Verify HMAC signature
            token_data = f"{random_token}:{timestamp}"
            expected_signature = hmac.new(
                self.secret_key,
                token_data.encode(),
                hashlib.sha256
            ).hexdigest()

            if not hmac.compare_digest(signature, expected_signature):
                logger.warning("CSRF token signature mismatch")
                return False

            logger.debug("CSRF token verified successfully")
            return True

        except Exception as e:
            logger.error("CSRF token verification error", error=str(e))
            return False

    def get_token_from_request(self, request: Request) -> Optional[str]:
        """
        Extract CSRF token from request header.

        Args:
            request: FastAPI request object

        Returns:
            CSRF token or None if not found
        """
        return request.headers.get(self.header_name)

    def get_token_from_cookie(self, request: Request) -> Optional[str]:
        """
        Extract CSRF token from request cookie.

        Args:
            request: FastAPI request object

        Returns:
            CSRF token from cookie or None if not found
        """
        return request.cookies.get(self.cookie_name)

    def set_csrf_cookie(self, response: Response, token: str):
        """
        Set CSRF token cookie on response.

        Args:
            response: Response object to set cookie on
            token: CSRF token to set
        """
        response.set_cookie(
            key=self.cookie_name,
            value=token,
            max_age=self.token_max_age,
            path=self.cookie_path,
            domain=self.cookie_domain,
            secure=self.cookie_secure,
            httponly=self.cookie_httponly,
            samesite=self.cookie_samesite,
        )
        logger.debug("CSRF cookie set", cookie_name=self.cookie_name)


# Global CSRF protection instance
csrf_protection = CSRFProtection(
    cookie_secure=not settings.DEBUG,  # Only use secure cookies in production
    cookie_samesite="lax" if settings.DEBUG else "strict",  # More lenient in dev
)


class CSRFMiddleware(BaseHTTPMiddleware):
    """
    CSRF protection middleware for FastAPI.

    Protects against CSRF attacks for state-changing requests (POST, PUT, PATCH, DELETE).
    Safe methods (GET, HEAD, OPTIONS) are exempt from CSRF checks.
    """

    # Methods that require CSRF protection
    PROTECTED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

    # Paths that are exempt from CSRF protection (e.g., API endpoints with API key auth)
    EXEMPT_PATHS = {
        "/health",
        "/health/",
        "/docs",
        "/docs/",
        "/redoc",
        "/redoc/",
        "/openapi.json",
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/refresh",
        "/api/webhooks",  # Webhooks typically use HMAC signatures instead
    }

    async def dispatch(self, request: Request, call_next):
        """
        Process request and check CSRF token for protected methods.

        Args:
            request: FastAPI request
            call_next: Next middleware in chain

        Returns:
            Response object
        """
        # Check if path is exempt
        if request.url.path in self.EXEMPT_PATHS or request.url.path.startswith("/api/webhooks/"):
            return await call_next(request)

        # Safe methods don't require CSRF protection
        if request.method not in self.PROTECTED_METHODS:
            response = await call_next(request)

            # For safe methods, ensure CSRF cookie is set
            csrf_cookie = csrf_protection.get_token_from_cookie(request)
            if not csrf_cookie:
                # Generate and set new CSRF token
                new_token = csrf_protection.generate_token()
                csrf_protection.set_csrf_cookie(response, new_token)

            return response

        # Protected methods require CSRF token validation
        logger.debug(
            "CSRF check required",
            method=request.method,
            path=request.url.path
        )

        # Get token from cookie
        cookie_token = csrf_protection.get_token_from_cookie(request)
        if not cookie_token:
            logger.warning(
                "CSRF cookie missing",
                path=request.url.path,
                method=request.method
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "CSRF_TOKEN_MISSING",
                    "message": "CSRF token cookie not found. Please refresh the page.",
                    "details": {}
                }
            )

        # Get token from header
        header_token = csrf_protection.get_token_from_request(request)
        if not header_token:
            logger.warning(
                "CSRF header missing",
                path=request.url.path,
                method=request.method
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "CSRF_HEADER_MISSING",
                    "message": f"CSRF token required in {csrf_protection.header_name} header.",
                    "details": {}
                }
            )

        # Verify both tokens match and are valid
        if not hmac.compare_digest(cookie_token, header_token):
            logger.warning(
                "CSRF token mismatch",
                path=request.url.path,
                method=request.method
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "CSRF_TOKEN_MISMATCH",
                    "message": "CSRF token validation failed.",
                    "details": {}
                }
            )

        # Verify token is valid
        if not csrf_protection.verify_token(header_token):
            logger.warning(
                "CSRF token invalid",
                path=request.url.path,
                method=request.method
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "CSRF_TOKEN_INVALID",
                    "message": "CSRF token is invalid or expired. Please refresh the page.",
                    "details": {}
                }
            )

        # CSRF validation passed
        logger.debug("CSRF validation passed", path=request.url.path)

        # Process request
        response = await call_next(request)

        # Rotate CSRF token after successful state-changing request
        new_token = csrf_protection.generate_token()
        csrf_protection.set_csrf_cookie(response, new_token)

        return response


def get_csrf_token(request: Request) -> str:
    """
    Get or generate CSRF token for a request.
    Use this in endpoints that need to provide CSRF token to frontend.

    Args:
        request: FastAPI request

    Returns:
        CSRF token string
    """
    # Try to get existing token from cookie
    token = csrf_protection.get_token_from_cookie(request)

    if not token or not csrf_protection.verify_token(token):
        # Generate new token if not found or invalid
        token = csrf_protection.generate_token()

    return token

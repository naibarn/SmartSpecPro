"""
SmartSpec Pro - Middleware
Phase 0.4

FastAPI middleware for:
- Security headers
- Rate limiting
- Error handling
- Request logging
"""

import asyncio

from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware
import time
import structlog

import sentry_sdk
from app.core.security import rate_limiter
from app.core.errors import SmartSpecError, to_http_exception, RateLimitError
from app.core.request_validator import RequestValidationMiddleware

logger = structlog.get_logger()


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses"""
    
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        
        return response


class RequestTimeoutMiddleware(BaseHTTPMiddleware):
    """
    Enforces per-request timeout to prevent hung connections and resource exhaustion.

    Uses asyncio.wait_for to wrap downstream processing with a configurable timeout.
    Long-running paths (LLM inference, media generation) get an extended timeout.

    On timeout, returns a 504 Gateway Timeout JSON response.
    """

    DEFAULT_TIMEOUT: int = 120  # 2 minutes for standard requests
    LONG_TIMEOUT: int = 600  # 10 minutes for LLM/media/generation ops
    LONG_TIMEOUT_PREFIXES: tuple[str, ...] = (
        "/api/v1/llm/",
        "/api/v1/media/",
        "/api/v1/generate/",
        "/api/v1/workflows/",
        "/api/v1/orchestrator/",
    )
    # Internal live-browser routes already sit behind the web gateway, which applies
    # its own request budget. Wrapping these endpoints with BaseHTTPMiddleware +
    # asyncio.wait_for causes false 504s in-process while the handler keeps running.
    EXEMPT_TIMEOUT_PREFIXES: tuple[str, ...] = (
        "/api/v1/live-browser/",
    )

    async def dispatch(self, request: Request, call_next):
        timeout = self.DEFAULT_TIMEOUT
        path = request.url.path

        if any(path.startswith(prefix) for prefix in self.EXEMPT_TIMEOUT_PREFIXES):
            return await call_next(request)

        if any(path.startswith(prefix) for prefix in self.LONG_TIMEOUT_PREFIXES):
            timeout = self.LONG_TIMEOUT

        try:
            response = await asyncio.wait_for(call_next(request), timeout=timeout)
            return response
        except asyncio.TimeoutError:
            logger.warning(
                "Request timed out",
                method=request.method,
                path=path,
                timeout_seconds=timeout,
                client_ip=request.client.host if request.client else None,
            )
            return JSONResponse(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                content={
                    "error": "GATEWAY_TIMEOUT",
                    "message": f"Request timed out after {timeout}s",
                    "details": {"timeout_seconds": timeout, "path": path},
                },
            )


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Enhanced rate limiting middleware with JWT authentication support.
    Applies different rate limits based on authentication status and user tier.
    """

    async def dispatch(self, request: Request, call_next):
        # Get client identifier (IP address)
        client_ip = request.client.host if request.client else "unknown"

        # Try to extract user info from JWT token
        user_id = None
        is_authenticated = False
        tier = "standard"
        rate_limit_key = f"ip:{client_ip}"

        # Check for Authorization header
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            try:
                from app.core.auth import verify_token
                payload = verify_token(token, expected_type="access")

                if payload:
                    user_id = payload.get("sub") or payload.get("user_id")
                    is_authenticated = True
                    tier = payload.get("tier", "standard")  # Get tier from token

                    # Use user-based rate limiting for authenticated users
                    if user_id:
                        rate_limit_key = f"user:{user_id}"
            except Exception as e:
                # If token verification fails, treat as unauthenticated
                logger.debug("Token verification failed in rate limiter", error=str(e))
                pass

        # Check rate limit with authentication context
        allowed, rate_info = rate_limiter.check_rate_limit(
            rate_limit_key,
            is_authenticated=is_authenticated,
            tier=tier
        )

        if not allowed:
            logger.warning(
                "Rate limit exceeded",
                key=rate_limit_key,
                client_ip=client_ip,
                user_id=user_id,
                path=request.url.path,
                is_authenticated=is_authenticated,
                tier=tier
            )

            # Return 429 with rate limit headers
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "RATE_LIMIT_EXCEEDED",
                    "message": "Too many requests. Please try again later.",
                    "details": {
                        "limit": rate_info["limit"],
                        "retry_after": rate_info["retry_after"],
                        "reset": rate_info["reset"]
                    }
                },
                headers={
                    "X-RateLimit-Limit": str(rate_info["limit"]),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(rate_info["reset"]),
                    "Retry-After": str(rate_info["retry_after"])
                }
            )

        # Process request and add rate limit headers to response
        response = await call_next(request)

        # Add rate limit info headers
        response.headers["X-RateLimit-Limit"] = str(rate_info["limit"])
        response.headers["X-RateLimit-Remaining"] = str(rate_info["remaining"])
        response.headers["X-RateLimit-Reset"] = str(rate_info["reset"])

        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log all requests and responses"""
    
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # Log request
        logger.info(
            "Request started",
            method=request.method,
            path=request.url.path,
            client_ip=request.client.host if request.client else None
        )
        
        # Process request
        try:
            response = await call_next(request)
            duration = time.time() - start_time
            
            # Log response
            logger.info(
                "Request completed",
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                duration_ms=round(duration * 1000, 2)
            )
            
            return response
        
        except Exception as e:
            duration = time.time() - start_time
            
            logger.error(
                "Request failed",
                method=request.method,
                path=request.url.path,
                error=str(e),
                duration_ms=round(duration * 1000, 2),
                exc_info=e
            )
            
            raise


class SentryTagMiddleware(BaseHTTPMiddleware):
    """Set Sentry scope tags for request correlation."""

    async def dispatch(self, request: Request, call_next):
        request_id = getattr(request.state, "request_id", None)
        if request_id:
            sentry_sdk.set_tag("request_id", request_id)

        user_id = getattr(request.state, "user_id", None)
        if user_id:
            sentry_sdk.set_tag("user_id", str(user_id))
            sentry_sdk.set_user({"id": str(user_id)})

        # Check for job_id in path params or query
        job_id = request.path_params.get("job_id") or request.query_params.get("job_id")
        if job_id:
            sentry_sdk.set_tag("job_id", str(job_id))

        return await call_next(request)


class ErrorHandlingMiddleware(BaseHTTPMiddleware):
    """Global error handling middleware"""

    async def dispatch(self, request: Request, call_next):
        try:
            response = await call_next(request)
            return response

        except SmartSpecError as e:
            # Convert SmartSpec errors to HTTP exceptions
            http_exc = to_http_exception(e)
            return JSONResponse(
                status_code=http_exc.status_code,
                content=http_exc.detail
            )

        except Exception as e:
            # Log unexpected errors
            logger.error(
                "Unexpected error",
                error=str(e),
                error_type=type(e).__name__,
                path=request.url.path,
                exc_info=e
            )

            # Return generic error response
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={
                    "error": "INTERNAL_SERVER_ERROR",
                    "message": "An unexpected error occurred",
                    "details": {}
                }
            )


def setup_cors(app):
    """
    Setup CORS middleware with secure environment-based configuration.

    Security improvements:
    1. No wildcards in production
    2. Whitelist specific ports in development
    3. Strict origin validation
    4. Secure headers whitelist
    5. Credential support with strict origin checking
    """
    from app.core.config import settings
    import structlog

    logger = structlog.get_logger()

    # Get CORS origins from environment
    cors_origins_str = getattr(settings, 'CORS_ORIGINS', '')

    if cors_origins_str:
        # Parse comma-separated origins
        if isinstance(cors_origins_str, str):
            origins = [origin.strip() for origin in cors_origins_str.split(",")]
        elif isinstance(cors_origins_str, list):
            origins = cors_origins_str
    else:
        # Default origins for development only
        if settings.DEBUG:
            origins = [
                "http://localhost:3000",
                "http://localhost:5173",
                "http://localhost:8080",
                "http://localhost:1420",
                "tauri://localhost",
            ]
        else:
            # In production, require explicit CORS_ORIGINS configuration
            origins = []

    # SECURITY: Validate origins
    if not origins and not settings.DEBUG:
        logger.warning(
            "cors_not_configured_production",
            message="CORS_ORIGINS not set in production. No origins will be allowed."
        )

    # SECURITY: Don't allow wildcard in production
    if "*" in origins:
        if not settings.DEBUG:
            raise ValueError(
                "CORS_ORIGINS cannot contain wildcard (*) in production. "
                "Please set CORS_ORIGINS environment variable with specific domains."
            )
        else:
            logger.warning(
                "cors_wildcard_in_development",
                message="Wildcard CORS origin detected in development mode"
            )

    # SECURITY: Validate origin format (must be valid URLs)
    for origin in origins:
        if origin != "*" and not origin.startswith(("http://", "https://", "tauri://")):
            raise ValueError(
                f"Invalid CORS origin format: {origin}. "
                "Origins must start with http://, https://, or tauri://"
            )

    logger.info(
        "cors_configured",
        origins=origins,
        environment=settings.ENVIRONMENT,
        debug=settings.DEBUG
    )

    # In development, allow specific ports only - SECURITY FIX #7
    allow_origin_regex = None
    if settings.DEBUG:
        # Allow localhost and local network IPs on SPECIFIC PORTS ONLY
        # Ports: 3000 (React), 5173 (Vite), 8080 (Alt), 1420 (Tauri), 4200 (Angular), 8000-8099 (Dev servers)
        allowed_ports = "3000|5173|8080|1420|4200|800[0-9]|809[0-9]"
        allow_origin_regex = (
            rf"^https?://(localhost|127\.0\.0\.1|172\.\d{{1,3}}\.\d{{1,3}}\.\d{{1,3}}|"
            rf"192\.168\.\d{{1,3}}\.\d{{1,3}}|10\.\d{{1,3}}\.\d{{1,3}}\.\d{{1,3}}):({allowed_ports})$"
        )
        logger.info(
            "cors_allow_origin_regex_enabled_secure",
            message="Only specific development ports allowed",
            allowed_ports=allowed_ports.replace("|", ", ")
        )
    else:
        # In production, no regex - only explicit origins
        logger.info(
            "cors_production_mode",
            message="CORS origin regex disabled in production (explicit origins only)"
        )

    # SECURITY: Restricted allowed headers
    # Only allow necessary headers, not all headers
    allowed_headers = [
        "Authorization",
        "Content-Type",
        "Accept",
        "Origin",
        "X-Requested-With",
        "X-CSRF-Token",  # For CSRF protection
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
    ]

    # Add X-Proxy-Token only if SmartSpecWeb gateway is enabled
    if settings.SMARTSPEC_USE_WEB_GATEWAY:
        allowed_headers.append("X-Proxy-Token")

    # SECURITY: Restricted exposed headers
    # Tell browsers which response headers can be accessed by frontend JavaScript
    expose_headers = [
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
        "Retry-After",
        "X-Request-ID",
    ]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_origin_regex=allow_origin_regex,
        allow_credentials=True,  # Allow cookies and Authorization headers
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=allowed_headers,
        expose_headers=expose_headers,
        max_age=600,  # Cache preflight requests for 10 minutes
    )

    logger.info(
        "cors_middleware_configured",
        origins_count=len(origins),
        allow_credentials=True,
        max_age=600
    )


def setup_middleware(app):
    """
    Setup all middleware in correct order.

    Middleware execution order (outermost to innermost):
    1. Error handling - catches all errors
    2. Request/audit logging - logs all requests
    3. Security headers - adds security headers
    4. CORS - handles cross-origin requests
    5. CSRF protection - validates CSRF tokens
    6. Request timeout - enforces per-request timeout
    7. Rate limiting - enforces rate limits
    8. Request validation - validates request format
    9. OIDC validation - validates Cloud Tasks tokens
    """

    # Order matters: first added = last executed

    # 1. Error handling (outermost - catches all errors)
    app.add_middleware(ErrorHandlingMiddleware)

    # 1.5. Sentry tags (set request_id, user_id, job_id as Sentry tags)
    app.add_middleware(SentryTagMiddleware)

    # 2. Request and audit logging
    from app.core.request_logging import setup_request_logging
    setup_request_logging(app)

    # 3. Security headers
    app.add_middleware(SecurityHeadersMiddleware)

    # 4. CORS (must be before CSRF for preflight requests)
    setup_cors(app)

    # 5. CSRF protection
    from app.core.csrf import CSRFMiddleware
    from app.core.config import settings

    # CSRF protection enabled in ALL environments for security
    app.add_middleware(CSRFMiddleware)
    logger.info("CSRF protection enabled", environment=settings.ENVIRONMENT)

    # 6. Request timeout (prevents hung connections)
    app.add_middleware(RequestTimeoutMiddleware)

    # 7. Rate limiting (with JWT support)
    app.add_middleware(RateLimitMiddleware)

    # 8. Request validation (innermost)
    app.add_middleware(RequestValidationMiddleware)

    # 9. OIDC validation for /tasks/* endpoints (Cloud Tasks)
    from app.middleware.oidc_auth import OIDCAuthMiddleware
    app.add_middleware(OIDCAuthMiddleware)

    logger.info("All middleware configured successfully")

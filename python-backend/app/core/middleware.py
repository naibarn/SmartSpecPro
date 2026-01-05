"""
SmartSpec Pro - Middleware
Phase 0.4

FastAPI middleware for:
- Security headers
- Rate limiting
- Error handling
- Request logging
"""

from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware
import time
import structlog

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


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware"""
    
    async def dispatch(self, request: Request, call_next):
        # Get client identifier (IP address)
        client_ip = request.client.host if request.client else "unknown"
        
        # Check rate limit
        if not rate_limiter.check_rate_limit(client_ip):
            logger.warning("Rate limit exceeded", client_ip=client_ip, path=request.url.path)
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "RATE_LIMIT_EXCEEDED",
                    "message": "Too many requests. Please try again later.",
                    "details": {}
                }
            )
        
        response = await call_next(request)
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
    """Setup CORS middleware with environment-based configuration"""
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
        # Default origins for development
        origins = [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://localhost:8080",
        ]
    
    # Validate: don't allow wildcard in production
    if "*" in origins and not settings.DEBUG:
        raise ValueError(
            "CORS_ORIGINS cannot contain wildcard (*) in production. "
            "Please set CORS_ORIGINS environment variable with specific domains."
        )
    
    logger.info(
        "cors_configured",
        origins=origins,
        debug=settings.DEBUG
    )
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
        max_age=600,  # Cache preflight requests for 10 minutes
    )


def setup_middleware(app):
    """Setup all middleware"""
    
    # Order matters: first added = last executed
    
    # Error handling (outermost)
    app.add_middleware(ErrorHandlingMiddleware)
    
    # Request and audit logging
    from app.core.request_logging import setup_request_logging
    setup_request_logging(app)
    
    # Security headers (innermost - runs first)
    app.add_middleware(SecurityHeadersMiddleware)
    
    # Request validation
    app.add_middleware(RequestValidationMiddleware)
    
    # Rate limiting
    app.add_middleware(RateLimitMiddleware)
    
    # CORS
    setup_cors(app)
    
    logger.info("Middleware configured")

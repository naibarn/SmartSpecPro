"""
Request Logging Middleware
Comprehensive API request/response logging with audit trail
"""

import time
import uuid
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
import structlog

logger = structlog.get_logger()


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware for logging all API requests and responses
    
    Features:
    - Request ID generation
    - Request/response logging
    - Duration tracking
    - User identification
    - Audit trail
    - Error tracking
    """
    
    def __init__(self, app: ASGIApp):
        super().__init__(app)
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request and log details"""
        
        # Generate request ID
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        
        # Extract request details
        method = request.method
        path = request.url.path
        query_params = dict(request.query_params)
        client_ip = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("user-agent", "unknown")
        
        # Try to get user ID from request state (set by auth middleware)
        user_id = getattr(request.state, "user_id", None)
        
        # Start timer
        start_time = time.time()
        
        # Log request
        logger.info(
            "api_request_started",
            request_id=request_id,
            method=method,
            path=path,
            query_params=query_params,
            client_ip=client_ip,
            user_agent=user_agent,
            user_id=user_id
        )
        
        # Process request
        try:
            response = await call_next(request)
            
            # Calculate duration
            duration_ms = (time.time() - start_time) * 1000
            
            # Log successful response
            logger.info(
                "api_request_completed",
                request_id=request_id,
                method=method,
                path=path,
                status_code=response.status_code,
                duration_ms=round(duration_ms, 2),
                user_id=user_id
            )
            
            # Add request ID to response headers
            response.headers["X-Request-ID"] = request_id
            
            return response
        
        except Exception as e:
            # Calculate duration
            duration_ms = (time.time() - start_time) * 1000
            
            # Log error
            logger.error(
                "api_request_failed",
                request_id=request_id,
                method=method,
                path=path,
                error=str(e),
                error_type=type(e).__name__,
                duration_ms=round(duration_ms, 2),
                user_id=user_id
            )
            
            # Re-raise exception
            raise


class AuditLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware for audit logging of sensitive operations
    
    Logs:
    - Authentication events
    - Credit transactions
    - Payment operations
    - User management
    - Configuration changes
    """
    
    # Paths that require audit logging
    AUDIT_PATHS = [
        "/api/auth/register",
        "/api/auth/login",
        "/api/auth/logout",
        "/api/credits/topup",
        "/api/payments/checkout",
        "/api/payments/webhook",
        "/api/users/",  # Any user management endpoint
    ]
    
    def __init__(self, app: ASGIApp):
        super().__init__(app)
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request and audit if needed"""
        
        path = request.url.path
        
        # Check if path requires audit logging
        should_audit = any(
            path.startswith(audit_path)
            for audit_path in self.AUDIT_PATHS
        )
        
        if not should_audit:
            return await call_next(request)
        
        # Get request details
        request_id = getattr(request.state, "request_id", "unknown")
        method = request.method
        user_id = getattr(request.state, "user_id", None)
        client_ip = request.client.host if request.client else "unknown"
        
        # Log audit event (before)
        logger.info(
            "audit_event_started",
            request_id=request_id,
            event_type="api_call",
            method=method,
            path=path,
            user_id=user_id,
            client_ip=client_ip
        )
        
        # Process request
        try:
            response = await call_next(request)
            
            # Log audit event (after)
            logger.info(
                "audit_event_completed",
                request_id=request_id,
                event_type="api_call",
                method=method,
                path=path,
                status_code=response.status_code,
                user_id=user_id,
                client_ip=client_ip,
                success=response.status_code < 400
            )
            
            return response
        
        except Exception as e:
            # Log audit event (error)
            logger.error(
                "audit_event_failed",
                request_id=request_id,
                event_type="api_call",
                method=method,
                path=path,
                error=str(e),
                error_type=type(e).__name__,
                user_id=user_id,
                client_ip=client_ip
            )
            
            raise


def setup_request_logging(app):
    """Setup request logging middleware"""
    
    # Add request logging middleware
    app.add_middleware(RequestLoggingMiddleware)
    
    # Add audit logging middleware
    app.add_middleware(AuditLoggingMiddleware)
    
    logger.info("request_logging_middleware_configured")

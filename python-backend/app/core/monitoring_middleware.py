"""
Monitoring Middleware
FastAPI middleware for request monitoring
"""

import time
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
import structlog

from app.core.monitoring import metrics_collector, alert_manager

logger = structlog.get_logger()


class MonitoringMiddleware(BaseHTTPMiddleware):
    """
    Monitoring Middleware
    
    Tracks request metrics and performance
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request and collect metrics"""
        start_time = time.time()
        
        # Get request info
        method = request.method
        path = request.url.path
        
        # Process request
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception as e:
            # Record error
            duration = time.time() - start_time
            logger.error(
                "request_failed",
                method=method,
                path=path,
                duration=duration,
                error=str(e)
            )
            metrics_collector.record_error(
                error_type=type(e).__name__,
                error_message=str(e),
                context={"method": method, "path": path}
            )
            raise
        
        # Calculate duration
        duration = time.time() - start_time
        
        # Record metrics
        metrics_collector.record_request(
            endpoint=path,
            method=method,
            duration=duration,
            status_code=status_code
        )
        
        # Log request
        logger.info(
            "request_completed",
            method=method,
            path=path,
            status_code=status_code,
            duration=duration
        )
        
        # Add custom headers
        response.headers["X-Response-Time"] = f"{duration:.3f}s"
        
        # Check alerts
        if status_code >= 500:
            alert_manager.send_alert({
                "severity": "error",
                "type": "server_error",
                "message": f"{method} {path} returned {status_code}",
                "timestamp": time.time()
            })
        
        return response

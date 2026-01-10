"""
SmartSpec Pro - Request Validation Middleware
Phase 0 - Critical Gap Fix #4
"""

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import structlog

logger = structlog.get_logger()


class RequestValidationMiddleware(BaseHTTPMiddleware):
    """Middleware to validate all incoming requests"""

    MAX_REQUEST_SIZE = 10 * 1024 * 1024  # 10MB
    MAX_JSON_DEPTH = 20

    # Paths that allow non-JSON content (binary uploads)
    BINARY_UPLOAD_PATHS = [
        "/api/artifacts/upload/",
        "/api/kilo/media/",
    ]

    async def dispatch(self, request: Request, call_next):
        """Validate request before processing"""

        try:
            # Skip validation for OPTIONS requests (CORS preflight)
            if request.method == "OPTIONS":
                return await call_next(request)

            # Check if this is a binary upload endpoint
            is_binary_upload = any(
                request.url.path.startswith(path)
                for path in self.BINARY_UPLOAD_PATHS
            )

            # Validate request size
            content_length = request.headers.get("content-length")
            if content_length and int(content_length) > self.MAX_REQUEST_SIZE:
                logger.warning(
                    "Request too large",
                    size=content_length,
                    max_size=self.MAX_REQUEST_SIZE,
                    path=request.url.path
                )
                return JSONResponse(
                    status_code=413,
                    content={
                        "error": "Request too large",
                        "max_size": self.MAX_REQUEST_SIZE
                    }
                )

            # Validate content type for POST/PUT/PATCH (skip for binary uploads)
            if request.method in ["POST", "PUT", "PATCH"] and not is_binary_upload:
                content_type = request.headers.get("content-type", "")

                if not content_type:
                    logger.warning(
                        "Missing content-type header",
                        method=request.method,
                        path=request.url.path
                    )
                    return JSONResponse(
                        status_code=400,
                        content={
                            "error": "Missing Content-Type header"
                        }
                    )

                # Only allow JSON
                if "application/json" not in content_type:
                    logger.warning(
                        "Invalid content-type",
                        content_type=content_type,
                        path=request.url.path
                    )
                    return JSONResponse(
                        status_code=415,
                        content={
                            "error": "Unsupported Media Type",
                            "supported": ["application/json"]
                        }
                    )
            
            # Process request
            response = await call_next(request)
            return response
        
        except Exception as e:
            logger.error(
                "Request validation error",
                error=str(e),
                path=request.url.path,
                exc_info=e
            )
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Internal server error",
                    "message": "Request validation failed"
                }
            )


def validate_json_depth(data, current_depth=0, max_depth=20):
    """
    Validate JSON depth to prevent deeply nested attacks
    
    Args:
        data: JSON data to validate
        current_depth: Current nesting depth
        max_depth: Maximum allowed depth
    
    Raises:
        ValueError: If depth exceeds max_depth
    """
    if current_depth > max_depth:
        raise ValueError(f"JSON depth exceeds maximum of {max_depth}")
    
    if isinstance(data, dict):
        for value in data.values():
            validate_json_depth(value, current_depth + 1, max_depth)
    elif isinstance(data, list):
        for item in data:
            validate_json_depth(item, current_depth + 1, max_depth)


def validate_string_length(value: str, max_length: int = 10000, field_name: str = "field"):
    """
    Validate string length
    
    Args:
        value: String to validate
        max_length: Maximum allowed length
        field_name: Name of field for error message
    
    Raises:
        ValueError: If string exceeds max_length
    """
    if len(value) > max_length:
        raise ValueError(
            f"{field_name} exceeds maximum length of {max_length} characters"
        )

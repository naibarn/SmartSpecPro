"""
CSRF Token API
Provides endpoints for frontend to retrieve CSRF tokens
"""

from fastapi import APIRouter, Request, Response
from app.core.csrf import get_csrf_token, csrf_protection
import structlog

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/csrf", tags=["CSRF"])


@router.get("/token")
async def get_token(request: Request, response: Response):
    """
    Get CSRF token for the current session.
    Frontend should call this endpoint and include the token in X-CSRF-Token header
    for all state-changing requests (POST, PUT, PATCH, DELETE).

    Returns:
        CSRF token and usage instructions
    """
    # Get or generate CSRF token
    token = get_csrf_token(request)

    # Set CSRF cookie on response
    csrf_protection.set_csrf_cookie(response, token)

    logger.debug("CSRF token provided to client")

    return {
        "csrf_token": token,
        "header_name": csrf_protection.header_name,
        "cookie_name": csrf_protection.cookie_name,
        "instructions": {
            "message": "Include this token in the X-CSRF-Token header for POST, PUT, PATCH, DELETE requests",
            "example": f"headers: {{ '{csrf_protection.header_name}': '{token}' }}",
            "cookie": f"Cookie '{csrf_protection.cookie_name}' has been set automatically"
        }
    }


@router.get("/status")
async def csrf_status(request: Request):
    """
    Check if CSRF token is valid for the current session.

    Returns:
        CSRF protection status
    """
    cookie_token = csrf_protection.get_token_from_cookie(request)

    if not cookie_token:
        return {
            "protected": True,
            "has_token": False,
            "valid": False,
            "message": "No CSRF token found. Call /api/csrf/token to get one."
        }

    is_valid = csrf_protection.verify_token(cookie_token)

    return {
        "protected": True,
        "has_token": True,
        "valid": is_valid,
        "message": "CSRF token is valid" if is_valid else "CSRF token is invalid or expired"
    }

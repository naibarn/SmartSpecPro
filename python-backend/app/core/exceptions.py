'''
# R10: Centralized Exception Handling

This module provides centralized exception handlers for the FastAPI application
to ensure consistent and secure error responses.
'''

import structlog
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError

from app.services.credit_service import InsufficientCreditsError

logger = structlog.get_logger()


async def http_exception_handler(request: Request, exc: Exception):
    logger.error(
        "unhandled_exception",
        path=request.url.path,
        method=request.method,
        error=str(exc),
        exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An unexpected internal server error occurred."},
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # Serialize errors to be JSON-safe
    def serialize_error(error):
        """Convert error dict to JSON-serializable format"""
        serialized = {}
        for key, value in error.items():
            if key == 'ctx' and isinstance(value, dict):
                # Convert context values to strings
                serialized[key] = {k: str(v) for k, v in value.items()}
            elif isinstance(value, Exception):
                serialized[key] = str(value)
            else:
                serialized[key] = value
        return serialized
    
    serialized_errors = [serialize_error(e) for e in exc.errors()]
    
    # Log the validation error with more detail
    logger.warning(
        "validation_error",
        path=request.url.path,
        method=request.method,
        errors=serialized_errors,
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": serialized_errors},
    )


async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    logger.critical(
        "database_error",
        path=request.url.path,
        method=request.method,
        error=str(exc),
        exc_info=True,
    )
    # In a production environment, you might want to rollback the session here
    # if not handled automatically by a middleware.
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": "Database error. Please try again later."},
    )


async def insufficient_credits_exception_handler(request: Request, exc: InsufficientCreditsError):
    logger.warning(
        "insufficient_credits_triggered",
        path=request.url.path,
        user_id=request.state.user.id if hasattr(request.state, "user") else "unknown",
        required=exc.required,
        available=exc.available,
    )
    return JSONResponse(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        content={
            "detail": "Insufficient credits.",
            "required_credits": exc.required,
            "available_credits": exc.available,
        },
    )


def register_exception_handlers(app):
    '''Registers all custom exception handlers with the FastAPI app.'''
    app.add_exception_handler(Exception, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(SQLAlchemyError, sqlalchemy_exception_handler)
    app.add_exception_handler(InsufficientCreditsError, insufficient_credits_exception_handler)
    logger.info("Custom exception handlers registered.")

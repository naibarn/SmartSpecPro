"""
SmartSpec Pro - Logging Configuration
"""

import logging
import sys
from typing import Any
import structlog
from structlog.types import Processor

from app.core.config import settings


def setup_logging() -> None:
    """Setup structured logging with structlog"""
    
    # Configure standard logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, settings.LOG_LEVEL.upper()),
    )
    
    # Processors for structlog
    processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if settings.DEBUG:
        # Pretty console output for development
        processors.append(structlog.dev.ConsoleRenderer())
    else:
        # JSON output for production
        processors.append(structlog.processors.JSONRenderer())
    
    # Configure structlog
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str = __name__) -> Any:
    """Get a logger instance"""
    return structlog.get_logger(name)


def get_structured_logger(name: str = __name__) -> Any:
    """Get a structured logger instance (alias for get_logger).

    Returns a structlog logger that outputs JSON in production,
    compatible with Google Cloud Logging severity levels.
    """
    return structlog.get_logger(name)

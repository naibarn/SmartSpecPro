"""
SmartSpec Pro - LangSmith Integration (Optional)

This module provides optional LangSmith tracing for debugging and monitoring.
LangSmith is disabled by default and can be enabled via environment variables.

Usage:
    Set the following environment variables to enable:
    - LANGSMITH_ENABLED=true
    - LANGSMITH_API_KEY=your_api_key
    - LANGSMITH_PROJECT=your_project_name (optional, defaults to "smartspec-dev")
"""

import os
import structlog
from app.core.config import settings

logger = structlog.get_logger()


def initialize_langsmith() -> bool:
    """
    Initialize LangSmith tracing if enabled.
    
    Returns:
        bool: True if LangSmith was initialized, False otherwise
    """
    if not settings.LANGSMITH_ENABLED:
        logger.debug("LangSmith tracing is disabled")
        return False
    
    if not settings.LANGSMITH_API_KEY:
        logger.warning(
            "LangSmith is enabled but LANGSMITH_API_KEY is not set. "
            "Tracing will not work."
        )
        return False
    
    # Set environment variables for LangChain auto-tracing
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_API_KEY"] = settings.LANGSMITH_API_KEY
    os.environ["LANGCHAIN_PROJECT"] = settings.LANGSMITH_PROJECT
    os.environ["LANGCHAIN_ENDPOINT"] = settings.LANGSMITH_ENDPOINT
    
    logger.info(
        "LangSmith tracing initialized",
        project=settings.LANGSMITH_PROJECT,
        endpoint=settings.LANGSMITH_ENDPOINT
    )
    
    return True


def disable_langsmith():
    """
    Disable LangSmith tracing by unsetting environment variables.
    """
    os.environ.pop("LANGCHAIN_TRACING_V2", None)
    os.environ.pop("LANGCHAIN_API_KEY", None)
    os.environ.pop("LANGCHAIN_PROJECT", None)
    os.environ.pop("LANGCHAIN_ENDPOINT", None)
    
    logger.debug("LangSmith tracing disabled")


def is_langsmith_enabled() -> bool:
    """
    Check if LangSmith tracing is currently enabled.
    
    Returns:
        bool: True if LangSmith is enabled and configured
    """
    return (
        settings.LANGSMITH_ENABLED 
        and bool(settings.LANGSMITH_API_KEY)
        and os.environ.get("LANGCHAIN_TRACING_V2") == "true"
    )

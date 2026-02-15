"""
Tests for structured logging configuration.

Verifies that loggers produce structured output compatible with Cloud Logging.
"""

import pytest
from app.core.logging import get_logger, get_structured_logger


@pytest.mark.unit
class TestStructuredLogging:
    def test_get_logger_returns_bound_logger(self):
        """get_logger returns a structlog bound logger."""
        logger = get_logger("test")
        assert logger is not None
        assert hasattr(logger, "info")
        assert hasattr(logger, "error")
        assert hasattr(logger, "warning")

    def test_get_structured_logger_returns_bound_logger(self):
        """get_structured_logger returns a structlog bound logger."""
        logger = get_structured_logger("test")
        assert logger is not None
        assert hasattr(logger, "info")
        assert hasattr(logger, "error")

    def test_get_structured_logger_is_alias(self):
        """get_structured_logger is an alias for get_logger."""
        logger1 = get_logger("alias_test")
        logger2 = get_structured_logger("alias_test")
        # Both should return structlog BoundLogger instances
        assert type(logger1).__name__ == type(logger2).__name__

    def test_logger_can_bind_context(self):
        """Logger supports binding context variables."""
        logger = get_structured_logger("context_test")
        bound = logger.bind(request_id="test-123", job_id="job-456")
        assert bound is not None
        assert hasattr(bound, "info")

    def test_logger_supports_extra_kwargs(self):
        """Logger can accept extra keyword arguments."""
        logger = get_structured_logger("extra_test")
        # Should not raise
        logger.info(
            "Test message",
            request_id="test-123",
            route="/api/test",
            method="GET",
            status=200,
            latency_ms=42,
        )

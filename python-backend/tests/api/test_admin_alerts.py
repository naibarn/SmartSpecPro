"""
Tests for Admin Alerts API

Tests threshold checking, deduplication, and email sending.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime


@pytest.mark.unit
class TestAdminAlerts:
    """Test alert threshold checking logic."""

    @pytest.mark.asyncio
    async def test_check_dedup_returns_false_without_redis(self):
        """Dedup check returns False (not duplicate) when Redis unavailable."""
        from app.api.admin_alerts import _check_dedup
        result = await _check_dedup(None, "test_metric")
        assert result is False

    @pytest.mark.asyncio
    async def test_set_dedup_without_redis_is_noop(self):
        """Setting dedup without Redis is a no-op (does not raise)."""
        from app.api.admin_alerts import _set_dedup
        await _set_dedup(None, "test_metric")  # Should not raise

    @pytest.mark.asyncio
    async def test_check_dedup_returns_true_when_key_exists(self):
        """Dedup check returns True when Redis key exists."""
        from app.api.admin_alerts import _check_dedup
        mock_redis = AsyncMock()
        mock_redis.exists.return_value = 1
        result = await _check_dedup(mock_redis, "error_rate_5xx")
        assert result is True
        mock_redis.exists.assert_called_once_with("alert:error_rate_5xx:sent")

    @pytest.mark.asyncio
    async def test_check_dedup_returns_false_when_key_missing(self):
        """Dedup check returns False when Redis key does not exist."""
        from app.api.admin_alerts import _check_dedup
        mock_redis = AsyncMock()
        mock_redis.exists.return_value = 0
        result = await _check_dedup(mock_redis, "error_rate_5xx")
        assert result is False

    @pytest.mark.asyncio
    async def test_set_dedup_sets_key_with_ttl(self):
        """Setting dedup creates Redis key with 1-hour TTL."""
        from app.api.admin_alerts import _set_dedup, ALERT_DEDUP_TTL
        mock_redis = AsyncMock()
        await _set_dedup(mock_redis, "error_rate_5xx")
        mock_redis.set.assert_called_once_with(
            "alert:error_rate_5xx:sent", "1", ex=ALERT_DEDUP_TTL
        )

    @pytest.mark.asyncio
    async def test_get_admin_emails(self):
        """Gets email addresses of admin and domain_admin users."""
        from app.api.admin_alerts import _get_admin_emails
        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.fetchall.return_value = [
            ("admin@example.com",),
            ("domain_admin@example.com",),
        ]
        mock_db.execute.return_value = mock_result

        emails = await _get_admin_emails(mock_db)
        assert len(emails) == 2
        assert "admin@example.com" in emails
        assert "domain_admin@example.com" in emails

    @pytest.mark.asyncio
    async def test_get_admin_emails_excludes_none(self):
        """Admin email query excludes None email addresses."""
        from app.api.admin_alerts import _get_admin_emails
        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.fetchall.return_value = [
            ("admin@example.com",),
            (None,),
        ]
        mock_db.execute.return_value = mock_result

        emails = await _get_admin_emails(mock_db)
        assert len(emails) == 1
        assert "admin@example.com" in emails

    @pytest.mark.asyncio
    async def test_send_alert_email_no_recipients(self):
        """Send alert returns 0 when no admin emails."""
        from app.api.admin_alerts import _send_alert_email
        result = await _send_alert_email("Test", "10%", "5%", [])
        assert result == 0

    @pytest.mark.asyncio
    async def test_thresholds_are_defined(self):
        """All expected thresholds are defined."""
        from app.api.admin_alerts import THRESHOLDS
        assert "error_rate_5xx" in THRESHOLDS
        assert "job_failure_rate" in THRESHOLDS
        assert "callback_miss_rate" in THRESHOLDS
        assert "dlq_count" in THRESHOLDS

    @pytest.mark.asyncio
    async def test_dedup_ttl_is_one_hour(self):
        """Dedup TTL is set to 1 hour (3600 seconds)."""
        from app.api.admin_alerts import ALERT_DEDUP_TTL
        assert ALERT_DEDUP_TTL == 3600

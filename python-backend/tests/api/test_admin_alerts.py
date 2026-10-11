"""
Tests for Admin Alerts API

Tests threshold checking, deduplication, and email sending.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.unit
class TestAdminAlerts:
    """Test alert threshold checking logic."""

    @pytest.mark.asyncio
    async def test_claim_dedup_returns_false_when_claim_succeeds(self):
        """A newly claimed metric is not considered a duplicate."""
        from app.api.admin_alerts import _claim_alert_dedup
        with patch("app.services.postgres_ephemeral_store.claim_value", new=AsyncMock(return_value=True)) as claim:
            assert await _claim_alert_dedup("test_metric") is False
        claim.assert_awaited_once_with("admin_alert_dedupe", "test_metric", {"claimed": True}, 3600)

    @pytest.mark.asyncio
    async def test_claim_dedup_returns_true_when_key_is_already_claimed(self):
        """An existing unexpired claim suppresses duplicate notifications."""
        from app.api.admin_alerts import _claim_alert_dedup
        with patch("app.services.postgres_ephemeral_store.claim_value", new=AsyncMock(return_value=False)):
            assert await _claim_alert_dedup("error_rate_5xx") is True

    @pytest.mark.asyncio
    async def test_release_dedup_allows_retry_after_delivery_failure(self):
        """A failed delivery can release its persistent dedupe claim."""
        from app.api.admin_alerts import _release_alert_dedup
        with patch("app.services.postgres_ephemeral_store.delete_value", new=AsyncMock(return_value=True)) as delete:
            await _release_alert_dedup("error_rate_5xx")
        delete.assert_awaited_once_with("admin_alert_dedupe", "error_rate_5xx")

    @pytest.mark.asyncio
    async def test_claim_dedup_uses_one_hour_ttl(self):
        """The persistent dedupe claim uses the configured one-hour expiry."""
        from app.api.admin_alerts import ALERT_DEDUP_TTL, _claim_alert_dedup
        with patch("app.services.postgres_ephemeral_store.claim_value", new=AsyncMock(return_value=True)) as claim:
            await _claim_alert_dedup("error_rate_5xx")
        assert ALERT_DEDUP_TTL == 3600
        claim.assert_awaited_once_with(
            "admin_alert_dedupe", "error_rate_5xx", {"claimed": True}, ALERT_DEDUP_TTL
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

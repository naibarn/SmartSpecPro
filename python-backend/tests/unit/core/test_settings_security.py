"""Tests for Settings security-related configuration."""

import pytest

from app.core.config import Settings


class TestSecretKeyValidation:
    def test_allows_default_in_development(self):
        """In development, the default SECRET_KEY is allowed for convenience."""
        s = Settings(ENVIRONMENT="development", SECRET_KEY="change-this-in-production")
        assert s.SECRET_KEY == "change-this-in-production"

    def test_rejects_default_in_production(self):
        """In production, using the default SECRET_KEY should raise an error."""
        with pytest.raises(ValueError):
            Settings(ENVIRONMENT="production", SECRET_KEY="change-this-in-production")

    def test_rejects_too_short_secret_in_production(self):
        """In production, SECRET_KEY must be at least 32 characters long."""
        with pytest.raises(ValueError):
            Settings(ENVIRONMENT="production", SECRET_KEY="short-secret-key")


class TestLiveBrowserOperationalConfig:
    def test_rejects_empty_live_browser_owner(self):
        with pytest.raises(ValueError):
            Settings(LIVE_BROWSER_READINESS_OWNER="   ")

    def test_rejects_non_absolute_live_browser_runbook_url(self):
        with pytest.raises(ValueError):
            Settings(LIVE_BROWSER_READINESS_RUNBOOK_URL="/runbooks/live-browser")

    def test_rejects_watchdog_interval_larger_than_max_age(self):
        with pytest.raises(ValueError):
            Settings(
                LIVE_BROWSER_READINESS_WATCHDOG_INTERVAL_SECONDS=180,
                LIVE_BROWSER_READINESS_MAX_AGE_SECONDS=120,
            )

    def test_accepts_valid_live_browser_operational_contract(self):
        settings = Settings(
            LIVE_BROWSER_READINESS_PUBLISHER="celery-prod-eu",
            LIVE_BROWSER_READINESS_OWNER="live-browser-primary",
            LIVE_BROWSER_READINESS_RUNBOOK_URL="https://ops.example.com/runbooks/live-browser/readiness",
            LIVE_BROWSER_READINESS_PUBLISH_INTERVAL_SECONDS=45,
            LIVE_BROWSER_READINESS_WATCHDOG_INTERVAL_SECONDS=60,
            LIVE_BROWSER_READINESS_MAX_AGE_SECONDS=90,
            LIVE_BROWSER_READINESS_TTL_SECONDS=180,
            LIVE_BROWSER_MAINTENANCE_INTERVAL_SECONDS=240,
        )

        assert settings.LIVE_BROWSER_READINESS_OWNER == "live-browser-primary"

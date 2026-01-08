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

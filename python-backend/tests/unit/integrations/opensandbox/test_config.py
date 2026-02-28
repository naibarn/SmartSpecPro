"""Tests for OpenSandbox configuration."""
import pytest
from unittest.mock import patch


@pytest.mark.unit
@pytest.mark.sandbox
class TestOpenSandboxConfig:
    """Tests for the OpenSandboxSettings Pydantic config class."""

    def test_defaults_load_when_no_env_vars_set(self):
        """Default settings should be valid with OPENSANDBOX_ENABLED=False."""
        with patch.dict("os.environ", {}, clear=False):
            from app.integrations.opensandbox.config import OpenSandboxSettings

            settings = OpenSandboxSettings(
                _env_file=None,
            )
            assert settings.OPENSANDBOX_ENABLED is False
            assert settings.OPENSANDBOX_BASE_URL == "http://localhost:8080"
            assert settings.OPENSANDBOX_API_KEY == ""
            assert settings.OPENSANDBOX_REQUEST_TIMEOUT_SECONDS == 30
            assert settings.OPENSANDBOX_CREATE_TIMEOUT_SECONDS == 120

    def test_settings_override_from_environment(self):
        """Env vars should override all defaults."""
        env = {
            "OPENSANDBOX_ENABLED": "true",
            "OPENSANDBOX_BASE_URL": "http://custom:9090",
            "OPENSANDBOX_API_KEY": "test-key-123",
            "OPENSANDBOX_REQUEST_TIMEOUT_SECONDS": "60",
            "OPENSANDBOX_CREATE_TIMEOUT_SECONDS": "240",
            "OPENSANDBOX_READY_POLL_INTERVAL_MS": "5000",
            "SANDBOX_MAX_CONCURRENT_GLOBAL": "20",
        }
        with patch.dict("os.environ", env, clear=False):
            from app.integrations.opensandbox.config import OpenSandboxSettings

            settings = OpenSandboxSettings(_env_file=None)
            assert settings.OPENSANDBOX_ENABLED is True
            assert settings.OPENSANDBOX_BASE_URL == "http://custom:9090"
            assert settings.OPENSANDBOX_API_KEY == "test-key-123"
            assert settings.OPENSANDBOX_REQUEST_TIMEOUT_SECONDS == 60
            assert settings.OPENSANDBOX_CREATE_TIMEOUT_SECONDS == 240
            assert settings.OPENSANDBOX_READY_POLL_INTERVAL_MS == 5000
            assert settings.SANDBOX_MAX_CONCURRENT_GLOBAL == 20

    def test_disabled_flag_prevents_operations(self):
        """When OPENSANDBOX_ENABLED=false, is_enabled property returns False."""
        from app.integrations.opensandbox.config import OpenSandboxSettings

        settings = OpenSandboxSettings(
            OPENSANDBOX_ENABLED=False,
            OPENSANDBOX_BASE_URL="http://localhost:8080",
            _env_file=None,
        )
        assert settings.is_enabled is False

    def test_enabled_with_valid_url_returns_true(self):
        """When enabled=True and URL set, is_enabled returns True."""
        from app.integrations.opensandbox.config import OpenSandboxSettings

        settings = OpenSandboxSettings(
            OPENSANDBOX_ENABLED=True,
            OPENSANDBOX_BASE_URL="http://localhost:8080",
            _env_file=None,
        )
        assert settings.is_enabled is True

    def test_invalid_url_raises_validation_error(self):
        """A malformed base URL should raise a Pydantic validation error."""
        from pydantic import ValidationError

        from app.integrations.opensandbox.config import OpenSandboxSettings

        with pytest.raises(ValidationError):
            OpenSandboxSettings(
                OPENSANDBOX_BASE_URL="not-a-url",
                _env_file=None,
            )

    def test_timeout_settings_are_integers(self):
        """Timeout fields parse correctly from string env vars to int."""
        from app.integrations.opensandbox.config import OpenSandboxSettings

        settings = OpenSandboxSettings(
            OPENSANDBOX_REQUEST_TIMEOUT_SECONDS=45,
            OPENSANDBOX_CREATE_TIMEOUT_SECONDS=180,
            OPENSANDBOX_READY_POLL_INTERVAL_MS=3000,
            _env_file=None,
        )
        assert isinstance(settings.OPENSANDBOX_REQUEST_TIMEOUT_SECONDS, int)
        assert isinstance(settings.OPENSANDBOX_CREATE_TIMEOUT_SECONDS, int)
        assert isinstance(settings.OPENSANDBOX_READY_POLL_INTERVAL_MS, int)
        assert settings.OPENSANDBOX_REQUEST_TIMEOUT_SECONDS == 45

    def test_api_prefix_normalization(self):
        """API prefix is normalized with leading slash and no trailing slash."""
        from app.integrations.opensandbox.config import OpenSandboxSettings

        settings = OpenSandboxSettings(
            OPENSANDBOX_API_PREFIX="api/v1/",
            _env_file=None,
        )
        assert settings.OPENSANDBOX_API_PREFIX == "/api/v1"

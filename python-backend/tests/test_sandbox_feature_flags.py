"""Tests for OpenSandbox feature flag behavior in Python backend.

Tests verify that environment variables correctly control sandbox routing
at the configuration level.
"""
import pytest
from unittest.mock import patch


pytestmark = [pytest.mark.unit, pytest.mark.sandbox]


class TestOpenSandboxSettingsFlags:
    """Tests for the OpenSandboxSettings config reading feature flag env vars."""

    def test_enabled_defaults_to_false(self):
        """When no OPENSANDBOX_ENABLED env var is set, is_enabled returns False."""
        with patch.dict("os.environ", {}, clear=True):
            from app.integrations.opensandbox.config import OpenSandboxSettings
            settings = OpenSandboxSettings(_env_file=None)
            assert settings.OPENSANDBOX_ENABLED is False
            assert settings.is_enabled is False

    @patch.dict("os.environ", {"OPENSANDBOX_ENABLED": "true"})
    def test_enabled_reads_true_from_env(self):
        """OPENSANDBOX_ENABLED=true sets OPENSANDBOX_ENABLED to True."""
        from app.integrations.opensandbox.config import OpenSandboxSettings
        settings = OpenSandboxSettings(_env_file=None)
        assert settings.OPENSANDBOX_ENABLED is True

    @patch.dict("os.environ", {"OPENSANDBOX_ENABLED": "false"})
    def test_enabled_reads_false_from_env(self):
        """OPENSANDBOX_ENABLED=false sets OPENSANDBOX_ENABLED to False."""
        from app.integrations.opensandbox.config import OpenSandboxSettings
        settings = OpenSandboxSettings(_env_file=None)
        assert settings.OPENSANDBOX_ENABLED is False

    @patch.dict("os.environ", {
        "OPENSANDBOX_ENABLED": "true",
        "OPENSANDBOX_BASE_URL": "",
    })
    def test_enabled_but_no_url_returns_disabled(self):
        """is_enabled is False when OPENSANDBOX_ENABLED=true but URL is empty."""
        from app.integrations.opensandbox.config import OpenSandboxSettings
        settings = OpenSandboxSettings(_env_file=None)
        assert settings.OPENSANDBOX_ENABLED is True
        assert settings.is_enabled is False


class TestDispatchModeFlags:
    """Tests for OPENSANDBOX_DISPATCH_MODE behavior at config level."""

    def test_dispatch_mode_defaults_to_optional(self):
        """When OPENSANDBOX_DISPATCH_MODE is unset, default is 'optional'."""
        with patch.dict("os.environ", {}, clear=True):
            from app.integrations.opensandbox.config import OpenSandboxSettings
            settings = OpenSandboxSettings(_env_file=None)
            assert settings.OPENSANDBOX_DISPATCH_MODE == "optional"

    @patch.dict("os.environ", {"OPENSANDBOX_DISPATCH_MODE": "required"})
    def test_dispatch_mode_reads_required(self):
        """OPENSANDBOX_DISPATCH_MODE=required is read correctly."""
        from app.integrations.opensandbox.config import OpenSandboxSettings
        settings = OpenSandboxSettings(_env_file=None)
        assert settings.OPENSANDBOX_DISPATCH_MODE == "required"

    @patch.dict("os.environ", {"OPENSANDBOX_DISPATCH_MODE": "optional"})
    def test_dispatch_mode_reads_optional(self):
        """OPENSANDBOX_DISPATCH_MODE=optional is read correctly."""
        from app.integrations.opensandbox.config import OpenSandboxSettings
        settings = OpenSandboxSettings(_env_file=None)
        assert settings.OPENSANDBOX_DISPATCH_MODE == "optional"

    @patch.dict("os.environ", {"OPENSANDBOX_DISPATCH_MODE": "banana"})
    def test_dispatch_mode_rejects_invalid_values(self):
        """Invalid OPENSANDBOX_DISPATCH_MODE falls back to 'optional'."""
        from app.integrations.opensandbox.config import OpenSandboxSettings
        settings = OpenSandboxSettings(_env_file=None)
        assert settings.OPENSANDBOX_DISPATCH_MODE == "optional"


class TestPerFeatureFlags:
    """Tests for per-feature sandbox requirement flags."""

    def test_skills_required_defaults_to_false(self):
        """SANDBOX_REQUIRE_FOR_SKILLS defaults to False."""
        with patch.dict("os.environ", {}, clear=True):
            from app.integrations.opensandbox.config import OpenSandboxSettings
            settings = OpenSandboxSettings(_env_file=None)
            assert settings.SANDBOX_REQUIRE_FOR_SKILLS is False

    @patch.dict("os.environ", {"SANDBOX_REQUIRE_FOR_SKILLS": "true"})
    def test_skills_required_reads_true(self):
        """SANDBOX_REQUIRE_FOR_SKILLS=true sets flag to True."""
        from app.integrations.opensandbox.config import OpenSandboxSettings
        settings = OpenSandboxSettings(_env_file=None)
        assert settings.SANDBOX_REQUIRE_FOR_SKILLS is True

    @patch.dict("os.environ", {"SANDBOX_REQUIRE_FOR_SKILLS": "false"})
    def test_skills_required_reads_false(self):
        """SANDBOX_REQUIRE_FOR_SKILLS=false sets flag to False."""
        from app.integrations.opensandbox.config import OpenSandboxSettings
        settings = OpenSandboxSettings(_env_file=None)
        assert settings.SANDBOX_REQUIRE_FOR_SKILLS is False

    def test_media_required_defaults_to_false(self):
        """SANDBOX_REQUIRE_FOR_MEDIA defaults to False."""
        with patch.dict("os.environ", {}, clear=True):
            from app.integrations.opensandbox.config import OpenSandboxSettings
            settings = OpenSandboxSettings(_env_file=None)
            assert settings.SANDBOX_REQUIRE_FOR_MEDIA is False

    @patch.dict("os.environ", {"SANDBOX_REQUIRE_FOR_MEDIA": "true"})
    def test_media_required_reads_true(self):
        """SANDBOX_REQUIRE_FOR_MEDIA=true sets flag to True."""
        from app.integrations.opensandbox.config import OpenSandboxSettings
        settings = OpenSandboxSettings(_env_file=None)
        assert settings.SANDBOX_REQUIRE_FOR_MEDIA is True

    @patch.dict("os.environ", {"SANDBOX_REQUIRE_FOR_MEDIA": "false"})
    def test_media_required_reads_false(self):
        """SANDBOX_REQUIRE_FOR_MEDIA=false sets flag to False."""
        from app.integrations.opensandbox.config import OpenSandboxSettings
        settings = OpenSandboxSettings(_env_file=None)
        assert settings.SANDBOX_REQUIRE_FOR_MEDIA is False

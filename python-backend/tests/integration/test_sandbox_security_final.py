"""Final security verification for OpenSandbox integration.

Comprehensive checks that sandbox isolation, secret hygiene, and
artifact integrity are maintained across the entire system.

Markers: integration, sandbox, security
"""
import inspect
import pytest

pytestmark = [pytest.mark.integration, pytest.mark.sandbox]


class TestNetworkIsolation:
    """Verify sandbox network isolation configuration."""

    def test_sandbox_profiles_model_has_network_action(self):
        """SandboxProfile model includes networkDefaultAction column."""
        from app.models.sandbox import SandboxProfile

        columns = {c.name for c in SandboxProfile.__table__.columns}
        assert "networkDefaultAction" in columns

    def test_sandbox_config_model_has_network_field(self):
        """SandboxConfig pydantic model has network_action field."""
        from app.integrations.opensandbox.models import SandboxConfig

        fields = SandboxConfig.model_fields
        assert "network_action" in fields


class TestSecretHygiene:
    """Verify no secrets leak into sandbox environments."""

    def test_client_sends_api_key_via_header_not_body(self):
        """OpenSandboxClient sends API key as OPEN-SANDBOX-API-KEY header, not in request body."""
        source = inspect.getsource(
            __import__(
                "app.integrations.opensandbox.client", fromlist=["OpenSandboxClient"]
            )
        )
        assert "OPEN-SANDBOX-API-KEY" in source
        # API key should be in headers, not in json body
        assert 'headers["OPEN-SANDBOX-API-KEY"]' in source or "headers['OPEN-SANDBOX-API-KEY']" in source

    def test_sandbox_client_does_not_forward_database_url(self):
        """OpenSandboxClient source does not reference DATABASE_URL."""
        source = inspect.getsource(
            __import__(
                "app.integrations.opensandbox.client", fromlist=["OpenSandboxClient"]
            )
        )
        assert "DATABASE_URL" not in source

    def test_sandbox_client_does_not_forward_jwt_secret(self):
        """OpenSandboxClient source does not reference JWT_SECRET."""
        source = inspect.getsource(
            __import__(
                "app.integrations.opensandbox.client", fromlist=["OpenSandboxClient"]
            )
        )
        assert "JWT_SECRET" not in source

    def test_config_does_not_include_llm_keys(self):
        """OpenSandbox config settings do not include LLM API keys."""
        source = inspect.getsource(
            __import__(
                "app.integrations.opensandbox.config", fromlist=["OpenSandboxSettings"]
            )
        )
        assert "OPENAI_API_KEY" not in source
        assert "ANTHROPIC_API_KEY" not in source

    def test_sandbox_models_do_not_contain_secret_fields(self):
        """Sandbox pydantic models do not have fields for secrets."""
        from app.integrations.opensandbox.models import SandboxConfig

        field_names = set(SandboxConfig.model_fields.keys())
        secret_patterns = {"api_key", "secret", "password", "token", "jwt"}
        # None of the field names should match secret patterns
        for field in field_names:
            for pattern in secret_patterns:
                assert pattern not in field.lower(), (
                    f"SandboxConfig has suspicious field: {field}"
                )


class TestArtifactIntegrity:
    """Verify artifact model has integrity fields."""

    def test_sandbox_artifact_model_has_checksum(self):
        """SandboxArtifact model has sha256 column for integrity."""
        from app.models.sandbox import SandboxArtifact

        columns = {c.name for c in SandboxArtifact.__table__.columns}
        assert "sha256" in columns

    def test_sandbox_artifact_has_job_reference(self):
        """SandboxArtifact model references sandboxJobId for isolation via job."""
        from app.models.sandbox import SandboxArtifact

        columns = {c.name for c in SandboxArtifact.__table__.columns}
        assert "sandboxJobId" in columns

    def test_sandbox_artifact_has_size_bytes(self):
        """SandboxArtifact model tracks file size for billing."""
        from app.models.sandbox import SandboxArtifact

        columns = {c.name for c in SandboxArtifact.__table__.columns}
        assert "sizeBytes" in columns

"""OpenSandbox configuration settings."""
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class OpenSandboxSettings(BaseSettings):
    """Configuration for the OpenSandbox integration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    OPENSANDBOX_ENABLED: bool = False
    OPENSANDBOX_BASE_URL: str = "http://localhost:8080"
    OPENSANDBOX_API_PREFIX: str = "/v1"
    OPENSANDBOX_API_KEY: str = ""
    OPENSANDBOX_REQUEST_TIMEOUT_SECONDS: int = 30
    OPENSANDBOX_CREATE_TIMEOUT_SECONDS: int = 120
    OPENSANDBOX_READY_POLL_INTERVAL_MS: int = 2000
    OPENSANDBOX_MEDIA_IMAGE: str = "jrottenberg/ffmpeg:6-ubuntu"
    SANDBOX_ARTIFACT_BUCKET: str = "smartspec-sandbox-artifacts"
    SANDBOX_SIGNED_URL_TTL_SECONDS: int = 900
    SANDBOX_DEFAULT_NETWORK_ACTION: str = "deny"
    SANDBOX_MAX_CONCURRENT_GLOBAL: int = 10
    SANDBOX_MAX_CONCURRENT_PER_TENANT_DEFAULT: int = 3

    # Feature flags
    OPENSANDBOX_DISPATCH_MODE: str = "optional"
    SANDBOX_REQUIRE_FOR_SKILLS: bool = False
    SANDBOX_REQUIRE_FOR_MEDIA: bool = False

    @property
    def is_enabled(self) -> bool:
        """Return True if OpenSandbox is enabled and has a valid base URL."""
        return self.OPENSANDBOX_ENABLED and bool(self.OPENSANDBOX_BASE_URL)

    @field_validator("OPENSANDBOX_BASE_URL")
    @classmethod
    def validate_base_url(cls, v: str) -> str:
        """Reject obviously malformed URLs."""
        if v and not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError(
                f"OPENSANDBOX_BASE_URL must start with http:// or https://, got: {v}"
            )
        return v.rstrip("/")

    @field_validator("OPENSANDBOX_API_PREFIX")
    @classmethod
    def validate_api_prefix(cls, v: str) -> str:
        """Normalize optional API prefix (e.g. /v1, /api/v1, or empty)."""
        if not v:
            return ""
        normalized = v.strip()
        if not normalized:
            return ""
        if not normalized.startswith("/"):
            normalized = f"/{normalized}"
        return normalized.rstrip("/")

    @field_validator("OPENSANDBOX_DISPATCH_MODE")
    @classmethod
    def validate_dispatch_mode(cls, v: str) -> str:
        """Clamp dispatch mode to known values, defaulting to 'optional'."""
        if v not in ("optional", "required"):
            return "optional"
        return v


opensandbox_settings = OpenSandboxSettings()

"""
SmartSpec Pro - Core Configuration
"""

from typing import List, Literal, Union
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator, model_validator


class Settings(BaseSettings):
    """Application settings"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra='ignore',
    )

    # App
    APP_NAME: str = "SmartSpec Pro"
    APP_VERSION: str = "0.2.0"
    SITE_URL: str = "https://smartspec.pro"
    SITE_NAME: str = "SmartSpec Pro"
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: Union[str, List[str]] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8080",
        "http://localhost:1420",  # Tauri desktop app
        "http://172.22.241.100:1420",  # Tauri desktop app (network)
        "tauri://localhost",  # Tauri protocol
    ]

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/smartspec.db"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_MAX_CONNECTIONS: int = 50

    # LLM Providers
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"

    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_BASE_URL: str = "https://api.anthropic.com"

    GOOGLE_API_KEY: str = ""

    GROQ_API_KEY: str = ""
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"

    OLLAMA_BASE_URL: str = "http://localhost:11434"

    OPENROUTER_API_KEY: str = ""
    OPENROUTER_SITE_URL: str = "https://smartspec.pro"  # Your site URL for rankings
    OPENROUTER_SITE_NAME: str = "SmartSpec Pro"  # Your site name for rankings

    ZAI_API_KEY: str = ""
    ZAI_USE_CODING_ENDPOINT: bool = False  # Use coding endpoint for GLM Coding Plan

    KILOCODE_API_KEY: str = ""
    KILOCODE_BASE_URL: str = "https://api.kilo.ai/api/openrouter"

    # Stripe Payment
    STRIPE_PUBLISHABLE_KEY: str = ""
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_CURRENCY: str = "USD"
    PAYMENT_MIN_AMOUNT: float = 5.00
    PAYMENT_MAX_AMOUNT: float = 10000.00

    # Security
    SECRET_KEY: str = "change-this-in-production"
    JWT_SECRET: str = "change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15  # 15 minutes for security
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7  # 7 days
    ENCRYPTION_MASTER_KEY: str = "change-this-in-production-32-chars-min"  # For encrypting provider API keys

    # ============================================================
    # SmartSpecWeb Gateway Integration (OpenAI-compatible)
    # ============================================================
    # When enabled, Python backend can expose `/v1/chat/completions` and forward to SmartSpecWeb gateway
    SMARTSPEC_USE_WEB_GATEWAY: bool = True
    SMARTSPEC_WEB_GATEWAY_URL: str = ""  # e.g. http://localhost:3000
    SMARTSPEC_WEB_GATEWAY_TOKEN: str = ""  # bearer token for SmartSpecWeb gateway (static or signed)
    SMARTSPEC_MCP_BASE_URL: str = ""  # optional; defaults to WEB_GATEWAY_URL
    SMARTSPEC_WEB_GATEWAY_TIMEOUT_SECONDS: int = 600
    SMARTSPEC_WEB_GATEWAY_RETRIES: int = 2  # number of retries on transient errors (in addition to first attempt)

    # Optional auth gate for the Python OpenAI-compatible surface (if set, require Authorization Bearer)
    SMARTSPEC_PROXY_TOKEN: str = ""

    # Restrict OpenAI-compatible surface to localhost by default (recommended for desktop)
    SMARTSPEC_LOCALHOST_ONLY: bool = True

    # LLM Proxy
    USE_OPENROUTER: bool = True  # Use OpenRouter by default
    DEFAULT_BUDGET_PRIORITY: Literal["quality", "cost", "speed", "balanced"] = "balanced"
    DEFAULT_TEMPERATURE: float = 0.7
    DEFAULT_MAX_TOKENS: int = 4000

    # LangGraph
    CHECKPOINT_DIR: str = "./data/checkpoints"
    STATE_DIR: str = "./data/state"
    MAX_PARALLEL_WORKFLOWS: int = 5

    # LangGraph Checkpoint Database (PostgreSQL)
    # Format: postgresql://user:password@host:port/database
    CHECKPOINT_DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/smartspec_checkpoints"
    CHECKPOINT_POOL_SIZE: int = 5

    # Workflow
    WORKFLOWS_DIR: str = "../.smartspec/workflows"
    WORKFLOW_TIMEOUT_SECONDS: int = 300

    # Kilo Code CLI
    KILO_CLI_PATH: str = "kilo"
    KILO_CLI_TIMEOUT: int = 300

    # Auth Generator
    AUTH_GENERATOR_PATH: str = "../auth-generator/dist/cli/index.js"

    # Monitoring
    ENABLE_TELEMETRY: bool = True
    SENTRY_DSN: str = ""

    # LangSmith (Optional - for debugging and tracing)
    # Set LANGSMITH_ENABLED=true to enable tracing
    LANGSMITH_ENABLED: bool = False
    LANGSMITH_API_KEY: str = ""
    LANGSMITH_PROJECT: str = "smartspec-dev"
    LANGSMITH_ENDPOINT: str = "https://api.smith.langchain.com"

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_BURST: int = 10

    @model_validator(mode="after")
    def validate_production_security(self):
        """Ensure all security settings are properly configured in production."""
        if self.ENVIRONMENT != "production":
            return self

        # Validate SECRET_KEY
        forbidden_secrets = [
            "change-this-in-production",
            "dev-secret-key",
            "dev_jwt_secret",
            "dev_token"
        ]

        if not self.SECRET_KEY or any(forbidden in self.SECRET_KEY for forbidden in forbidden_secrets):
            raise ValueError(
                "SECRET_KEY must be set to a secure value in production. "
                "Generate with: openssl rand -hex 32"
            )

        if len(self.SECRET_KEY) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters in production")

        # Validate JWT_SECRET
        if not self.JWT_SECRET or any(forbidden in self.JWT_SECRET for forbidden in forbidden_secrets):
            raise ValueError(
                "JWT_SECRET must be set to a secure value in production. "
                "Generate with: openssl rand -hex 32"
            )

        if len(self.JWT_SECRET) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters in production")

        # Validate DEBUG is disabled
        if self.DEBUG:
            raise ValueError("DEBUG must be False in production")

        # Validate LOG_LEVEL is not DEBUG
        if self.LOG_LEVEL == "DEBUG":
            raise ValueError("LOG_LEVEL must not be DEBUG in production (use INFO, WARNING, or ERROR)")

        # Validate ENCRYPTION_MASTER_KEY
        if "change-this-in-production" in self.ENCRYPTION_MASTER_KEY:
            raise ValueError(
                "ENCRYPTION_MASTER_KEY must be set to a secure value in production. "
                "Generate with: openssl rand -hex 32"
            )

        # Validate Stripe keys are production keys
        if self.STRIPE_SECRET_KEY and self.STRIPE_SECRET_KEY.startswith("sk_test_"):
            raise ValueError("Stripe test keys cannot be used in production. Use sk_live_... keys")

        if self.STRIPE_PUBLISHABLE_KEY and self.STRIPE_PUBLISHABLE_KEY.startswith("pk_test_"):
            raise ValueError("Stripe test keys cannot be used in production. Use pk_live_... keys")

        return self

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        """Parse CORS origins from string or list"""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v


# Global settings instance
settings = Settings()
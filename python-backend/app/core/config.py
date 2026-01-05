"""
SmartSpec Pro - Core Configuration
"""

from typing import List, Literal
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, validator


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
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173", "http://localhost:8080"]
    
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
    
    # Stripe Payment
    STRIPE_PUBLISHABLE_KEY: str = ""
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_CURRENCY: str = "USD"
    PAYMENT_MIN_AMOUNT: float = 5.00
    PAYMENT_MAX_AMOUNT: float = 10000.00
    
    # Security
    SECRET_KEY: str = "change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
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
    
    @validator("CORS_ORIGINS", pre=True)
    def parse_cors_origins(cls, v):
        """Parse CORS origins from string or list"""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v


# Global settings instance
settings = Settings()

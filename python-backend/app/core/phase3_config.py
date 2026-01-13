"""
SmartSpec Pro - Phase 3 Configuration
Centralized configuration for all Phase 1-3 modules
"""

from typing import Optional, List, Dict, Any
from pydantic import Field
from pydantic_settings import BaseSettings
from enum import Enum


class Environment(str, Enum):
    """Environment types."""
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


class SupervisorSettings(BaseSettings):
    """Configuration for Supervisor Agent."""
    
    # Model settings
    default_model: str = Field(
        default="gpt-4o-mini",
        description="Default model for task analysis",
    )
    fallback_model: str = Field(
        default="gpt-4o",
        description="Fallback model if default fails",
    )
    max_analysis_tokens: int = Field(
        default=2000,
        description="Maximum tokens for task analysis",
    )
    
    # Routing settings
    complexity_threshold_simple: float = Field(
        default=0.3,
        description="Threshold below which task is considered simple",
    )
    complexity_threshold_complex: float = Field(
        default=0.7,
        description="Threshold above which task is considered complex",
    )
    
    # Execution settings
    max_iterations: int = Field(
        default=10,
        description="Maximum iterations per execution",
    )
    enable_handoff: bool = Field(
        default=True,
        description="Enable handoff between agents",
    )
    
    class Config:
        env_prefix = "SUPERVISOR_"


class KiloSettings(BaseSettings):
    """Configuration for Kilo Code integration."""
    
    # CLI settings
    cli_path: str = Field(
        default="kilo",
        description="Path to Kilo CLI executable",
    )
    cli_timeout: int = Field(
        default=300,
        description="Timeout for CLI commands in seconds",
    )
    
    # Mode settings
    default_mode: str = Field(
        default="architect",
        description="Default Kilo mode",
    )
    allowed_modes: List[str] = Field(
        default=["architect", "code", "debug", "ask", "orchestrator"],
        description="Allowed Kilo modes",
    )
    
    # Workspace settings
    workspace_base: str = Field(
        default="/tmp/smartspec/workspaces",
        description="Base directory for workspaces",
    )
    
    class Config:
        env_prefix = "KILO_"


class OpenCodeSettings(BaseSettings):
    """Configuration for OpenCode integration."""
    
    # API settings
    api_base_url: str = Field(
        default="http://localhost:8000/v1",
        description="Base URL for OpenCode API",
    )
    api_timeout: int = Field(
        default=120,
        description="API timeout in seconds",
    )
    
    # Model settings
    default_model: str = Field(
        default="claude-3.5-sonnet",
        description="Default model for OpenCode",
    )
    allowed_models: List[str] = Field(
        default=[
            "claude-3.5-sonnet",
            "gpt-4o",
            "gpt-4o-mini",
            "deepseek-coder",
        ],
        description="Allowed models for OpenCode",
    )
    
    # Rate limiting
    rate_limit_rpm: int = Field(
        default=60,
        description="Rate limit requests per minute",
    )
    rate_limit_rpd: int = Field(
        default=1000,
        description="Rate limit requests per day",
    )
    
    class Config:
        env_prefix = "OPENCODE_"


class TokenBudgetSettings(BaseSettings):
    """Configuration for Token Budget Controller."""
    
    # Budget settings
    default_budget: int = Field(
        default=10000,
        description="Default token budget per execution",
    )
    max_budget: int = Field(
        default=100000,
        description="Maximum token budget per execution",
    )
    
    # Warning thresholds
    warning_threshold: float = Field(
        default=0.8,
        description="Threshold for budget warning (0-1)",
    )
    critical_threshold: float = Field(
        default=0.95,
        description="Threshold for critical budget warning (0-1)",
    )
    
    # Cost settings (per 1M tokens)
    model_costs: Dict[str, Dict[str, float]] = Field(
        default={
            "gpt-4o": {"input": 2.50, "output": 10.00},
            "gpt-4o-mini": {"input": 0.15, "output": 0.60},
            "claude-3.5-sonnet": {"input": 3.00, "output": 15.00},
            "claude-3-haiku": {"input": 0.25, "output": 1.25},
            "deepseek-coder": {"input": 0.14, "output": 0.28},
        },
        description="Cost per 1M tokens for each model",
    )
    
    class Config:
        env_prefix = "TOKEN_BUDGET_"


class QualityGateSettings(BaseSettings):
    """Configuration for Quality Gates."""
    
    # Coverage thresholds
    min_coverage_core: float = Field(
        default=0.90,
        description="Minimum coverage for core modules",
    )
    min_coverage_gateway: float = Field(
        default=0.85,
        description="Minimum coverage for gateway modules",
    )
    min_coverage_new: float = Field(
        default=0.90,
        description="Minimum coverage for new code",
    )
    
    # Security settings
    enable_security_scan: bool = Field(
        default=True,
        description="Enable security scanning",
    )
    max_critical_vulnerabilities: int = Field(
        default=0,
        description="Maximum allowed critical vulnerabilities",
    )
    max_high_vulnerabilities: int = Field(
        default=0,
        description="Maximum allowed high vulnerabilities",
    )
    
    # Performance settings
    max_response_time_ms: int = Field(
        default=500,
        description="Maximum allowed response time in ms",
    )
    max_memory_mb: int = Field(
        default=512,
        description="Maximum allowed memory usage in MB",
    )
    
    class Config:
        env_prefix = "QUALITY_GATE_"


class RAGSettings(BaseSettings):
    """Configuration for Hybrid RAG Engine."""
    
    # Search settings
    default_search_mode: str = Field(
        default="hybrid",
        description="Default search mode",
    )
    top_k: int = Field(
        default=10,
        description="Number of results to return",
    )
    
    # BM25 settings
    bm25_k1: float = Field(
        default=1.5,
        description="BM25 k1 parameter",
    )
    bm25_b: float = Field(
        default=0.75,
        description="BM25 b parameter",
    )
    
    # Vector settings
    embedding_model: str = Field(
        default="text-embedding-3-small",
        description="Embedding model to use",
    )
    embedding_dimension: int = Field(
        default=1536,
        description="Embedding dimension",
    )
    
    # Reranking settings
    enable_reranking: bool = Field(
        default=True,
        description="Enable result reranking",
    )
    rerank_model: str = Field(
        default="cross-encoder/ms-marco-MiniLM-L-6-v2",
        description="Reranking model",
    )
    
    # Fusion settings
    rrf_k: int = Field(
        default=60,
        description="RRF k parameter",
    )
    bm25_weight: float = Field(
        default=0.4,
        description="Weight for BM25 results",
    )
    vector_weight: float = Field(
        default=0.6,
        description="Weight for vector results",
    )
    
    class Config:
        env_prefix = "RAG_"


class MultitenancySettings(BaseSettings):
    """Configuration for Multi-tenancy."""
    
    # Isolation settings
    default_isolation_level: str = Field(
        default="row",
        description="Default isolation level (row, schema, database)",
    )
    
    # Plan limits
    free_plan_limits: Dict[str, int] = Field(
        default={
            "max_users": 5,
            "max_projects": 10,
            "max_storage_gb": 10,
            "max_api_calls_per_month": 10000,
        },
        description="Limits for free plan",
    )
    starter_plan_limits: Dict[str, int] = Field(
        default={
            "max_users": 20,
            "max_projects": 50,
            "max_storage_gb": 100,
            "max_api_calls_per_month": 100000,
        },
        description="Limits for starter plan",
    )
    professional_plan_limits: Dict[str, int] = Field(
        default={
            "max_users": 100,
            "max_projects": 500,
            "max_storage_gb": 1000,
            "max_api_calls_per_month": 1000000,
        },
        description="Limits for professional plan",
    )
    enterprise_plan_limits: Dict[str, int] = Field(
        default={
            "max_users": -1,  # Unlimited
            "max_projects": -1,
            "max_storage_gb": -1,
            "max_api_calls_per_month": -1,
        },
        description="Limits for enterprise plan",
    )
    
    class Config:
        env_prefix = "MULTITENANCY_"


class RBACSettings(BaseSettings):
    """Configuration for RBAC."""
    
    # Role settings
    default_role: str = Field(
        default="developer",
        description="Default role for new users",
    )
    
    # Permission caching
    permission_cache_ttl: int = Field(
        default=300,
        description="Permission cache TTL in seconds",
    )
    
    # Policy settings
    enable_abac: bool = Field(
        default=True,
        description="Enable attribute-based access control",
    )
    
    class Config:
        env_prefix = "RBAC_"


class ApprovalSettings(BaseSettings):
    """Configuration for Approval Gates."""
    
    # Timeout settings
    default_timeout_minutes: int = Field(
        default=60,
        description="Default approval timeout in minutes",
    )
    max_timeout_minutes: int = Field(
        default=10080,  # 1 week
        description="Maximum approval timeout in minutes",
    )
    
    # Escalation settings
    enable_escalation: bool = Field(
        default=True,
        description="Enable automatic escalation",
    )
    escalation_timeout_minutes: int = Field(
        default=30,
        description="Time before escalation in minutes",
    )
    
    # Notification settings
    enable_notifications: bool = Field(
        default=True,
        description="Enable approval notifications",
    )
    notification_channels: List[str] = Field(
        default=["email", "webhook"],
        description="Notification channels",
    )
    
    class Config:
        env_prefix = "APPROVAL_"


class ObservabilitySettings(BaseSettings):
    """Configuration for Observability."""
    
    # Metrics settings
    enable_metrics: bool = Field(
        default=True,
        description="Enable metrics collection",
    )
    metrics_port: int = Field(
        default=9090,
        description="Prometheus metrics port",
    )
    
    # Tracing settings
    enable_tracing: bool = Field(
        default=True,
        description="Enable distributed tracing",
    )
    tracing_sample_rate: float = Field(
        default=0.1,
        description="Tracing sample rate (0-1)",
    )
    jaeger_endpoint: Optional[str] = Field(
        default=None,
        description="Jaeger collector endpoint",
    )
    
    # Cost tracking settings
    enable_cost_tracking: bool = Field(
        default=True,
        description="Enable cost tracking",
    )
    
    class Config:
        env_prefix = "OBSERVABILITY_"


class Phase3Config(BaseSettings):
    """Main configuration aggregating all Phase 1-3 settings."""
    
    # Environment
    environment: Environment = Field(
        default=Environment.DEVELOPMENT,
        description="Current environment",
    )
    
    # Sub-configurations
    supervisor: SupervisorSettings = Field(default_factory=SupervisorSettings)
    kilo: KiloSettings = Field(default_factory=KiloSettings)
    opencode: OpenCodeSettings = Field(default_factory=OpenCodeSettings)
    token_budget: TokenBudgetSettings = Field(default_factory=TokenBudgetSettings)
    quality_gate: QualityGateSettings = Field(default_factory=QualityGateSettings)
    rag: RAGSettings = Field(default_factory=RAGSettings)
    multitenancy: MultitenancySettings = Field(default_factory=MultitenancySettings)
    rbac: RBACSettings = Field(default_factory=RBACSettings)
    approval: ApprovalSettings = Field(default_factory=ApprovalSettings)
    observability: ObservabilitySettings = Field(default_factory=ObservabilitySettings)
    
    class Config:
        env_prefix = "SMARTSPEC_"


# Global configuration instance
_config: Optional[Phase3Config] = None


def get_phase3_config() -> Phase3Config:
    """Get the Phase 3 configuration instance."""
    global _config
    if _config is None:
        _config = Phase3Config()
    return _config


def reload_config() -> Phase3Config:
    """Reload the configuration from environment."""
    global _config
    _config = Phase3Config()
    return _config

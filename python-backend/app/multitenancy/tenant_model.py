"""
Tenant Model for Multi-tenancy
Phase 3: SaaS Readiness
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, List
import uuid


class TenantStatus(str, Enum):
    """Tenant status enumeration."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    PENDING = "pending"
    TRIAL = "trial"
    DELETED = "deleted"


class TenantPlan(str, Enum):
    """Tenant subscription plan."""
    FREE = "free"
    STARTER = "starter"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"
    CUSTOM = "custom"


@dataclass
class TenantSettings:
    """Tenant-specific settings."""
    
    # Feature flags
    enable_kilo: bool = True
    enable_opencode: bool = True
    enable_hybrid_rag: bool = True
    enable_quality_gates: bool = True
    enable_approval_gates: bool = False
    
    # Limits
    max_users: int = 5
    max_projects: int = 10
    max_workspaces: int = 3
    max_api_keys: int = 5
    max_concurrent_sessions: int = 2
    
    # Token/Credit limits
    monthly_token_limit: int = 1_000_000
    monthly_credit_limit: float = 100.0
    daily_token_limit: int = 50_000
    daily_credit_limit: float = 10.0
    
    # Storage limits (MB)
    max_storage_mb: int = 1024
    max_file_size_mb: int = 50
    
    # Rate limits
    requests_per_minute: int = 60
    requests_per_hour: int = 1000
    
    # Retention (days)
    log_retention_days: int = 30
    memory_retention_days: int = 90
    
    # Custom settings
    custom_settings: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "feature_flags": {
                "enable_kilo": self.enable_kilo,
                "enable_opencode": self.enable_opencode,
                "enable_hybrid_rag": self.enable_hybrid_rag,
                "enable_quality_gates": self.enable_quality_gates,
                "enable_approval_gates": self.enable_approval_gates,
            },
            "limits": {
                "max_users": self.max_users,
                "max_projects": self.max_projects,
                "max_workspaces": self.max_workspaces,
                "max_api_keys": self.max_api_keys,
                "max_concurrent_sessions": self.max_concurrent_sessions,
            },
            "token_limits": {
                "monthly_token_limit": self.monthly_token_limit,
                "monthly_credit_limit": self.monthly_credit_limit,
                "daily_token_limit": self.daily_token_limit,
                "daily_credit_limit": self.daily_credit_limit,
            },
            "storage_limits": {
                "max_storage_mb": self.max_storage_mb,
                "max_file_size_mb": self.max_file_size_mb,
            },
            "rate_limits": {
                "requests_per_minute": self.requests_per_minute,
                "requests_per_hour": self.requests_per_hour,
            },
            "retention": {
                "log_retention_days": self.log_retention_days,
                "memory_retention_days": self.memory_retention_days,
            },
            "custom_settings": self.custom_settings,
        }
    
    @classmethod
    def from_plan(cls, plan: TenantPlan) -> "TenantSettings":
        """Create settings based on plan."""
        plan_configs = {
            TenantPlan.FREE: {
                "max_users": 1,
                "max_projects": 3,
                "max_workspaces": 1,
                "max_api_keys": 1,
                "max_concurrent_sessions": 1,
                "monthly_token_limit": 100_000,
                "monthly_credit_limit": 10.0,
                "daily_token_limit": 10_000,
                "daily_credit_limit": 1.0,
                "max_storage_mb": 100,
                "requests_per_minute": 10,
                "requests_per_hour": 100,
                "enable_approval_gates": False,
            },
            TenantPlan.STARTER: {
                "max_users": 5,
                "max_projects": 10,
                "max_workspaces": 3,
                "max_api_keys": 5,
                "max_concurrent_sessions": 2,
                "monthly_token_limit": 500_000,
                "monthly_credit_limit": 50.0,
                "daily_token_limit": 25_000,
                "daily_credit_limit": 5.0,
                "max_storage_mb": 512,
                "requests_per_minute": 30,
                "requests_per_hour": 500,
                "enable_approval_gates": False,
            },
            TenantPlan.PROFESSIONAL: {
                "max_users": 20,
                "max_projects": 50,
                "max_workspaces": 10,
                "max_api_keys": 20,
                "max_concurrent_sessions": 5,
                "monthly_token_limit": 2_000_000,
                "monthly_credit_limit": 200.0,
                "daily_token_limit": 100_000,
                "daily_credit_limit": 20.0,
                "max_storage_mb": 2048,
                "requests_per_minute": 60,
                "requests_per_hour": 1000,
                "enable_approval_gates": True,
            },
            TenantPlan.ENTERPRISE: {
                "max_users": 1000,
                "max_projects": 500,
                "max_workspaces": 100,
                "max_api_keys": 100,
                "max_concurrent_sessions": 50,
                "monthly_token_limit": 50_000_000,
                "monthly_credit_limit": 5000.0,
                "daily_token_limit": 2_000_000,
                "daily_credit_limit": 500.0,
                "max_storage_mb": 51200,
                "max_file_size_mb": 500,
                "requests_per_minute": 300,
                "requests_per_hour": 10000,
                "enable_approval_gates": True,
                "log_retention_days": 365,
                "memory_retention_days": 365,
            },
        }
        
        config = plan_configs.get(plan, plan_configs[TenantPlan.FREE])
        return cls(**config)


@dataclass
class TenantUsage:
    """Tenant usage tracking."""
    
    tenant_id: str
    period: str  # YYYY-MM format
    
    # Token usage
    total_tokens: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    
    # Credit usage
    total_credits: float = 0.0
    
    # Request counts
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    
    # Resource usage
    active_users: int = 0
    active_projects: int = 0
    active_workspaces: int = 0
    storage_used_mb: float = 0.0
    
    # Daily breakdown
    daily_usage: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    
    # Timestamps
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    
    def add_request(
        self,
        input_tokens: int,
        output_tokens: int,
        credits: float,
        success: bool = True,
    ) -> None:
        """Record a request."""
        self.total_tokens += input_tokens + output_tokens
        self.input_tokens += input_tokens
        self.output_tokens += output_tokens
        self.total_credits += credits
        self.total_requests += 1
        
        if success:
            self.successful_requests += 1
        else:
            self.failed_requests += 1
        
        # Update daily breakdown
        today = datetime.utcnow().strftime("%Y-%m-%d")
        if today not in self.daily_usage:
            self.daily_usage[today] = {
                "tokens": 0,
                "credits": 0.0,
                "requests": 0,
            }
        
        self.daily_usage[today]["tokens"] += input_tokens + output_tokens
        self.daily_usage[today]["credits"] += credits
        self.daily_usage[today]["requests"] += 1
        
        self.updated_at = datetime.utcnow()
    
    def get_daily_tokens(self, date: Optional[str] = None) -> int:
        """Get token usage for a specific day."""
        if date is None:
            date = datetime.utcnow().strftime("%Y-%m-%d")
        return self.daily_usage.get(date, {}).get("tokens", 0)
    
    def get_daily_credits(self, date: Optional[str] = None) -> float:
        """Get credit usage for a specific day."""
        if date is None:
            date = datetime.utcnow().strftime("%Y-%m-%d")
        return self.daily_usage.get(date, {}).get("credits", 0.0)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "tenant_id": self.tenant_id,
            "period": self.period,
            "tokens": {
                "total": self.total_tokens,
                "input": self.input_tokens,
                "output": self.output_tokens,
            },
            "credits": {
                "total": self.total_credits,
            },
            "requests": {
                "total": self.total_requests,
                "successful": self.successful_requests,
                "failed": self.failed_requests,
            },
            "resources": {
                "active_users": self.active_users,
                "active_projects": self.active_projects,
                "active_workspaces": self.active_workspaces,
                "storage_used_mb": self.storage_used_mb,
            },
            "daily_usage": self.daily_usage,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


@dataclass
class Tenant:
    """Tenant entity for multi-tenancy."""
    
    # Identity
    tenant_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    slug: str = ""  # URL-friendly identifier
    
    # Status
    status: TenantStatus = TenantStatus.PENDING
    plan: TenantPlan = TenantPlan.FREE
    
    # Contact
    owner_id: Optional[str] = None
    admin_email: str = ""
    billing_email: str = ""
    
    # Organization info
    company_name: Optional[str] = None
    industry: Optional[str] = None
    size: Optional[str] = None  # small, medium, large, enterprise
    
    # Settings
    settings: TenantSettings = field(default_factory=TenantSettings)
    
    # Metadata
    metadata: Dict[str, Any] = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)
    
    # Domain/subdomain
    custom_domain: Optional[str] = None
    subdomain: Optional[str] = None
    
    # Database isolation (for enterprise)
    database_schema: Optional[str] = None
    database_connection: Optional[str] = None
    
    # Timestamps
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    activated_at: Optional[datetime] = None
    trial_ends_at: Optional[datetime] = None
    suspended_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    
    def __post_init__(self):
        """Post-initialization processing."""
        if not self.slug and self.name:
            self.slug = self._generate_slug(self.name)
        
        if isinstance(self.settings, dict):
            self.settings = TenantSettings(**self.settings)
    
    def _generate_slug(self, name: str) -> str:
        """Generate URL-friendly slug from name."""
        import re
        slug = name.lower()
        slug = re.sub(r'[^a-z0-9]+', '-', slug)
        slug = slug.strip('-')
        return slug
    
    def is_active(self) -> bool:
        """Check if tenant is active."""
        return self.status in [TenantStatus.ACTIVE, TenantStatus.TRIAL]
    
    def is_trial(self) -> bool:
        """Check if tenant is in trial period."""
        if self.status != TenantStatus.TRIAL:
            return False
        if self.trial_ends_at is None:
            return True
        return datetime.utcnow() < self.trial_ends_at
    
    def is_enterprise(self) -> bool:
        """Check if tenant is enterprise."""
        return self.plan == TenantPlan.ENTERPRISE
    
    def has_feature(self, feature: str) -> bool:
        """Check if tenant has a specific feature."""
        feature_map = {
            "kilo": self.settings.enable_kilo,
            "opencode": self.settings.enable_opencode,
            "hybrid_rag": self.settings.enable_hybrid_rag,
            "quality_gates": self.settings.enable_quality_gates,
            "approval_gates": self.settings.enable_approval_gates,
        }
        return feature_map.get(feature, False)
    
    def activate(self) -> None:
        """Activate the tenant."""
        self.status = TenantStatus.ACTIVE
        self.activated_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
    
    def suspend(self, reason: Optional[str] = None) -> None:
        """Suspend the tenant."""
        self.status = TenantStatus.SUSPENDED
        self.suspended_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
        if reason:
            self.metadata["suspension_reason"] = reason
    
    def delete(self) -> None:
        """Soft delete the tenant."""
        self.status = TenantStatus.DELETED
        self.deleted_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
    
    def upgrade_plan(self, new_plan: TenantPlan) -> None:
        """Upgrade tenant plan."""
        self.plan = new_plan
        self.settings = TenantSettings.from_plan(new_plan)
        self.updated_at = datetime.utcnow()
    
    def to_dict(self, include_sensitive: bool = False) -> Dict[str, Any]:
        """Convert to dictionary."""
        data = {
            "tenant_id": self.tenant_id,
            "name": self.name,
            "slug": self.slug,
            "status": self.status.value,
            "plan": self.plan.value,
            "owner_id": self.owner_id,
            "admin_email": self.admin_email,
            "company_name": self.company_name,
            "industry": self.industry,
            "size": self.size,
            "settings": self.settings.to_dict(),
            "metadata": self.metadata,
            "tags": self.tags,
            "custom_domain": self.custom_domain,
            "subdomain": self.subdomain,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "activated_at": self.activated_at.isoformat() if self.activated_at else None,
            "trial_ends_at": self.trial_ends_at.isoformat() if self.trial_ends_at else None,
            "is_active": self.is_active(),
            "is_trial": self.is_trial(),
            "is_enterprise": self.is_enterprise(),
        }
        
        if include_sensitive:
            data["billing_email"] = self.billing_email
            data["database_schema"] = self.database_schema
        
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Tenant":
        """Create from dictionary."""
        # Convert enum strings
        if "status" in data and isinstance(data["status"], str):
            data["status"] = TenantStatus(data["status"])
        if "plan" in data and isinstance(data["plan"], str):
            data["plan"] = TenantPlan(data["plan"])
        
        # Convert datetime strings
        for field_name in ["created_at", "updated_at", "activated_at", "trial_ends_at", "suspended_at", "deleted_at"]:
            if field_name in data and isinstance(data[field_name], str):
                data[field_name] = datetime.fromisoformat(data[field_name])
        
        # Convert settings
        if "settings" in data and isinstance(data["settings"], dict):
            # Flatten nested settings
            flat_settings = {}
            for category in data["settings"].values():
                if isinstance(category, dict):
                    flat_settings.update(category)
            data["settings"] = TenantSettings(**flat_settings)
        
        return cls(**data)

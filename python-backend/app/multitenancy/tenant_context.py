"""
Tenant Context for Multi-tenancy
Phase 3: SaaS Readiness

Provides request-scoped tenant context using contextvars.
"""

import structlog
from contextvars import ContextVar
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Dict, Any

from .tenant_model import Tenant, TenantPlan

logger = structlog.get_logger(__name__)


@dataclass
class TenantContext:
    """
    Request-scoped tenant context.
    
    Contains tenant information and request metadata for the current request.
    """
    
    # Tenant info
    tenant_id: str
    tenant_name: str
    tenant_slug: str
    tenant_plan: TenantPlan
    
    # User info (if authenticated)
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    user_roles: list = field(default_factory=list)
    
    # Request info
    request_id: str = ""
    request_path: str = ""
    request_method: str = ""
    client_ip: str = ""
    
    # Feature flags (cached from tenant settings)
    features: Dict[str, bool] = field(default_factory=dict)
    
    # Limits (cached from tenant settings)
    limits: Dict[str, Any] = field(default_factory=dict)
    
    # Timestamps
    created_at: datetime = field(default_factory=datetime.utcnow)
    
    @classmethod
    def from_tenant(
        cls,
        tenant: Tenant,
        user_id: Optional[str] = None,
        user_email: Optional[str] = None,
        user_roles: Optional[list] = None,
        request_id: str = "",
        request_path: str = "",
        request_method: str = "",
        client_ip: str = "",
    ) -> "TenantContext":
        """
        Create context from tenant.
        
        Args:
            tenant: Tenant entity
            user_id: Current user ID
            user_email: Current user email
            user_roles: Current user roles
            request_id: Request ID
            request_path: Request path
            request_method: HTTP method
            client_ip: Client IP address
        
        Returns:
            TenantContext instance
        """
        return cls(
            tenant_id=tenant.tenant_id,
            tenant_name=tenant.name,
            tenant_slug=tenant.slug,
            tenant_plan=tenant.plan,
            user_id=user_id,
            user_email=user_email,
            user_roles=user_roles or [],
            request_id=request_id,
            request_path=request_path,
            request_method=request_method,
            client_ip=client_ip,
            features={
                "kilo": tenant.settings.enable_kilo,
                "opencode": tenant.settings.enable_opencode,
                "hybrid_rag": tenant.settings.enable_hybrid_rag,
                "quality_gates": tenant.settings.enable_quality_gates,
                "approval_gates": tenant.settings.enable_approval_gates,
            },
            limits={
                "max_users": tenant.settings.max_users,
                "max_projects": tenant.settings.max_projects,
                "max_workspaces": tenant.settings.max_workspaces,
                "monthly_token_limit": tenant.settings.monthly_token_limit,
                "daily_token_limit": tenant.settings.daily_token_limit,
                "requests_per_minute": tenant.settings.requests_per_minute,
            },
        )
    
    def has_feature(self, feature: str) -> bool:
        """Check if feature is enabled for this tenant."""
        return self.features.get(feature, False)
    
    def has_role(self, role: str) -> bool:
        """Check if current user has a specific role."""
        return role in self.user_roles
    
    def has_any_role(self, roles: list) -> bool:
        """Check if current user has any of the specified roles."""
        return any(role in self.user_roles for role in roles)
    
    def is_admin(self) -> bool:
        """Check if current user is admin."""
        return self.has_any_role(["admin", "owner", "super_admin"])
    
    def is_enterprise(self) -> bool:
        """Check if tenant is enterprise."""
        return self.tenant_plan == TenantPlan.ENTERPRISE
    
    def get_limit(self, limit_name: str, default: Any = None) -> Any:
        """Get a specific limit value."""
        return self.limits.get(limit_name, default)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "tenant_id": self.tenant_id,
            "tenant_name": self.tenant_name,
            "tenant_slug": self.tenant_slug,
            "tenant_plan": self.tenant_plan.value,
            "user_id": self.user_id,
            "user_email": self.user_email,
            "user_roles": self.user_roles,
            "request_id": self.request_id,
            "features": self.features,
            "limits": self.limits,
            "created_at": self.created_at.isoformat(),
        }
    
    def to_log_context(self) -> Dict[str, Any]:
        """Get context for logging."""
        return {
            "tenant_id": self.tenant_id,
            "tenant_slug": self.tenant_slug,
            "user_id": self.user_id,
            "request_id": self.request_id,
        }


# Context variable for storing current tenant context
_tenant_context_var: ContextVar[Optional[TenantContext]] = ContextVar(
    "tenant_context",
    default=None,
)


def get_current_tenant() -> Optional[TenantContext]:
    """
    Get the current tenant context.
    
    Returns:
        Current TenantContext or None if not set
    """
    return _tenant_context_var.get()


def set_current_tenant(context: Optional[TenantContext]) -> None:
    """
    Set the current tenant context.
    
    Args:
        context: TenantContext to set (or None to clear)
    """
    _tenant_context_var.set(context)


def require_current_tenant() -> TenantContext:
    """
    Get the current tenant context, raising if not set.
    
    Returns:
        Current TenantContext
    
    Raises:
        RuntimeError: If no tenant context is set
    """
    context = get_current_tenant()
    if context is None:
        raise RuntimeError("No tenant context available")
    return context


@contextmanager
def tenant_context(context: TenantContext):
    """
    Context manager for setting tenant context.
    
    Usage:
        with tenant_context(ctx):
            # Code runs with tenant context
            pass
    
    Args:
        context: TenantContext to use
    
    Yields:
        The tenant context
    """
    token = _tenant_context_var.set(context)
    try:
        yield context
    finally:
        _tenant_context_var.reset(token)


class TenantContextLogger:
    """
    Logger that automatically includes tenant context.
    """
    
    def __init__(self, name: str):
        """Initialize logger."""
        self._logger = structlog.get_logger(name)
    
    def _bind_context(self) -> structlog.BoundLogger:
        """Bind tenant context to logger."""
        context = get_current_tenant()
        if context:
            return self._logger.bind(**context.to_log_context())
        return self._logger
    
    def info(self, event: str, **kwargs) -> None:
        """Log info message."""
        self._bind_context().info(event, **kwargs)
    
    def warning(self, event: str, **kwargs) -> None:
        """Log warning message."""
        self._bind_context().warning(event, **kwargs)
    
    def error(self, event: str, **kwargs) -> None:
        """Log error message."""
        self._bind_context().error(event, **kwargs)
    
    def debug(self, event: str, **kwargs) -> None:
        """Log debug message."""
        self._bind_context().debug(event, **kwargs)


def get_tenant_logger(name: str) -> TenantContextLogger:
    """Get a tenant-aware logger."""
    return TenantContextLogger(name)


def get_current_tenant_id() -> Optional[str]:
    """
    Get the current tenant ID.
    
    Returns:
        Current tenant ID or None if not set
    """
    context = get_current_tenant()
    return context.tenant_id if context else None

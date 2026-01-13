"""
SmartSpec Pro - Multi-tenancy Module
Phase 3: SaaS Readiness

This module provides multi-tenant support including:
- Tenant management (create, update, delete)
- Tenant isolation (data separation)
- Tenant context (request-scoped tenant info)
- Tenant middleware (automatic tenant detection)
"""

from .tenant_model import (
    Tenant,
    TenantStatus,
    TenantPlan,
    TenantSettings,
    TenantUsage,
)
from .tenant_service import (
    TenantService,
    get_tenant_service,
)
from .tenant_context import (
    TenantContext,
    get_current_tenant,
    set_current_tenant,
    tenant_context,
)
from .tenant_middleware import (
    TenantMiddleware,
    TenantDependency,
    require_tenant,
)
from .tenant_isolation import (
    TenantIsolation,
    IsolationLevel,
    TenantFilter,
)

__all__ = [
    # Models
    "Tenant",
    "TenantStatus",
    "TenantPlan",
    "TenantSettings",
    "TenantUsage",
    # Service
    "TenantService",
    "get_tenant_service",
    # Context
    "TenantContext",
    "get_current_tenant",
    "set_current_tenant",
    "tenant_context",
    # Middleware
    "TenantMiddleware",
    "TenantDependency",
    "require_tenant",
    # Isolation
    "TenantIsolation",
    "IsolationLevel",
    "TenantFilter",
]

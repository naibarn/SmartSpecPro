"""
Tenant Isolation for Multi-tenancy
Phase 3: SaaS Readiness

Provides data isolation mechanisms for multi-tenant environments.
"""

import structlog
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List, TypeVar, Generic, Callable
from datetime import datetime

from .tenant_context import get_current_tenant, TenantContext

logger = structlog.get_logger(__name__)

T = TypeVar("T")


class IsolationLevel(str, Enum):
    """
    Data isolation levels.
    
    - SHARED: All tenants share the same data (public data)
    - ROW: Row-level isolation with tenant_id column
    - SCHEMA: Schema-level isolation (separate schemas per tenant)
    - DATABASE: Database-level isolation (separate databases per tenant)
    """
    SHARED = "shared"
    ROW = "row"
    SCHEMA = "schema"
    DATABASE = "database"


@dataclass
class TenantFilter:
    """
    Filter for tenant-scoped queries.
    
    Automatically adds tenant_id filter to queries.
    """
    
    tenant_id: str
    isolation_level: IsolationLevel = IsolationLevel.ROW
    include_shared: bool = False
    
    def apply_to_query(self, query: Any) -> Any:
        """
        Apply tenant filter to a query.
        
        This is a placeholder - actual implementation depends on ORM.
        
        Args:
            query: Database query object
        
        Returns:
            Filtered query
        """
        # For SQLAlchemy-style queries
        if hasattr(query, "filter"):
            # Assuming model has tenant_id column
            if self.include_shared:
                # Include both tenant-specific and shared (null tenant_id) data
                return query.filter(
                    (query.model.tenant_id == self.tenant_id) |
                    (query.model.tenant_id.is_(None))
                )
            else:
                return query.filter(query.model.tenant_id == self.tenant_id)
        
        return query
    
    def to_dict_filter(self) -> Dict[str, Any]:
        """
        Get filter as dictionary for document databases.
        
        Returns:
            Filter dictionary
        """
        if self.include_shared:
            return {
                "$or": [
                    {"tenant_id": self.tenant_id},
                    {"tenant_id": None},
                ]
            }
        return {"tenant_id": self.tenant_id}
    
    def to_sql_where(self, table_alias: str = "") -> str:
        """
        Get filter as SQL WHERE clause.
        
        Args:
            table_alias: Optional table alias
        
        Returns:
            SQL WHERE clause
        """
        prefix = f"{table_alias}." if table_alias else ""
        
        if self.include_shared:
            return f"({prefix}tenant_id = '{self.tenant_id}' OR {prefix}tenant_id IS NULL)"
        return f"{prefix}tenant_id = '{self.tenant_id}'"


class TenantIsolation:
    """
    Manager for tenant data isolation.
    
    Provides utilities for ensuring data isolation in multi-tenant environment.
    """
    
    def __init__(
        self,
        default_level: IsolationLevel = IsolationLevel.ROW,
    ):
        """
        Initialize isolation manager.
        
        Args:
            default_level: Default isolation level
        """
        self.default_level = default_level
        self._logger = logger.bind(component="tenant_isolation")
    
    def get_current_filter(
        self,
        include_shared: bool = False,
    ) -> Optional[TenantFilter]:
        """
        Get filter for current tenant context.
        
        Args:
            include_shared: Include shared (public) data
        
        Returns:
            TenantFilter or None if no tenant context
        """
        context = get_current_tenant()
        if context is None:
            return None
        
        return TenantFilter(
            tenant_id=context.tenant_id,
            isolation_level=self.default_level,
            include_shared=include_shared,
        )
    
    def require_filter(
        self,
        include_shared: bool = False,
    ) -> TenantFilter:
        """
        Get filter for current tenant, raising if not available.
        
        Args:
            include_shared: Include shared data
        
        Returns:
            TenantFilter
        
        Raises:
            RuntimeError: If no tenant context
        """
        filter_ = self.get_current_filter(include_shared)
        if filter_ is None:
            raise RuntimeError("Tenant context required for data access")
        return filter_
    
    def validate_access(
        self,
        resource_tenant_id: Optional[str],
        allow_shared: bool = False,
    ) -> bool:
        """
        Validate that current tenant can access a resource.
        
        Args:
            resource_tenant_id: Tenant ID of the resource
            allow_shared: Allow access to shared resources (null tenant_id)
        
        Returns:
            True if access is allowed
        """
        context = get_current_tenant()
        
        # No tenant context - check if resource is shared
        if context is None:
            return resource_tenant_id is None and allow_shared
        
        # Resource belongs to current tenant
        if resource_tenant_id == context.tenant_id:
            return True
        
        # Resource is shared
        if resource_tenant_id is None and allow_shared:
            return True
        
        self._logger.warning(
            "access_denied",
            current_tenant=context.tenant_id,
            resource_tenant=resource_tenant_id,
        )
        return False
    
    def ensure_tenant_id(
        self,
        data: Dict[str, Any],
        field_name: str = "tenant_id",
    ) -> Dict[str, Any]:
        """
        Ensure data has tenant_id set from current context.
        
        Args:
            data: Data dictionary
            field_name: Name of tenant ID field
        
        Returns:
            Data with tenant_id set
        """
        context = get_current_tenant()
        if context is not None:
            data[field_name] = context.tenant_id
        return data
    
    def create_scoped_repository(
        self,
        base_repository: Any,
    ) -> "TenantScopedRepository":
        """
        Create a tenant-scoped wrapper for a repository.
        
        Args:
            base_repository: Base repository instance
        
        Returns:
            Tenant-scoped repository wrapper
        """
        return TenantScopedRepository(base_repository, self)


class TenantScopedRepository(Generic[T]):
    """
    Wrapper that adds tenant isolation to repository operations.
    """
    
    def __init__(
        self,
        repository: Any,
        isolation: TenantIsolation,
    ):
        """
        Initialize scoped repository.
        
        Args:
            repository: Base repository
            isolation: Isolation manager
        """
        self._repository = repository
        self._isolation = isolation
        self._logger = logger.bind(component="tenant_scoped_repo")
    
    async def create(self, data: Dict[str, Any], **kwargs) -> T:
        """Create with tenant_id."""
        data = self._isolation.ensure_tenant_id(data)
        return await self._repository.create(data, **kwargs)
    
    async def get(self, id: str, **kwargs) -> Optional[T]:
        """Get with tenant validation."""
        result = await self._repository.get(id, **kwargs)
        if result is None:
            return None
        
        # Validate tenant access
        resource_tenant_id = getattr(result, "tenant_id", None)
        if not self._isolation.validate_access(resource_tenant_id):
            return None
        
        return result
    
    async def list(self, **kwargs) -> List[T]:
        """List with tenant filter."""
        filter_ = self._isolation.get_current_filter()
        if filter_:
            kwargs["tenant_id"] = filter_.tenant_id
        return await self._repository.list(**kwargs)
    
    async def update(self, id: str, data: Dict[str, Any], **kwargs) -> Optional[T]:
        """Update with tenant validation."""
        # First validate access
        existing = await self.get(id)
        if existing is None:
            return None
        
        return await self._repository.update(id, data, **kwargs)
    
    async def delete(self, id: str, **kwargs) -> bool:
        """Delete with tenant validation."""
        # First validate access
        existing = await self.get(id)
        if existing is None:
            return False
        
        return await self._repository.delete(id, **kwargs)


@dataclass
class TenantAwareModel:
    """
    Base class for tenant-aware models.
    
    Provides common fields and methods for multi-tenant data.
    """
    
    tenant_id: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    
    def set_tenant_from_context(self) -> None:
        """Set tenant_id from current context."""
        context = get_current_tenant()
        if context:
            self.tenant_id = context.tenant_id
            if context.user_id:
                if self.created_by is None:
                    self.created_by = context.user_id
                self.updated_by = context.user_id
    
    def belongs_to_tenant(self, tenant_id: str) -> bool:
        """Check if model belongs to a tenant."""
        return self.tenant_id == tenant_id
    
    def is_shared(self) -> bool:
        """Check if model is shared (no tenant)."""
        return self.tenant_id is None


class CrossTenantAccess:
    """
    Manager for cross-tenant data access (admin/system operations).
    
    Use with caution - bypasses normal tenant isolation.
    """
    
    def __init__(self):
        """Initialize cross-tenant access manager."""
        self._logger = logger.bind(component="cross_tenant_access")
        self._allowed_operations: Dict[str, List[str]] = {}
    
    def register_operation(
        self,
        operation: str,
        allowed_roles: List[str],
    ) -> None:
        """
        Register an allowed cross-tenant operation.
        
        Args:
            operation: Operation name
            allowed_roles: Roles that can perform this operation
        """
        self._allowed_operations[operation] = allowed_roles
    
    def can_access(
        self,
        operation: str,
        user_roles: List[str],
    ) -> bool:
        """
        Check if user can perform cross-tenant operation.
        
        Args:
            operation: Operation name
            user_roles: User's roles
        
        Returns:
            True if allowed
        """
        allowed_roles = self._allowed_operations.get(operation, [])
        if not allowed_roles:
            return False
        
        return any(role in allowed_roles for role in user_roles)
    
    async def execute_cross_tenant(
        self,
        operation: str,
        target_tenant_id: str,
        action: Callable,
        user_roles: List[str],
    ) -> Any:
        """
        Execute a cross-tenant operation.
        
        Args:
            operation: Operation name
            target_tenant_id: Target tenant ID
            action: Action to execute
            user_roles: User's roles
        
        Returns:
            Action result
        
        Raises:
            PermissionError: If not allowed
        """
        if not self.can_access(operation, user_roles):
            raise PermissionError(f"Cross-tenant operation '{operation}' not allowed")
        
        self._logger.info(
            "cross_tenant_operation",
            operation=operation,
            target_tenant=target_tenant_id,
        )
        
        return await action()


# Global instances
_isolation: Optional[TenantIsolation] = None
_cross_tenant: Optional[CrossTenantAccess] = None


def get_isolation() -> TenantIsolation:
    """Get global isolation manager."""
    global _isolation
    if _isolation is None:
        _isolation = TenantIsolation()
    return _isolation


def get_cross_tenant_access() -> CrossTenantAccess:
    """Get global cross-tenant access manager."""
    global _cross_tenant
    if _cross_tenant is None:
        _cross_tenant = CrossTenantAccess()
        # Register default operations
        _cross_tenant.register_operation("admin_view", ["super_admin", "system"])
        _cross_tenant.register_operation("admin_manage", ["super_admin"])
        _cross_tenant.register_operation("support_view", ["super_admin", "support"])
    return _cross_tenant

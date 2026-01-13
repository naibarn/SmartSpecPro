"""
Tenant Middleware for Multi-tenancy
Phase 3: SaaS Readiness

Provides automatic tenant detection and context setup for requests.
"""

import structlog
from fastapi import Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Optional, Callable, List
import uuid

from .tenant_model import Tenant
from .tenant_service import TenantService, get_tenant_service
from .tenant_context import TenantContext, set_current_tenant, get_current_tenant

logger = structlog.get_logger(__name__)


class TenantMiddleware(BaseHTTPMiddleware):
    """
    Middleware for automatic tenant detection and context setup.
    
    Detects tenant from:
    1. X-Tenant-ID header
    2. X-Tenant-Slug header
    3. Subdomain
    4. Custom domain
    5. API key (tenant association)
    """
    
    def __init__(
        self,
        app,
        tenant_service: Optional[TenantService] = None,
        exclude_paths: Optional[List[str]] = None,
        require_tenant: bool = False,
    ):
        """
        Initialize middleware.
        
        Args:
            app: FastAPI application
            tenant_service: Tenant service instance
            exclude_paths: Paths to exclude from tenant detection
            require_tenant: If True, reject requests without tenant
        """
        super().__init__(app)
        self.tenant_service = tenant_service or get_tenant_service()
        self.exclude_paths = exclude_paths or [
            "/health",
            "/metrics",
            "/docs",
            "/openapi.json",
            "/redoc",
        ]
        self.require_tenant = require_tenant
        self._logger = logger.bind(middleware="tenant")
    
    async def dispatch(self, request: Request, call_next: Callable):
        """Process request and detect tenant."""
        # Generate request ID
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        
        # Check if path is excluded
        if self._is_excluded(request.url.path):
            return await call_next(request)
        
        # Try to detect tenant
        tenant = await self._detect_tenant(request)
        
        if tenant is None:
            if self.require_tenant:
                return JSONResponse(
                    status_code=400,
                    content={
                        "error": "tenant_required",
                        "message": "Tenant identification required",
                    },
                )
            # Continue without tenant context
            return await call_next(request)
        
        # Validate tenant
        if not tenant.is_active():
            return JSONResponse(
                status_code=403,
                content={
                    "error": "tenant_not_active",
                    "message": f"Tenant is {tenant.status.value}",
                    "tenant_id": tenant.tenant_id,
                },
            )
        
        # Create tenant context
        context = TenantContext.from_tenant(
            tenant=tenant,
            request_id=request_id,
            request_path=request.url.path,
            request_method=request.method,
            client_ip=self._get_client_ip(request),
        )
        
        # Set context
        set_current_tenant(context)
        
        try:
            # Add tenant info to request state
            request.state.tenant = tenant
            request.state.tenant_context = context
            
            # Process request
            response = await call_next(request)
            
            # Add tenant headers to response
            response.headers["X-Tenant-ID"] = tenant.tenant_id
            response.headers["X-Request-ID"] = request_id
            
            return response
        
        finally:
            # Clear context
            set_current_tenant(None)
    
    def _is_excluded(self, path: str) -> bool:
        """Check if path is excluded from tenant detection."""
        for excluded in self.exclude_paths:
            if path.startswith(excluded):
                return True
        return False
    
    async def _detect_tenant(self, request: Request) -> Optional[Tenant]:
        """
        Detect tenant from request.
        
        Priority:
        1. X-Tenant-ID header
        2. X-Tenant-Slug header
        3. Subdomain
        4. Custom domain
        """
        # Try X-Tenant-ID header
        tenant_id = request.headers.get("X-Tenant-ID")
        if tenant_id:
            tenant = await self.tenant_service.get_tenant(tenant_id)
            if tenant:
                self._logger.debug("tenant_detected_by_id", tenant_id=tenant_id)
                return tenant
        
        # Try X-Tenant-Slug header
        tenant_slug = request.headers.get("X-Tenant-Slug")
        if tenant_slug:
            tenant = await self.tenant_service.get_tenant_by_slug(tenant_slug)
            if tenant:
                self._logger.debug("tenant_detected_by_slug", slug=tenant_slug)
                return tenant
        
        # Try subdomain
        host = request.headers.get("Host", "")
        subdomain = self._extract_subdomain(host)
        if subdomain:
            tenant = await self.tenant_service.get_tenant_by_slug(subdomain)
            if tenant:
                self._logger.debug("tenant_detected_by_subdomain", subdomain=subdomain)
                return tenant
        
        # Try custom domain
        if host:
            tenant = await self.tenant_service.get_tenant_by_domain(host)
            if tenant:
                self._logger.debug("tenant_detected_by_domain", domain=host)
                return tenant
        
        return None
    
    def _extract_subdomain(self, host: str) -> Optional[str]:
        """Extract subdomain from host."""
        if not host:
            return None
        
        # Remove port
        host = host.split(":")[0]
        
        # Split by dots
        parts = host.split(".")
        
        # Need at least 3 parts for subdomain (subdomain.domain.tld)
        if len(parts) >= 3:
            subdomain = parts[0]
            # Exclude common non-tenant subdomains
            if subdomain not in ["www", "api", "app", "admin", "mail"]:
                return subdomain
        
        return None
    
    def _get_client_ip(self, request: Request) -> str:
        """Get client IP address."""
        # Check forwarded headers
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip
        
        # Fall back to client host
        if request.client:
            return request.client.host
        
        return ""


class TenantDependency:
    """
    FastAPI dependency for tenant context.
    
    Usage:
        @app.get("/api/data")
        async def get_data(tenant: TenantContext = Depends(TenantDependency())):
            return {"tenant_id": tenant.tenant_id}
    """
    
    def __init__(
        self,
        required: bool = True,
        require_feature: Optional[str] = None,
        require_plan: Optional[List[str]] = None,
    ):
        """
        Initialize dependency.
        
        Args:
            required: If True, raise 400 if no tenant
            require_feature: Required feature flag
            require_plan: Required plan(s)
        """
        self.required = required
        self.require_feature = require_feature
        self.require_plan = require_plan
    
    async def __call__(self, request: Request) -> Optional[TenantContext]:
        """Get tenant context from request."""
        # Try to get from request state (set by middleware)
        context = getattr(request.state, "tenant_context", None)
        
        # Fall back to context var
        if context is None:
            context = get_current_tenant()
        
        if context is None:
            if self.required:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "tenant_required",
                        "message": "Tenant context required",
                    },
                )
            return None
        
        # Check feature requirement
        if self.require_feature and not context.has_feature(self.require_feature):
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "feature_not_available",
                    "message": f"Feature '{self.require_feature}' not available for this tenant",
                    "feature": self.require_feature,
                },
            )
        
        # Check plan requirement
        if self.require_plan:
            if context.tenant_plan.value not in self.require_plan:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "plan_upgrade_required",
                        "message": f"This feature requires plan: {', '.join(self.require_plan)}",
                        "current_plan": context.tenant_plan.value,
                        "required_plans": self.require_plan,
                    },
                )
        
        return context


def require_tenant(
    require_feature: Optional[str] = None,
    require_plan: Optional[List[str]] = None,
) -> TenantDependency:
    """
    Create a tenant dependency.
    
    Usage:
        @app.get("/api/data")
        async def get_data(tenant: TenantContext = Depends(require_tenant())):
            return {"tenant_id": tenant.tenant_id}
        
        @app.get("/api/enterprise")
        async def enterprise_only(
            tenant: TenantContext = Depends(require_tenant(require_plan=["enterprise"]))
        ):
            return {"enterprise": True}
    
    Args:
        require_feature: Required feature flag
        require_plan: Required plan(s)
    
    Returns:
        TenantDependency instance
    """
    return TenantDependency(
        required=True,
        require_feature=require_feature,
        require_plan=require_plan,
    )


def optional_tenant() -> TenantDependency:
    """
    Create an optional tenant dependency.
    
    Usage:
        @app.get("/api/public")
        async def public_data(tenant: Optional[TenantContext] = Depends(optional_tenant())):
            if tenant:
                return {"tenant_id": tenant.tenant_id}
            return {"public": True}
    
    Returns:
        TenantDependency instance
    """
    return TenantDependency(required=False)

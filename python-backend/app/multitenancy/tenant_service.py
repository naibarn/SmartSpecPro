"""
Tenant Service for Multi-tenancy
Phase 3: SaaS Readiness
"""

import structlog
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
import uuid

from .tenant_model import (
    Tenant,
    TenantStatus,
    TenantPlan,
    TenantSettings,
    TenantUsage,
)

logger = structlog.get_logger(__name__)


class TenantService:
    """
    Service for managing tenants.
    
    Provides CRUD operations and business logic for tenant management.
    """
    
    def __init__(self):
        """Initialize tenant service."""
        # In-memory storage (replace with database in production)
        self._tenants: Dict[str, Tenant] = {}
        self._tenants_by_slug: Dict[str, str] = {}  # slug -> tenant_id
        self._tenants_by_domain: Dict[str, str] = {}  # domain -> tenant_id
        self._usage: Dict[str, Dict[str, TenantUsage]] = {}  # tenant_id -> {period: usage}
        
        self._logger = logger.bind(service="tenant_service")
    
    # ==================== CRUD Operations ====================
    
    async def create_tenant(
        self,
        name: str,
        admin_email: str,
        owner_id: Optional[str] = None,
        plan: TenantPlan = TenantPlan.FREE,
        company_name: Optional[str] = None,
        trial_days: int = 14,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Tenant:
        """
        Create a new tenant.
        
        Args:
            name: Tenant name
            admin_email: Admin email address
            owner_id: Owner user ID
            plan: Subscription plan
            company_name: Company name
            trial_days: Number of trial days (0 for no trial)
            metadata: Additional metadata
        
        Returns:
            Created tenant
        """
        # Generate unique slug
        base_slug = self._generate_slug(name)
        slug = base_slug
        counter = 1
        while slug in self._tenants_by_slug:
            slug = f"{base_slug}-{counter}"
            counter += 1
        
        # Create tenant
        tenant = Tenant(
            name=name,
            slug=slug,
            admin_email=admin_email,
            billing_email=admin_email,
            owner_id=owner_id,
            plan=plan,
            company_name=company_name,
            settings=TenantSettings.from_plan(plan),
            metadata=metadata or {},
        )
        
        # Set trial period
        if trial_days > 0:
            tenant.status = TenantStatus.TRIAL
            tenant.trial_ends_at = datetime.utcnow() + timedelta(days=trial_days)
        else:
            tenant.status = TenantStatus.ACTIVE
            tenant.activated_at = datetime.utcnow()
        
        # Store tenant
        self._tenants[tenant.tenant_id] = tenant
        self._tenants_by_slug[slug] = tenant.tenant_id
        
        # Initialize usage tracking
        self._initialize_usage(tenant.tenant_id)
        
        self._logger.info(
            "tenant_created",
            tenant_id=tenant.tenant_id,
            name=name,
            plan=plan.value,
        )
        
        return tenant
    
    async def get_tenant(self, tenant_id: str) -> Optional[Tenant]:
        """Get tenant by ID."""
        return self._tenants.get(tenant_id)
    
    async def get_tenant_by_slug(self, slug: str) -> Optional[Tenant]:
        """Get tenant by slug."""
        tenant_id = self._tenants_by_slug.get(slug)
        if tenant_id:
            return self._tenants.get(tenant_id)
        return None
    
    async def get_tenant_by_domain(self, domain: str) -> Optional[Tenant]:
        """Get tenant by custom domain."""
        tenant_id = self._tenants_by_domain.get(domain)
        if tenant_id:
            return self._tenants.get(tenant_id)
        return None
    
    async def update_tenant(
        self,
        tenant_id: str,
        updates: Dict[str, Any],
    ) -> Optional[Tenant]:
        """
        Update tenant.
        
        Args:
            tenant_id: Tenant ID
            updates: Fields to update
        
        Returns:
            Updated tenant or None if not found
        """
        tenant = self._tenants.get(tenant_id)
        if not tenant:
            return None
        
        # Apply updates
        allowed_fields = [
            "name", "admin_email", "billing_email", "company_name",
            "industry", "size", "metadata", "tags", "custom_domain",
        ]
        
        for field, value in updates.items():
            if field in allowed_fields:
                setattr(tenant, field, value)
        
        # Handle slug update
        if "name" in updates:
            old_slug = tenant.slug
            new_slug = self._generate_slug(updates["name"])
            if new_slug != old_slug and new_slug not in self._tenants_by_slug:
                del self._tenants_by_slug[old_slug]
                tenant.slug = new_slug
                self._tenants_by_slug[new_slug] = tenant_id
        
        # Handle domain update
        if "custom_domain" in updates:
            # Remove old domain mapping
            for domain, tid in list(self._tenants_by_domain.items()):
                if tid == tenant_id:
                    del self._tenants_by_domain[domain]
            
            # Add new domain mapping
            if updates["custom_domain"]:
                self._tenants_by_domain[updates["custom_domain"]] = tenant_id
        
        tenant.updated_at = datetime.utcnow()
        
        self._logger.info(
            "tenant_updated",
            tenant_id=tenant_id,
            updates=list(updates.keys()),
        )
        
        return tenant
    
    async def delete_tenant(
        self,
        tenant_id: str,
        hard_delete: bool = False,
    ) -> bool:
        """
        Delete tenant.
        
        Args:
            tenant_id: Tenant ID
            hard_delete: If True, permanently delete; otherwise soft delete
        
        Returns:
            True if deleted, False if not found
        """
        tenant = self._tenants.get(tenant_id)
        if not tenant:
            return False
        
        if hard_delete:
            # Remove from all indexes
            del self._tenants[tenant_id]
            if tenant.slug in self._tenants_by_slug:
                del self._tenants_by_slug[tenant.slug]
            if tenant.custom_domain and tenant.custom_domain in self._tenants_by_domain:
                del self._tenants_by_domain[tenant.custom_domain]
            if tenant_id in self._usage:
                del self._usage[tenant_id]
            
            self._logger.info("tenant_hard_deleted", tenant_id=tenant_id)
        else:
            # Soft delete
            tenant.delete()
            self._logger.info("tenant_soft_deleted", tenant_id=tenant_id)
        
        return True
    
    async def list_tenants(
        self,
        status: Optional[TenantStatus] = None,
        plan: Optional[TenantPlan] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Tenant]:
        """
        List tenants with optional filtering.
        
        Args:
            status: Filter by status
            plan: Filter by plan
            limit: Maximum results
            offset: Offset for pagination
        
        Returns:
            List of tenants
        """
        tenants = list(self._tenants.values())
        
        # Apply filters
        if status:
            tenants = [t for t in tenants if t.status == status]
        if plan:
            tenants = [t for t in tenants if t.plan == plan]
        
        # Exclude deleted
        tenants = [t for t in tenants if t.status != TenantStatus.DELETED]
        
        # Sort by created_at descending
        tenants.sort(key=lambda t: t.created_at, reverse=True)
        
        # Apply pagination
        return tenants[offset:offset + limit]
    
    # ==================== Status Management ====================
    
    async def activate_tenant(self, tenant_id: str) -> Optional[Tenant]:
        """Activate a tenant."""
        tenant = self._tenants.get(tenant_id)
        if not tenant:
            return None
        
        tenant.activate()
        self._logger.info("tenant_activated", tenant_id=tenant_id)
        return tenant
    
    async def suspend_tenant(
        self,
        tenant_id: str,
        reason: Optional[str] = None,
    ) -> Optional[Tenant]:
        """Suspend a tenant."""
        tenant = self._tenants.get(tenant_id)
        if not tenant:
            return None
        
        tenant.suspend(reason)
        self._logger.warning(
            "tenant_suspended",
            tenant_id=tenant_id,
            reason=reason,
        )
        return tenant
    
    async def reactivate_tenant(self, tenant_id: str) -> Optional[Tenant]:
        """Reactivate a suspended tenant."""
        tenant = self._tenants.get(tenant_id)
        if not tenant:
            return None
        
        if tenant.status != TenantStatus.SUSPENDED:
            return tenant
        
        tenant.status = TenantStatus.ACTIVE
        tenant.suspended_at = None
        tenant.metadata.pop("suspension_reason", None)
        tenant.updated_at = datetime.utcnow()
        
        self._logger.info("tenant_reactivated", tenant_id=tenant_id)
        return tenant
    
    # ==================== Plan Management ====================
    
    async def upgrade_plan(
        self,
        tenant_id: str,
        new_plan: TenantPlan,
    ) -> Optional[Tenant]:
        """
        Upgrade tenant plan.
        
        Args:
            tenant_id: Tenant ID
            new_plan: New plan
        
        Returns:
            Updated tenant
        """
        tenant = self._tenants.get(tenant_id)
        if not tenant:
            return None
        
        old_plan = tenant.plan
        tenant.upgrade_plan(new_plan)
        
        self._logger.info(
            "tenant_plan_upgraded",
            tenant_id=tenant_id,
            old_plan=old_plan.value,
            new_plan=new_plan.value,
        )
        
        return tenant
    
    async def update_settings(
        self,
        tenant_id: str,
        settings_updates: Dict[str, Any],
    ) -> Optional[Tenant]:
        """
        Update tenant settings.
        
        Args:
            tenant_id: Tenant ID
            settings_updates: Settings to update
        
        Returns:
            Updated tenant
        """
        tenant = self._tenants.get(tenant_id)
        if not tenant:
            return None
        
        for key, value in settings_updates.items():
            if hasattr(tenant.settings, key):
                setattr(tenant.settings, key, value)
        
        tenant.updated_at = datetime.utcnow()
        
        self._logger.info(
            "tenant_settings_updated",
            tenant_id=tenant_id,
            updates=list(settings_updates.keys()),
        )
        
        return tenant
    
    # ==================== Usage Tracking ====================
    
    def _initialize_usage(self, tenant_id: str) -> None:
        """Initialize usage tracking for tenant."""
        if tenant_id not in self._usage:
            self._usage[tenant_id] = {}
    
    def _get_current_period(self) -> str:
        """Get current period (YYYY-MM)."""
        return datetime.utcnow().strftime("%Y-%m")
    
    async def get_usage(
        self,
        tenant_id: str,
        period: Optional[str] = None,
    ) -> Optional[TenantUsage]:
        """
        Get tenant usage for a period.
        
        Args:
            tenant_id: Tenant ID
            period: Period in YYYY-MM format (default: current)
        
        Returns:
            Usage data
        """
        if tenant_id not in self._usage:
            return None
        
        if period is None:
            period = self._get_current_period()
        
        if period not in self._usage[tenant_id]:
            # Create new usage record
            self._usage[tenant_id][period] = TenantUsage(
                tenant_id=tenant_id,
                period=period,
            )
        
        return self._usage[tenant_id][period]
    
    async def record_usage(
        self,
        tenant_id: str,
        input_tokens: int,
        output_tokens: int,
        credits: float,
        success: bool = True,
    ) -> Optional[TenantUsage]:
        """
        Record usage for a tenant.
        
        Args:
            tenant_id: Tenant ID
            input_tokens: Input tokens used
            output_tokens: Output tokens used
            credits: Credits consumed
            success: Whether request was successful
        
        Returns:
            Updated usage
        """
        usage = await self.get_usage(tenant_id)
        if not usage:
            return None
        
        usage.add_request(input_tokens, output_tokens, credits, success)
        return usage
    
    async def check_limits(
        self,
        tenant_id: str,
        input_tokens: int = 0,
        output_tokens: int = 0,
    ) -> Dict[str, Any]:
        """
        Check if tenant is within limits.
        
        Args:
            tenant_id: Tenant ID
            input_tokens: Tokens to be used
            output_tokens: Output tokens expected
        
        Returns:
            Limit check result
        """
        tenant = self._tenants.get(tenant_id)
        if not tenant:
            return {"allowed": False, "reason": "tenant_not_found"}
        
        if not tenant.is_active():
            return {"allowed": False, "reason": "tenant_not_active"}
        
        usage = await self.get_usage(tenant_id)
        if not usage:
            return {"allowed": True}
        
        total_tokens = input_tokens + output_tokens
        settings = tenant.settings
        
        # Check monthly token limit
        if usage.total_tokens + total_tokens > settings.monthly_token_limit:
            return {
                "allowed": False,
                "reason": "monthly_token_limit_exceeded",
                "limit": settings.monthly_token_limit,
                "used": usage.total_tokens,
                "requested": total_tokens,
            }
        
        # Check daily token limit
        daily_tokens = usage.get_daily_tokens()
        if daily_tokens + total_tokens > settings.daily_token_limit:
            return {
                "allowed": False,
                "reason": "daily_token_limit_exceeded",
                "limit": settings.daily_token_limit,
                "used": daily_tokens,
                "requested": total_tokens,
            }
        
        return {"allowed": True}
    
    # ==================== Validation ====================
    
    async def validate_tenant(self, tenant_id: str) -> Dict[str, Any]:
        """
        Validate tenant status and configuration.
        
        Args:
            tenant_id: Tenant ID
        
        Returns:
            Validation result
        """
        tenant = self._tenants.get(tenant_id)
        if not tenant:
            return {"valid": False, "errors": ["tenant_not_found"]}
        
        errors = []
        warnings = []
        
        # Check status
        if tenant.status == TenantStatus.DELETED:
            errors.append("tenant_deleted")
        elif tenant.status == TenantStatus.SUSPENDED:
            errors.append("tenant_suspended")
        elif tenant.status == TenantStatus.INACTIVE:
            errors.append("tenant_inactive")
        
        # Check trial expiration
        if tenant.is_trial() and tenant.trial_ends_at:
            days_left = (tenant.trial_ends_at - datetime.utcnow()).days
            if days_left <= 0:
                errors.append("trial_expired")
            elif days_left <= 3:
                warnings.append(f"trial_expires_in_{days_left}_days")
        
        # Check required fields
        if not tenant.admin_email:
            errors.append("missing_admin_email")
        
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
            "tenant_id": tenant_id,
            "status": tenant.status.value,
        }
    
    # ==================== Helpers ====================
    
    def _generate_slug(self, name: str) -> str:
        """Generate URL-friendly slug."""
        import re
        slug = name.lower()
        slug = re.sub(r'[^a-z0-9]+', '-', slug)
        slug = slug.strip('-')
        return slug or "tenant"


# Global instance
_tenant_service: Optional[TenantService] = None


def get_tenant_service() -> TenantService:
    """Get global tenant service instance."""
    global _tenant_service
    if _tenant_service is None:
        _tenant_service = TenantService()
    return _tenant_service

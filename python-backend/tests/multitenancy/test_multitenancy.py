"""
Integration Tests for Multi-tenancy Module
Phase 3: SaaS Readiness
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

# Import modules to test
import sys
sys.path.insert(0, '/home/ubuntu/SmartSpecPro/python-backend')

from app.multitenancy.tenant_model import (
    Tenant,
    TenantStatus,
    TenantPlan,
    TenantSettings,
    TenantLimits,
)
from app.multitenancy.tenant_service import TenantService
from app.multitenancy.tenant_context import TenantContext, get_current_tenant
from app.multitenancy.tenant_isolation import TenantIsolation, IsolationLevel


class TestTenantModel:
    """Tests for Tenant model."""
    
    def test_tenant_creation(self):
        """Test creating a tenant."""
        tenant = Tenant(
            name="Test Company",
            slug="test-company",
            owner_email="admin@test.com",
        )
        
        assert tenant.name == "Test Company"
        assert tenant.slug == "test-company"
        assert tenant.status == TenantStatus.ACTIVE
        assert tenant.plan == TenantPlan.FREE
    
    def test_tenant_is_active(self):
        """Test tenant active status check."""
        tenant = Tenant(name="Test", slug="test")
        assert tenant.is_active() is True
        
        tenant.status = TenantStatus.SUSPENDED
        assert tenant.is_active() is False
    
    def test_tenant_limits(self):
        """Test tenant limits."""
        limits = TenantLimits(
            max_projects=10,
            max_users=50,
            max_storage_gb=100,
        )
        
        assert limits.max_projects == 10
        assert limits.max_users == 50
        assert limits.max_storage_gb == 100
    
    def test_tenant_to_dict(self):
        """Test tenant serialization."""
        tenant = Tenant(
            name="Test",
            slug="test",
            owner_email="test@test.com",
        )
        
        data = tenant.to_dict()
        
        assert data["name"] == "Test"
        assert data["slug"] == "test"
        assert "tenant_id" in data
        assert "created_at" in data


class TestTenantService:
    """Tests for TenantService."""
    
    @pytest.fixture
    def service(self):
        """Create tenant service instance."""
        return TenantService()
    
    @pytest.mark.asyncio
    async def test_create_tenant(self, service):
        """Test creating a tenant."""
        tenant = await service.create_tenant(
            name="New Company",
            slug="new-company",
            owner_email="owner@new.com",
            plan=TenantPlan.PROFESSIONAL,
        )
        
        assert tenant.name == "New Company"
        assert tenant.slug == "new-company"
        assert tenant.plan == TenantPlan.PROFESSIONAL
    
    @pytest.mark.asyncio
    async def test_get_tenant(self, service):
        """Test getting a tenant."""
        created = await service.create_tenant(
            name="Get Test",
            slug="get-test",
            owner_email="get@test.com",
        )
        
        fetched = await service.get_tenant(created.tenant_id)
        
        assert fetched is not None
        assert fetched.tenant_id == created.tenant_id
        assert fetched.name == "Get Test"
    
    @pytest.mark.asyncio
    async def test_get_tenant_by_slug(self, service):
        """Test getting a tenant by slug."""
        created = await service.create_tenant(
            name="Slug Test",
            slug="slug-test",
            owner_email="slug@test.com",
        )
        
        fetched = await service.get_tenant_by_slug("slug-test")
        
        assert fetched is not None
        assert fetched.slug == "slug-test"
    
    @pytest.mark.asyncio
    async def test_update_tenant(self, service):
        """Test updating a tenant."""
        tenant = await service.create_tenant(
            name="Update Test",
            slug="update-test",
            owner_email="update@test.com",
        )
        
        updated = await service.update_tenant(
            tenant.tenant_id,
            name="Updated Name",
        )
        
        assert updated.name == "Updated Name"
    
    @pytest.mark.asyncio
    async def test_suspend_tenant(self, service):
        """Test suspending a tenant."""
        tenant = await service.create_tenant(
            name="Suspend Test",
            slug="suspend-test",
            owner_email="suspend@test.com",
        )
        
        suspended = await service.suspend_tenant(
            tenant.tenant_id,
            reason="Test suspension",
        )
        
        assert suspended.status == TenantStatus.SUSPENDED
    
    @pytest.mark.asyncio
    async def test_list_tenants(self, service):
        """Test listing tenants."""
        # Create multiple tenants
        for i in range(3):
            await service.create_tenant(
                name=f"List Test {i}",
                slug=f"list-test-{i}",
                owner_email=f"list{i}@test.com",
            )
        
        tenants = await service.list_tenants(limit=10)
        
        assert len(tenants) >= 3
    
    @pytest.mark.asyncio
    async def test_duplicate_slug_error(self, service):
        """Test that duplicate slugs raise error."""
        await service.create_tenant(
            name="Dup Test",
            slug="dup-slug",
            owner_email="dup@test.com",
        )
        
        with pytest.raises(ValueError, match="already exists"):
            await service.create_tenant(
                name="Dup Test 2",
                slug="dup-slug",
                owner_email="dup2@test.com",
            )


class TestTenantContext:
    """Tests for TenantContext."""
    
    def test_context_creation(self):
        """Test creating tenant context."""
        context = TenantContext(
            tenant_id="test-tenant-id",
            tenant_slug="test-tenant",
        )
        
        assert context.tenant_id == "test-tenant-id"
        assert context.tenant_slug == "test-tenant"
    
    def test_context_to_dict(self):
        """Test context serialization."""
        context = TenantContext(
            tenant_id="test-id",
            tenant_slug="test-slug",
            user_id="user-123",
        )
        
        data = context.to_dict()
        
        assert data["tenant_id"] == "test-id"
        assert data["user_id"] == "user-123"


class TestTenantIsolation:
    """Tests for TenantIsolation."""
    
    @pytest.fixture
    def isolation(self):
        """Create tenant isolation instance."""
        return TenantIsolation(level=IsolationLevel.ROW)
    
    def test_isolation_levels(self):
        """Test isolation level enum."""
        assert IsolationLevel.ROW.value == "row"
        assert IsolationLevel.SCHEMA.value == "schema"
        assert IsolationLevel.DATABASE.value == "database"
    
    @pytest.mark.asyncio
    async def test_validate_access(self, isolation):
        """Test access validation."""
        # Same tenant should pass
        result = await isolation.validate_access(
            tenant_id="tenant-1",
            resource_tenant_id="tenant-1",
        )
        assert result is True
        
        # Different tenant should fail
        result = await isolation.validate_access(
            tenant_id="tenant-1",
            resource_tenant_id="tenant-2",
        )
        assert result is False
    
    @pytest.mark.asyncio
    async def test_filter_query(self, isolation):
        """Test query filtering."""
        query = "SELECT * FROM projects"
        
        filtered = await isolation.filter_query(
            query=query,
            tenant_id="tenant-123",
        )
        
        assert "tenant_id" in filtered
        assert "tenant-123" in filtered


# Test __init__.py files
class TestModuleInit:
    """Tests for module initialization."""
    
    def test_multitenancy_init(self):
        """Test multitenancy module init."""
        from app.multitenancy import (
            Tenant,
            TenantService,
            TenantContext,
            TenantIsolation,
        )
        
        assert Tenant is not None
        assert TenantService is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

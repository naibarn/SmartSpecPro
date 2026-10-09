"""Tests for the current tenant model, context, service, and isolation APIs."""

import pytest

from app.multitenancy.tenant_context import TenantContext, get_current_tenant, tenant_context
from app.multitenancy.tenant_isolation import IsolationLevel, TenantIsolation
from app.multitenancy.tenant_model import Tenant, TenantPlan, TenantSettings, TenantStatus
from app.multitenancy.tenant_service import TenantService


def test_tenant_defaults_and_plan_settings():
    tenant = Tenant(name="Test Company")
    assert tenant.slug == "test-company"
    assert tenant.status == TenantStatus.PENDING
    assert tenant.plan == TenantPlan.FREE

    settings = TenantSettings.from_plan(TenantPlan.ENTERPRISE)
    assert settings.max_users == 1000
    assert settings.max_storage_mb == 51200


def test_tenant_lifecycle_and_serialization():
    tenant = Tenant(name="Test", slug="test")
    tenant.activate()
    assert tenant.is_active()
    assert tenant.to_dict()["tenant_id"] == tenant.tenant_id

    tenant.suspend("security review")
    assert tenant.status == TenantStatus.SUSPENDED
    assert tenant.metadata["suspension_reason"] == "security review"


@pytest.mark.asyncio
async def test_tenant_service_creates_and_retrieves_tenant():
    service = TenantService()
    created = await service.create_tenant(
        name="New Company",
        admin_email="owner@example.test",
        plan=TenantPlan.PROFESSIONAL,
        trial_days=0,
    )

    assert created.status == TenantStatus.ACTIVE
    assert created.plan == TenantPlan.PROFESSIONAL
    assert await service.get_tenant(created.tenant_id) is created
    assert await service.get_tenant_by_slug(created.slug) is created


@pytest.mark.asyncio
async def test_tenant_service_applies_updates_and_suspension():
    service = TenantService()
    tenant = await service.create_tenant(
        name="Update Company", admin_email="admin@example.test", trial_days=0
    )

    updated = await service.update_tenant(tenant.tenant_id, {"name": "Updated Company"})
    assert updated is tenant
    assert updated.name == "Updated Company"
    assert updated.slug == "updated-company"

    suspended = await service.suspend_tenant(tenant.tenant_id, reason="review")
    assert suspended.status == TenantStatus.SUSPENDED


def test_tenant_context_scopes_access_and_restores_previous_context():
    tenant = Tenant(name="Scoped Tenant", slug="scoped", plan=TenantPlan.FREE)
    context = TenantContext.from_tenant(
        tenant, user_id="user-1", user_roles=["owner"], request_path="/api/data"
    )
    isolation = TenantIsolation(default_level=IsolationLevel.ROW)

    assert get_current_tenant() is None
    with tenant_context(context):
        assert get_current_tenant() is context
        assert context.is_admin()
        assert isolation.validate_access(tenant.tenant_id)
        assert not isolation.validate_access("another-tenant")
        assert isolation.require_filter().to_dict_filter() == {"tenant_id": tenant.tenant_id}
    assert get_current_tenant() is None


def test_tenant_isolation_requires_context_except_for_shared_resources():
    isolation = TenantIsolation()
    assert isolation.validate_access(None, allow_shared=True)
    assert not isolation.validate_access("tenant-1")
    with pytest.raises(RuntimeError, match="Tenant context required"):
        isolation.require_filter()

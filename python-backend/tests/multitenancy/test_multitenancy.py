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


@pytest.mark.asyncio
async def test_tenant_service_indexes_domains_lists_and_soft_deletes():
    service = TenantService()
    first = await service.create_tenant(
        name="Shared Name", admin_email="one@example.test", trial_days=0
    )
    second = await service.create_tenant(
        name="Shared Name", admin_email="two@example.test", trial_days=0
    )

    assert first.slug != second.slug
    updated = await service.update_tenant(
        first.tenant_id, {"custom_domain": "one.example.test"}
    )
    assert updated is first
    assert await service.get_tenant_by_domain("one.example.test") is first

    listed = await service.list_tenants(plan=TenantPlan.FREE, limit=1, offset=0)
    assert len(listed) == 1
    assert listed[0].plan == TenantPlan.FREE

    assert await service.delete_tenant(second.tenant_id)
    assert second.status == TenantStatus.DELETED
    assert second not in await service.list_tenants()

    assert await service.delete_tenant(first.tenant_id, hard_delete=True)
    assert await service.get_tenant_by_domain("one.example.test") is None


def test_tenant_context_serializes_tenant_and_user_scope():
    tenant = Tenant(name="Context Tenant", slug="context")
    context = TenantContext.from_tenant(
        tenant, user_id="user-1", user_email="user@example.test", request_id="req-1"
    )

    serialized = context.to_dict()
    assert serialized["tenant_id"] == tenant.tenant_id
    assert serialized["user_id"] == "user-1"
    assert serialized["request_id"] == "req-1"


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

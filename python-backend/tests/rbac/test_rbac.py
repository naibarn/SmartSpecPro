"""Focused contract tests for the active RBAC models and services."""

import pytest

from app.rbac.models import Permission, PermissionScope, ResourceType, Role
from app.rbac.policy_engine import (
    Policy,
    PolicyEffect,
    PolicyEngine,
    PolicyEvaluationResult,
)
from app.rbac.rbac_service import RBACService


class TestRoleModel:
    def test_role_creation_and_permissions(self):
        role = Role(
            name="Administrator",
            code="admin",
            description="Full system access",
            permissions={"project:read", "project:write"},
        )

        assert role.code == "admin"
        assert role.has_permission("project:read")
        assert not role.has_permission("project:delete")
        assert role.to_dict()["role_id"] == role.role_id


class TestPermissionModel:
    def test_permission_parses_code_and_serializes_scope(self):
        permission = Permission(
            code="project:read",
            name="View Projects",
            scope=PermissionScope.TENANT,
        )

        assert permission.resource_type is ResourceType.PROJECT
        assert permission.action == "read"
        assert permission.to_dict()["scope"] == "tenant"


class TestRBACService:
    @pytest.fixture
    def service(self):
        return RBACService()

    @pytest.mark.asyncio
    async def test_create_get_and_assign_role(self, service):
        role = await service.create_role(
            name="Project Editor",
            code="project-editor",
            permissions={"project:read", "project:write"},
            tenant_id="tenant-1",
        )

        assert await service.get_role(role.role_id) is role
        assert await service.get_role_by_code("project-editor", "tenant-1") is role

        assignment = await service.assign_role(
            user_id="user-1",
            role_id=role.role_id,
            tenant_id="tenant-1",
        )
        assert assignment.user_id == "user-1"
        assert assignment.role_id == role.role_id
        assert await service.get_user_roles("user-1", "tenant-1") == [role]

    @pytest.mark.asyncio
    async def test_permissions_are_scoped_to_assigned_tenant_and_revoke(self, service):
        role = await service.create_role(
            name="Project Reader",
            code="project-reader",
            permissions={"project:read"},
            tenant_id="tenant-a",
        )
        await service.assign_role("user-1", role.role_id, tenant_id="tenant-a")

        assert await service.has_permission("user-1", "project:read", "tenant-a")
        assert not await service.has_permission("user-1", "project:delete", "tenant-a")
        assert not await service.has_permission("user-1", "project:read", "tenant-b")

        assert await service.revoke_role("user-1", role.role_id, "tenant-a")
        assert not await service.has_permission("user-1", "project:read", "tenant-a")

        with pytest.raises(ValueError, match="outside the requested tenant"):
            await service.assign_role("user-2", role.role_id, tenant_id="tenant-b")

    def test_permission_decorators_remain_public(self):
        from app.rbac.decorators import require_permission, require_role

        assert callable(require_permission)
        assert callable(require_role)


class TestPolicyEngine:
    @pytest.mark.asyncio
    async def test_add_policy_and_evaluate_matching_action(self):
        engine = PolicyEngine()
        policy = await engine.add_policy(
            Policy(
                name="allow-project-read",
                effect=PolicyEffect.ALLOW,
                resource_types=[ResourceType.PROJECT],
                actions=["read"],
            )
        )

        result = await engine.evaluate(
            user={"id": "user-1"},
            resource={"id": "project-1"},
            action="read",
            resource_type=ResourceType.PROJECT,
        )

        assert isinstance(result, PolicyEvaluationResult)
        assert result.allowed is True
        assert result.matching_policy is policy

    @pytest.mark.asyncio
    async def test_policy_engine_defaults_to_deny(self):
        result = await PolicyEngine().evaluate(
            user={"id": "user-1"},
            resource={"id": "project-1"},
            action="read",
            resource_type=ResourceType.PROJECT,
        )

        assert result.allowed is False
        assert result.effect is PolicyEffect.DENY

    @pytest.mark.asyncio
    async def test_deny_policy_overrides_matching_allow(self):
        engine = PolicyEngine()
        await engine.add_policy(
            Policy(
                name="high-priority-allow",
                effect=PolicyEffect.ALLOW,
                actions=["read"],
                priority=100,
            )
        )
        await engine.add_policy(
            Policy(
                name="explicit-deny",
                effect=PolicyEffect.DENY,
                actions=["read"],
                priority=1,
            )
        )

        result = await engine.evaluate(
            user={"id": "user-1"},
            resource={"id": "project-1"},
            action="read",
            resource_type=ResourceType.PROJECT,
        )

        assert result.allowed is False
        assert result.effect is PolicyEffect.DENY
        assert result.matching_policy.name == "explicit-deny"

"""
Integration Tests for RBAC Module
Phase 3: SaaS Readiness
"""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import sys
sys.path.insert(0, '/home/ubuntu/SmartSpecPro/python-backend')

from app.rbac.models import (
    Role,
    Permission,
    RoleAssignment,
    PermissionScope,
)
from app.rbac.rbac_service import RBACService
from app.rbac.policy_engine import PolicyEngine, Policy, PolicyEffect


class TestRoleModel:
    """Tests for Role model."""
    
    def test_role_creation(self):
        """Test creating a role."""
        role = Role(
            name="admin",
            display_name="Administrator",
            description="Full system access",
        )
        
        assert role.name == "admin"
        assert role.display_name == "Administrator"
        assert role.is_system is False
    
    def test_role_with_permissions(self):
        """Test role with permissions."""
        role = Role(
            name="editor",
            display_name="Editor",
            permissions=["read", "write", "update"],
        )
        
        assert "read" in role.permissions
        assert "write" in role.permissions
        assert len(role.permissions) == 3
    
    def test_role_to_dict(self):
        """Test role serialization."""
        role = Role(name="test", display_name="Test Role")
        data = role.to_dict()
        
        assert data["name"] == "test"
        assert "role_id" in data


class TestPermissionModel:
    """Tests for Permission model."""
    
    def test_permission_creation(self):
        """Test creating a permission."""
        perm = Permission(
            name="projects:read",
            resource="projects",
            action="read",
        )
        
        assert perm.name == "projects:read"
        assert perm.resource == "projects"
        assert perm.action == "read"
    
    def test_permission_scopes(self):
        """Test permission scopes."""
        assert PermissionScope.GLOBAL.value == "global"
        assert PermissionScope.TENANT.value == "tenant"
        assert PermissionScope.PROJECT.value == "project"


class TestRBACService:
    """Tests for RBACService."""
    
    @pytest.fixture
    def service(self):
        """Create RBAC service instance."""
        return RBACService()
    
    @pytest.mark.asyncio
    async def test_create_role(self, service):
        """Test creating a role."""
        role = await service.create_role(
            name="custom-role",
            display_name="Custom Role",
            permissions=["read", "write"],
        )
        
        assert role.name == "custom-role"
        assert "read" in role.permissions
    
    @pytest.mark.asyncio
    async def test_get_role(self, service):
        """Test getting a role."""
        created = await service.create_role(
            name="get-test-role",
            display_name="Get Test",
        )
        
        fetched = await service.get_role(created.role_id)
        
        assert fetched is not None
        assert fetched.name == "get-test-role"
    
    @pytest.mark.asyncio
    async def test_assign_role(self, service):
        """Test assigning a role to a user."""
        role = await service.create_role(
            name="assign-test",
            display_name="Assign Test",
        )
        
        assignment = await service.assign_role(
            user_id="user-123",
            role_id=role.role_id,
            tenant_id="tenant-456",
        )
        
        assert assignment.user_id == "user-123"
        assert assignment.role_id == role.role_id
    
    @pytest.mark.asyncio
    async def test_get_user_roles(self, service):
        """Test getting user roles."""
        role1 = await service.create_role(name="role1", display_name="Role 1")
        role2 = await service.create_role(name="role2", display_name="Role 2")
        
        await service.assign_role("user-multi", role1.role_id, "tenant-1")
        await service.assign_role("user-multi", role2.role_id, "tenant-1")
        
        roles = await service.get_user_roles("user-multi", "tenant-1")
        
        assert len(roles) >= 2
    
    @pytest.mark.asyncio
    async def test_check_permission(self, service):
        """Test checking user permission."""
        role = await service.create_role(
            name="perm-check",
            display_name="Permission Check",
            permissions=["projects:read", "projects:write"],
        )
        
        await service.assign_role("user-perm", role.role_id, "tenant-perm")
        
        has_read = await service.check_permission(
            user_id="user-perm",
            permission="projects:read",
            tenant_id="tenant-perm",
        )
        
        has_delete = await service.check_permission(
            user_id="user-perm",
            permission="projects:delete",
            tenant_id="tenant-perm",
        )
        
        assert has_read is True
        assert has_delete is False
    
    @pytest.mark.asyncio
    async def test_revoke_role(self, service):
        """Test revoking a role."""
        role = await service.create_role(name="revoke-test", display_name="Revoke")
        await service.assign_role("user-revoke", role.role_id, "tenant-rev")
        
        result = await service.revoke_role("user-revoke", role.role_id, "tenant-rev")
        
        assert result is True
        
        roles = await service.get_user_roles("user-revoke", "tenant-rev")
        role_ids = [r.role_id for r in roles]
        assert role.role_id not in role_ids


class TestPolicyEngine:
    """Tests for PolicyEngine."""
    
    @pytest.fixture
    def engine(self):
        """Create policy engine instance."""
        return PolicyEngine()
    
    @pytest.mark.asyncio
    async def test_create_policy(self, engine):
        """Test creating a policy."""
        policy = await engine.create_policy(
            name="test-policy",
            effect=PolicyEffect.ALLOW,
            actions=["read", "write"],
            resources=["projects/*"],
        )
        
        assert policy.name == "test-policy"
        assert policy.effect == PolicyEffect.ALLOW
    
    @pytest.mark.asyncio
    async def test_evaluate_policy_allow(self, engine):
        """Test policy evaluation - allow."""
        await engine.create_policy(
            name="allow-read",
            effect=PolicyEffect.ALLOW,
            actions=["read"],
            resources=["projects/*"],
            principals=["user:*"],
        )
        
        result = await engine.evaluate(
            principal="user:123",
            action="read",
            resource="projects/456",
        )
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_evaluate_policy_deny(self, engine):
        """Test policy evaluation - deny."""
        await engine.create_policy(
            name="deny-delete",
            effect=PolicyEffect.DENY,
            actions=["delete"],
            resources=["*"],
            principals=["user:*"],
        )
        
        result = await engine.evaluate(
            principal="user:123",
            action="delete",
            resource="projects/456",
        )
        
        assert result is False
    
    @pytest.mark.asyncio
    async def test_deny_overrides_allow(self, engine):
        """Test that deny policies override allow."""
        await engine.create_policy(
            name="allow-all",
            effect=PolicyEffect.ALLOW,
            actions=["*"],
            resources=["*"],
            principals=["user:*"],
        )
        
        await engine.create_policy(
            name="deny-admin",
            effect=PolicyEffect.DENY,
            actions=["*"],
            resources=["admin/*"],
            principals=["user:*"],
        )
        
        # Regular resource should be allowed
        result1 = await engine.evaluate(
            principal="user:123",
            action="read",
            resource="projects/456",
        )
        assert result1 is True
        
        # Admin resource should be denied
        result2 = await engine.evaluate(
            principal="user:123",
            action="read",
            resource="admin/settings",
        )
        assert result2 is False


class TestRBACDecorators:
    """Tests for RBAC decorators."""
    
    def test_require_permission_decorator_exists(self):
        """Test that decorator is importable."""
        from app.rbac.decorators import require_permission, require_role
        
        assert require_permission is not None
        assert require_role is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

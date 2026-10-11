"""Contract coverage for RBAC HTTP adapters and tenant authorization."""

from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.api.rbac import (
    RoleAssignmentCreate,
    RoleAssignmentResponse,
    RoleCreate,
    RoleResponse,
    assign_role,
    create_role,
    get_role,
)
from app.rbac.models import ResourceType
from app.rbac.rbac_service import RBACService


@pytest.mark.asyncio
async def test_create_role_maps_http_fields_to_domain_and_response():
    service = RBACService()
    service.has_permission = AsyncMock(return_value=True)

    response = await create_role(
        RoleCreate(
            name="project-editor",
            display_name="Project Editor",
            permissions=["project:read", "project:write"],
        ),
        current_user=SimpleNamespace(id="admin-1"),
        tenant_id="tenant-1",
        rbac_service=service,
    )

    role = await service.get_role_by_code("project-editor", "tenant-1")
    assert response["id"] == role.role_id
    assert response["name"] == "project-editor"
    assert response["display_name"] == "Project Editor"
    assert response["permissions"] == ["project:read", "project:write"]
    assert RoleResponse.model_validate(response).id == role.role_id


@pytest.mark.asyncio
async def test_create_role_keeps_permission_denial_enforced():
    service = RBACService()
    service.has_permission = AsyncMock(return_value=False)

    with pytest.raises(HTTPException) as error:
        await create_role(
            RoleCreate(name="project-editor", display_name="Project Editor"),
            current_user=SimpleNamespace(id="user-1"),
            tenant_id="tenant-1",
            rbac_service=service,
        )

    assert error.value.status_code == 403
    assert await service.get_role_by_code("project-editor", "tenant-1") is None


@pytest.mark.asyncio
async def test_assignment_http_contract_maps_project_and_audit_fields():
    service = RBACService()
    service.has_permission = AsyncMock(return_value=True)
    role = await service.create_role(name="Editor", code="editor", tenant_id="tenant-1")

    response = await assign_role(
        RoleAssignmentCreate(
            user_id="user-1",
            role_id=role.role_id,
            project_id="project-1",
            reason="project collaboration",
        ),
        current_user=SimpleNamespace(id="admin-1"),
        tenant_id="tenant-1",
        rbac_service=service,
    )

    assignment = RoleAssignmentResponse.model_validate(response)
    assert assignment.project_id == "project-1"
    assert assignment.reason == "project collaboration"
    assert assignment.assigned_by == "admin-1"


@pytest.mark.asyncio
async def test_role_lookup_does_not_expose_another_tenant_role():
    service = RBACService()
    role = await service.create_role(
        name="Private role",
        code="private-role",
        tenant_id="tenant-a",
    )

    with pytest.raises(HTTPException) as error:
        await get_role(
            role.role_id,
            current_user=SimpleNamespace(id="user-b"),
            tenant_id="tenant-b",
            rbac_service=service,
        )

    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_assignment_listing_and_revocation_are_tenant_scoped():
    service = RBACService()
    role_a = await service.create_role(name="A", code="a", tenant_id="tenant-a")
    role_b = await service.create_role(name="B", code="b", tenant_id="tenant-b")
    assignment_a = await service.assign_role(
        "user-a",
        role_a.role_id,
        tenant_id="tenant-a",
        scope_type=ResourceType.PROJECT,
        scope_id="project-a",
        expires_at=datetime.utcnow() + timedelta(days=1),
        reason="test assignment",
    )
    assignment_b = await service.assign_role(
        "user-b", role_b.role_id, tenant_id="tenant-b"
    )

    assert await service.list_assignments(tenant_id="tenant-a") == [assignment_a]
    assert await service.list_assignments(tenant_id="tenant-a", project_id="project-a") == [assignment_a]
    assert not await service.revoke_assignment(assignment_b.assignment_id, tenant_id="tenant-a")
    assert assignment_b.is_active
    assert await service.revoke_assignment(assignment_a.assignment_id, tenant_id="tenant-a")
    assert not assignment_a.is_active

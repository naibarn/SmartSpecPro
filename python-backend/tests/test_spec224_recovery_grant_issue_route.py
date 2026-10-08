from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api import approvals
from app.api.approvals import Spec224RecoveryGrantIssue


def issue_request(**overrides) -> Spec224RecoveryGrantIssue:
    payload = {
        "idempotencyKey": "lane1-owner-grant-001",
        "scope": {"scopeMarker": "validated-by-service"},
    }
    payload.update(overrides)
    return Spec224RecoveryGrantIssue.model_validate(payload)


@pytest.mark.asyncio
async def test_issue_recovery_grant_uses_authenticated_owner_and_tenant(monkeypatch):
    captured = {}

    class Service:
        def __init__(self, database):
            captured["database"] = database

        async def issue_spec224_recovery_grant(self, **kwargs):
            captured.update(kwargs)
            return {"grantId": "grant-1", "ownerId": kwargs["owner_id"]}

    monkeypatch.setattr(approvals, "ApprovalDBService", Service)
    database = object()
    result = await approvals.issue_spec224_recovery_grant(
        issue_request(), SimpleNamespace(id=27), "tenant-owned", database
    )

    assert result == {"grantId": "grant-1", "ownerId": 27}
    assert captured == {
        "database": database,
        "tenant_id": "tenant-owned",
        "owner_id": 27,
        "idempotency_key": "lane1-owner-grant-001",
        "scope": {"scopeMarker": "validated-by-service"},
    }


@pytest.mark.asyncio
async def test_issue_recovery_grant_requires_server_resolved_tenant(monkeypatch):
    def unexpected_service(_database):
        raise AssertionError("owner grant service must not run without tenant context")

    monkeypatch.setattr(approvals, "ApprovalDBService", unexpected_service)
    with pytest.raises(HTTPException) as exc:
        await approvals.issue_spec224_recovery_grant(
            issue_request(), SimpleNamespace(id=27), None, object()
        )

    assert exc.value.status_code == 400
    assert exc.value.detail == "TENANT_CONTEXT_REQUIRED"


@pytest.mark.asyncio
async def test_issue_recovery_grant_maps_non_owner_to_forbidden(monkeypatch):
    class Service:
        def __init__(self, _database):
            pass

        async def issue_spec224_recovery_grant(self, **_kwargs):
            raise PermissionError("SPEC224_RECOVERY_GRANT_TENANT_OWNER_REQUIRED")

    monkeypatch.setattr(approvals, "ApprovalDBService", Service)
    with pytest.raises(HTTPException) as exc:
        await approvals.issue_spec224_recovery_grant(
            issue_request(), SimpleNamespace(id=28), "tenant-owned", object()
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "SPEC224_RECOVERY_GRANT_TENANT_OWNER_REQUIRED"


@pytest.mark.asyncio
async def test_issue_recovery_grant_maps_invalid_scope_without_persisting(monkeypatch):
    class Service:
        def __init__(self, _database):
            pass

        async def issue_spec224_recovery_grant(self, **_kwargs):
            raise ValueError("SPEC224_RECOVERY_GRANT_SCOPE_INVALID")

    monkeypatch.setattr(approvals, "ApprovalDBService", Service)
    with pytest.raises(HTTPException) as exc:
        await approvals.issue_spec224_recovery_grant(
            issue_request(), SimpleNamespace(id=27), "tenant-owned", object()
        )

    assert exc.value.status_code == 422
    assert exc.value.detail == "SPEC224_RECOVERY_GRANT_SCOPE_INVALID"


def test_issue_recovery_grant_route_requires_authenticated_user_and_tenant_context():
    route = next(
        route
        for route in approvals.router.routes
        if route.path == "/api/v1/approvals/spec224/recovery-grants"
    )
    dependencies = {dependency.call for dependency in route.dependant.dependencies}

    assert approvals.get_current_user in dependencies
    assert approvals.get_current_tenant_id in dependencies
    assert approvals.get_db_session in dependencies

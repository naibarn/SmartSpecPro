from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api import approvals
from app.api.approvals import Spec224RecoveryGrantRevoke


def revoke_request(**overrides) -> Spec224RecoveryGrantRevoke:
    payload = {"reason": "owner requested revocation"}
    payload.update(overrides)
    return Spec224RecoveryGrantRevoke.model_validate(payload)


def test_revoke_request_rejects_extra_fields_and_invalid_reason():
    with pytest.raises(ValueError):
        revoke_request(untrusted_owner_id=27)

    with pytest.raises(ValueError):
        revoke_request(reason="no")


@pytest.mark.asyncio
async def test_revoke_recovery_grant_uses_authenticated_owner_and_tenant(monkeypatch):
    captured = {}

    class Service:
        def __init__(self, database):
            captured["database"] = database

        async def revoke_spec224_recovery_grant(self, **kwargs):
            captured.update(kwargs)
            return {"grantId": kwargs["grant_id"], "state": "revoked"}

    monkeypatch.setattr(approvals, "ApprovalDBService", Service)
    database = object()
    result = await approvals.revoke_spec224_recovery_grant(
        "grant-1", revoke_request(), SimpleNamespace(id=27), "tenant-owned", database
    )

    assert result == {"grantId": "grant-1", "state": "revoked"}
    assert captured == {
        "database": database,
        "grant_id": "grant-1",
        "tenant_id": "tenant-owned",
        "owner_id": 27,
        "reason": "owner requested revocation",
    }


@pytest.mark.asyncio
async def test_revoke_recovery_grant_requires_server_resolved_tenant(monkeypatch):
    def unexpected_service(_database):
        raise AssertionError("revoke service must not run without tenant context")

    monkeypatch.setattr(approvals, "ApprovalDBService", unexpected_service)
    with pytest.raises(HTTPException) as exc:
        await approvals.revoke_spec224_recovery_grant(
            "grant-1", revoke_request(), SimpleNamespace(id=27), None, object()
        )

    assert exc.value.status_code == 400
    assert exc.value.detail == "TENANT_CONTEXT_REQUIRED"


@pytest.mark.asyncio
async def test_revoke_recovery_grant_maps_non_owner_to_forbidden(monkeypatch):
    class Service:
        def __init__(self, _database):
            pass

        async def revoke_spec224_recovery_grant(self, **_kwargs):
            raise PermissionError("SPEC224_RECOVERY_GRANT_TENANT_OWNER_REQUIRED")

    monkeypatch.setattr(approvals, "ApprovalDBService", Service)
    with pytest.raises(HTTPException) as exc:
        await approvals.revoke_spec224_recovery_grant(
            "grant-1", revoke_request(), SimpleNamespace(id=28), "tenant-owned", object()
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "SPEC224_RECOVERY_GRANT_TENANT_OWNER_REQUIRED"


@pytest.mark.asyncio
async def test_revoke_recovery_grant_distinguishes_unknown_grant(monkeypatch):
    class Service:
        def __init__(self, _database):
            pass

        async def revoke_spec224_recovery_grant(self, **_kwargs):
            raise ValueError("SPEC224_RECOVERY_GRANT_NOT_FOUND")

    monkeypatch.setattr(approvals, "ApprovalDBService", Service)
    with pytest.raises(HTTPException) as exc:
        await approvals.revoke_spec224_recovery_grant(
            "missing", revoke_request(), SimpleNamespace(id=27), "tenant-owned", object()
        )

    assert exc.value.status_code == 404
    assert exc.value.detail == "SPEC224_RECOVERY_GRANT_NOT_FOUND"


@pytest.mark.asyncio
async def test_revoke_recovery_grant_maps_other_service_validation_to_unprocessable(monkeypatch):
    class Service:
        def __init__(self, _database):
            pass

        async def revoke_spec224_recovery_grant(self, **_kwargs):
            raise ValueError("SPEC224_RECOVERY_GRANT_ALREADY_EXPIRED")

    monkeypatch.setattr(approvals, "ApprovalDBService", Service)
    with pytest.raises(HTTPException) as exc:
        await approvals.revoke_spec224_recovery_grant(
            "grant-1", revoke_request(), SimpleNamespace(id=27), "tenant-owned", object()
        )

    assert exc.value.status_code == 422
    assert exc.value.detail == "SPEC224_RECOVERY_GRANT_ALREADY_EXPIRED"


def test_revoke_recovery_grant_route_requires_authenticated_user_and_tenant_context():
    route = next(
        route
        for route in approvals.router.routes
        if route.path == "/api/v1/approvals/spec224/recovery-grants/{grant_id}/revoke"
    )
    dependencies = {dependency.call for dependency in route.dependant.dependencies}

    assert approvals.get_current_user in dependencies
    assert approvals.get_current_tenant_id in dependencies
    assert approvals.get_db_session in dependencies

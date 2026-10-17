from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.approvals import (
    CloudflareStagingGrantIssue,
    _assert_cloudflare_staging_gateway_token,
    create_cloudflare_staging_grant_request,
)
from app.models.approval import ApprovalStatus, ApprovalType
from app.services.approval_db_service import (
    ApprovalDBService,
    normalize_cloudflare_staging_grant_payload,
)


def _grant_payload(**overrides):
    now = datetime.now(timezone.utc)
    payload = {
        "schemaVersion": "cloudflare.staging-deployment-grant.v1",
        "grantRef": "grant-ref-1",
        "tenantId": "tenant-1",
        "requesterUserId": 17,
        "projectId": "project-1",
        "executorId": "cloudflare-staging-executor",
        "targetId": "smartspec-cloudflare-staging",
        "environment": "staging",
        "artifactRef": "sha256:" + "a" * 64,
        "sourceSha": "b" * 40,
        "buildDigest": "a" * 64,
        "actions": ["deploy", "rollback"],
        "rollbackDeploymentId": "deployment-previous",
        "rollbackArtifactRef": "sha256:" + "c" * 64,
        "rollbackSourceSha": "d" * 40,
        "rollbackBuildDigest": "c" * 64,
        "expiresAt": (now + timedelta(hours=2)).isoformat().replace("+00:00", "Z"),
        "revokedAt": None,
    }
    payload.update(overrides)
    return payload


@pytest.mark.unit
def test_cloudflare_staging_grant_payload_is_typed_and_closed():
    grant = normalize_cloudflare_staging_grant_payload(_grant_payload(actions=["rollback", "deploy"]))
    assert grant["actions"] == ["deploy", "rollback"]

    with pytest.raises(ValueError, match="TARGET_INVALID"):
        normalize_cloudflare_staging_grant_payload(_grant_payload(targetId="production"))
    with pytest.raises(ValueError, match="FIELDS_INVALID"):
        normalize_cloudflare_staging_grant_payload(_grant_payload(workerJobGrant=True))
    with pytest.raises(ValueError, match="ACTIONS_INVALID"):
        normalize_cloudflare_staging_grant_payload(_grant_payload(actions=["deploy", "production_dns"]))
    with pytest.raises(ValueError, match="SOURCE_SHA_INVALID"):
        normalize_cloudflare_staging_grant_payload(_grant_payload(sourceSha="b" * 64))


@pytest.mark.unit
@pytest.mark.asyncio
async def test_cloudflare_grant_api_requires_admin_and_typed_staging_target():
    issue = CloudflareStagingGrantIssue.model_validate({
        "idempotencyKey": "request-key-123",
        "projectId": "project-1",
        "executorId": "cloudflare-staging-executor",
        "targetId": "smartspec-cloudflare-staging",
        "environment": "staging",
        "artifactRef": "sha256:" + "a" * 64,
        "sourceSha": "b" * 40,
        "buildDigest": "a" * 64,
        "actions": ["deploy", "rollback"],
        "rollbackDeploymentId": "deployment-previous",
        "rollbackArtifactRef": "sha256:" + "c" * 64,
        "rollbackSourceSha": "d" * 40,
        "rollbackBuildDigest": "c" * 64,
        "expiresAt": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
    })
    db = AsyncMock()
    with pytest.raises(HTTPException) as raised:
        await create_cloudflare_staging_grant_request(
            issue,
            current_user=SimpleNamespace(id=17, role="user"),
            tenant_id="tenant-1",
            db=db,
        )
    assert raised.value.status_code == 403
    db.execute.assert_not_awaited()

    with pytest.raises(ValidationError):
        CloudflareStagingGrantIssue.model_validate({
            **issue.model_dump(by_alias=True),
            "targetId": "smartspec-cloudflare-production",
        })


@pytest.mark.unit
@pytest.mark.asyncio
async def test_grant_resolver_returns_only_approved_unexpired_unrevoked_record():
    payload = _grant_payload()
    row = SimpleNamespace(
        id=payload["grantRef"],
        request_type=ApprovalType.DEPLOYMENT,
        status=ApprovalStatus.APPROVED,
        revoked_at=None,
        resolved_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
        current_approvals=1,
        required_approvers=1,
        tenant_id=payload["tenantId"],
        project_id=payload["projectId"],
        requester_id=payload["requesterUserId"],
        payload=payload,
        extra_data={"cloudflareStagingGrantIssuerV1": "admin_approval_workflow"},
    )
    db = AsyncMock()
    db.execute.return_value = SimpleNamespace(scalar_one_or_none=Mock(return_value=row))
    service = ApprovalDBService(db)

    resolved = await service.resolve_cloudflare_staging_grant(row.id)
    assert resolved == payload

    row.extra_data = {}
    assert await service.resolve_cloudflare_staging_grant(row.id) is None
    row.extra_data = {"cloudflareStagingGrantIssuerV1": "admin_approval_workflow"}

    row.status = ApprovalStatus.PENDING
    assert await service.resolve_cloudflare_staging_grant(row.id) is None
    row.status = ApprovalStatus.APPROVED
    row.revoked_at = datetime.now(timezone.utc)
    assert await service.resolve_cloudflare_staging_grant(row.id) is None

    row.revoked_at = None
    row.payload = _grant_payload(expiresAt=(datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat())
    assert await service.resolve_cloudflare_staging_grant(row.id) is None


@pytest.mark.unit
def test_generic_deployment_approval_is_not_a_staging_grant():
    with pytest.raises(ValueError, match="FIELDS_INVALID"):
        normalize_cloudflare_staging_grant_payload({"kind": "deployment", "target": "staging"})


@pytest.mark.unit
def test_internal_resolver_uses_existing_gateway_token_only(monkeypatch):
    from app.api import approvals

    monkeypatch.setattr(approvals.settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "server-only-token")
    _assert_cloudflare_staging_gateway_token("server-only-token")
    with pytest.raises(HTTPException) as raised:
        _assert_cloudflare_staging_gateway_token("wrong-token")
    assert raised.value.status_code == 401


@pytest.mark.unit
@pytest.mark.asyncio
async def test_cloudflare_grant_revoke_is_admin_only_audited_and_idempotent():
    payload = _grant_payload()
    request = SimpleNamespace(
        id=payload["grantRef"],
        request_type=ApprovalType.DEPLOYMENT,
        tenant_id=payload["tenantId"],
        payload=payload,
        extra_data={"cloudflareStagingGrantIssuerV1": "admin_approval_workflow"},
        revoked_at=None,
    )
    db = AsyncMock()
    db.add = Mock()
    role_result = SimpleNamespace(scalar_one_or_none=Mock(return_value="admin"))
    request_result = SimpleNamespace(scalar_one_or_none=Mock(return_value=request))
    db.execute.side_effect = [role_result, request_result, role_result, request_result]
    service = ApprovalDBService(db)

    first = await service.revoke_cloudflare_staging_grant(
        grant_ref=request.id,
        tenant_id=request.tenant_id,
        actor_id=17,
        reason="operator requested stop",
    )
    assert first is request
    assert request.revoked_at is not None
    assert request.payload["revokedAt"] is not None
    assert db.add.call_count == 1

    second = await service.revoke_cloudflare_staging_grant(
        grant_ref=request.id,
        tenant_id=request.tenant_id,
        actor_id=17,
        reason="operator requested stop",
    )
    assert second is request
    assert db.add.call_count == 1
    assert db.commit.await_count == 2

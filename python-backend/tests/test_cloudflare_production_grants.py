from datetime import datetime, timedelta, timezone
import hashlib
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException

from app.api.approvals import (
    ApprovalResponseCreate,
    CloudflareProductionGrantIssue,
    create_cloudflare_production_grant_request,
    respond_to_approval,
)
from app.models.approval import ApprovalStatus, ApprovalType
from app.services.approval_db_service import (
    ApprovalDBService,
    normalize_cloudflare_production_grant_payload,
)


def _grant_payload(**overrides):
    digest = "a" * 64
    rollback_digest = "b" * 64
    payload = {
        "schemaVersion": "cloudflare.production-deployment-grant.v2",
        "grantRef": "11111111-1111-4111-8111-111111111111",
        "tenantId": "tenant-1", "requesterUserId": 17, "projectId": "project-1",
        "executorId": "cloudflare-production-executor",
        "targetId": "smartspec-cloudflare-runtime", "environment": "production",
        "accountRef": "c" * 32, "zoneId": "9" * 32, "routePattern": "smartaihub.app/*",
        "expectedRouteId": None, "expectedRouteScript": None, "rolloutStage": "canary",
        "canaryGrantRef": None, "canaryDeploymentId": None,
        "canaryVerifiedAt": None,
        "candidateVersionId": None,
        "jobId": "22222222-2222-4222-8222-222222222222",
        "artifactRef": f"sha256:{digest}", "sourceSha": "d" * 40, "buildDigest": digest,
        "configurationRef": f"cf-origin:{digest}", "configurationDigest": digest,
        "actions": ["deploy"], "rollbackDeploymentId": "33333333-3333-4333-8333-333333333333",
        "rollbackArtifactRef": f"sha256:{rollback_digest}", "rollbackSourceSha": "e" * 40,
        "rollbackBuildDigest": rollback_digest,
        "rollbackConfigurationRef": f"cf-origin:{rollback_digest}",
        "rollbackConfigurationDigest": rollback_digest,
        "canaryRequired": True, "maxDurationSeconds": 300,
        "expiresAt": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat().replace("+00:00", "Z"),
        "revokedAt": None,
    }
    payload.update(overrides)
    return payload


@pytest.mark.unit
def test_production_grant_payload_is_exact_bounded_and_separate_from_staging():
    assert normalize_cloudflare_production_grant_payload(_grant_payload())["environment"] == "production"
    promote = _grant_payload(rolloutStage="promote", canaryGrantRef="44444444-4444-4444-8444-444444444444",
                             canaryDeploymentId="55555555-5555-4555-8555-555555555555",
                             canaryVerifiedAt=datetime.now(timezone.utc).isoformat(),
                             candidateVersionId="66666666-6666-4666-8666-666666666666")
    assert normalize_cloudflare_production_grant_payload(promote)["rolloutStage"] == "promote"
    with pytest.raises(ValueError, match="TARGET_INVALID"):
        normalize_cloudflare_production_grant_payload(_grant_payload(environment="staging"))
    with pytest.raises(ValueError, match="TARGET_INVALID"):
        normalize_cloudflare_production_grant_payload(_grant_payload(targetId="smartspec-cloudflare-staging"))
    with pytest.raises(ValueError, match="ARTIFACT_BINDING_INVALID"):
        normalize_cloudflare_production_grant_payload(_grant_payload(artifactRef="sha256:" + "f" * 64))
    with pytest.raises(ValueError, match="BUDGET_INVALID"):
        normalize_cloudflare_production_grant_payload(_grant_payload(maxDurationSeconds=901))
    with pytest.raises(ValueError, match="FIELDS_INVALID"):
        normalize_cloudflare_production_grant_payload(_grant_payload(unbounded=True))
    with pytest.raises(ValueError, match="ROUTE_OR_STAGE_INVALID"):
        normalize_cloudflare_production_grant_payload(_grant_payload(routePattern="*.smartaihub.app/*"))
    with pytest.raises(ValueError, match="ROUTE_OR_STAGE_INVALID"):
        normalize_cloudflare_production_grant_payload(_grant_payload(rolloutStage="promote", expectedRouteId="route-a"))


@pytest.mark.unit
@pytest.mark.asyncio
async def test_production_grant_api_is_admin_only_and_never_auto_approves(monkeypatch):
    issue = CloudflareProductionGrantIssue.model_validate({
        "idempotencyKey": "production-grant-001", "projectId": "project-1",
        "executorId": "cloudflare-production-executor", "targetId": "smartspec-cloudflare-runtime",
        "environment": "production", "accountRef": "c" * 32,
        "zoneId": "9" * 32, "routePattern": "smartaihub.app/*",
        "expectedRouteId": None, "expectedRouteScript": None, "rolloutStage": "canary",
        "canaryGrantRef": None, "canaryDeploymentId": None,
        "canaryVerifiedAt": None,
        "candidateVersionId": None,
        "jobId": "22222222-2222-4222-8222-222222222222",
        "artifactRef": "sha256:" + "a" * 64, "sourceSha": "d" * 40, "buildDigest": "a" * 64,
        "configurationRef": "cf-origin:" + "a" * 64, "configurationDigest": "a" * 64,
        "actions": ["deploy"], "rollbackDeploymentId": "33333333-3333-4333-8333-333333333333",
        "rollbackArtifactRef": "sha256:" + "b" * 64, "rollbackSourceSha": "e" * 40,
        "rollbackBuildDigest": "b" * 64, "rollbackConfigurationRef": "cf-origin:" + "b" * 64,
        "rollbackConfigurationDigest": "b" * 64, "canaryRequired": True,
        "maxDurationSeconds": 300,
        "expiresAt": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
    })
    db = AsyncMock()
    with pytest.raises(HTTPException) as raised:
        await create_cloudflare_production_grant_request(
            issue, current_user=SimpleNamespace(id=17, role="user"), tenant_id="tenant-1", db=db,
        )
    assert raised.value.status_code == 403
    db.execute.assert_not_awaited()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_production_grant_request_is_pending_and_requires_independent_approval():
    db = AsyncMock()
    db.add = Mock()
    db.execute.side_effect = [
        SimpleNamespace(scalar_one_or_none=Mock(return_value="admin")),
        SimpleNamespace(),
    ]
    service = ApprovalDBService(db)
    service.get_request_by_correlation = AsyncMock(return_value=None)
    payload = _grant_payload(grantRef="pending-idempotency-binding")
    request = await service.create_cloudflare_production_grant_request(
        tenant_id="tenant-1", requester_id=17, idempotency_key="production-grant-001", payload=payload,
    )
    assert request.status == ApprovalStatus.PENDING
    assert request.required_approvers == 1
    assert request.current_approvals == 0
    assert request.extra_data["cloudflareProductionGrantIssuerV1"] == "admin_approval_workflow"
    assert request.payload["grantRef"] == request.id
    db.commit.assert_awaited_once()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_production_grant_requester_cannot_self_approve(monkeypatch):
    request = SimpleNamespace(
        requester_id=17,
        extra_data={"cloudflareProductionGrantIssuerV1": "admin_approval_workflow"},
    )
    service = AsyncMock()
    service.get_request.return_value = request
    monkeypatch.setattr("app.api.approvals.ApprovalDBService", lambda _db: service)
    with pytest.raises(HTTPException) as raised:
        await respond_to_approval(
            "grant-1", ApprovalResponseCreate(decision="approved"),
            current_user=SimpleNamespace(id=17, role="admin"), tenant_id="tenant-1", db=AsyncMock(),
        )
    assert raised.value.status_code == 403
    assert raised.value.detail == "CLOUDFLARE_PRODUCTION_GRANT_REQUIRES_INDEPENDENT_APPROVER"
    service.can_user_approve.assert_not_awaited()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_production_grant_resolver_returns_only_approved_exact_requests():
    payload = _grant_payload()
    row = SimpleNamespace(
        id=payload["grantRef"], request_type=ApprovalType.DEPLOYMENT, status=ApprovalStatus.APPROVED,
        revoked_at=None, resolved_at=datetime.now(timezone.utc), created_at=datetime.now(timezone.utc),
        current_approvals=1, required_approvers=1, tenant_id=payload["tenantId"],
        project_id=payload["projectId"], requester_id=payload["requesterUserId"], payload=payload,
        action_digest=hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
        extra_data={"cloudflareProductionGrantIssuerV1": "admin_approval_workflow"},
    )
    db = AsyncMock()
    db.execute.return_value = SimpleNamespace(scalar_one_or_none=Mock(return_value=row))
    service = ApprovalDBService(db)
    assert await service.resolve_cloudflare_production_grant(row.id) == payload

    row.status = ApprovalStatus.PENDING
    assert await service.resolve_cloudflare_production_grant(row.id) is None
    row.status = ApprovalStatus.APPROVED
    row.extra_data = {}
    assert await service.resolve_cloudflare_production_grant(row.id) is None
    row.extra_data = {"cloudflareProductionGrantIssuerV1": "admin_approval_workflow"}
    row.payload = _grant_payload(expiresAt=(datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat())
    assert await service.resolve_cloudflare_production_grant(row.id) is None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_production_grant_revoke_is_tenant_scoped_audited_and_idempotent():
    payload = _grant_payload()
    request = SimpleNamespace(
        id=payload["grantRef"], request_type=ApprovalType.DEPLOYMENT, tenant_id=payload["tenantId"],
        payload=payload, extra_data={"cloudflareProductionGrantIssuerV1": "admin_approval_workflow"},
        revoked_at=None,
    )
    db = AsyncMock()
    db.add = Mock()
    db.execute.side_effect = [
        SimpleNamespace(scalar_one_or_none=Mock(return_value="admin")),
        SimpleNamespace(scalar_one_or_none=Mock(return_value=request)),
        SimpleNamespace(scalar_one_or_none=Mock(return_value="admin")),
        SimpleNamespace(scalar_one_or_none=Mock(return_value=request)),
    ]
    service = ApprovalDBService(db)
    first = await service.revoke_cloudflare_production_grant(
        grant_ref=request.id, tenant_id=request.tenant_id, actor_id=29, reason="deployment canceled",
    )
    assert first is request
    assert request.revoked_at is not None and request.payload["revokedAt"] is not None
    assert db.add.call_count == 1
    second = await service.revoke_cloudflare_production_grant(
        grant_ref=request.id, tenant_id=request.tenant_id, actor_id=29, reason="deployment canceled",
    )
    assert second is request
    assert db.add.call_count == 1
    assert db.commit.await_count == 2

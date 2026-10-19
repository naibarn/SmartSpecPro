"""Checks for the bounded policy branch of the existing approval authority."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from app.models.approval import ApprovalRule, ApprovalType
from app.services.approval_db_service import ApprovalDBService, normalize_cloudflare_staging_grant_payload
from app.services.cloudflare_staging_policy import SCHEMA, _version, validate_staging_policy


def definition():
    return {"accountRef": "a" * 32, "executorId": "cf-staging-executor:policy-test", "actorUserId": 17,
        "targetId": "smartspec-cloudflare-staging", "environment": "staging", "maxOperations": 4, "allowBootstrap": True,
        "expiresAt": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
        "artifacts": [{"artifactRef": "sha256:" + "b" * 64, "sourceSha": "c" * 40, "buildDigest": "b" * 64}]}


def bootstrap(policy):
    return {"schemaVersion": "cloudflare.staging-deployment-grant.v1", "grantRef": str(uuid4()), "tenantId": "tenant-1",
        "requesterUserId": 17, "projectId": "project-1", "executorId": policy["executorId"], "targetId": policy["targetId"],
        "environment": "staging", **policy["artifacts"][0], "actions": ["bootstrap"], "rollbackDeploymentId": None,
        "rollbackArtifactRef": None, "rollbackSourceSha": None, "rollbackBuildDigest": None,
        "expiresAt": policy["expiresAt"], "revokedAt": None, "accountRef": policy["accountRef"], "jobId": str(uuid4())}


@pytest.mark.unit
@pytest.mark.parametrize("changed", [{"environment": "production"}, {"maxOperations": 5}, {"maxOperations": True},
    {"allowBootstrap": "yes"}, {"accountRef": "foreign"}, {"expiresAt": "2020-01-01T00:00:00Z"}, {"extra": "allow-all"}])
def test_policy_is_closed_and_bounded(changed):
    with pytest.raises(ValueError):
        validate_staging_policy({**definition(), **changed}, datetime.now(timezone.utc))


@pytest.mark.unit
def test_bootstrap_requires_explicitly_absent_baseline_and_exclusive_action():
    grant = bootstrap(definition())
    assert normalize_cloudflare_staging_grant_payload(grant)["actions"] == ["bootstrap"]
    for changed in [{"actions": ["bootstrap", "deploy"]}, {"rollbackDeploymentId": "invented"}, {"actions": ["deploy"]}, {"jobId": "not-uuid"}]:
        with pytest.raises(ValueError):
            normalize_cloudflare_staging_grant_payload({**grant, **changed})


def service_fixture():
    policy = definition()
    rule = ApprovalRule(id=str(uuid4()), tenant_id="tenant-1", project_id="project-1", trigger_type=ApprovalType.DEPLOYMENT,
        conditions={"schemaVersion": SCHEMA, "ownerUserId": 17, "definition": policy, "version": _version(policy)}, is_active=True)
    prior = []
    db = AsyncMock()
    db.add = Mock()
    db.execute.side_effect = lambda query, *args: SimpleNamespace(
        scalar_one_or_none=lambda: rule, scalars=lambda: SimpleNamespace(all=lambda: prior))
    service = ApprovalDBService(db)
    service._require_cloudflare_policy_owner = AsyncMock()
    service._check_cloudflare_policy_bindings = AsyncMock()
    return service, rule, prior, bootstrap(policy)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_owner_runtime_rechecks_budget_and_revocation():
    service, rule, prior, grant = service_fixture()
    result = await service.authorize_cloudflare_staging_policy_grant(rule.id, grant)
    service._require_cloudflare_policy_owner.assert_awaited_once_with("tenant-1", 17)
    service._check_cloudflare_policy_bindings.assert_awaited_once()
    prior.extend(SimpleNamespace(id=str(uuid4()), payload={"actions": ["deploy"]}, extra_data={"cloudflareStagingPolicyDecisionV1": result}) for _ in range(4))
    with pytest.raises(PermissionError, match="BUDGET_EXHAUSTED"):
        await service.authorize_cloudflare_staging_policy_grant(rule.id, grant)
    prior.clear()
    rule.is_active = False
    with pytest.raises(PermissionError, match="UNAVAILABLE"):
        await service.authorize_cloudflare_staging_policy_grant(rule.id, grant)


@pytest.mark.unit
@pytest.mark.asyncio
@pytest.mark.parametrize("changed", [{"accountRef": "f" * 32}, {"executorId": "foreign"}, {"requesterUserId": 18},
    {"jobId": None}, {"sourceSha": "d" * 40}, {"actions": ["deploy", "rollback"]}])
async def test_scope_mismatch_never_issues(changed):
    service, rule, _, grant = service_fixture()
    with pytest.raises(PermissionError):
        await service.authorize_cloudflare_staging_policy_grant(rule.id, {**grant, **changed})
    service.db.add.assert_not_called()
    service.db.commit.assert_not_awaited()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_repeated_bootstrap_and_job_replay_denied():
    service, rule, prior, grant = service_fixture()
    decision = await service.authorize_cloudflare_staging_policy_grant(rule.id, grant)
    prior.append(SimpleNamespace(id=str(uuid4()), payload={"actions": ["bootstrap"]}, extra_data={"cloudflareStagingPolicyDecisionV1": decision}))
    with pytest.raises(PermissionError, match="BUDGET_EXHAUSTED"):
        await service.authorize_cloudflare_staging_policy_grant(rule.id, grant)
    prior[0].payload = {"actions": ["deploy"], "jobId": grant["jobId"]}
    with pytest.raises(PermissionError, match="BUDGET_EXHAUSTED"):
        await service.authorize_cloudflare_staging_policy_grant(rule.id, grant)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_live_owner_active_admin_required():
    for row in [None, {"ownerId": 18, "isActive": True, "role": "admin"}, {"ownerId": 17, "isActive": False, "role": "admin"}, {"ownerId": 17, "isActive": True, "role": "user"}]:
        db = AsyncMock()
        db.execute.return_value = SimpleNamespace(mappings=lambda: SimpleNamespace(one_or_none=lambda: row))
        with pytest.raises(PermissionError, match="ACTIVE_OWNER_ADMIN_REQUIRED"):
            await ApprovalDBService(db)._require_cloudflare_policy_owner("tenant-1", 17)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_resolution_rejects_changed_policy_decision():
    service, rule, _, grant = service_fixture()
    decision = await service.authorize_cloudflare_staging_policy_grant(rule.id, grant)
    request = SimpleNamespace(payload=grant, extra_data={"cloudflareStagingPolicyDecisionV1": decision})
    assert await service.validate_cloudflare_staging_policy_decision(request, datetime.now(timezone.utc))
    rule.conditions = {**rule.conditions, "version": "modified"}
    assert not await service.validate_cloudflare_staging_policy_decision(request, datetime.now(timezone.utc))


@pytest.mark.unit
def test_api_tenant_uses_verified_auth_binding_and_rejects_context_mismatch():
    from fastapi import HTTPException
    from app.api.approvals import _cloudflare_authenticated_tenant
    user = SimpleNamespace(currentTenantId="tenant-1")
    assert _cloudflare_authenticated_tenant(user, None) == "tenant-1"
    with pytest.raises(HTTPException):
        _cloudflare_authenticated_tenant(user, "tenant-2")
    with pytest.raises(HTTPException):
        _cloudflare_authenticated_tenant(SimpleNamespace(), "tenant-1")

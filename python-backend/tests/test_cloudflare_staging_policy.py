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
    for row in [None, {"ownerId": 18, "isActive": True, "role": "admin", "isDisabled": False}, {"ownerId": 17, "isActive": False, "role": "admin", "isDisabled": False}, {"ownerId": 17, "isActive": True, "role": "user", "isDisabled": False}, {"ownerId": 17, "isActive": True, "role": "admin", "isDisabled": True}]:
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


@pytest.mark.unit
def test_approval_response_preserves_canonical_numeric_requester():
    from app.api.approvals import ApprovalRequestResponse
    from pydantic import TypeAdapter
    requester = TypeAdapter(ApprovalRequestResponse.model_fields["requester_id"].annotation)
    assert requester.validate_python(17) == 17
    assert requester.validate_python("legacy-id") == "legacy-id"


def origin_fixture():
    from app.services.cloudflare_staging_policy import ORIGIN_CONTRACT, ORIGIN_SCHEMA, ORIGIN_GRANT
    service, rule, prior, old = service_fixture()
    config = {"configurationRef": "cf-origin:" + "d" * 64, "configurationDigest": "d" * 64}
    rollback = {"artifactRef": "sha256:" + "e" * 64, "sourceSha": "f" * 40, "buildDigest": "e" * 64,
        "configurationRef": None, "configurationDigest": None}
    policy = rule.conditions["definition"]
    policy.pop("allowBootstrap")
    artifacts = policy.pop("artifacts")
    policy.update({"contractVersion": ORIGIN_CONTRACT, "releases": [{**artifacts[0], **config}, rollback]})
    rule.conditions = {"schemaVersion": ORIGIN_SCHEMA, "ownerUserId": 17, "definition": policy, "version": _version(policy)}
    grant = {**old, "schemaVersion": ORIGIN_GRANT, "actions": ["deploy"], **config,
        "rollbackDeploymentId": str(uuid4()), "rollbackArtifactRef": rollback["artifactRef"],
        "rollbackSourceSha": rollback["sourceSha"], "rollbackBuildDigest": rollback["buildDigest"],
        "rollbackConfigurationRef": None, "rollbackConfigurationDigest": None}
    return service, rule, prior, grant


@pytest.mark.unit
@pytest.mark.asyncio
async def test_origin_policy_binds_exact_release_pairs_and_current_target():
    service, rule, _, grant = origin_fixture()
    assert normalize_cloudflare_staging_grant_payload(grant) == grant
    decision = await service.authorize_cloudflare_staging_policy_grant(rule.id, grant)
    assert decision["policyVersion"] == _version(rule.conditions["definition"])
    service._check_cloudflare_policy_bindings.assert_awaited_once_with(grant["tenantId"], grant["projectId"],
        rule.conditions["definition"], datetime.fromisoformat(grant["expiresAt"]), active_origin_ref=grant["configurationRef"])
    assert await service.validate_cloudflare_staging_policy_decision(SimpleNamespace(payload=grant,
        extra_data={"cloudflareStagingPolicyDecisionV1": decision}), datetime.now(timezone.utc))
    rule.is_active = False
    assert not await service.validate_cloudflare_staging_policy_decision(SimpleNamespace(payload=grant,
        extra_data={"cloudflareStagingPolicyDecisionV1": decision}), datetime.now(timezone.utc))


@pytest.mark.unit
@pytest.mark.asyncio
@pytest.mark.parametrize("changes", [
    {"configurationRef": "cf-origin:" + "a" * 64, "configurationDigest": "a" * 64},
    {"rollbackConfigurationRef": "cf-origin:" + "d" * 64, "rollbackConfigurationDigest": "d" * 64},
    {"sourceSha": "9" * 40}, {"actions": ["bootstrap"]},
])
async def test_origin_policy_cannot_cross_pair_artifact_and_configuration(changes):
    service, rule, _, grant = origin_fixture()
    with pytest.raises((ValueError, PermissionError)):
        await service.authorize_cloudflare_staging_policy_grant(rule.id, {**grant, **changes})
    service.db.commit.assert_not_awaited()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_legacy_policy_never_authorizes_origin_grant():
    from app.services.cloudflare_staging_policy import SCHEMA
    service, rule, _, grant = origin_fixture()
    rule.conditions = {**rule.conditions, "schemaVersion": SCHEMA}
    with pytest.raises(PermissionError, match="POLICY_UNAVAILABLE"):
        await service.authorize_cloudflare_staging_policy_grant(rule.id, grant)


@pytest.mark.unit
@pytest.mark.parametrize("changes", [
    {"configurationRef": "cf-origin:" + "a" * 64}, {"configurationDigest": None},
    {"rollbackConfigurationRef": "cf-origin:" + "a" * 64},
    {"actions": ["deploy", "rollback"]}, {"actions": ["bootstrap"]},
    {"schemaVersion": "cloudflare.staging-deployment-grant.v1"}, {"rollbackDeploymentId": "foreign"},
    {"secret": "unexpected-secret"},
])
def test_origin_grant_requires_exact_version_and_complete_config_pair(changes):
    _, _, _, grant = origin_fixture()
    with pytest.raises(ValueError):
        normalize_cloudflare_staging_grant_payload({**grant, **changes})


@pytest.mark.unit
@pytest.mark.asyncio
async def test_policy_binding_rejects_drifted_or_origin_configured_legacy_target():
    service, rule, _, grant = origin_fixture()
    for runtime_policy in (None, "cf-origin:" + "f" * 64):
        service.db.execute.side_effect = None
        service.db.execute.return_value = SimpleNamespace(mappings=lambda: SimpleNamespace(first=lambda: {"project_id": grant["projectId"], "runtimePolicy": runtime_policy}))
        with pytest.raises(PermissionError, match="ORIGIN_BINDING_DENIED"):
            await ApprovalDBService(service.db)._check_cloudflare_policy_bindings(grant["tenantId"], grant["projectId"],
                rule.conditions["definition"], datetime.fromisoformat(grant["expiresAt"]), active_origin_ref=grant["configurationRef"])
    with pytest.raises(PermissionError, match="ORIGIN_BINDING_DENIED"):
        await ApprovalDBService(service.db)._check_cloudflare_policy_bindings(grant["tenantId"], grant["projectId"],
            definition(), datetime.fromisoformat(grant["expiresAt"]))


@pytest.mark.unit
@pytest.mark.asyncio
async def test_api_preserves_explicit_origin_contract_and_pairs():
    from pydantic import TypeAdapter, ValidationError
    from app.api.approvals import CloudflareStagingPolicyGrantIssue, CloudflareStagingOriginPolicyGrantIssue
    _, rule, _, grant = origin_fixture()
    api_fields = {k: v for k, v in grant.items() if k not in {"grantRef", "tenantId", "requesterUserId", "revokedAt"}}
    api_fields.update({"policyId": rule.id, "idempotencyKey": "origin-policy-fixture"})
    adapter = TypeAdapter(CloudflareStagingPolicyGrantIssue | CloudflareStagingOriginPolicyGrantIssue)
    parsed = adapter.validate_python(api_fields)
    assert isinstance(parsed, CloudflareStagingOriginPolicyGrantIssue)
    assert parsed.configuration_ref == grant["configurationRef"]
    with pytest.raises(ValidationError):
        adapter.validate_python({**api_fields, "configurationDigest": None})


def provision_fixture():
    from app.services.cloudflare_origin_provision_contract import CONTRACT, POLICY_SCHEMA, GRANT_SCHEMA, plan_digest
    service, rule, prior, old = service_fixture()
    plan = {"hostname": "origin-staging.smartaihub.app", "zoneId": "a" * 32, "tunnelId": str(uuid4()),
        "teamName": "test-team", "publicOrigin": "https://smartspec-cloudflare-staging.test.workers.dev",
        "configurationExpiresAt": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()}
    policy = {k: v for k, v in rule.conditions["definition"].items() if k not in ("allowBootstrap", "artifacts")}
    policy.update({"contractVersion": CONTRACT, "maxOperations": 1, "plan": plan, "planDigest": plan_digest(plan)})
    rule.conditions = {"schemaVersion": POLICY_SCHEMA, "ownerUserId": 17, "definition": policy, "version": _version(policy)}
    grant = {k: old[k] for k in ("grantRef", "tenantId", "requesterUserId", "projectId", "executorId", "targetId", "environment", "expiresAt", "revokedAt", "accountRef", "jobId")}
    grant.update({"schemaVersion": GRANT_SCHEMA, "actions": ["provision"], "plan": plan, "planDigest": plan_digest(plan)})
    return service, rule, prior, grant


@pytest.mark.unit
@pytest.mark.asyncio
async def test_provision_policy_requires_exact_intent_and_separate_schema_and_budget():
    from app.services.cloudflare_origin_provision_contract import plan_digest
    service, rule, prior, grant = provision_fixture()
    assert normalize_cloudflare_staging_grant_payload(grant) == grant
    decision = await service.authorize_cloudflare_staging_policy_grant(rule.id, grant)
    for changed in [{"accountRef": "f" * 32}, {"actions": ["deploy"]}, {"executorId": "foreign"},
        {"plan": {**grant["plan"], "hostname": "smartaihub.app"}}, {"planDigest": "f" * 64}]:
        with pytest.raises((ValueError, PermissionError)):
            candidate = normalize_cloudflare_staging_grant_payload({**grant, **changed})
            await service.authorize_cloudflare_staging_policy_grant(rule.id, candidate)
    changed_plan = {**grant["plan"], "zoneId": "b" * 32}
    with pytest.raises(PermissionError):
        await service.authorize_cloudflare_staging_policy_grant(rule.id, {**grant, "plan": changed_plan, "planDigest": plan_digest(changed_plan)})
    prior.append(SimpleNamespace(id=str(uuid4()), payload={"jobId": str(uuid4())}, extra_data={"cloudflareStagingPolicyDecisionV1": decision}))
    with pytest.raises(PermissionError, match="BUDGET_EXHAUSTED"):
        await service.authorize_cloudflare_staging_policy_grant(rule.id, grant)
    prior.clear()
    rule.conditions = {**rule.conditions, "schemaVersion": SCHEMA}
    with pytest.raises(PermissionError, match="UNAVAILABLE"):
        await service.authorize_cloudflare_staging_policy_grant(rule.id, grant)


@pytest.mark.unit
@pytest.mark.parametrize("changes", [{"maxOperations": 2}, {"expiresAt": "2030-01-01T00:00:00Z"},
    {"planDigest": "f" * 64}, {"allowBootstrap": True}])
def test_provision_policy_closed_budget_and_expiry(changes):
    _, rule, _, _ = provision_fixture()
    with pytest.raises(ValueError):
        validate_staging_policy({**rule.conditions["definition"], **changes}, datetime.now(timezone.utc))


# Native metadata uses the same owner, budget, revocation and runner authority.
def native_definition():
    from app.services.cloudflare_native_provision_contract import CONTRACT, namespace, plan_digest
    policy = definition()
    policy.pop("allowBootstrap")
    policy.pop("artifacts")
    plan = {"namespace": namespace("tenant-1", "project-1"), "vectorDimensions": 768,
            "vectorMetric": "cosine", "configurationExpiresAt": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()}
    return {**policy, "contractVersion": CONTRACT, "maxOperations": 1, "plan": plan, "planDigest": plan_digest(plan)}


def native_grant(policy):
    from app.services.cloudflare_native_provision_contract import GRANT_SCHEMA
    return {"schemaVersion": GRANT_SCHEMA, "grantRef": str(uuid4()), "tenantId": "tenant-1", "projectId": "project-1",
            "requesterUserId": 17, "executorId": policy["executorId"], "jobId": str(uuid4()), "accountRef": policy["accountRef"],
            "targetId": policy["targetId"], "environment": "staging", "actions": ["provision"],
            "plan": policy["plan"], "planDigest": policy["planDigest"], "expiresAt": policy["expiresAt"], "revokedAt": None}


@pytest.mark.unit
def test_native_grant_and_policy_use_strict_resource_scope():
    policy = native_definition()
    assert validate_staging_policy(policy, datetime.now(timezone.utc)) == policy
    assert normalize_cloudflare_staging_grant_payload(native_grant(policy))["actions"] == ["provision"]
    for changed in [{"tenantId": "foreign"}, {"projectId": "foreign"}, {"environment": "production"},
                    {"actions": ["deploy"]}, {"jobId": "not-uuid"}, {"planDigest": "f" * 64}, {"extra": True}]:
        with pytest.raises(ValueError):
            normalize_cloudflare_staging_grant_payload({**native_grant(policy), **changed})


@pytest.mark.unit
def test_native_workflow_extension_requires_exact_parent_and_policy_digest():
    from app.services.cloudflare_native_provision_contract import plan_digest, validate_plan
    policy = native_definition()
    plan = {**policy["plan"], "workflow": True, "reuseProvisionJobId": str(uuid4())}
    policy = {**policy, "plan": plan, "planDigest": plan_digest(plan)}
    assert validate_staging_policy(policy, datetime.now(timezone.utc)) == policy
    assert normalize_cloudflare_staging_grant_payload(native_grant(policy))["plan"] == plan
    for extra in [{"workflow": True}, {"reuseProvisionJobId": str(uuid4())},
                  {"workflow": False, "reuseProvisionJobId": str(uuid4())},
                  {"workflow": True, "reuseProvisionJobId": "foreign"},
                  {"workflow": True, "reuseProvisionJobId": str(uuid4()), "schedules": ["* * * * *"]}]:
        with pytest.raises(ValueError):
            validate_plan({**native_definition()["plan"], **extra})
    with pytest.raises(ValueError):
        validate_staging_policy({**policy, "planDigest": "f" * 64}, datetime.now(timezone.utc))


@pytest.mark.unit
@pytest.mark.parametrize("changed", [{"maxOperations": 2}, {"plan": {"namespace": "production"}},
                                     {"expiresAt": "2000-01-01T00:00:00Z"}])
def test_native_policy_never_expands_budget_or_scope(changed):
    with pytest.raises(ValueError):
        validate_staging_policy({**native_definition(), **changed}, datetime.now(timezone.utc))


@pytest.mark.unit
@pytest.mark.asyncio
async def test_native_policy_admission_rechecks_budget_schema_and_revocation():
    from app.services.cloudflare_native_provision_contract import POLICY_SCHEMA
    service, rule, prior, _ = service_fixture()
    policy = native_definition()
    rule.conditions = {"schemaVersion": POLICY_SCHEMA, "ownerUserId": 17, "definition": policy, "version": _version(policy)}
    grant = native_grant(policy)
    decision = await service.authorize_cloudflare_staging_policy_grant(rule.id, grant)
    assert decision["policyId"] == rule.id
    prior.append(SimpleNamespace(id=str(uuid4()), payload={"jobId": "prior"}, extra_data={"cloudflareStagingPolicyDecisionV1": decision}))
    with pytest.raises(PermissionError, match="BUDGET_EXHAUSTED"):
        await service.authorize_cloudflare_staging_policy_grant(rule.id, grant)
    prior.clear()
    with pytest.raises(PermissionError):
        await service.authorize_cloudflare_staging_policy_grant(rule.id, {**grant, "schemaVersion": "cloudflare.staging-origin-provision-grant.v1"})
    rule.is_active = False
    with pytest.raises(PermissionError, match="UNAVAILABLE"):
        await service.authorize_cloudflare_staging_policy_grant(rule.id, grant)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_http_image_policy_reuses_owner_job_budget_and_live_revocation():
    from app.services.cloudflare_http_image_provision_contract import CONTRACT, GRANT_SCHEMA, POLICY_SCHEMA
    from app.services.cloudflare_origin_provision_contract import plan_digest
    service, rule, prior, _ = service_fixture()
    policy = native_definition()
    plan = {"namespace": policy["plan"]["namespace"], "runtime": "python-http", "sourceSha": "c" * 40,
            "buildId": "c" * 40 + "-" + str(uuid4()), "buildBudgetSeconds": 180,
            "maxImageBytes": 1073741824, "maxPublishedImages": 1,
            "configurationExpiresAt": (datetime.now(timezone.utc) + timedelta(minutes=50)).isoformat()}
    policy.update(contractVersion=CONTRACT, plan=plan, planDigest=plan_digest(plan))
    rule.conditions = {"schemaVersion": POLICY_SCHEMA, "ownerUserId": 17, "definition": policy, "version": _version(policy)}
    grant = {**native_grant(policy), "schemaVersion": GRANT_SCHEMA}
    assert normalize_cloudflare_staging_grant_payload(grant) == grant
    decision = await service.authorize_cloudflare_staging_policy_grant(rule.id, grant)
    service._require_cloudflare_policy_owner.assert_awaited_once_with("tenant-1", 17)
    request = SimpleNamespace(payload=grant, extra_data={"cloudflareStagingPolicyDecisionV1": decision})
    assert await service.validate_cloudflare_staging_policy_decision(request, datetime.now(timezone.utc))
    for changes in [{"maxOperations": 2}, {"planDigest": "f" * 64}, {"environment": "production"}]:
        with pytest.raises(ValueError):
            validate_staging_policy({**policy, **changes}, datetime.now(timezone.utc))
    extended = {**plan, "configurationExpiresAt": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()}
    with pytest.raises(ValueError, match="HTTP_IMAGE_POLICY_EXPIRY"):
        validate_staging_policy({**policy, "plan": extended, "planDigest": plan_digest(extended)}, datetime.now(timezone.utc))
    prior.append(SimpleNamespace(id=str(uuid4()), payload={"jobId": str(uuid4())}, extra_data={"cloudflareStagingPolicyDecisionV1": decision}))
    with pytest.raises(PermissionError, match="BUDGET_EXHAUSTED"):
        await service.authorize_cloudflare_staging_policy_grant(rule.id, grant)
    prior.clear()
    rule.is_active = False
    assert not await service.validate_cloudflare_staging_policy_decision(request, datetime.now(timezone.utc))

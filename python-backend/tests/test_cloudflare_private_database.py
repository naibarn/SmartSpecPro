"""Private database plans extend the existing exact staging authority only."""
from datetime import datetime, timedelta, timezone
import pytest
from app.services.cloudflare_private_database_contract import CONTRACT, POLICY_SCHEMA, GRANT_SCHEMA, validate_plan, normalize_grant
from app.services.cloudflare_native_provision_contract import namespace
from app.services.cloudflare_origin_provision_contract import plan_digest
from app.services.cloudflare_staging_policy import validate_staging_policy, _version
from app.services.approval_db_service import normalize_cloudflare_staging_grant_payload
from tests.test_cloudflare_staging_policy import definition, service_fixture


def private_definition():
    policy = definition()
    policy.pop("artifacts")
    policy.pop("allowBootstrap")
    plan = {"namespace": namespace("tenant-1", "project-1"), "hostname": "db-staging.smartaihub.app",
        "zoneId": "a" * 32, "tunnelId": "11111111-1111-4111-8111-111111111111", "databaseName": "fixture_db",
        "caSha256": "b" * 64, "connectionLimit": 5,
        "configurationExpiresAt": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()}
    return {**policy, "contractVersion": CONTRACT, "plan": plan, "planDigest": plan_digest(plan), "maxOperations": 1}


def private_grant(policy):
    return {"schemaVersion": GRANT_SCHEMA, "grantRef": "22222222-2222-4222-8222-222222222222", "jobId": "33333333-3333-4333-8333-333333333333",
        "tenantId": "tenant-1", "projectId": "project-1", "requesterUserId": policy["actorUserId"], "executorId": policy["executorId"],
        "targetId": policy["targetId"], "environment": "staging", "accountRef": policy["accountRef"], "actions": ["provision"],
        "plan": policy["plan"], "planDigest": policy["planDigest"], "expiresAt": policy["expiresAt"], "revokedAt": None}


@pytest.mark.unit
def test_private_database_plan_and_grant_use_existing_normalizer():
    policy = private_definition()
    assert validate_staging_policy(policy, datetime.now(timezone.utc)) == policy
    grant = private_grant(policy)
    assert normalize_grant(grant) == normalize_cloudflare_staging_grant_payload(grant) == grant


@pytest.mark.unit
@pytest.mark.parametrize("change", [{"hostname": "production.example"}, {"databaseName": 'db";DROP DATABASE x;'}, {"connectionLimit": 100},
    {"connectionLimit": True}, {"caSha256": "invalid"}, {"namespace": "foreign"}, {"password": "forbidden"}, {"tlsVerify": False}])
def test_private_database_intent_rejects_broader_scope_or_credentials(change):
    with pytest.raises(ValueError):
        validate_plan({**private_definition()["plan"], **change})


@pytest.mark.unit
def test_private_database_grant_is_tenant_project_and_digest_bound():
    grant = private_grant(private_definition())
    for change in [{"tenantId": "other"}, {"projectId": "other"}, {"planDigest": "c" * 64}, {"actions": ["provision", "deploy"]}]:
        with pytest.raises(ValueError):
            normalize_grant({**grant, **change})


@pytest.mark.unit
@pytest.mark.asyncio
async def test_private_database_policy_preserves_owner_budget_and_revocation_checks():
    service, rule, prior, _ = service_fixture()
    policy = private_definition()
    rule.conditions = {"schemaVersion": POLICY_SCHEMA, "ownerUserId": 17, "definition": policy, "version": _version(policy)}
    grant = private_grant(policy)
    decision = await service.authorize_cloudflare_staging_policy_grant(rule.id, grant)
    assert decision
    service._require_cloudflare_policy_owner.assert_awaited_once_with("tenant-1", 17)
    service._check_cloudflare_policy_bindings.assert_awaited_once()
    rule.is_active = False
    with pytest.raises(PermissionError):
        await service.authorize_cloudflare_staging_policy_grant(rule.id, grant)


@pytest.mark.unit
def test_private_database_policy_cannot_purchase_or_activate():
    policy = private_definition()
    for change in [{"maxOperations": 2}, {"environment": "production"}, {"billing": True}, {"activation": "enabled"}]:
        with pytest.raises(ValueError):
            validate_staging_policy({**policy, **change}, datetime.now(timezone.utc))

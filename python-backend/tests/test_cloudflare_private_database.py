"""Private database plans extend the existing exact staging authority only."""
from datetime import datetime, timedelta, timezone
import pytest
from app.services.cloudflare_private_database_contract import (CONTRACT, POLICY_SCHEMA, GRANT_SCHEMA, RENEWAL_CONTRACT,
    RENEWAL_POLICY_SCHEMA, RENEWAL_GRANT_SCHEMA, validate_plan, normalize_grant, validate_renewal_plan, normalize_renewal_grant,
    renewal_plan_digest)
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


def renewal_definition():
    now = datetime.now(timezone.utc)
    source = private_definition()
    plan = {"configurationRef": "cf-origin:" + "c" * 64, "configurationDigest": "c" * 64,
        "sourceProvisionJobId": "44444444-4444-4444-8444-444444444444", "sourcePlan": source["plan"],
        "sourcePlanDigest": plan_digest(source["plan"]), "resources": {"hyperdriveId": "a" * 32, "caId": "b" * 32,
            "accessApplicationId": "11111111-1111-4111-8111-111111111111", "accessPolicyId": "22222222-2222-4222-8222-222222222222",
            "serviceTokenId": "33333333-3333-4333-8333-333333333333", "dnsRecordId": "d" * 32},
        "leaseExpiresAt": (now + timedelta(days=30)).isoformat(), "authorizationExpiresAt": (now + timedelta(minutes=10)).isoformat()}
    policy = {key: value for key, value in source.items() if key not in ("contractVersion", "plan", "planDigest")}
    policy.update({"contractVersion": RENEWAL_CONTRACT, "plan": plan, "planDigest": plan_digest(plan), "maxOperations": 1})
    return policy


def renewal_grant(policy):
    return {"schemaVersion": RENEWAL_GRANT_SCHEMA, "grantRef": "55555555-5555-4555-8555-555555555555",
        "jobId": "66666666-6666-4666-8666-666666666666", "tenantId": "tenant-1", "projectId": "project-1",
        "requesterUserId": policy["actorUserId"], "executorId": policy["executorId"], "targetId": policy["targetId"],
        "environment": "staging", "accountRef": policy["accountRef"], "actions": ["renew_lease"], "plan": policy["plan"],
        "planDigest": policy["planDigest"], "expiresAt": policy["plan"]["authorizationExpiresAt"], "revokedAt": None}


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
@pytest.mark.asyncio
async def test_private_database_policy_can_be_revoked_through_existing_authority():
    service, rule, _, _ = service_fixture()
    policy = private_definition()
    rule.conditions = {"schemaVersion": POLICY_SCHEMA, "ownerUserId": 17, "definition": policy, "version": _version(policy)}
    result = await service.revoke_cloudflare_staging_policy(tenant_id="tenant-1", actor_id=17, policy_id=rule.id)
    assert not rule.is_active
    service._require_cloudflare_policy_owner.assert_awaited_once_with("tenant-1", 17)


@pytest.mark.unit
def test_private_database_policy_cannot_purchase_or_activate():
    policy = private_definition()
    for change in [{"maxOperations": 2}, {"environment": "production"}, {"billing": True}, {"activation": "enabled"}]:
        with pytest.raises(ValueError):
            validate_staging_policy({**policy, **change}, datetime.now(timezone.utc))


@pytest.mark.unit
def test_private_database_renewal_contract_is_exact_and_owner_scoped():
    policy = renewal_definition()
    assert validate_staging_policy(policy, datetime.now(timezone.utc)) == policy
    grant = renewal_grant(policy)
    assert normalize_renewal_grant(grant) == normalize_cloudflare_staging_grant_payload(grant)
    for changes in ({"actions": ["provision"]}, {"projectId": "foreign"}, {"planDigest": "f" * 64},
        {"plan": {**grant["plan"], "resources": {**grant["plan"]["resources"], "hyperdriveId": "e" * 32}}}):
        with pytest.raises(ValueError):
            normalize_renewal_grant({**grant, **changes})


@pytest.mark.unit
def test_private_database_renewal_rejects_expired_or_unbounded_owner_action():
    policy = renewal_definition()
    expired_auth = {**policy, "plan": {**policy["plan"], "authorizationExpiresAt": (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()}}
    expired_auth["planDigest"] = plan_digest(expired_auth["plan"])
    with pytest.raises(ValueError):
        validate_staging_policy(expired_auth, datetime.now(timezone.utc))
    for change in ({"maxOperations": 2}, {"environment": "production"}, {"allowBootstrap": True}):
        with pytest.raises(ValueError):
            validate_staging_policy({**policy, **change}, datetime.now(timezone.utc))


@pytest.mark.unit
def test_private_database_renewal_digest_matches_admin_canonical_plan():
    source = {"namespace": "smartspec-staging-aaaaaaaaaaaa", "hostname": "db-staging.smartaihub.app", "zoneId": "b" * 32,
        "tunnelId": "22222222-2222-4222-8222-222222222222", "databaseName": "smartaihub", "caSha256": "c" * 64,
        "connectionLimit": 5, "configurationExpiresAt": "2026-10-01T00:00:00.000Z"}
    plan = {"configurationRef": "cf-origin:" + "a" * 64, "configurationDigest": "a" * 64,
        "sourceProvisionJobId": "11111111-1111-4111-8111-111111111111", "sourcePlan": source,
        "sourcePlanDigest": "f1e7c560cdb582fed16f5c75631adc2184f2576a5e33e65d18bf2c08752831a5",
        "resources": {"hyperdriveId": "e" * 32, "caId": "f" * 32, "accessApplicationId": "33333333-3333-4333-8333-333333333333",
            "accessPolicyId": "44444444-4444-4444-8444-444444444444", "serviceTokenId": "55555555-5555-4555-8555-555555555555", "dnsRecordId": "6" * 32},
        "leaseExpiresAt": "2026-11-28T00:00:00.000Z", "authorizationExpiresAt": "2026-10-29T05:00:00.000Z"}
    assert renewal_plan_digest(plan) == "9762e7eff4eeaf7f6602d4765ef6d7d8ed3b7a8fc8fa199be0782e25ba12f3e4"


@pytest.mark.unit
def test_public_catalog_intent_is_exact_parent_bound_and_uses_existing_grant_authority():
    from uuid import uuid4
    policy = private_definition()
    plan = {**policy["plan"], "publicRunnerCatalogSourceJobId": str(uuid4())}
    policy = {**policy, "plan": plan, "planDigest": plan_digest(plan)}
    assert validate_staging_policy(policy, datetime.now(timezone.utc)) == policy
    assert normalize_grant(private_grant(policy))["plan"] == plan
    for source in [None, 17, "any", "../../foreign", "", True]:
        with pytest.raises(ValueError):
            validate_plan({**plan, "publicRunnerCatalogSourceJobId": source})
    with pytest.raises(ValueError):
        validate_plan({**plan, "readTables": ["users"]})

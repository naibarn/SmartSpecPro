from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app.models.approval import ApprovalStatus, ApprovalType
from app.api.approvals import CloudflareMigrationMandateIssue, CloudflareMigrationOperationGrantIssue
from app.services.approval_db_service import ApprovalDBService, _normalize_cloudflare_migration_mandate


def _mandate(**overrides):
    import hashlib
    tenant = "tenant-a"
    project = "project-a"
    target = "smartspec-cloudflare-runtime"
    mission = "cf-migration:" + hashlib.sha256(f"{tenant}|{project}|production|{target}".encode()).hexdigest()[:32]
    value = {
        "schemaVersion": "cloudflare.first-migration-mandate.v1", "missionId": mission,
        "tenantId": tenant, "ownerUserId": 17, "projectId": project, "environment": "production",
        "targetId": target, "accountRef": "a" * 32, "zoneId": "b" * 32, "routePattern": "smartaihub.app/*",
        "resourceIds": {"queueId": "c" * 32, "deadLetterQueueId": "d" * 32, "vpcServiceId": "f" * 8 + "-" + "1" * 4 + "-" + "2" * 4 + "-" + "3" * 4 + "-" + "4" * 12,
            "hyperdriveId": "e" * 32, "nodeApplicationId": "a" * 32, "pythonApplicationId": "b" * 32},
        "actions": ["rotate_origin_configuration", "deploy_worker", "worker_canary", "synthetic_credit_billing",
            "synthetic_queue_recovery", "native_runtime_activation", "rollback"],
        "resourceBudget": {"maxProviderWrites": 20, "maxWorkerDeployments": 8, "maxContainerStarts": 4,
            "maxContainerReservedSeconds": 1800, "maxQueueMessages": 100, "maxSyntheticCredits": 60, "syntheticFinancialMinorUnits": 0},
        "rollbackPolicy": {"preserveM2Ingress": True, "preserveLinuxFallback": True, "containersOnDemand": True,
            "rollbackOnFailedAcceptance": True, "requireOwnerForOutOfScopeAction": True},
        "revokedAt": None,
    }
    value.update(overrides)
    return value


@pytest.mark.unit
def test_mandate_contract_rejects_foreign_scope_expanded_budget_and_charge_authority():
    assert _normalize_cloudflare_migration_mandate(_mandate())["targetId"] == "smartspec-cloudflare-runtime"
    for candidate in (
        _mandate(tenantId="tenant-b"),
        _mandate(resourceBudget={**_mandate()["resourceBudget"], "maxQueueMessages": 501}),
        _mandate(resourceBudget={**_mandate()["resourceBudget"], "maxWorkerDeployments": 7}),
        _mandate(resourceBudget={**_mandate()["resourceBudget"], "syntheticFinancialMinorUnits": 1}),
        _mandate(rollbackPolicy={**_mandate()["rollbackPolicy"], "preserveLinuxFallback": False}),
        _mandate(actions=["delete_customer_data"]),
    ):
        with pytest.raises(ValueError, match="CLOUDFLARE_MIGRATION_MANDATE_INVALID"):
            _normalize_cloudflare_migration_mandate(candidate)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_owner_mandate_persists_idempotently_as_approval_evidence(monkeypatch):
    from app.services import approval_db_service
    monkeypatch.setattr(approval_db_service, "_CF_FIRST_MIGRATION_ENFORCED_ACTIONS",
        set(approval_db_service._CF_FIRST_MIGRATION_REQUIRED_ACTIONS))
    db = AsyncMock()
    db.add = Mock()
    db.execute.side_effect = [
        SimpleNamespace(one_or_none=Mock(return_value=("admin", False))),
        SimpleNamespace(one_or_none=Mock(return_value=(17, "active"))),
        SimpleNamespace(),
        SimpleNamespace(scalars=Mock(return_value=SimpleNamespace(all=Mock(return_value=[])))),
    ]
    service = ApprovalDBService(db)
    service.get_request_by_correlation = AsyncMock(return_value=None)
    request = await service.create_cloudflare_migration_mandate(
        tenant_id="tenant-a", owner_id=17, idempotency_key="mission-approval-v1",
        payload=_mandate(),
    )
    assert request.request_type == ApprovalType.DEPLOYMENT
    assert request.status == ApprovalStatus.APPROVED
    assert request.expires_at is None
    assert request.payload["mandateRef"] == request.id
    assert request.extra_data["cloudflareFirstMigrationMandateV1"] == "first_migration_mandate_owner_v1"
    assert db.add.call_count == 3  # mandate, approval response, audit evidence
    db.commit.assert_awaited_once()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_owner_api_cannot_bypass_incomplete_web_executor_enforcement():
    db = AsyncMock()
    db.execute.side_effect = [
        SimpleNamespace(one_or_none=Mock(return_value=("admin", False))),
        SimpleNamespace(one_or_none=Mock(return_value=(17, "active"))),
    ] * 2
    service = ApprovalDBService(db)
    for payload in (_mandate(), _mandate(actions=["synthetic_credit_billing", "synthetic_queue_recovery"])):
        with pytest.raises(ValueError, match="CLOUDFLARE_MIGRATION_OPERATION_ENFORCEMENT_INCOMPLETE"):
            await service.create_cloudflare_migration_mandate(
                tenant_id="tenant-a", owner_id=17, idempotency_key="full-mission-mandate-v1", payload=payload,
            )


@pytest.mark.unit
@pytest.mark.asyncio
async def test_mandate_readback_rejects_revoked_or_digest_tampered_record():
    payload = _mandate()
    payload["mandateRef"] = "mandate-1"
    import hashlib, json
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    request = SimpleNamespace(
        id="mandate-1", tenant_id="tenant-a", project_id="project-a", requester_id=17,
        request_type=ApprovalType.DEPLOYMENT, status=ApprovalStatus.APPROVED, revoked_at=None,
        resolved_at=datetime.now(timezone.utc), current_approvals=1, required_approvers=1,
        extra_data={"cloudflareFirstMigrationMandateV1": "first_migration_mandate_owner_v1"},
        payload=payload, action_digest=digest, created_at=datetime.now(timezone.utc),
    )
    db = AsyncMock()
    db.execute.return_value = SimpleNamespace(scalar_one_or_none=Mock(return_value=request))
    service = ApprovalDBService(db)
    assert (await service.resolve_cloudflare_migration_mandate("mandate-1", tenant_id="tenant-a"))["status"] == "ACTIVE"
    assert await service.resolve_cloudflare_migration_mandate("mandate-1", tenant_id="tenant-b") is None
    request.action_digest = "tampered"
    assert await service.resolve_cloudflare_migration_mandate("mandate-1", tenant_id="tenant-a") is None
    request.action_digest = digest
    request.revoked_at = datetime.now(timezone.utc)
    assert await service.resolve_cloudflare_migration_mandate("mandate-1", tenant_id="tenant-a") is None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_owner_can_suspend_then_permanently_revoke_without_reactivating_mandate():
    request = SimpleNamespace(id="mandate-1", tenant_id="tenant-a", request_type=ApprovalType.DEPLOYMENT,
        status=ApprovalStatus.APPROVED, revoked_at=None,
        extra_data={"cloudflareFirstMigrationMandateV1": "first_migration_mandate_owner_v1"}, payload={},)
    db = AsyncMock()
    db.add = Mock()
    db.execute.side_effect = [
        SimpleNamespace(scalar_one_or_none=Mock(return_value=request)),
        SimpleNamespace(one_or_none=Mock(return_value=(17, "admin", False))),
        SimpleNamespace(scalar_one_or_none=Mock(return_value=request)),
        SimpleNamespace(one_or_none=Mock(return_value=(17, "admin", False))),
    ]
    service = ApprovalDBService(db)
    await service.change_cloudflare_migration_mandate_state(mandate_ref="mandate-1", tenant_id="tenant-a",
        actor_id=17, reason="Pause mission", state="SUSPENDED")
    assert request.status == ApprovalStatus.CANCELLED
    assert request.extra_data["cloudflareFirstMigrationMandateState"] == "SUSPENDED"
    await service.change_cloudflare_migration_mandate_state(mandate_ref="mandate-1", tenant_id="tenant-a",
        actor_id=17, reason="End mission", state="REVOKED")
    assert request.extra_data["cloudflareFirstMigrationMandateState"] == "REVOKED"
    assert db.commit.await_count == 2
    assert db.add.call_count == 2


@pytest.mark.unit
@pytest.mark.asyncio
async def test_mandate_operation_grant_reserves_scoped_budget_idempotently():
    parent = SimpleNamespace(id="mandate-1", requester_id=17, extra_data={}, project_id="project-a")
    active = _mandate()
    active["mandateRef"] = "mandate-1"
    usage = {"providerWrites": 0, "workerDeployments": 0, "containerStarts": 0,
             "containerReservedSeconds": 0, "queueMessages": 4, "syntheticCredits": 0,
             "syntheticFinancialMinorUnits": 0}
    db = AsyncMock()
    db.add = Mock()
    db.execute.side_effect = [
        SimpleNamespace(),
        SimpleNamespace(scalar_one_or_none=Mock(return_value=parent)),
        SimpleNamespace(scalars=Mock(return_value=SimpleNamespace(all=Mock(return_value=[])))),
    ]
    service = ApprovalDBService(db)
    service.resolve_cloudflare_migration_mandate = AsyncMock(return_value=active)
    service.get_request_by_correlation = AsyncMock(return_value=None)
    grant = await service.create_cloudflare_migration_operation_grant(
        mandate_ref="mandate-1", tenant_id="tenant-a", project_id="project-a",
        job_id="11111111-1111-4111-8111-111111111111", operation="queue_recovery_acceptance",
        plan_digest="a" * 64, idempotency_key="stable-submission-1", usage=usage,
    )
    assert grant.payload["mandateRef"] == "mandate-1"
    assert grant.payload["action"] == "synthetic_queue_recovery"
    assert grant.payload["usage"] == usage
    assert grant.expires_at is not None
    assert grant.extra_data["cloudflareFirstMigrationOperationGrantV1"] == "first_migration_mandate_operation_v1"
    assert db.add.call_count == 2
    db.commit.assert_awaited_once()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_mandate_operation_grant_fails_closed_when_aggregate_queue_budget_is_exhausted():
    parent = SimpleNamespace(id="mandate-1", requester_id=17, extra_data={}, project_id="project-a")
    active = _mandate()
    active["mandateRef"] = "mandate-1"
    active["resourceBudget"]["maxQueueMessages"] = 3
    usage = {"providerWrites": 0, "workerDeployments": 0, "containerStarts": 0,
             "containerReservedSeconds": 0, "queueMessages": 4, "syntheticCredits": 0,
             "syntheticFinancialMinorUnits": 0}
    db = AsyncMock()
    db.add = Mock()
    db.execute.side_effect = [
        SimpleNamespace(),
        SimpleNamespace(scalar_one_or_none=Mock(return_value=parent)),
        SimpleNamespace(scalars=Mock(return_value=SimpleNamespace(all=Mock(return_value=[])))),
    ]
    service = ApprovalDBService(db)
    service.resolve_cloudflare_migration_mandate = AsyncMock(return_value=active)
    service.get_request_by_correlation = AsyncMock(return_value=None)
    with pytest.raises(ValueError, match="CLOUDFLARE_MIGRATION_RESOURCE_BUDGET_EXHAUSTED"):
        await service.create_cloudflare_migration_operation_grant(
            mandate_ref="mandate-1", tenant_id="tenant-a", project_id="project-a",
            job_id="11111111-1111-4111-8111-111111111111", operation="queue_recovery_acceptance",
            plan_digest="a" * 64, idempotency_key="stable-submission-1", usage=usage,
        )
    db.add.assert_not_called()
    db.commit.assert_not_awaited()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_mandate_operation_grant_rejects_usage_not_declared_for_operation():
    service = ApprovalDBService(AsyncMock())
    usage = {"providerWrites": 0, "workerDeployments": 0, "containerStarts": 0,
             "containerReservedSeconds": 0, "queueMessages": 0, "syntheticCredits": 30,
             "syntheticFinancialMinorUnits": 0}
    with pytest.raises(ValueError, match="CLOUDFLARE_MIGRATION_OPERATION_GRANT_USAGE_INVALID"):
        await service.create_cloudflare_migration_operation_grant(
            mandate_ref="mandate-1", tenant_id="tenant-a", project_id="project-a",
            job_id="11111111-1111-4111-8111-111111111111", operation="queue_recovery_acceptance",
            plan_digest="a" * 64, idempotency_key="stable-submission-1", usage=usage,
        )


@pytest.mark.unit
def test_operation_grant_api_schema_is_strict_and_forbids_real_financial_usage():
    request = {"mandateRef": "mandate-1", "tenantId": "tenant-a", "projectId": "project-a",
        "jobId": "11111111-1111-4111-8111-111111111111", "operation": "queue_recovery_acceptance",
        "planDigest": "a" * 64, "idempotencyKey": "stable-submission-1",
        "usage": {"providerWrites": 0, "workerDeployments": 0, "containerStarts": 0,
            "containerReservedSeconds": 0, "queueMessages": 4, "syntheticCredits": 0,
            "syntheticFinancialMinorUnits": 0}}
    assert CloudflareMigrationOperationGrantIssue.model_validate(request).usage.queue_messages == 4
    with pytest.raises(Exception):
        CloudflareMigrationOperationGrantIssue.model_validate({**request, "unexpected": "authority"})
    with pytest.raises(Exception):
        CloudflareMigrationOperationGrantIssue.model_validate({**request, "usage": {
            **request["usage"], "syntheticFinancialMinorUnits": 1}})


@pytest.mark.unit
@pytest.mark.asyncio
async def test_operation_grant_rechecks_parent_mandate_and_allows_only_one_renewal():
    import hashlib, json
    now = datetime.now(timezone.utc)
    payload = {"schemaVersion": "cloudflare.first-migration-operation-grant.v1", "grantRef": "grant-1",
        "mandateRef": "mandate-1", "tenantId": "tenant-a", "projectId": "project-a", "ownerUserId": 17,
        "jobId": "11111111-1111-4111-8111-111111111111", "operation": "queue_recovery_acceptance",
        "action": "synthetic_queue_recovery", "planDigest": "a" * 64, "targetId": _mandate()["targetId"],
        "environment": "production", "accountRef": _mandate()["accountRef"], "zoneId": _mandate()["zoneId"],
        "routePattern": _mandate()["routePattern"], "resourceIds": _mandate()["resourceIds"],
        "usage": {"providerWrites": 0, "workerDeployments": 0, "containerStarts": 0,
            "containerReservedSeconds": 0, "queueMessages": 4, "syntheticCredits": 0,
            "syntheticFinancialMinorUnits": 0}, "issuedAt": now.isoformat().replace("+00:00", "Z"),
        "expiresAt": (now + __import__("datetime").timedelta(minutes=15)).isoformat().replace("+00:00", "Z"), "renewalCount": 0}
    row = SimpleNamespace(id="grant-1", tenant_id="tenant-a", project_id="project-a", status=ApprovalStatus.APPROVED,
        revoked_at=None, request_type=ApprovalType.DEPLOYMENT, payload=payload,
        extra_data={"cloudflareFirstMigrationOperationGrantV1": "first_migration_mandate_operation_v1", "mandateRef": "mandate-1"},
        action_digest=hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
        expires_at=(now + __import__("datetime").timedelta(minutes=15)).replace(tzinfo=None))
    active = _mandate()
    active["mandateRef"] = "mandate-1"
    db = AsyncMock()
    db.add = Mock()
    db.execute.side_effect = [SimpleNamespace(scalar_one_or_none=Mock(return_value=row)),
                              SimpleNamespace(scalar_one_or_none=Mock(return_value=row))]
    service = ApprovalDBService(db)
    service.resolve_cloudflare_migration_mandate = AsyncMock(return_value=active)
    resolved = await service.resolve_cloudflare_migration_operation_grant("grant-1", tenant_id="tenant-a")
    assert resolved["jobId"] == payload["jobId"]
    renewed = await service.renew_cloudflare_migration_operation_grant("grant-1", tenant_id="tenant-a", job_id=payload["jobId"])
    assert renewed["renewalCount"] == 1
    assert row.payload["renewalCount"] == 1
    service.resolve_cloudflare_migration_mandate.return_value = None
    db.execute.side_effect = None
    db.execute.return_value = SimpleNamespace(scalar_one_or_none=Mock(return_value=row))
    assert await service.resolve_cloudflare_migration_operation_grant("grant-1", tenant_id="tenant-a") is None


@pytest.mark.unit
@pytest.mark.parametrize("operation", [
    "rotate_origin_configuration", "deploy_worker", "worker_canary", "native_runtime_activation", "rollback",
])
@pytest.mark.asyncio
async def test_unenforced_production_operation_grants_are_rejected(operation):
    service = ApprovalDBService(AsyncMock())
    usage = {"providerWrites": 0, "workerDeployments": 0, "containerStarts": 0,
             "containerReservedSeconds": 0, "queueMessages": 0, "syntheticCredits": 0,
             "syntheticFinancialMinorUnits": 0}
    with pytest.raises(ValueError, match="CLOUDFLARE_MIGRATION_OPERATION_ENFORCEMENT_INCOMPLETE"):
        await service.create_cloudflare_migration_operation_grant(
            mandate_ref="mandate-1", tenant_id="tenant-a", project_id="project-a",
            job_id="11111111-1111-4111-8111-111111111111", operation=operation,
            plan_digest="a" * 64, idempotency_key=f"stable-{operation}", usage=usage,
        )


@pytest.mark.unit
@pytest.mark.asyncio
async def test_unenforced_operation_grant_is_rejected_before_any_reservation():
    service = ApprovalDBService(AsyncMock())
    underreported = {"providerWrites": 0, "workerDeployments": 0, "containerStarts": 0,
                     "containerReservedSeconds": 0, "queueMessages": 0, "syntheticCredits": 0,
                     "syntheticFinancialMinorUnits": 0}
    with pytest.raises(ValueError, match="CLOUDFLARE_MIGRATION_OPERATION_ENFORCEMENT_INCOMPLETE"):
        await service.create_cloudflare_migration_operation_grant(
            mandate_ref="mandate-1", tenant_id="tenant-a", project_id="project-a",
            job_id="11111111-1111-4111-8111-111111111111", operation="deploy_worker",
            plan_digest="a" * 64, idempotency_key="stable-deploy", usage=underreported,
        )


@pytest.mark.unit
def test_mandate_enrollment_api_accepts_only_the_owner_reviewed_envelope_without_storage_fields():
    envelope = _mandate()
    envelope.pop("revokedAt")
    owner_input = {key: value for key, value in envelope.items() if key not in ("tenantId", "ownerUserId")}
    request = CloudflareMigrationMandateIssue.model_validate({"idempotencyKey": "first-migration-owner-v1", **owner_input})
    assert request.mission_id == envelope["missionId"]
    with pytest.raises(Exception):
        CloudflareMigrationMandateIssue.model_validate({"idempotencyKey": "first-migration-owner-v1",
            **owner_input, "revokedAt": None})
    with pytest.raises(Exception):
        CloudflareMigrationMandateIssue.model_validate({"idempotencyKey": "first-migration-owner-v1",
            **owner_input, "tenantId": "tenant-b"})

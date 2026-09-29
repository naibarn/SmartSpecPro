"""P-RECOVERY grant contract against a disposable PostgreSQL database."""

import os
import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def _database_url() -> str:
    raw = os.environ.get("DATABASE_URL", "")
    parsed = urlparse(raw)
    name = parsed.path.lstrip("/")
    if parsed.hostname not in {"localhost", "127.0.0.1"} or not name.startswith("spec224_") or not name.endswith("_test"):
        raise RuntimeError("P-RECOVERY grant integration requires a loopback spec224_*_test database")
    if raw.startswith("postgresql://"):
        raw = "postgresql+asyncpg://" + raw.removeprefix("postgresql://")
    return raw


def _scope() -> dict:
    source_commit = "a" * 40
    source_files = [{"path": "python-backend/app/services/approval_db_service.py", "sha256": "c" * 64}]
    source_manifest = {
        "files": source_files,
        "schemaVersion": "spec224.source-manifest.v1",
        "sourceCommit": source_commit,
    }
    return {
        "sourceCommit": source_commit,
        "sourceSha256": hashlib.sha256(json.dumps(
            source_manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode("utf-8")).hexdigest(),
        "sourceFiles": source_files,
        "workpackageId": "WP-RECOVERY-04",
        "allowedWriteSet": ["python-backend/app/services/approval_db_service.py"],
        "allowedOperations": ["modify_owned_paths", "run_focused_tests"],
        "forbiddenOperations": ["production", "paid_provider", "cloudflare_migration", "shared_worktree"],
        "runtimeScope": "python-approval",
        "environmentScope": "isolated-non-production",
        "expiresAt": (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat().replace("+00:00", "Z"),
    }


def _source_attestation(binding: dict) -> dict:
    attestation = {
        "schemaVersion": "spec224.trusted-source-attestation.v1",
        "attestationId": "",
        "trustClass": "LOCAL_NONPRODUCTION_INTEGRITY_ONLY",
        "tenantId": binding["tenantId"],
        "actorId": binding["ownerId"],
        "runId": binding["runId"],
        "workerJobId": binding["workerJobId"],
        "workPackageId": binding["workPackageId"],
        "attemptId": binding["attemptId"],
        "attempt": binding["attempt"],
        "projectionRevision": binding["revision"],
        "decisionEpoch": binding["decisionEpoch"],
        "requirementClosureDigest": "9" * 64,
        "developmentRunFencingVersion": binding["developmentRunFencingVersion"],
        "workerJobFencingVersion": binding["workerJobFencingVersion"],
        "developmentRepositoryRef": "local-test",
        "developmentBaseRevision": "base-test",
        "sourceCommit": binding["sourceCommit"],
        "sourceTree": binding["sourceTree"],
        "sourceManifestDigest": binding["sourceManifestDigest"],
        "sourceSha256": binding["sourceSha256"],
        "specDigest": "8" * 64,
        "specSourceDigest": "7" * 64,
        "specBaselineId": "baseline:test",
        "profileId": binding["profileId"],
        "profileVersion": binding["profileVersion"],
        "profileDigest": binding["profileDigest"],
        "bundleDigest": binding["bundleDigest"],
        "artifactEvidenceDigest": binding["artifactEvidenceDigest"],
        "objectRef": "local-nonprod-bundle:sha256:" + binding["bundleDigest"],
        "issuer": "spec224-local-source-verifier.v1",
        "issuedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "status": "ACTIVE",
    }
    stable_identity = {key: value for key, value in attestation.items() if key not in {"attestationId", "issuedAt"}}
    attestation["attestationId"] = hashlib.sha256(json.dumps(
        stable_identity, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")).hexdigest()
    return attestation


@pytest.mark.asyncio
async def test_owner_scoped_grant_issue_validate_revoke_and_audit_are_transactional(monkeypatch):
    from app.models.approval import ApprovalRequest, ApprovalResponse, ApprovalStatus
    from app.models.audit_log import AuditLog
    from app.services.approval_db_service import ApprovalDBService
    from sqlalchemy import select

    engine = create_async_engine(_database_url(), pool_pre_ping=True)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    suffix = uuid.uuid4().hex
    tenant_id = str(uuid.uuid4())
    owner_id = None
    other_id = None
    grant_id = None
    runtime_job_id = None
    runtime_attempt_id = None
    scope = _scope()
    try:
        async with engine.begin() as connection:
            owner = await connection.execute(text(
                'INSERT INTO users ("openId", role, plan, credits, "isDisabled") '
                'VALUES (:open_id, \'user\', \'free\', 0, false) RETURNING id'
            ), {"open_id": f"spec224-grant-owner-{suffix}"})
            owner_id = owner.scalar_one()
            other = await connection.execute(text(
                'INSERT INTO users ("openId", role, plan, credits, "isDisabled") '
                'VALUES (:open_id, \'user\', \'free\', 0, false) RETURNING id'
            ), {"open_id": f"spec224-grant-other-{suffix}"})
            other_id = other.scalar_one()
            await connection.execute(text(
                'INSERT INTO tenants (id, slug, name, status, plan, "ownerId", created_at) '
                'VALUES (:id, :slug, :name, \'ACTIVE\', \'FREE\', :owner, now())'
            ), {"id": tenant_id, "slug": f"spec224-grant-{suffix}", "name": "Spec224 Grant Test", "owner": owner_id})

        async with sessions() as session:
            service = ApprovalDBService(session)
            forged_manifest = {**scope, "sourceSha256": "f" * 64}
            with pytest.raises(ValueError, match="SOURCE_MANIFEST_DIGEST_MISMATCH"):
                await service.issue_spec224_recovery_grant(
                    tenant_id=tenant_id, owner_id=owner_id, idempotency_key=f"forged-{suffix}", scope=forged_manifest
                )
            with pytest.raises(PermissionError, match="TENANT_OWNER_REQUIRED"):
                await service.issue_spec224_recovery_grant(
                    tenant_id=tenant_id, owner_id=other_id, idempotency_key=f"grant-{suffix}", scope=scope
                )
            grant = await service.issue_spec224_recovery_grant(
                tenant_id=tenant_id, owner_id=owner_id, idempotency_key=f"grant-{suffix}", scope=scope
            )
            grant_id = grant["grantId"]
            assert grant["state"] == "active"
            assert await service.issue_spec224_recovery_grant(
                tenant_id=tenant_id, owner_id=owner_id, idempotency_key=f"grant-{suffix}", scope=scope
            ) == grant
            assert await service.validate_spec224_recovery_grant(
                grant_id=grant_id, tenant_id=tenant_id, source_commit="a" * 40, source_sha256=scope["sourceSha256"],
                workpackage_id="WP-RECOVERY-04", operation="modify_owned_paths",
                path="python-backend/app/services/approval_db_service.py", runtime_scope="python-approval",
                environment_scope="isolated-non-production",
            )

            runtime_binding = {
                "tenantId": tenant_id,
                "ownerId": owner_id,
                "runId": f"run-{suffix}",
                "workerJobId": str(uuid.uuid4()),
                "attempt": 2,
                "revision": 7,
                "decisionEpoch": 3,
                "developmentRunFencingVersion": 11,
                "workerJobFencingVersion": 19,
                "runnerId": f"runner-{suffix}",
                "runnerSessionId": f"session-{suffix}",
                "capabilitySnapshotId": f"capability-{suffix}",
                "capabilitySnapshotRevision": "cap-r7",
            }
            admission_binding = {
                **runtime_binding,
                "workPackageId": "WP-RECOVERY-04",
                "attemptId": str(uuid.uuid4()),
                "sourceCommit": "a" * 40,
                "sourceTree": "c" * 40,
                "sourceSha256": "b" * 64,
                "sourceManifestDigest": "2" * 64,
                "profileId": "spec224-test-profile",
                "profileVersion": 1,
                "profileDigest": "d" * 64,
                "bundleDigest": "e" * 64,
                "artifactEvidenceDigest": "f" * 64,
                "attestationId": "1" * 64,
            }
            runtime_path = "apps/web/server/services/externalAgentTaskExecutor.ts"
            runtime_scope = _scope()
            runtime_scope["sourceFiles"] = [
                *runtime_scope["sourceFiles"],
                {"path": runtime_path, "sha256": "d" * 64},
            ]
            runtime_scope["sourceFiles"] = sorted(runtime_scope["sourceFiles"], key=lambda item: item["path"])
            runtime_scope["allowedWriteSet"] = [runtime_path]
            runtime_scope["allowedOperations"] = ["protected_dispatch"]
            runtime_scope["runtimeScope"] = "local-test-runner"
            runtime_scope["runtimeBinding"] = runtime_binding
            admission_binding["sourceCommit"] = runtime_scope["sourceCommit"]
            runtime_manifest = {
                "files": runtime_scope["sourceFiles"],
                "schemaVersion": "spec224.source-manifest.v1",
                "sourceCommit": runtime_scope["sourceCommit"],
            }
            runtime_scope["sourceSha256"] = hashlib.sha256(json.dumps(
                runtime_manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=False
            ).encode("utf-8")).hexdigest()
            admission_binding["sourceSha256"] = runtime_scope["sourceSha256"]
            runtime_job_id = runtime_binding["workerJobId"]
            runtime_attempt_id = admission_binding["attemptId"]
            attestation = _source_attestation(admission_binding)
            admission_binding["attestationId"] = attestation["attestationId"]
            runtime_scope["admissionBinding"] = admission_binding
            run_projection = {
                "runId": admission_binding["runId"],
                "tenantId": tenant_id,
                "actorId": owner_id,
                "workerJobId": runtime_job_id,
                "projectionVersion": admission_binding["revision"],
                "decisionEpoch": admission_binding["decisionEpoch"],
                "fencingVersion": admission_binding["developmentRunFencingVersion"],
            }
            await session.execute(text('''
                INSERT INTO "worker_jobs"
                    ("id", "tenantId", "runtimeType", "requestedByUserId", "jobType",
                     "attempt", "fencingVersion", "progressJson")
                VALUES (:id, :tenant, 'node_job_worker', :owner, 'external_agent_task',
                        :attempt, :fence, CAST(:progress AS jsonb))
            '''), {
                "id": runtime_job_id,
                "tenant": tenant_id,
                "owner": owner_id,
                "attempt": admission_binding["attempt"],
                "fence": admission_binding["workerJobFencingVersion"],
                "progress": json.dumps({"spec224": run_projection}),
            })
            await session.execute(text('''
                INSERT INTO "worker_job_attempts" ("id", "workerJobId", "attempt")
                VALUES (:id, :job_id, :attempt)
            '''), {"id": runtime_attempt_id, "job_id": runtime_job_id, "attempt": admission_binding["attempt"]})
            await session.execute(text('''
                INSERT INTO "worker_job_events"
                    ("workerJobId", "eventType", "eventIdempotencyKey", "attemptId", "payloadJson")
                VALUES (:job_id, 'SPEC224_SOURCE_ATTESTED', :event_key, :attempt_id, CAST(:payload AS jsonb))
            '''), {
                "job_id": runtime_job_id,
                "event_key": f"spec224:source-attestation:{attestation['attestationId']}",
                "attempt_id": runtime_attempt_id,
                "payload": json.dumps({"attestation": attestation}),
            })
            with pytest.raises(ValueError, match="RUNTIME_BINDING_REQUIRED"):
                await service.issue_spec224_recovery_grant(
                    tenant_id=tenant_id,
                    owner_id=owner_id,
                    idempotency_key=f"runtime-grant-missing-binding-{suffix}",
                    scope={**runtime_scope, "runtimeBinding": None},
                )
            with pytest.raises(ValueError, match="RUNTIME_BINDING_INVALID"):
                await service.issue_spec224_recovery_grant(
                    tenant_id=tenant_id,
                    owner_id=owner_id,
                    idempotency_key=f"runtime-grant-bool-owner-{suffix}",
                    scope={**runtime_scope, "runtimeBinding": {**runtime_binding, "ownerId": True}},
                )
            monkeypatch.setenv("ENVIRONMENT", "development")
            monkeypatch.delenv("SPEC224_LOCAL_ADMISSION_TESTS", raising=False)
            with pytest.raises(ValueError, match="ADMISSION_BINDING_NOT_AUTHORITATIVE"):
                await service.issue_spec224_recovery_grant(
                    tenant_id=tenant_id, owner_id=owner_id,
                    idempotency_key=f"runtime-grant-no-test-scope-{suffix}", scope=runtime_scope,
                )
            monkeypatch.setenv("SPEC224_LOCAL_ADMISSION_TESTS", "true")
            runtime_grant = await service.issue_spec224_recovery_grant(
                tenant_id=tenant_id, owner_id=owner_id,
                idempotency_key=f"runtime-grant-{suffix}", scope=runtime_scope,
            )
            runtime_validation = {
                "grant_id": runtime_grant["grantId"],
                "tenant_id": tenant_id,
                "source_commit": runtime_scope["sourceCommit"],
                "source_sha256": runtime_scope["sourceSha256"],
                "workpackage_id": "WP-RECOVERY-04",
                "operation": "protected_dispatch",
                "path": runtime_path,
                "runtime_scope": "local-test-runner",
                "environment_scope": "isolated-non-production",
                "runtime_binding": runtime_binding,
                "admission_binding": admission_binding,
            }
            assert await service.validate_spec224_recovery_grant(**runtime_validation)
            assert not await service.validate_spec224_recovery_grant(
                **{**runtime_validation, "runtime_binding": {**runtime_binding, "workerJobFencingVersion": 20}}
            )
            assert not await service.validate_spec224_recovery_grant(
                **{**runtime_validation, "admission_binding": {**admission_binding, "bundleDigest": "2" * 64}}
            )
            assert not await service.validate_spec224_recovery_grant(
                **{key: value for key, value in runtime_validation.items() if key != "runtime_binding"}
            )
            assert not await service.validate_spec224_recovery_grant(
                **{**runtime_validation, "tenant_id": str(uuid.uuid4())}
            )
            request = (await session.execute(select(ApprovalRequest).where(ApprovalRequest.id == grant_id))).scalar_one()

            request.status = ApprovalStatus.REJECTED
            await session.commit()
            assert not await service.validate_spec224_recovery_grant(
                grant_id=grant_id, tenant_id=tenant_id, source_commit="a" * 40, source_sha256=scope["sourceSha256"],
                workpackage_id="WP-RECOVERY-04", operation="modify_owned_paths",
                path="python-backend/app/services/approval_db_service.py", runtime_scope="python-approval",
                environment_scope="isolated-non-production",
            )
            request.status = ApprovalStatus.APPROVED
            await session.commit()

            request.revoked_at = datetime.utcnow()
            await session.commit()
            assert not await service.validate_spec224_recovery_grant(
                grant_id=grant_id, tenant_id=tenant_id, source_commit="a" * 40, source_sha256=scope["sourceSha256"],
                workpackage_id="WP-RECOVERY-04", operation="modify_owned_paths",
                path="python-backend/app/services/approval_db_service.py", runtime_scope="python-approval",
                environment_scope="isolated-non-production",
            )
            request.revoked_at = None
            await session.commit()

            response = (await session.execute(select(ApprovalResponse).where(
                ApprovalResponse.request_id == grant_id,
                ApprovalResponse.approver_id == owner_id,
                ApprovalResponse.decision == "approved",
            ))).scalar_one()
            await session.delete(response)
            await session.commit()
            assert not await service.validate_spec224_recovery_grant(
                grant_id=grant_id, tenant_id=tenant_id, source_commit="a" * 40, source_sha256=scope["sourceSha256"],
                workpackage_id="WP-RECOVERY-04", operation="modify_owned_paths",
                path="python-backend/app/services/approval_db_service.py", runtime_scope="python-approval",
                environment_scope="isolated-non-production",
            )
            session.add(ApprovalResponse(
                id=str(uuid.uuid4()), request_id=grant_id, approver_id=owner_id,
                decision="approved", comment="restore fixture evidence", created_at=datetime.utcnow(),
            ))
            await session.commit()

            audit = (await session.execute(select(AuditLog).where(
                AuditLog.resource_id == grant_id,
                AuditLog.action == "spec224.recovery_grant.issued",
            ))).scalar_one()
            await session.delete(audit)
            await session.commit()
            assert not await service.validate_spec224_recovery_grant(
                grant_id=grant_id, tenant_id=tenant_id, source_commit="a" * 40, source_sha256=scope["sourceSha256"],
                workpackage_id="WP-RECOVERY-04", operation="modify_owned_paths",
                path="python-backend/app/services/approval_db_service.py", runtime_scope="python-approval",
                environment_scope="isolated-non-production",
            )
            session.add(AuditLog(
                user_id=str(owner_id), user_role="tenant_owner", action="spec224.recovery_grant.issued",
                resource_type="spec224_recovery_grant", resource_id=grant_id,
                details={"tenantId": tenant_id, "scopeDigest": grant["scopeDigest"], "eventDigest": grant["auditEvents"][0]["eventDigest"]},
            ))
            await session.commit()
            assert await service.validate_spec224_recovery_grant(
                grant_id=grant_id, tenant_id=tenant_id, source_commit="a" * 40, source_sha256=scope["sourceSha256"],
                workpackage_id="WP-RECOVERY-04", operation="modify_owned_paths",
                path="python-backend/app/services/approval_db_service.py", runtime_scope="python-approval",
                environment_scope="isolated-non-production",
            )

            for invalid_scope in (
                {"tenant_id": str(uuid.uuid4())},
                {"source_sha256": "e" * 64},
                {"workpackage_id": "WP-OTHER-01"},
                {"operation": "deploy_production"},
                {"runtime_scope": "node-control-plane"},
                {"environment_scope": "production"},
            ):
                arguments = {
                    "grant_id": grant_id, "tenant_id": tenant_id, "source_commit": "a" * 40,
                    "source_sha256": scope["sourceSha256"], "workpackage_id": "WP-RECOVERY-04",
                    "operation": "modify_owned_paths",
                    "path": "python-backend/app/services/approval_db_service.py",
                    "runtime_scope": "python-approval", "environment_scope": "isolated-non-production",
                }
                arguments.update(invalid_scope)
                assert not await service.validate_spec224_recovery_grant(**arguments)

            import app.services.approval_db_service as approval_db_module
            real_datetime = approval_db_module.datetime

            class ExpiredClock(real_datetime):
                @classmethod
                def now(cls, tz=None):
                    return real_datetime.now(tz) + timedelta(days=2)

            approval_db_module.datetime = ExpiredClock
            try:
                assert not await service.validate_spec224_recovery_grant(
                    grant_id=grant_id, tenant_id=tenant_id, source_commit="a" * 40, source_sha256=scope["sourceSha256"],
                    workpackage_id="WP-RECOVERY-04", operation="modify_owned_paths",
                    path="python-backend/app/services/approval_db_service.py", runtime_scope="python-approval",
                    environment_scope="isolated-non-production",
                )
            finally:
                approval_db_module.datetime = real_datetime

            assert not await service.validate_spec224_recovery_grant(
                grant_id=grant_id, tenant_id=tenant_id, source_commit="d" * 40, source_sha256=scope["sourceSha256"],
                workpackage_id="WP-RECOVERY-04", operation="modify_owned_paths",
                path="python-backend/app/services/approval_db_service.py", runtime_scope="python-approval",
                environment_scope="isolated-non-production",
            )
            assert not await service.validate_spec224_recovery_grant(
                grant_id=grant_id, tenant_id=tenant_id, source_commit="a" * 40, source_sha256=scope["sourceSha256"],
                workpackage_id="WP-RECOVERY-04", operation="modify_owned_paths",
                path="apps/web/server/services/spec224AuthorizationService.ts", runtime_scope="python-approval",
                environment_scope="isolated-non-production",
            )
            revoked = await service.revoke_spec224_recovery_grant(
                grant_id=grant_id, tenant_id=tenant_id, owner_id=owner_id, reason="owner revoked test grant"
            )
            assert revoked["state"] == "revoked"
            assert not await service.validate_spec224_recovery_grant(
                grant_id=grant_id, tenant_id=tenant_id, source_commit="a" * 40, source_sha256=scope["sourceSha256"],
                workpackage_id="WP-RECOVERY-04", operation="modify_owned_paths",
                path="python-backend/app/services/approval_db_service.py", runtime_scope="python-approval",
                environment_scope="isolated-non-production",
            )
            assert await service.revoke_spec224_recovery_grant(
                grant_id=grant_id, tenant_id=tenant_id, owner_id=owner_id, reason="retry revoke request"
            ) == revoked

        async with sessions() as session:
            from app.models.approval import ApprovalRequest, ApprovalResponse
            from app.models.audit_log import AuditLog
            from sqlalchemy import select

            row = (await session.execute(select(ApprovalRequest).where(ApprovalRequest.id == grant_id))).scalar_one()
            grant = row.extra_data["spec224RecoveryGrantV1"]
            assert grant["state"] == "revoked"
            assert len(grant["auditEvents"]) == 2
            assert ApprovalDBService._recovery_grant_audit_valid(grant)
            assert (await session.execute(select(ApprovalResponse).where(ApprovalResponse.request_id == grant_id))).scalars().one().decision == "approved"
            logs = (await session.execute(select(AuditLog).where(AuditLog.resource_id == grant_id))).scalars().all()
            assert {entry.action for entry in logs} == {"spec224.recovery_grant.issued", "spec224.recovery_grant.revoked"}
    finally:
        async with engine.begin() as connection:
            if grant_id:
                await connection.execute(text("DELETE FROM audit_logs WHERE resource_id = :id"), {"id": grant_id})
                await connection.execute(text("DELETE FROM approval_responses WHERE request_id = :id"), {"id": grant_id})
                await connection.execute(text("DELETE FROM approval_requests WHERE id = :id"), {"id": grant_id})
            if runtime_job_id:
                await connection.execute(text('DELETE FROM "worker_job_events" WHERE "workerJobId" = :id'), {"id": runtime_job_id})
                await connection.execute(text('DELETE FROM "worker_job_attempts" WHERE "workerJobId" = :id'), {"id": runtime_job_id})
                await connection.execute(text('DELETE FROM "worker_jobs" WHERE "id" = :id'), {"id": runtime_job_id})
            await connection.execute(text("DELETE FROM tenants WHERE id = :id"), {"id": tenant_id})
            if owner_id:
                await connection.execute(text('DELETE FROM users WHERE id = :id'), {"id": owner_id})
            if other_id:
                await connection.execute(text('DELETE FROM users WHERE id = :id'), {"id": other_id})
        await engine.dispose()


@pytest.mark.asyncio
async def test_spec224_cancellation_replay_returns_the_same_durable_delivery():
    from app.models.approval import ApprovalType
    from app.services.approval_db_service import ApprovalDBService

    engine = create_async_engine(_database_url(), pool_pre_ping=True)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    suffix = uuid.uuid4().hex
    tenant_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    requester_id = None
    request_id = None
    operation_key = f"spec224-operation-{suffix}"
    correlation = {
        "jobId": job_id,
        "tenantId": tenant_id,
        "requesterId": 1,
        "operationKey": operation_key,
        "providerRequestId": f"command-{suffix}",
    }
    try:
        async with engine.begin() as connection:
            user = await connection.execute(text(
                'INSERT INTO users ("openId", role, plan, credits, "isDisabled") '
                'VALUES (:open_id, \'user\', \'free\', 0, false) RETURNING id'
            ), {"open_id": f"spec224-cancel-{suffix}"})
            requester_id = user.scalar_one()
            await connection.execute(text(
                'INSERT INTO tenants (id, slug, name, status, plan, "ownerId", created_at) '
                'VALUES (:id, :slug, :name, \'ACTIVE\', \'FREE\', :owner, now())'
            ), {"id": tenant_id, "slug": f"spec224-cancel-{suffix}", "name": "Spec224 Cancel Test", "owner": requester_id})
        correlation["requesterId"] = requester_id

        async with sessions() as session:
            service = ApprovalDBService(session)
            request = await service.create_request(
                request_type=ApprovalType.CODE_EXECUTION,
                title="Spec224 idempotent cancellation test",
                tenant_id=tenant_id,
                requester_id=requester_id,
                requester_type="user",
                execution_id=job_id,
                extra_data={"spec224ExternalAgentResume": correlation},
                correlation_key=f"spec224-cancel:{suffix}",
                risk_level="high",
            )
            request_id = request.id
            first = await service.cancel_request(
                request.id, cancelled_by=requester_id, tenant_id=tenant_id, reason="test cancellation"
            )
            assert first is not None
            first_delivery = service._read_spec224_delivery(first)
            replay = await service.cancel_request(
                request.id, cancelled_by=requester_id, tenant_id=tenant_id, reason="duplicate test cancellation"
            )
            replay_delivery = service._read_spec224_delivery(replay) if replay else None
            assert replay is not None and replay.status.value == "cancelled"
            assert first_delivery["event"]["deliveryId"] == replay_delivery["event"]["deliveryId"]
            assert first_delivery["payloadDigest"] == replay_delivery["payloadDigest"]
            assert await service.cancel_request(
                request.id, cancelled_by=requester_id + 1, tenant_id=tenant_id, reason="wrong actor"
            ) is None

            claim_time = datetime.now(timezone.utc)
            first_claims = await service.claim_spec224_decision_deliveries(
                "cancel-worker-1", now=claim_time
            )
            assert len(first_claims) == 1
            first_claim = first_claims[0]
            receipt = {
                "deliveryId": first_claim["deliveryId"],
                "payloadDigest": first_claim["payloadDigest"],
                "result": "cancel_requested",
                "acknowledgedAt": (claim_time + timedelta(seconds=1)).isoformat().replace("+00:00", "Z"),
            }
            assert await service.acknowledge_spec224_decision_delivery(
                request.id, tenant_id, job_id, operation_key,
                first_claim["deliveryId"], first_claim["payloadDigest"], receipt,
                first_claim["leaseOwner"], first_claim["leaseEpoch"],
                now=claim_time + timedelta(seconds=1),
            )

            # Simulate process loss after Python committed ACK but before Node
            # recorded its own acknowledged event; a new worker reclaims the
            # persisted receipt only after the delivery lease expires.
            restart_time = claim_time + timedelta(seconds=61)
            replay_claims = await service.claim_spec224_decision_deliveries(
                "cancel-worker-2", now=restart_time
            )
            assert len(replay_claims) == 1
            replay_claim = replay_claims[0]
            persisted_delivery = await service.get_spec224_decision_delivery(
                request.id, tenant_id, job_id, operation_key
            )
            assert persisted_delivery["state"] == "acknowledged"
            assert persisted_delivery["receipt"] == receipt
            assert await service.acknowledge_spec224_decision_delivery(
                request.id, tenant_id, job_id, operation_key,
                replay_claim["deliveryId"], replay_claim["payloadDigest"], receipt,
                replay_claim["leaseOwner"], replay_claim["leaseEpoch"],
                now=restart_time + timedelta(seconds=1),
            )

        async with sessions() as session:
            from app.models.approval import ApprovalRequest
            from sqlalchemy import select

            persisted = (await session.execute(select(ApprovalRequest).where(ApprovalRequest.id == request_id))).scalar_one()
            delivery = persisted.extra_data["spec224DecisionDeliveryV1"]
            assert delivery["event"]["decision"] == "cancelled"
            assert delivery["state"] == "acknowledged"
    finally:
        async with engine.begin() as connection:
            if request_id:
                await connection.execute(text("DELETE FROM approval_requests WHERE id = :id"), {"id": request_id})
            await connection.execute(text("DELETE FROM tenants WHERE id = :id"), {"id": tenant_id})
            if requester_id:
                await connection.execute(text('DELETE FROM users WHERE id = :id'), {"id": requester_id})
        await engine.dispose()

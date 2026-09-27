"""Focused ApprovalDBService certification against a disposable PostgreSQL DB."""

import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def _test_database_url() -> str:
    raw = os.environ.get("DATABASE_URL", "")
    parsed = urlparse(raw)
    database = parsed.path.lstrip("/")
    if parsed.hostname not in {"127.0.0.1", "localhost"} or not database.startswith("spec224_") or not database.endswith("_test"):
        raise RuntimeError("Approval integration requires a loopback spec224_*_test PostgreSQL database")
    return raw


pytestmark = pytest.mark.asyncio


async def test_postgres_approval_decision_delivery_and_recovery():
    url = _test_database_url()
    from app.models.approval import ApprovalStatus, ApprovalType
    from app.services.approval_db_service import ApprovalDBService

    engine = create_async_engine(url, pool_pre_ping=True)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    suffix = uuid.uuid4().hex
    tenant_id = str(uuid.uuid4())
    requester_id = None
    approver_id = None
    other_id = None
    request_ids: list[str] = []
    try:
        async with engine.begin() as connection:
            await connection.execute(
                text('INSERT INTO tenants (id, slug, name) VALUES (:id, :slug, :name)'),
                {"id": tenant_id, "slug": f"spec224-approval-{suffix}", "name": "Spec224 Approval Test"},
            )
            result = await connection.execute(
                text('INSERT INTO users ("openId") VALUES (:open_id) RETURNING id'),
                {"open_id": f"spec224-requester-{suffix}"},
            )
            requester_id = result.scalar_one()
            result = await connection.execute(
                text('INSERT INTO users ("openId") VALUES (:open_id) RETURNING id'),
                {"open_id": f"spec224-approver-{suffix}"},
            )
            approver_id = result.scalar_one()
            result = await connection.execute(
                text('INSERT INTO users ("openId") VALUES (:open_id) RETURNING id'),
                {"open_id": f"spec224-other-{suffix}"},
            )
            other_id = result.scalar_one()

        async with sessions() as session:
            service = ApprovalDBService(session)
            request = await service.create_request(
                request_type=ApprovalType.CODE_EXECUTION,
                title="Spec 224 approval integration",
                tenant_id=tenant_id,
                requester_id=requester_id,
                execution_id=str(uuid.uuid4()),
                extra_data={
                    "approvers": [str(approver_id)],
                    "spec224ExternalAgentResume": {
                        "jobId": "",  # filled with the actual job below
                        "tenantId": tenant_id,
                        "operationKey": f"operation-{suffix}",
                        "providerRequestId": f"provider-request-{suffix}",
                    },
                },
            )
            request_ids.append(request.id)
            request.execution_id = str(uuid.uuid4())
            correlation = dict(request.extra_data["spec224ExternalAgentResume"])
            correlation["jobId"] = request.execution_id
            request.extra_data = {**request.extra_data, "spec224ExternalAgentResume": correlation}
            await session.commit()
            request_id = request.id
            job_id = request.execution_id

            assert (await service.get_request(request_id, tenant_id=tenant_id)).status == ApprovalStatus.PENDING
            assert await service.get_request(request_id, tenant_id=str(uuid.uuid4())) is None
            with pytest.raises(PermissionError):
                await service.submit_decision(request_id, other_id, "approved", tenant_id=tenant_id)

            response = await service.submit_decision(request_id, approver_id, "approved", tenant_id=tenant_id)
            assert response.decision == "approved"
            replay = await service.submit_decision(request_id, approver_id, "approved", tenant_id=tenant_id)
            assert replay.id == response.id
            with pytest.raises(ValueError, match="Conflicting decision replay"):
                await service.submit_decision(request_id, approver_id, "rejected", tenant_id=tenant_id)

            request = await service.get_request(request_id, tenant_id=tenant_id)
            delivery = service._read_spec224_delivery(request)
            assert delivery["event"]["schemaVersion"] == "spec224.approval-decision.v1"
            assert delivery["event"]["decision"] == "approved"
            assert delivery["event"]["tenantId"] == tenant_id
            assert delivery["event"]["jobId"] == job_id
            assert delivery["event"]["operationId"] == f"operation-{suffix}"
            assert len(delivery["event"]["deliveryId"]) == 36
            assert await service.get_spec224_decision_delivery(
                request_id, tenant_id, job_id, f"operation-{suffix}"
            ) is not None
            assert await service.get_spec224_decision_delivery(
                request_id, str(uuid.uuid4()), job_id, f"operation-{suffix}"
            ) is None

            delivery_id = delivery["event"]["deliveryId"]
            digest = delivery["payloadDigest"]
            claim_time = datetime(2026, 9, 27, 2, 0, tzinfo=timezone.utc)
            claim = (await service.claim_spec224_decision_deliveries(
                "reconciler-1", now=claim_time
            ))[0]
            assert claim["approvalRef"] == request_id
            assert claim["deliveryId"] == delivery_id
            assert claim["leaseEpoch"] == 1
            assert await service.claim_spec224_decision_deliveries(
                "reconciler-2", now=claim_time + timedelta(seconds=5)
            ) == []

            receipt = {
                "deliveryId": delivery_id,
                "payloadDigest": digest,
                "result": "resumed",
                "acknowledgedAt": claim_time.isoformat(),
            }
            assert not await service.acknowledge_spec224_decision_delivery(
                request_id, tenant_id, job_id, f"operation-{suffix}", delivery_id,
                digest, receipt, "forged-worker", 1, claim_time + timedelta(seconds=1)
            )
            reclaimed = (await service.claim_spec224_decision_deliveries(
                "reconciler-2", now=claim_time + timedelta(seconds=61)
            ))[0]
            assert reclaimed["leaseEpoch"] == 2
            assert not await service.acknowledge_spec224_decision_delivery(
                request_id, tenant_id, job_id, f"operation-{suffix}", delivery_id,
                digest, receipt, "reconciler-1", 1, claim_time + timedelta(seconds=62)
            )
            assert await service.acknowledge_spec224_decision_delivery(
                request_id, tenant_id, job_id, f"operation-{suffix}", delivery_id, digest,
                receipt, "reconciler-2", 2, claim_time + timedelta(seconds=62)
            )
            assert await service.acknowledge_spec224_decision_delivery(
                request_id, tenant_id, job_id, f"operation-{suffix}", delivery_id, digest,
                receipt, "reconciler-1", 1, claim_time + timedelta(seconds=63)
            )
            assert not await service.acknowledge_spec224_decision_delivery(
                request_id, tenant_id, job_id, f"operation-{suffix}", delivery_id, "0" * 64,
                receipt, "reconciler-2", 2, claim_time + timedelta(seconds=63)
            )

        # A new session models process restart and reads only persisted state.
        async with sessions() as restarted:
            service = ApprovalDBService(restarted)
            delivery = await service.get_spec224_decision_delivery(
                request_id, tenant_id, job_id, f"operation-{suffix}"
            )
            assert delivery["state"] == "acknowledged"
            assert delivery["event"]["schemaVersion"] == "spec224.approval-decision.v1"

        # Race owner cancellation against an authorized decision. The locked
        # canonical row permits one terminal outcome, never a mixed state.
        async with sessions() as session:
            service = ApprovalDBService(session)
            race_request = await service.create_request(
                request_type=ApprovalType.CODE_EXECUTION,
                title="Spec 224 cancellation race",
                tenant_id=tenant_id,
                requester_id=requester_id,
                execution_id=str(uuid.uuid4()),
                extra_data={"approvers": [str(approver_id)]},
            )
            request_ids.append(race_request.id)
            race_id = race_request.id

        async def decide():
            async with sessions() as session:
                try:
                    return await ApprovalDBService(session).submit_decision(
                        race_id, approver_id, "approved", tenant_id=tenant_id
                    )
                except (ValueError, PermissionError):
                    return None

        async def cancel():
            async with sessions() as session:
                return await ApprovalDBService(session).cancel_request(
                    race_id, requester_id, tenant_id=tenant_id
                )

        decision_result, cancel_result = await asyncio.gather(decide(), cancel())
        assert bool(decision_result) != bool(cancel_result)
        async with sessions() as session:
            final = await ApprovalDBService(session).get_request(race_id, tenant_id=tenant_id)
            assert final.status in {ApprovalStatus.APPROVED, ApprovalStatus.CANCELLED}
            assert final.status != ApprovalStatus.PENDING
    finally:
        async with engine.begin() as connection:
            for request_id in request_ids:
                await connection.execute(text("DELETE FROM approval_responses WHERE request_id = :id"), {"id": request_id})
                await connection.execute(text("DELETE FROM approval_requests WHERE id = :id"), {"id": request_id})
            if requester_id is not None and approver_id is not None and other_id is not None:
                await connection.execute(
                    text('DELETE FROM users WHERE id IN (:requester, :approver, :other)'),
                    {"requester": requester_id, "approver": approver_id, "other": other_id},
                )
            await connection.execute(text("DELETE FROM tenants WHERE id = :id"), {"id": tenant_id})
        await engine.dispose()

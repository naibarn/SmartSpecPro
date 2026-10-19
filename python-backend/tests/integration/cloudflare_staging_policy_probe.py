"""Disposable-PostgreSQL probe called by the canonical job integration test.

Never accepts a shared database. All auth identities here are labeled fixtures;
real runtime auth is exercised separately against the application's SDK.
"""
import asyncio
import json
import sys
from datetime import datetime, timezone
from urllib.parse import urlparse

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from app.core.database import Base
from app.models.approval import ApprovalRequest, ApprovalRule
from app.models.audit_log import AuditLog
from app.services.approval_db_service import ApprovalDBService


async def main():
    data = json.load(sys.stdin)
    parsed = urlparse(data["databaseUrl"])
    if parsed.hostname != "127.0.0.1" or parsed.username != "spec277_autoteam_test" or not parsed.path.endswith("_test"):
        raise ValueError("DISPOSABLE_DATABASE_REQUIRED")
    engine = create_async_engine(data["databaseUrl"].replace("postgresql://", "postgresql+asyncpg://", 1))
    try:
        if data["mode"] == "issue":
            async with engine.begin() as conn:
                await conn.run_sync(lambda sync: Base.metadata.create_all(sync, tables=[ApprovalRule.__table__, ApprovalRequest.__table__, AuditLog.__table__]))
        async with AsyncSession(engine, expire_on_commit=False) as db:
            service = ApprovalDBService(db)
            if data["mode"] == "issue":
                grant = data["grant"]
                grant.pop("revoked", None)
                grant["jobId"] = data["jobId"]
                grant["accountRef"] = data["accountRef"]
                policy = {"accountRef": data["accountRef"], "executorId": grant["executorId"], "actorUserId": grant["requesterUserId"],
                    "targetId": grant["targetId"], "environment": "staging", "maxOperations": 1, "allowBootstrap": False,
                    "expiresAt": grant["expiresAt"], "artifacts": [
                        {k: grant[k] for k in ("artifactRef", "sourceSha", "buildDigest")},
                        {k: grant["rollback" + k[0].upper() + k[1:]] for k in ("artifactRef", "sourceSha", "buildDigest")}]}
                if grant["schemaVersion"] == "cloudflare.staging-origin-grant.v2":
                    policy.pop("allowBootstrap")
                    artifacts = policy.pop("artifacts")
                    policy.update({"contractVersion": "cloudflare-staging-origin-v2", "releases": [
                        {**artifacts[0], "configurationRef": grant["configurationRef"], "configurationDigest": grant["configurationDigest"]},
                        {**artifacts[1], "configurationRef": grant["rollbackConfigurationRef"], "configurationDigest": grant["rollbackConfigurationDigest"]}]})
                rule = await service.create_cloudflare_staging_policy(tenant_id=grant["tenantId"], project_id=grant["projectId"], actor_id=grant["requesterUserId"], definition=policy)
                grant["actions"] = ["deploy"]
                request = await service.create_cloudflare_staging_grant_request(tenant_id=grant["tenantId"], requester_id=grant["requesterUserId"],
                    idempotency_key="disposable-policy-job-1", payload=grant, policy_id=rule.id)
                from app.api.approvals import ApprovalRequestResponse
                response = ApprovalRequestResponse.model_validate(request)
                assert response.requester_id == grant["requesterUserId"]
                # An exact retry reuses the durable decision and consumes no budget.
                again = await service.create_cloudflare_staging_grant_request(tenant_id=grant["tenantId"], requester_id=grant["requesterUserId"],
                    idempotency_key="disposable-policy-job-1", payload=grant, policy_id=rule.id)
                assert request.id == again.id
                resolved = await service.resolve_cloudflare_staging_grant(request.id)
                assert resolved and resolved["jobId"] == data["jobId"]
                print("POLICY_PROBE:" + json.dumps({"grant": resolved, "policyId": rule.id}))
            else:
                resolved = await service.resolve_cloudflare_staging_grant(data["grantRef"])
                print("POLICY_PROBE:" + json.dumps({"grant": resolved}))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())

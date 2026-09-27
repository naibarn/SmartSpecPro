"""P-RECOVERY grant contract against a disposable PostgreSQL database."""

import os
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
    return raw


def _scope() -> dict:
    return {
        "sourceCommit": "a" * 40,
        "sourceSha256": "b" * 64,
        "sourceFiles": [{"path": "python-backend/app/services/approval_db_service.py", "sha256": "c" * 64}],
        "workpackageId": "WP-RECOVERY-04",
        "allowedWriteSet": ["python-backend/app/services/approval_db_service.py"],
        "allowedOperations": ["modify_owned_paths", "run_focused_tests"],
        "forbiddenOperations": ["production", "paid_provider", "cloudflare_migration", "shared_worktree"],
        "runtimeScope": "python-approval",
        "environmentScope": "isolated-non-production",
        "expiresAt": (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat().replace("+00:00", "Z"),
    }


@pytest.mark.asyncio
async def test_owner_scoped_grant_issue_validate_revoke_and_audit_are_transactional():
    from app.services.approval_db_service import ApprovalDBService

    engine = create_async_engine(_database_url(), pool_pre_ping=True)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    suffix = uuid.uuid4().hex
    tenant_id = str(uuid.uuid4())
    owner_id = None
    other_id = None
    grant_id = None
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
                'INSERT INTO tenants (id, slug, name, "ownerId") VALUES (:id, :slug, :name, :owner)'
            ), {"id": tenant_id, "slug": f"spec224-grant-{suffix}", "name": "Spec224 Grant Test", "owner": owner_id})

        async with sessions() as session:
            service = ApprovalDBService(session)
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
                grant_id=grant_id, tenant_id=tenant_id, source_commit="a" * 40, source_sha256="b" * 64,
                workpackage_id="WP-RECOVERY-04", operation="modify_owned_paths",
                path="python-backend/app/services/approval_db_service.py", runtime_scope="python-approval",
                environment_scope="isolated-non-production",
            )
            assert not await service.validate_spec224_recovery_grant(
                grant_id=grant_id, tenant_id=tenant_id, source_commit="d" * 40, source_sha256="b" * 64,
                workpackage_id="WP-RECOVERY-04", operation="modify_owned_paths",
                path="python-backend/app/services/approval_db_service.py", runtime_scope="python-approval",
                environment_scope="isolated-non-production",
            )
            assert not await service.validate_spec224_recovery_grant(
                grant_id=grant_id, tenant_id=tenant_id, source_commit="a" * 40, source_sha256="b" * 64,
                workpackage_id="WP-RECOVERY-04", operation="modify_owned_paths",
                path="apps/web/server/services/spec224AuthorizationService.ts", runtime_scope="python-approval",
                environment_scope="isolated-non-production",
            )
            revoked = await service.revoke_spec224_recovery_grant(
                grant_id=grant_id, tenant_id=tenant_id, owner_id=owner_id, reason="owner revoked test grant"
            )
            assert revoked["state"] == "revoked"
            assert not await service.validate_spec224_recovery_grant(
                grant_id=grant_id, tenant_id=tenant_id, source_commit="a" * 40, source_sha256="b" * 64,
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
            await connection.execute(text("DELETE FROM tenants WHERE id = :id"), {"id": tenant_id})
            if owner_id:
                await connection.execute(text('DELETE FROM users WHERE id = :id'), {"id": owner_id})
            if other_id:
                await connection.execute(text('DELETE FROM users WHERE id = :id'), {"id": other_id})
        await engine.dispose()

"""Subprocess bridge used by the D3.79 Node/Python PostgreSQL integration test."""

import asyncio
import hashlib
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from app.services.approval_db_service import ApprovalDBService  # noqa: E402


def _database_url() -> str:
    value = os.environ.get("DATABASE_URL", "")
    parsed = urlparse(value)
    if (
        parsed.hostname not in {"localhost", "127.0.0.1"}
        or parsed.path.lstrip("/") != "spec224_d377_test"
        or parsed.username != "spec224_runtime"
        or os.environ.get("SPEC224_TEST_DATABASE_IDENTITY")
        != "spec224-d377-pg-20260930|spec224_d377_test|spec224_runtime|PostgreSQL 15.17"
    ):
        raise RuntimeError("SPEC224_TEST_DATABASE_FORBIDDEN")
    if value.startswith("postgresql://"):
        value = "postgresql+asyncpg://" + value.removeprefix("postgresql://")
    return value


async def main() -> None:
    action = sys.argv[1]
    request = json.loads(os.environ["SPEC224_GRANT_TEST_INPUT"])
    engine = create_async_engine(_database_url(), pool_pre_ping=True)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.connect() as connection:
            identity = (await connection.execute(text(
                "SELECT current_database(), current_user, role.rolsuper, version() "
                "FROM pg_roles AS role WHERE role.rolname = current_user"
            ))).one()
            if (
                identity[0] != "spec224_d377_test"
                or identity[1] != "spec224_runtime"
                or identity[2] is not False
                or not identity[3].startswith("PostgreSQL 15.17")
            ):
                raise RuntimeError("SPEC224_TEST_DATABASE_IDENTITY_MISMATCH")
        async with sessions() as session:
            service = ApprovalDBService(session)
            if action == "issue":
                scope = request.get("scope")
                if not isinstance(scope, dict):
                    files = [{
                        "path": request["sourcePath"],
                        "sha256": request["sourceFileSha256"],
                    }]
                    manifest = {
                        "files": files,
                        "schemaVersion": "spec224.source-manifest.v1",
                        "sourceCommit": request["sourceCommit"],
                    }
                    scope = {
                        "sourceCommit": manifest["sourceCommit"],
                        "sourceSha256": request["sourceSha256"],
                        "sourceFiles": files,
                        "workpackageId": "WP-RECOVERY-04",
                        "allowedWriteSet": [request["sourcePath"]],
                        "allowedOperations": ["modify_owned_paths", "run_focused_tests"],
                        "forbiddenOperations": [
                            "production", "paid_provider", "cloudflare_migration", "shared_worktree"
                        ],
                        "runtimeScope": "python-approval",
                        "environmentScope": "isolated-non-production",
                        "expiresAt": request["expiresAt"],
                        "runtimeBinding": request["runtimeBinding"],
                    }
                grant = await service.issue_spec224_recovery_grant(
                    tenant_id=request["tenantId"], owner_id=request["ownerId"],
                    idempotency_key=request["idempotencyKey"], scope=scope,
                )
                print(json.dumps(grant, sort_keys=True))
            elif action == "revoke":
                grant = await service.revoke_spec224_recovery_grant(
                    grant_id=request["grantId"], tenant_id=request["tenantId"],
                    owner_id=request["ownerId"], reason=request["reason"],
                )
                print(json.dumps(grant, sort_keys=True))
            elif action == "revoke-hold":
                from app.services.approval_db_service import _spec224_recovery_grant_fence_identity

                await session.begin()
                fence_identity = _spec224_recovery_grant_fence_identity(
                    request["tenantId"], request["grantId"]
                )
                await session.execute(
                    text("SELECT pg_advisory_xact_lock(hashtextextended(:fence_identity, 224))"),
                    {"fence_identity": fence_identity},
                )
                print("FENCE_HELD", flush=True)
                await asyncio.to_thread(sys.stdin.readline)
                grant = await service.revoke_spec224_recovery_grant(
                    grant_id=request["grantId"], tenant_id=request["tenantId"],
                    owner_id=request["ownerId"], reason=request["reason"],
                )
                print(json.dumps(grant, sort_keys=True))
            else:
                raise ValueError("SPEC224_TEST_ACTION_INVALID")
    finally:
        await engine.dispose()


asyncio.run(main())

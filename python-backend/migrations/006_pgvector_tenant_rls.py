"""
Migration 006: pgvector schema + tenant RLS controls for library vectors.

This migration is intentionally additive and idempotent:
- Creates pgvector extension (if missing)
- Creates a tenant-scoped vector table + indexes
- Enables and enforces row-level security
- Installs explicit tenant policies for SELECT/INSERT/UPDATE/DELETE

Rollback keeps existing non-vector schemas intact and removes only migration-owned
objects unless `drop_extension=True` is explicitly requested.
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)

from app.core.config import settings

logger = logging.getLogger(__name__)

VECTOR_TABLE_NAME = "library_chunk_vectors"
VECTOR_EXTENSION_NAME = "vector"
TENANT_GUC_KEY = "app.current_tenant_id"

VECTOR_INDEXES = (
    "ix_library_chunk_vectors_tenant_item",
    "ix_library_chunk_vectors_embedding_hnsw",
)

RLS_POLICIES = (
    "library_chunk_vectors_tenant_select",
    "library_chunk_vectors_tenant_insert",
    "library_chunk_vectors_tenant_update",
    "library_chunk_vectors_tenant_delete",
)

DEFAULT_VECTOR_DIMENSIONS = 384
DEFAULT_MAX_DATABASE_BYTES = 50 * 1024 * 1024 * 1024
DEFAULT_MIN_CAPACITY_HEADROOM_BYTES = 2 * 1024 * 1024 * 1024


def _resolve_vector_dimensions() -> int:
    raw_value = (
        os.getenv("PGVECTOR_VECTOR_DIMENSIONS")
        or os.getenv("LIBRARY_EMBEDDING_DIMENSIONS")
        or str(DEFAULT_VECTOR_DIMENSIONS)
    )
    try:
        parsed = int(str(raw_value).strip())
    except (TypeError, ValueError):
        return DEFAULT_VECTOR_DIMENSIONS
    return max(1, parsed)


def build_upgrade_sql(vector_dimensions: int | None = None) -> list[str]:
    resolved_vector_dimensions = int(vector_dimensions or _resolve_vector_dimensions())
    return [
        f"CREATE EXTENSION IF NOT EXISTS {VECTOR_EXTENSION_NAME}",
        f"""
        CREATE TABLE IF NOT EXISTS {VECTOR_TABLE_NAME} (
            id BIGSERIAL PRIMARY KEY,
            tenant_id VARCHAR(36) NOT NULL,
            library_item_id INTEGER NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
            chunk_index INTEGER NOT NULL,
            embedding vector({resolved_vector_dimensions}) NOT NULL,
            metadata JSONB NOT NULL DEFAULT '{{}}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (library_item_id, chunk_index)
        )
        """.strip(),
        """
        CREATE INDEX IF NOT EXISTS ix_library_chunk_vectors_tenant_item
        ON library_chunk_vectors (tenant_id, library_item_id)
        """.strip(),
        "DROP INDEX IF EXISTS ix_library_chunk_vectors_embedding_hnsw",
        f"""
        ALTER TABLE {VECTOR_TABLE_NAME}
        ALTER COLUMN embedding TYPE vector({resolved_vector_dimensions})
        USING embedding::vector({resolved_vector_dimensions})
        """.strip(),
        """
        CREATE INDEX IF NOT EXISTS ix_library_chunk_vectors_embedding_hnsw
        ON library_chunk_vectors
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        """.strip(),
        f"ALTER TABLE {VECTOR_TABLE_NAME} ENABLE ROW LEVEL SECURITY",
        f"ALTER TABLE {VECTOR_TABLE_NAME} FORCE ROW LEVEL SECURITY",
        "DROP POLICY IF EXISTS library_chunk_vectors_tenant_select ON library_chunk_vectors",
        f"""
        CREATE POLICY library_chunk_vectors_tenant_select
        ON {VECTOR_TABLE_NAME}
        FOR SELECT
        USING (tenant_id = current_setting('{TENANT_GUC_KEY}', true))
        """.strip(),
        "DROP POLICY IF EXISTS library_chunk_vectors_tenant_insert ON library_chunk_vectors",
        f"""
        CREATE POLICY library_chunk_vectors_tenant_insert
        ON {VECTOR_TABLE_NAME}
        FOR INSERT
        WITH CHECK (tenant_id = current_setting('{TENANT_GUC_KEY}', true))
        """.strip(),
        "DROP POLICY IF EXISTS library_chunk_vectors_tenant_update ON library_chunk_vectors",
        f"""
        CREATE POLICY library_chunk_vectors_tenant_update
        ON {VECTOR_TABLE_NAME}
        FOR UPDATE
        USING (tenant_id = current_setting('{TENANT_GUC_KEY}', true))
        WITH CHECK (tenant_id = current_setting('{TENANT_GUC_KEY}', true))
        """.strip(),
        "DROP POLICY IF EXISTS library_chunk_vectors_tenant_delete ON library_chunk_vectors",
        f"""
        CREATE POLICY library_chunk_vectors_tenant_delete
        ON {VECTOR_TABLE_NAME}
        FOR DELETE
        USING (tenant_id = current_setting('{TENANT_GUC_KEY}', true))
        """.strip(),
    ]


def build_rollback_sql(*, drop_extension: bool = False) -> list[str]:
    statements = [
        "DROP POLICY IF EXISTS library_chunk_vectors_tenant_select ON library_chunk_vectors",
        "DROP POLICY IF EXISTS library_chunk_vectors_tenant_insert ON library_chunk_vectors",
        "DROP POLICY IF EXISTS library_chunk_vectors_tenant_update ON library_chunk_vectors",
        "DROP POLICY IF EXISTS library_chunk_vectors_tenant_delete ON library_chunk_vectors",
        "DROP INDEX IF EXISTS ix_library_chunk_vectors_embedding_hnsw",
        "DROP INDEX IF EXISTS ix_library_chunk_vectors_tenant_item",
        "DROP TABLE IF EXISTS library_chunk_vectors",
    ]
    if drop_extension:
        statements.append(f"DROP EXTENSION IF EXISTS {VECTOR_EXTENSION_NAME}")
    return statements


def build_verification_queries() -> dict[str, str]:
    return {
        "extension_present": "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')",
        "table_present": "SELECT to_regclass('public.library_chunk_vectors') IS NOT NULL",
        "tenant_index_present": "SELECT to_regclass('public.ix_library_chunk_vectors_tenant_item') IS NOT NULL",
        "embedding_index_present": "SELECT to_regclass('public.ix_library_chunk_vectors_embedding_hnsw') IS NOT NULL",
        "embedding_dimensions": """
            SELECT a.atttypmod
            FROM pg_attribute a
            JOIN pg_class c ON a.attrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE n.nspname = 'public'
              AND c.relname = 'library_chunk_vectors'
              AND a.attname = 'embedding'
        """.strip(),
        "rls_enabled": """
            SELECT COALESCE(
                (
                    SELECT relrowsecurity AND relforcerowsecurity
                    FROM pg_class
                    WHERE oid = to_regclass('public.library_chunk_vectors')
                ),
                false
            )
        """.strip(),
        "policy_names": """
            SELECT policyname
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = 'library_chunk_vectors'
        """.strip(),
    }


def build_rls_validation_queries(vector_dimensions: int | None = None) -> dict[str, str]:
    resolved_vector_dimensions = int(vector_dimensions or _resolve_vector_dimensions())
    return {
        "allow_same_tenant_select": """
            BEGIN;
            SELECT set_config('app.current_tenant_id', 'tenant-alpha', true);
            SELECT count(*) FROM library_chunk_vectors WHERE tenant_id = 'tenant-alpha';
            ROLLBACK;
        """.strip(),
        "deny_cross_tenant_select": """
            BEGIN;
            SELECT set_config('app.current_tenant_id', 'tenant-alpha', true);
            SELECT count(*) FROM library_chunk_vectors WHERE tenant_id = 'tenant-beta';
            ROLLBACK;
        """.strip(),
        "allow_same_tenant_insert": """
            BEGIN;
            SELECT set_config('app.current_tenant_id', 'tenant-alpha', true);
            INSERT INTO library_chunk_vectors (tenant_id, library_item_id, chunk_index, embedding)
            VALUES ('tenant-alpha', 1, 0, array_fill(0.0::real, ARRAY[:vector_dimensions])::vector);
            ROLLBACK;
        """.strip().replace(":vector_dimensions", str(resolved_vector_dimensions)),
        "deny_cross_tenant_insert": """
            BEGIN;
            SELECT set_config('app.current_tenant_id', 'tenant-alpha', true);
            INSERT INTO library_chunk_vectors (tenant_id, library_item_id, chunk_index, embedding)
            VALUES ('tenant-beta', 1, 1, array_fill(0.0::real, ARRAY[:vector_dimensions])::vector);
            ROLLBACK;
        """.strip().replace(":vector_dimensions", str(resolved_vector_dimensions)),
    }


def _preflight_issues(
    snapshot: dict[str, Any],
    *,
    min_capacity_headroom_bytes: int = DEFAULT_MIN_CAPACITY_HEADROOM_BYTES,
) -> list[str]:
    issues: list[str] = []

    if not bool(snapshot.get("can_create_extension")):
        issues.append("create_extension_privilege_missing")

    capacity_headroom = int(snapshot.get("capacity_headroom_bytes") or 0)
    if capacity_headroom < min_capacity_headroom_bytes:
        issues.append("insufficient_capacity_headroom")

    server_version_num = int(snapshot.get("server_version_num") or 0)
    if server_version_num < 120000:
        issues.append("postgres_version_too_old")

    return issues


def assert_preflight_ok(
    snapshot: dict[str, Any],
    *,
    min_capacity_headroom_bytes: int = DEFAULT_MIN_CAPACITY_HEADROOM_BYTES,
) -> None:
    issues = _preflight_issues(
        snapshot,
        min_capacity_headroom_bytes=min_capacity_headroom_bytes,
    )
    if issues:
        raise RuntimeError(f"pgvector_preflight_failed:{','.join(issues)}")


def _verification_issues(snapshot: dict[str, Any]) -> list[str]:
    issues: list[str] = []

    if not bool(snapshot.get("extension_present")):
        issues.append("extension_missing")
    if not bool(snapshot.get("table_present")):
        issues.append("table_missing")

    index_presence = snapshot.get("index_presence") or {}
    missing_indexes = [name for name in VECTOR_INDEXES if not bool(index_presence.get(name))]
    if missing_indexes:
        issues.append(f"missing_indexes:{','.join(missing_indexes)}")

    if not bool(snapshot.get("rls_enabled")):
        issues.append("rls_not_enforced")

    expected_dimensions = int(snapshot.get("expected_embedding_dimensions") or 0)
    actual_dimensions = int(snapshot.get("embedding_dimensions") or 0)
    if expected_dimensions > 0 and actual_dimensions != expected_dimensions:
        issues.append(
            f"embedding_dimension_drift:expected={expected_dimensions}:actual={actual_dimensions}"
        )

    actual_policies = set(snapshot.get("policy_names") or set())
    missing_policies = sorted(set(RLS_POLICIES) - actual_policies)
    if missing_policies:
        issues.append(f"policy_drift:{','.join(missing_policies)}")

    return issues


def assert_verification_ok(snapshot: dict[str, Any]) -> None:
    issues = _verification_issues(snapshot)
    if issues:
        raise RuntimeError(f"pgvector_verification_failed:{','.join(issues)}")


async def _collect_preflight_snapshot(
    session: AsyncSession,
    *,
    max_database_bytes: int = DEFAULT_MAX_DATABASE_BYTES,
) -> dict[str, Any]:
    can_create_extension = bool(
        (
            await session.execute(
                text("SELECT has_database_privilege(current_user, current_database(), 'CREATE')")
            )
        ).scalar()
    )
    db_size_bytes = int(
        (
            await session.execute(text("SELECT pg_database_size(current_database())"))
        ).scalar()
        or 0
    )
    server_version_num = int(
        (
            await session.execute(text("SELECT current_setting('server_version_num')"))
        ).scalar()
        or 0
    )

    return {
        "can_create_extension": can_create_extension,
        "db_size_bytes": db_size_bytes,
        "max_database_bytes": int(max_database_bytes),
        "capacity_headroom_bytes": int(max_database_bytes) - db_size_bytes,
        "server_version_num": server_version_num,
    }


async def _collect_verification_snapshot(session: AsyncSession) -> dict[str, Any]:
    queries = build_verification_queries()

    extension_present = bool((await session.execute(text(queries["extension_present"]))).scalar())
    table_present = bool((await session.execute(text(queries["table_present"]))).scalar())
    tenant_index_present = bool((await session.execute(text(queries["tenant_index_present"]))).scalar())
    embedding_index_present = bool((await session.execute(text(queries["embedding_index_present"]))).scalar())
    embedding_dimensions = int(
        (await session.execute(text(queries["embedding_dimensions"]))).scalar() or 0
    )
    rls_enabled = bool((await session.execute(text(queries["rls_enabled"]))).scalar())

    policy_rows = (await session.execute(text(queries["policy_names"]))).fetchall()
    policy_names = {str(row[0]) for row in policy_rows}

    return {
        "extension_present": extension_present,
        "table_present": table_present,
        "index_presence": {
            "ix_library_chunk_vectors_tenant_item": tenant_index_present,
            "ix_library_chunk_vectors_embedding_hnsw": embedding_index_present,
        },
        "embedding_dimensions": embedding_dimensions,
        "expected_embedding_dimensions": _resolve_vector_dimensions(),
        "rls_enabled": rls_enabled,
        "policy_names": policy_names,
    }


async def _execute_statements(session: AsyncSession, statements: list[str]) -> None:
    for statement in statements:
        await session.execute(text(statement))


async def upgrade(
    *,
    database_url: str | None = None,
    min_capacity_headroom_bytes: int = DEFAULT_MIN_CAPACITY_HEADROOM_BYTES,
    max_database_bytes: int | None = None,
) -> dict[str, Any]:
    target_database_url = database_url or settings.DATABASE_URL
    resolved_max_database_bytes = int(
        max_database_bytes
        if max_database_bytes is not None
        else int(os.getenv("PGVECTOR_MIGRATION_MAX_DB_BYTES", str(DEFAULT_MAX_DATABASE_BYTES)))
    )

    engine = create_async_engine(target_database_url, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            preflight_snapshot = await _collect_preflight_snapshot(
                session,
                max_database_bytes=resolved_max_database_bytes,
            )
            assert_preflight_ok(
                preflight_snapshot,
                min_capacity_headroom_bytes=min_capacity_headroom_bytes,
            )

            await _execute_statements(session, build_upgrade_sql())
            await session.commit()

            verification_snapshot = await _collect_verification_snapshot(session)
            assert_verification_ok(verification_snapshot)

            logger.info(
                "pgvector_migration_upgrade_completed preflight=%s verification=%s",
                preflight_snapshot,
                verification_snapshot,
            )
            return {
                "preflight": preflight_snapshot,
                "verification": verification_snapshot,
            }
    finally:
        await engine.dispose()


async def downgrade(
    *,
    database_url: str | None = None,
    drop_extension: bool = False,
) -> dict[str, Any]:
    target_database_url = database_url or settings.DATABASE_URL
    engine = create_async_engine(target_database_url, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            await _execute_statements(session, build_rollback_sql(drop_extension=drop_extension))
            await session.commit()

            table_present = bool(
                (
                    await session.execute(text("SELECT to_regclass('public.library_chunk_vectors') IS NOT NULL"))
                ).scalar()
            )
            if table_present:
                raise RuntimeError("pgvector_rollback_failed:table_still_present")

            logger.info(
                "pgvector_migration_rollback_completed drop_extension=%s",
                drop_extension,
            )
            return {
                "table_present": table_present,
                "drop_extension": drop_extension,
            }
    finally:
        await engine.dispose()


async def verify_migration(*, database_url: str | None = None) -> dict[str, Any]:
    target_database_url = database_url or settings.DATABASE_URL
    engine = create_async_engine(target_database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            snapshot = await _collect_verification_snapshot(session)
            assert_verification_ok(snapshot)
            logger.info("pgvector_migration_verification_passed snapshot=%s", snapshot)
            return snapshot
    finally:
        await engine.dispose()


if __name__ == "__main__":
    import sys

    logging.basicConfig(level=logging.INFO)
    command = sys.argv[1] if len(sys.argv) > 1 else "upgrade"

    if command == "upgrade":
        asyncio.run(upgrade())
    elif command == "downgrade":
        drop_extension = len(sys.argv) > 2 and sys.argv[2] == "--drop-extension"
        asyncio.run(downgrade(drop_extension=drop_extension))
    elif command == "verify":
        asyncio.run(verify_migration())
    else:
        raise SystemExit(
            "Usage: python 006_pgvector_tenant_rls.py [upgrade|downgrade [--drop-extension]|verify]"
        )

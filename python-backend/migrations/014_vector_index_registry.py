"""Migration 014: add the canonical vector projection registry.

The registry contains only rebuild metadata and provider mutation evidence. It
does not store embedding values and must never be populated from legacy vector
payloads.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

logger = logging.getLogger(__name__)


async def upgrade() -> None:
    """Create the idempotent Vectorize projection registry and its indexes."""
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            await session.execute(
                text(
                    """
                    DO $$
                    BEGIN
                        CREATE TYPE vector_projection_status AS ENUM (
                            'queued', 'indexing', 'indexed', 'stale',
                            'delete_pending', 'deleted', 'failed'
                        );
                    EXCEPTION
                        WHEN duplicate_object THEN NULL;
                    END $$;
                    """
                )
            )
            await session.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS vector_index_records (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                        workspace_id VARCHAR(128),
                        plugin_id VARCHAR(128),
                        source_family VARCHAR(96) NOT NULL,
                        source_table VARCHAR(128) NOT NULL,
                        source_id VARCHAR(256) NOT NULL,
                        chunk_id VARCHAR(256),
                        asset_id VARCHAR(256),
                        vector_id VARCHAR(128) NOT NULL,
                        vector_index VARCHAR(128) NOT NULL,
                        namespace VARCHAR(128) NOT NULL,
                        embedding_model VARCHAR(256) NOT NULL,
                        embedding_dimensions INTEGER NOT NULL,
                        embedding_version VARCHAR(64) NOT NULL,
                        metric VARCHAR(32) NOT NULL DEFAULT 'cosine',
                        chunking_version VARCHAR(64) NOT NULL,
                        normalization_version VARCHAR(64),
                        content_hash VARCHAR(64) NOT NULL,
                        source_revision VARCHAR(256) NOT NULL,
                        indexed_at TIMESTAMPTZ,
                        last_mutation_id VARCHAR(256),
                        input_hash VARCHAR(64),
                        source_locator_kind VARCHAR(64),
                        status vector_projection_status NOT NULL DEFAULT 'queued',
                        failure_code VARCHAR(96),
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        CONSTRAINT vector_index_records_dimensions_positive
                            CHECK (embedding_dimensions > 0),
                        CONSTRAINT vector_index_records_metric_check
                            CHECK (metric IN ('cosine', 'euclidean', 'dot-product'))
                    )
                    """
                )
            )
            statements = (
                "CREATE UNIQUE INDEX IF NOT EXISTS vector_index_records_index_vector_unique ON vector_index_records (vector_index, vector_id)",
                "CREATE INDEX IF NOT EXISTS vector_index_records_index_namespace_idx ON vector_index_records (vector_index, namespace)",
                "CREATE INDEX IF NOT EXISTS vector_index_records_tenant_source_idx ON vector_index_records (tenant_id, source_family, source_id)",
                "CREATE INDEX IF NOT EXISTS vector_index_records_tenant_hash_version_idx ON vector_index_records (tenant_id, content_hash, embedding_version)",
                "CREATE INDEX IF NOT EXISTS vector_index_records_index_status_idx ON vector_index_records (vector_index, status)",
                "CREATE INDEX IF NOT EXISTS vector_index_records_source_revision_idx ON vector_index_records (source_revision)",
            )
            for statement in statements:
                await session.execute(text(statement))
            await session.commit()
            logger.info("vector_index_registry_migration_upgraded")
    finally:
        await engine.dispose()


async def downgrade() -> None:
    """Remove only the registry owned by this migration."""
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            for statement in (
                "DROP INDEX IF EXISTS vector_index_records_source_revision_idx",
                "DROP INDEX IF EXISTS vector_index_records_index_status_idx",
                "DROP INDEX IF EXISTS vector_index_records_tenant_hash_version_idx",
                "DROP INDEX IF EXISTS vector_index_records_tenant_source_idx",
                "DROP INDEX IF EXISTS vector_index_records_index_namespace_idx",
                "DROP INDEX IF EXISTS vector_index_records_index_vector_unique",
                "DROP TABLE IF EXISTS vector_index_records",
            ):
                await session.execute(text(statement))
            await session.commit()
            logger.info("vector_index_registry_migration_downgraded")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(upgrade())

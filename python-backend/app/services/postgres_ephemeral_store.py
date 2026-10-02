"""Shared PostgreSQL TTL key/value primitives for cross-process state.

This is for short-lived coordination, OAuth state, and small status snapshots.
Durable job lifecycle and business truth remain in worker_jobs/domain tables.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy import text

from app.core.database import AsyncSessionLocal


def _key_hash(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def _validate(namespace: str, key: str, ttl_seconds: int | None = None) -> None:
    if not namespace or len(namespace) > 80:
        raise ValueError("Invalid ephemeral-state namespace")
    if not key or len(key) > 2_000:
        raise ValueError("Invalid ephemeral-state key")
    if ttl_seconds is not None and ttl_seconds < 1:
        raise ValueError("Ephemeral-state TTL must be positive")


async def read_value(namespace: str, key: str) -> Any | None:
    _validate(namespace, key)
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("""
                SELECT value FROM runtime_ephemeral_values
                WHERE namespace = :namespace AND key_hash = :key_hash
                  AND expires_at > now()
                LIMIT 1
            """),
            {"namespace": namespace, "key_hash": _key_hash(key)},
        )
        row = result.mappings().first()
        return row["value"] if row else None


async def take_value(namespace: str, key: str) -> Any | None:
    """Read and delete one live value atomically (for one-time OAuth state)."""
    _validate(namespace, key)
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(
                text("""
                    DELETE FROM runtime_ephemeral_values
                    WHERE namespace = :namespace AND key_hash = :key_hash
                      AND expires_at > now()
                    RETURNING value
                """),
                {"namespace": namespace, "key_hash": _key_hash(key)},
            )
            row = result.mappings().first()
            return row["value"] if row else None


async def put_value(namespace: str, key: str, value: Any, ttl_seconds: int) -> None:
    _validate(namespace, key, ttl_seconds)
    encoded = json.dumps(value, separators=(",", ":"), ensure_ascii=False)
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(
                text("""
                    INSERT INTO runtime_ephemeral_values
                        (namespace, key_hash, value, expires_at)
                    VALUES
                        (:namespace, :key_hash, CAST(:value AS jsonb),
                         now() + (:ttl_seconds * interval '1 second'))
                    ON CONFLICT (namespace, key_hash) DO UPDATE SET
                        value = EXCLUDED.value,
                        expires_at = EXCLUDED.expires_at,
                        created_at = now()
                """),
                {
                    "namespace": namespace,
                    "key_hash": _key_hash(key),
                    "value": encoded,
                    "ttl_seconds": ttl_seconds,
                },
            )


async def claim_value(namespace: str, key: str, value: Any, ttl_seconds: int) -> bool:
    """Atomically create a key only when absent or expired."""
    _validate(namespace, key, ttl_seconds)
    encoded = json.dumps(value, separators=(",", ":"), ensure_ascii=False)
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(
                text("""
                    INSERT INTO runtime_ephemeral_values
                        (namespace, key_hash, value, expires_at)
                    VALUES
                        (:namespace, :key_hash, CAST(:value AS jsonb),
                         now() + (:ttl_seconds * interval '1 second'))
                    ON CONFLICT (namespace, key_hash) DO UPDATE SET
                        value = EXCLUDED.value,
                        expires_at = EXCLUDED.expires_at,
                        created_at = now()
                    WHERE runtime_ephemeral_values.expires_at <= now()
                    RETURNING key_hash
                """),
                {
                    "namespace": namespace,
                    "key_hash": _key_hash(key),
                    "value": encoded,
                    "ttl_seconds": ttl_seconds,
                },
            )
            return result.first() is not None


async def replace_if_owned(
    namespace: str,
    key: str,
    owner: Any,
    value: Any,
    ttl_seconds: int,
) -> bool:
    """Replace a live row only while it still contains the expected owner."""
    _validate(namespace, key, ttl_seconds)
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(
                text("""
                    UPDATE runtime_ephemeral_values
                    SET value = CAST(:value AS jsonb),
                        expires_at = now() + (:ttl_seconds * interval '1 second'),
                        created_at = now()
                    WHERE namespace = :namespace AND key_hash = :key_hash
                      AND value = CAST(:owner AS jsonb) AND expires_at > now()
                    RETURNING key_hash
                """),
                {
                    "namespace": namespace,
                    "key_hash": _key_hash(key),
                    "owner": json.dumps(owner, separators=(",", ":"), ensure_ascii=False),
                    "value": json.dumps(value, separators=(",", ":"), ensure_ascii=False),
                    "ttl_seconds": ttl_seconds,
                },
            )
            return result.first() is not None


async def delete_value(namespace: str, key: str) -> bool:
    _validate(namespace, key)
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(
                text("""
                    DELETE FROM runtime_ephemeral_values
                    WHERE namespace = :namespace AND key_hash = :key_hash
                    RETURNING key_hash
                """),
                {"namespace": namespace, "key_hash": _key_hash(key)},
            )
            return result.first() is not None


async def delete_namespace(namespace: str) -> int:
    """Delete all short-lived values in one application-owned namespace."""
    _validate(namespace, "namespace-clear")
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(
                text("DELETE FROM runtime_ephemeral_values WHERE namespace = :namespace"),
                {"namespace": namespace},
            )
            return int(getattr(result, "rowcount", 0) or 0)


async def delete_if_owned(namespace: str, key: str, owner: Any) -> bool:
    _validate(namespace, key)
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(
                text("""
                    DELETE FROM runtime_ephemeral_values
                    WHERE namespace = :namespace AND key_hash = :key_hash
                      AND value = CAST(:owner AS jsonb)
                    RETURNING key_hash
                """),
                {
                    "namespace": namespace,
                    "key_hash": _key_hash(key),
                    "owner": json.dumps(owner, separators=(",", ":"), ensure_ascii=False),
                },
            )
            return result.first() is not None


async def increment_value(namespace: str, key: str, ttl_seconds: int) -> int:
    _validate(namespace, key, ttl_seconds)
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(
                text("""
                    INSERT INTO runtime_ephemeral_values
                        (namespace, key_hash, value, expires_at)
                    VALUES
                        (:namespace, :key_hash, '1'::jsonb,
                         now() + (:ttl_seconds * interval '1 second'))
                    ON CONFLICT (namespace, key_hash) DO UPDATE SET
                        value = CASE
                            WHEN runtime_ephemeral_values.expires_at <= now()
                                THEN '1'::jsonb
                            ELSE to_jsonb(COALESCE(
                                NULLIF(runtime_ephemeral_values.value #>> '{}', '')::bigint,
                                0
                            ) + 1)
                        END,
                        expires_at = now() + (:ttl_seconds * interval '1 second'),
                        created_at = now()
                    RETURNING (value #>> '{}')::bigint AS value
                """),
                {
                    "namespace": namespace,
                    "key_hash": _key_hash(key),
                    "ttl_seconds": ttl_seconds,
                },
            )
            row = result.mappings().first()
            return int(row["value"]) if row else 0


async def increment_object_field(
    namespace: str,
    key: str,
    field: str,
    amount: int,
    ttl_seconds: int,
) -> int:
    """Atomically increment an integer field in a short-lived JSON object."""
    _validate(namespace, key, ttl_seconds)
    if not field or len(field) > 100 or amount < 1:
        raise ValueError("Invalid ephemeral-state counter")
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await session.execute(
                text("""
                    INSERT INTO runtime_ephemeral_values
                        (namespace, key_hash, value, expires_at)
                    VALUES
                        (:namespace, :key_hash,
                         jsonb_build_object(:field, :amount),
                         now() + (:ttl_seconds * interval '1 second'))
                    ON CONFLICT (namespace, key_hash) DO UPDATE SET
                        value = jsonb_set(
                            CASE
                                WHEN runtime_ephemeral_values.expires_at <= now()
                                    THEN '{}'::jsonb
                                ELSE runtime_ephemeral_values.value
                            END,
                            ARRAY[CAST(:field AS text)],
                            to_jsonb(COALESCE(NULLIF(
                                CASE
                                    WHEN runtime_ephemeral_values.expires_at <= now()
                                        THEN NULL
                                    ELSE runtime_ephemeral_values.value ->> :field
                                END, '')::bigint, 0) + :amount),
                            true
                        ),
                        expires_at = now() + (:ttl_seconds * interval '1 second'),
                        created_at = now()
                    RETURNING (value ->> :field)::bigint AS value
                """),
                {
                    "namespace": namespace,
                    "key_hash": _key_hash(key),
                    "field": field,
                    "amount": amount,
                    "ttl_seconds": ttl_seconds,
                },
            )
            row = result.mappings().first()
            return int(row["value"]) if row else 0

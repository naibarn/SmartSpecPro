"""Cross-instance sliding-window rate limits backed by PostgreSQL."""

from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import text

from app.core.database import AsyncSessionLocal


@dataclass(frozen=True)
class SlidingWindowDecision:
    allowed: bool
    count: int
    remaining: int
    retry_after_seconds: int


def _subject_hash(subject: str) -> str:
    return hashlib.sha256(subject.encode("utf-8")).hexdigest()


async def consume_sliding_window(
    namespace: str,
    subject: str,
    limit: int,
    window_seconds: int,
) -> SlidingWindowDecision:
    if limit < 1 or window_seconds < 1:
        raise ValueError("Rate-limit configuration must be positive")
    subject_hash = _subject_hash(subject)
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(
                text("SELECT pg_advisory_xact_lock(hashtextextended(:lock_key, 0))"),
                {"lock_key": f"{namespace}:{subject_hash}"},
            )
            await session.execute(
                text("""
                    DELETE FROM rate_limit_events
                    WHERE namespace = :namespace AND subject_hash = :subject_hash
                      AND occurred_at <= now() - (:window_seconds * interval '1 second')
                """),
                {"namespace": namespace, "subject_hash": subject_hash, "window_seconds": window_seconds},
            )
            row = (await session.execute(
                text("""
                    SELECT count(*) AS count, min(occurred_at) AS oldest
                    FROM rate_limit_events
                    WHERE namespace = :namespace AND subject_hash = :subject_hash
                      AND occurred_at > now() - (:window_seconds * interval '1 second')
                """),
                {"namespace": namespace, "subject_hash": subject_hash, "window_seconds": window_seconds},
            )).mappings().one()
            count = int(row["count"] or 0)
            oldest = row["oldest"]
            retry_after = 0
            if count >= limit:
                if oldest is not None:
                    expires_at = oldest + timedelta(seconds=window_seconds)
                    retry_after = max(1, math.ceil((expires_at - datetime.now(timezone.utc)).total_seconds()))
                return SlidingWindowDecision(False, count, 0, retry_after or window_seconds)

            await session.execute(
                text("""
                    INSERT INTO rate_limit_events (namespace, subject_hash, units, occurred_at)
                    VALUES (:namespace, :subject_hash, 1, now())
                """),
                {"namespace": namespace, "subject_hash": subject_hash},
            )
            return SlidingWindowDecision(True, count + 1, max(0, limit - count - 1), 0)


async def read_sliding_window(
    namespace: str,
    subject: str,
    window_seconds: int,
) -> tuple[int, int]:
    subject_hash = _subject_hash(subject)
    async with AsyncSessionLocal() as session:
        row = (await session.execute(
            text("""
                SELECT count(*) AS count, min(occurred_at) AS oldest
                FROM rate_limit_events
                WHERE namespace = :namespace AND subject_hash = :subject_hash
                  AND occurred_at > now() - (:window_seconds * interval '1 second')
            """),
            {"namespace": namespace, "subject_hash": subject_hash, "window_seconds": window_seconds},
        )).mappings().one()
    count = int(row["count"] or 0)
    oldest = row["oldest"]
    retry_after = 0
    if oldest is not None:
        retry_after = max(
            1,
            math.ceil((oldest + timedelta(seconds=window_seconds) - datetime.now(timezone.utc)).total_seconds()),
        )
    return count, retry_after


async def is_ttl_dedupe_key_present(namespace: str, key: str) -> bool:
    """Check a hashed, expiring idempotency marker in shared PostgreSQL state."""
    key_hash = _subject_hash(key)
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("""
                SELECT 1 FROM runtime_dedupe_keys
                WHERE namespace = :namespace AND key_hash = :key_hash
                  AND expires_at > now()
                LIMIT 1
            """),
            {"namespace": namespace, "key_hash": key_hash},
        )
        return result.scalar_one_or_none() is not None


async def mark_ttl_dedupe_key(namespace: str, key: str, ttl_seconds: int) -> None:
    """Persist/refresh a hashed TTL marker in the shared PostgreSQL store."""
    if ttl_seconds < 1:
        raise ValueError("Dedupe TTL must be positive")
    key_hash = _subject_hash(key)
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(
                text("""
                    INSERT INTO runtime_dedupe_keys (namespace, key_hash, expires_at)
                    VALUES (:namespace, :key_hash, now() + (:ttl_seconds * interval '1 second'))
                    ON CONFLICT (namespace, key_hash) DO UPDATE SET
                      expires_at = EXCLUDED.expires_at,
                      created_at = now()
                """),
                {"namespace": namespace, "key_hash": key_hash, "ttl_seconds": ttl_seconds},
            )


async def claim_capacity_slot(
    namespace: str,
    subject: str,
    max_slots: int,
    ttl_seconds: int,
) -> str | None:
    """Atomically claim one of a bounded set of expiring shared capacity slots."""
    if not namespace or max_slots < 1 or ttl_seconds < 1:
        raise ValueError("Capacity-slot configuration must be positive")
    subject_hash = _subject_hash(subject)
    slot_id = str(uuid4())
    async with AsyncSessionLocal() as session:
        async with session.begin():
            lock_key = f"capacity:{namespace}:{subject_hash}"
            await session.execute(
                text("SELECT pg_advisory_xact_lock(hashtextextended(:lock_key, 0))"),
                {"lock_key": lock_key},
            )
            await session.execute(
                text("""
                    DELETE FROM rate_limit_slots
                    WHERE namespace = :namespace AND subject_hash = :subject_hash
                      AND expires_at <= now()
                """),
                {"namespace": namespace, "subject_hash": subject_hash},
            )
            row = (await session.execute(
                text("""
                    SELECT count(*) AS count FROM rate_limit_slots
                    WHERE namespace = :namespace AND subject_hash = :subject_hash
                      AND expires_at > now()
                """),
                {"namespace": namespace, "subject_hash": subject_hash},
            )).mappings().one()
            if int(row["count"] or 0) >= max_slots:
                return None
            await session.execute(
                text("""
                    INSERT INTO rate_limit_slots (id, namespace, subject_hash, expires_at)
                    VALUES (CAST(:id AS uuid), :namespace, :subject_hash,
                            now() + (:ttl_seconds * interval '1 second'))
                """),
                {
                    "id": slot_id,
                    "namespace": namespace,
                    "subject_hash": subject_hash,
                    "ttl_seconds": ttl_seconds,
                },
            )
    return slot_id


async def release_capacity_slot(namespace: str, slot_id: str) -> None:
    """Release a previously claimed capacity slot; repeated release is safe."""
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(
                text("DELETE FROM rate_limit_slots WHERE namespace = :namespace AND id = CAST(:id AS uuid)"),
                {"namespace": namespace, "id": slot_id},
            )

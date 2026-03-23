"""
Execution Memory Store — Dual Redis + PostgreSQL storage for autonomous execution state.

Redis: fast scratch-pad for in-flight state (TTL 1h)
PostgreSQL: durable checkpoints in agency_run_traces for crash recovery
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from app.services.agentic_sanitizer import sanitize_llm_input

logger = logging.getLogger(__name__)

TTL_SECONDS = 3600  # 1 hour


def _sanitize_dict(data: Any) -> Any:
    """Recursively sanitize string values in nested dict/list structures."""
    if isinstance(data, dict):
        return {k: _sanitize_dict(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [_sanitize_dict(item) for item in data]
    elif isinstance(data, str):
        return sanitize_llm_input(data)
    return data


class ExecutionMemoryStore:
    """Dual-layer storage for autonomous execution state."""

    def __init__(
        self,
        tenant_id: str,
        run_id: str,
        agency_id: str,
        redis_client: Any = None,
    ) -> None:
        self.tenant_id = tenant_id
        self.run_id = run_id
        self.agency_id = agency_id
        self._redis = redis_client

    def _redis_key(self) -> str:
        return f"agency:autonomous:{self.tenant_id}:{self.run_id}"

    async def _get_redis(self) -> Any:
        if self._redis is not None:
            return self._redis
        try:
            from redis.asyncio import Redis
            from app.core.settings import settings
            redis_url = getattr(settings, "REDIS_URL", None) or "redis://localhost:6379/0"
            self._redis = Redis.from_url(
                redis_url, decode_responses=True, socket_connect_timeout=5, socket_timeout=5
            )
            return self._redis
        except Exception as e:
            logger.warning("execution_store_redis_init_failed", extra={"error": str(e)})
            return None

    async def save_scratch_pad(self, state: dict) -> None:
        """Save full execution state to Redis scratch-pad."""
        try:
            redis = await self._get_redis()
            if redis is None:
                return
            sanitized = _sanitize_dict(state)
            key = self._redis_key()
            await redis.set(key, json.dumps(sanitized))
            await redis.expire(key, TTL_SECONDS)
        except Exception as e:
            logger.warning("scratch_pad_save_failed", extra={"error": str(e)})

    async def load_scratch_pad(self) -> dict | None:
        """Load execution state from Redis scratch-pad."""
        try:
            redis = await self._get_redis()
            if redis is None:
                return None
            raw = await redis.get(self._redis_key())
            if raw is None:
                return None
            return json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("scratch_pad_malformed_json")
            return None
        except Exception as e:
            logger.warning("scratch_pad_load_failed", extra={"error": str(e)})
            return None

    async def delete_scratch_pad(self) -> None:
        """Delete the Redis scratch-pad."""
        try:
            redis = await self._get_redis()
            if redis:
                await redis.delete(self._redis_key())
        except Exception as e:
            logger.warning("scratch_pad_delete_failed", extra={"error": str(e)})

    async def write_checkpoint(self, checkpoint: dict) -> None:
        """Write a durable checkpoint to agency_run_traces."""
        try:
            from app.core.database import AsyncSessionLocal
            from sqlalchemy import text

            checkpoint["type"] = "autonomous_checkpoint"
            checkpoint["last_checkpoint_at"] = datetime.now(timezone.utc).isoformat()

            async with AsyncSessionLocal() as session:
                query = text("""
                    INSERT INTO agency_run_traces (
                        id, "tenantId", "runId", "agencyId", trace, status, "createdAt"
                    )
                    VALUES (:id, :tenant_id, :run_id, :agency_id, :trace, 'running', NOW())
                    ON CONFLICT ("runId")
                    DO UPDATE SET
                        trace = :trace,
                        "totalTokens" = :total_tokens,
                        status = 'running'
                """)

                await session.execute(query, {
                    "id": str(uuid.uuid4()),
                    "tenant_id": self.tenant_id,
                    "run_id": self.run_id,
                    "agency_id": self.agency_id,
                    "trace": json.dumps(checkpoint),
                    "total_tokens": checkpoint.get("total_tokens_used", 0),
                })
                await session.commit()
        except Exception as e:
            logger.error("checkpoint_write_failed", extra={"error": str(e)})
            raise

    async def load_checkpoint(self) -> dict | None:
        """Load the latest checkpoint from agency_run_traces."""
        try:
            from app.core.database import AsyncSessionLocal
            from sqlalchemy import text

            async with AsyncSessionLocal() as session:
                query = text("""
                    SELECT trace FROM agency_run_traces
                    WHERE "runId" = :run_id AND "tenantId" = :tenant_id
                    ORDER BY "createdAt" DESC
                    LIMIT 1
                """)
                result = await session.execute(query, {
                    "run_id": self.run_id,
                    "tenant_id": self.tenant_id,
                })
                row = result.fetchone()
                if row is None:
                    return None

                trace = row[0]
                if isinstance(trace, str):
                    trace = json.loads(trace)
                if isinstance(trace, dict) and trace.get("type") == "autonomous_checkpoint":
                    return trace
                return None
        except Exception as e:
            logger.error("checkpoint_load_failed", extra={"error": str(e)})
            return None

    async def recover_state(self) -> dict | None:
        """Attempt to recover state from Redis, then fall back to Postgres."""
        state = await self.load_scratch_pad()
        if state is not None:
            return state
        return await self.load_checkpoint()

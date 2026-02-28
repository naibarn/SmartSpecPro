"""
Agency persistence hooks -- PostgreSQL-backed load/save for agency-swarm.

Implements the load_threads_callback and save_threads_callback interfaces
that agency-swarm expects for conversation persistence.

The callbacks are async since they use SQLAlchemy async sessions.
"""

import json
from datetime import datetime, timezone
from typing import Any, Callable

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.services.agency_pii import redact_pii

logger = structlog.get_logger(__name__)


def create_persistence_hooks(
    conversation_id: str,
    db_session_factory: async_sessionmaker,
) -> tuple[Callable, Callable]:
    """Create async load/save callbacks for a specific conversation.

    Returns:
        (load_callback, save_callback) -- both are async callables.
    """

    async def load_callback() -> list[dict[str, Any]]:
        """Load messages for this conversation from agency_messages table."""
        async with db_session_factory() as session:
            result = await session.execute(
                text("""
                    SELECT role, content, agent_name, tool_calls
                    FROM agency_messages
                    WHERE conversation_id = :conv_id
                    ORDER BY created_at ASC
                """),
                {"conv_id": conversation_id},
            )
            rows = result.all()

        messages: list[dict[str, Any]] = []
        for row in rows:
            msg: dict[str, Any] = {
                "role": row.role,
                "content": row.content or "",
            }
            if row.agent_name:
                msg["agent_name"] = row.agent_name
            if row.tool_calls:
                msg["tool_calls"] = row.tool_calls
            messages.append(msg)

        logger.info(
            "agency_persistence_loaded",
            conversation_id=conversation_id,
            message_count=len(messages),
        )
        return messages

    async def save_callback(messages: list[dict[str, Any]]) -> None:
        """Save new messages to agency_messages table.

        Agent-to-agent messages (role != 'user') have PII redacted.
        User messages are stored as-is.
        """
        if not messages:
            return

        async with db_session_factory() as session:
            for msg in messages:
                role = msg.get("role", "assistant")
                content = msg.get("content", "")
                agent_name = msg.get("agent_name")
                tool_calls = msg.get("tool_calls")

                # Apply PII redaction to non-user messages
                pii_redacted = False
                if role != "user" and content:
                    content, pii_redacted = redact_pii(content)

                await session.execute(
                    text("""
                        INSERT INTO agency_messages
                            (conversation_id, role, content, agent_name,
                             tool_calls, pii_redacted, created_at)
                        VALUES
                            (:conv_id, :role, :content, :agent_name,
                             CAST(:tool_calls AS json), :pii_redacted, :created_at)
                    """),
                    {
                        "conv_id": conversation_id,
                        "role": role,
                        "content": content,
                        "agent_name": agent_name,
                        "tool_calls": json.dumps(tool_calls) if tool_calls else None,
                        "pii_redacted": pii_redacted,
                        "created_at": datetime.now(timezone.utc),
                    },
                )

            await session.commit()

        logger.info(
            "agency_persistence_saved",
            conversation_id=conversation_id,
            message_count=len(messages),
        )

    return load_callback, save_callback
